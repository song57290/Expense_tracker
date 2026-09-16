package com.gaegyebu.app;

import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.WebView;
import android.util.Log;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final String WIDGET_PREFS = "gaegyebu_widget";
    private static final String PREF_PENDING_APK_ID = "pending_apk_download_id";
    private static final String PREF_PENDING_APK_FILE = "pending_apk_file_name";
    private static final String PREF_PENDING_APK_URL = "pending_apk_url";
    private static final String PREF_INSTALL_ATTEMPT_VERSION = "install_attempt_version";
    private static final String PREF_INSTALL_ATTEMPT_AT = "install_attempt_at";
    private static final String PREF_PENDING_APK_STARTED_AT = "pending_apk_started_at";
    private static final String PREF_PENDING_APK_VERSION = "pending_apk_version";
    private static final String PREF_INSTALL_RETRY_COUNT = "install_retry_count";
    private static final long PENDING_DOWNLOAD_STALE_MS = 10 * 60 * 1000;
    private static final int MAX_AUTO_INSTALL_RETRIES = 2;
    private BroadcastReceiver apkDownloadReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RingerModePlugin.class);
        registerPlugin(WidgetDataPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        refreshWidgets();
        storeWidgetNav(getIntent());
        setupDownloadListener();
        // 100%로 고정해 시스템 설정과 무관하게 항상 디자인 크기 그대로 렌더링
        getBridge().getWebView().getSettings().setTextZoom(100);
    }

    // Capacitor's WebView has no built-in file-download support, so
    // Content-Disposition: attachment responses (the APK update) are downloaded
    // via DownloadManager and installed via FileProvider once complete.
    private void setupDownloadListener() {
        WebView webView = getBridge().getWebView();
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                startApkDownload(url));
        registerApkDownloadReceiver();
    }

    // pendingApkDownloadId/pendingApkFileName were instance fields before, but a
    // background download can outlive the Activity that started it (config change,
    // low-memory kill) — a freshly recreated instance starts those fields back at
    // -1/null, so the completion broadcast (delivered to whichever receiver ends up
    // registered) never matches and the install step never fires. SharedPreferences
    // survives that recreation.
    private void registerApkDownloadReceiver() {
        apkDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                long pendingId = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE).getLong(PREF_PENDING_APK_ID, -1);
                if (id == -1 || id != pendingId) return;
                installDownloadedApk();
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(apkDownloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(apkDownloadReceiver, filter);
        }
    }

    // 다운로드 전 설치 권한 선확인 → 권한 없으면 완료 브로드캐스트를 기다리지 않고
    // 버튼 클릭 즉시 허용 화면으로 이동, URL은 저장해뒀다가 복귀 후 다운로드 개시
    private void startApkDownload(String url) {
        SharedPreferences prefs = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
        String pendingFile = prefs.getString(PREF_PENDING_APK_FILE, null);
        String pendingVersion = prefs.getString(PREF_PENDING_APK_VERSION, null);
        String requestedVersion = versionParam(url);
        long startedAt = prefs.getLong(PREF_PENDING_APK_STARTED_AT, 0);
        boolean stale = pendingFile != null && System.currentTimeMillis() - startedAt > PENDING_DOWNLOAD_STALE_MS;
        // 버전까지 같아야 재사용 → (최대 3분간 아무 반응 없이 멈춤)
        boolean sameVersion = requestedVersion != null && requestedVersion.equals(pendingVersion);
        if (pendingFile != null && !stale && sameVersion) {
            // 이미 받아뒀거나 받는 중인 파일이 있으면 새로 받지 않고 그걸로 이어서 설치
            Log.d("MainActivity", "startApkDownload: reusing pending download " + pendingFile);
            installDownloadedApk();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Log.d("MainActivity", "startApkDownload: install-unknown-apps not granted, opening settings first");
            prefs.edit().putString(PREF_PENDING_APK_URL, url).apply();
            openInstallPermissionSettings();
            return;
        }
        enqueueApkDownload(url);
    }

    private static String versionParam(String url) {
        try {
            return Uri.parse(url).getQueryParameter("v");
        } catch (Exception e) {
            return null;
        }
    }

    // 타임스탬프 붙인 고유 파일명, 공개 Downloads 폴더 저장 — 파일 관리자·다운로드
    // 앱에서 바로 보이고, setTitle() 미지정으로 알림에 실제 파일명 표시.
    private void enqueueApkDownload(String url) {
        try {
            String fileName = "gaegyebu-update-" + System.currentTimeMillis() + ".apk";
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            request.setMimeType("application/vnd.android.package-archive");
            long downloadId = dm.enqueue(request);
            getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE).edit()
                    .putLong(PREF_PENDING_APK_ID, downloadId)
                    .putString(PREF_PENDING_APK_FILE, fileName)
                    .putString(PREF_PENDING_APK_VERSION, versionParam(url))
                    .putLong(PREF_PENDING_APK_STARTED_AT, System.currentTimeMillis())
                    .remove(PREF_INSTALL_RETRY_COUNT)
                    .apply();
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to start APK download", e);
        }
    }

    // MainActivity 자체가 이미 살아있는 Activity라 그 task에 그대로 붙여야 뒤로가기로 자연스럽게 앱으로 복귀
    private void openInstallPermissionSettings() {
        try {
            Intent permIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(permIntent);
        } catch (Exception settingsEx) {
            // 일부 기기는 앱별 설치 권한 화면 미지원, 폴백은 앱 정보 화면
            Log.e("MainActivity", "ACTION_MANAGE_UNKNOWN_APP_SOURCES failed, falling back", settingsEx);
            Toast.makeText(this, "설정 화면 열기 실패, 앱 정보로 대신 이동: " + settingsEx.getMessage(), Toast.LENGTH_LONG).show();
            Intent fallback = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName()));
            startActivity(fallback);
        }
    }

    private void installDownloadedApk() {
        try {
            SharedPreferences prefs = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
            String fileName = prefs.getString(PREF_PENDING_APK_FILE, null);
            if (fileName == null) {
                Log.d("MainActivity", "installDownloadedApk: no pending file, skip");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                // 다운로드가 끝나기를 기다리는 사이에 권한이 다시 꺼진 경우에 대비한 안전망
                Log.d("MainActivity", "installDownloadedApk: install-unknown-apps not granted, opening settings");
                openInstallPermissionSettings();
                return;
            }
            Log.d("MainActivity", "installDownloadedApk: permission granted, proceeding to install " + fileName);
            File file = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName);
            if (!file.exists()) {
                Log.d("MainActivity", "installDownloadedApk: file not ready yet, " + file.getAbsolutePath());
                return;
            }
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            prefs.edit().putInt(PREF_INSTALL_ATTEMPT_VERSION, currentVersionCode())
                    .putLong(PREF_INSTALL_ATTEMPT_AT, System.currentTimeMillis()).apply();
            startActivity(installIntent);

            // 실제 성공 여부는 checkInstallOutcome()이 다음 onResume에서 버전 코드 변화로 확인한 뒤에 지움
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to launch APK installer", e);
        }
    }

    private void clearPendingDownload(SharedPreferences prefs) {
        String fileName = prefs.getString(PREF_PENDING_APK_FILE, null);
        if (fileName != null) {
            try {
                File file = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName);
                if (file.exists()) file.delete();
            } catch (Exception ignored) {}
        }
        prefs.edit().remove(PREF_PENDING_APK_ID).remove(PREF_PENDING_APK_FILE)
                .remove(PREF_PENDING_APK_STARTED_AT).remove(PREF_PENDING_APK_VERSION)
                .remove(PREF_INSTALL_RETRY_COUNT).apply();
    }

    private int currentVersionCode() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return -1;
        }
    }

    // 설치 인텐트를 띄운 뒤 앱으로 돌아왔는데 버전이 그대로면 삼성 자동 차단 등으로 설치가 안 된 것으로 판단
    private boolean checkInstallOutcome() {
        SharedPreferences prefs = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
        if (!prefs.contains(PREF_INSTALL_ATTEMPT_VERSION)) return false;
        int versionBefore = prefs.getInt(PREF_INSTALL_ATTEMPT_VERSION, -1);
        prefs.edit().remove(PREF_INSTALL_ATTEMPT_VERSION).remove(PREF_INSTALL_ATTEMPT_AT).apply();
        if (currentVersionCode() != versionBefore) {
            // 설치 성공 — 더 이상 필요 없는 다운로드 기록·파일 정리
            clearPendingDownload(prefs);
        } else {
            Toast.makeText(this, "설치가 진행되지 않았어요.\n설치창에서 취소했거나, 보안 설정에서 '자동 차단'이 켜져 있을 수 있어요", Toast.LENGTH_LONG).show();
            clearPendingDownload(prefs);
        }
        return false;
    }

    @Override
    public void onPause() {
        super.onPause();
        // 로그인 화면이 다시 뜨는 문제 → onPause 시점에 강제로 flush
        try {
            android.webkit.CookieManager.getInstance().flush();
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        if (apkDownloadReceiver != null) {
            try {
                unregisterReceiver(apkDownloadReceiver);
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        storeWidgetNav(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        refreshWidgets();
        if (checkInstallOutcome()) return;
        SharedPreferences prefs = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
        String pendingUrl = prefs.getString(PREF_PENDING_APK_URL, null);
        boolean canInstall = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls();
        if (pendingUrl != null && canInstall) {
            Log.d("MainActivity", "onResume: permission now granted, starting deferred download");
            Toast.makeText(this, "설치 권한 확인됨, 다운로드 시작", Toast.LENGTH_SHORT).show();
            prefs.edit().remove(PREF_PENDING_APK_URL).apply();
            enqueueApkDownload(pendingUrl);
        } else if (pendingUrl != null) {
            Toast.makeText(this, "아직 설치 권한이 없어요, 업데이트를 다시 눌러주세요", Toast.LENGTH_LONG).show();
        } else if (prefs.contains(PREF_PENDING_APK_FILE)) {
            int retries = prefs.getInt(PREF_INSTALL_RETRY_COUNT, 0);
            if (retries >= MAX_AUTO_INSTALL_RETRIES) {
                Log.d("MainActivity", "onResume: giving up auto-install after " + retries + " retries, clearing pending state");
                clearPendingDownload(prefs);
            } else {
                prefs.edit().putInt(PREF_INSTALL_RETRY_COUNT, retries + 1).apply();
                installDownloadedApk();
            }
        }
    }

    private void storeWidgetNav(Intent intent) {
        if (intent == null) return;
        String nav = intent.getStringExtra("widget_nav");
        if (nav != null && !nav.isEmpty()) {
            getSharedPreferences("gaegyebu_widget", MODE_PRIVATE)
                .edit().putString("widget_nav", nav).apply();
            intent.removeExtra("widget_nav");
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        refreshWidgets();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "gaegyebu_push",
                "가계부 알림",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("가계부 지출 알림");
            channel.enableVibration(true);
            channel.setShowBadge(true);
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }

    private void refreshWidgets() {
        CompactWidget.updateAll(this);
        BudgetWidget.updateAll(this);
        TodayWidget.updateAll(this);
        PaceWidget.updateAll(this);
        WeeklyWidget.updateAll(this);
    }
}
