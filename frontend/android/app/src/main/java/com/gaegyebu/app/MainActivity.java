package com.gaegyebu.app;

import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.WebView;
import android.util.Log;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

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
    // 직전 시도의 최종 상태 브로드캐스트가 새 시도를 시작한 뒤에야 뒤늦게 도착하면
    // (테스트를 연달아 할 때 특히) 그 낡은 값이 지금 진행 중인 시도의 결과인 것처럼
    // 잘못 저장돼버린다 — 지금 커밋한 세션 id를 기록해두고 그것과 일치하는
    // 브로드캐스트만 반영한다.
    private static final String PREF_ACTIVE_SESSION_ID = "active_install_session_id";
    // 우리가 직접 띄우는 확인창에서 "업데이트"를 눌렀는지 — 이게 true인 동안은(설정에서
    // 돌아와 재시도할 때 등) 확인창을 다시 띄우지 않는다.
    private static final String PREF_USER_CONFIRMED_INSTALL = "user_confirmed_install";
    // "설정으로 이동" 버튼을 눌러 보안 설정으로 보낸 경우에만 true — onResume()의
    // 자동 재시도가 이 플래그가 있을 때만 동작하게 해서, 남아있는 pending 파일
    // 때문에 아무 때나 앱을 열어도 확인창이 다시 뜨는 걸 막는다.
    private static final String PREF_AWAITING_SETTINGS_RETURN = "awaiting_settings_return";
    // ACTION_VIEW + startActivityForResult로는 "취소"와 "확인은 눌렀는데 삼성 자동
    // 차단으로 막힘"이 똑같이 RESULT_CANCELED로 돌아와 구분이 안 됐다 — 대신
    // PackageInstaller.Session API로 설치하면 STATUS_FAILURE_ABORTED(취소)와
    // STATUS_FAILURE_BLOCKED(차단)를 구조적으로 구분해서 받을 수 있어 이걸로 교체한다.
    private static final String ACTION_INSTALL_STATUS = "com.gaegyebu.app.INSTALL_STATUS";
    // 이전 빌드에서 쓰던 prefs 키 — 남아있을 수 있어 정리 목적으로만 참조.
    private static final String PREF_LAST_INSTALL_RESULT = "last_install_result_code";
    private static final String PREF_LAST_INSTALL_STATUS = "last_install_status_code";
    private static final long PENDING_DOWNLOAD_STALE_MS = 10 * 60 * 1000;
    private static final int MAX_AUTO_INSTALL_RETRIES = 2;
    private BroadcastReceiver apkDownloadReceiver;
    private BroadcastReceiver installStatusReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RingerModePlugin.class);
        registerPlugin(WidgetDataPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        refreshWidgets();
        storeWidgetNav(getIntent());
        setupDownloadListener();
        registerInstallStatusReceiver();
        // 100%로 고정해 시스템 설정과 무관하게 항상 디자인 크기 그대로 렌더링
        getBridge().getWebView().getSettings().setTextZoom(100);
    }

    // PackageInstaller.Session.commit()에 넘긴 PendingIntent가 트리거될 때마다
    // 이 리시버로 상태가 온다 — 확인창이 필요하면(PENDING_USER_ACTION) 그 화면을
    // 띄우고, 최종 결과(성공/취소/차단 등)가 오면 다음 onResume에서 읽을 수 있게
    // 저장해둔다.
    private void registerInstallStatusReceiver() {
        installStatusReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                int sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
                int activeSessionId = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE)
                        .getInt(PREF_ACTIVE_SESSION_ID, -1);
                if (sessionId != activeSessionId) {
                    // 이미 끝난(또는 교체된) 예전 세션의 뒤늦은 콜백 — 지금 진행 중인
                    // 시도와 무관하니 무시한다.
                    Log.d("MainActivity", "installStatusReceiver: stale session " + sessionId
                            + " (active=" + activeSessionId + "), ignoring");
                    return;
                }
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    // Intent.getParcelableExtra(String)은 API 33+에서 deprecated —
                    // 일부 기기/버전에서 null을 돌려줘 확인창이 아예 안 뜨던 원인이라
                    // 타입 지정 버전으로 명확히 가져온다.
                    Intent confirmIntent = Build.VERSION.SDK_INT >= 33
                            ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                            : intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirmIntent != null) {
                        confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        try {
                            startActivity(confirmIntent);
                        } catch (Exception e) {
                            Log.e("MainActivity", "Failed to launch install confirm UI", e);
                            Toast.makeText(MainActivity.this, "설치 확인창을 열지 못했어요", Toast.LENGTH_LONG).show();
                        }
                    } else {
                        Log.e("MainActivity", "installStatusReceiver: EXTRA_INTENT was null on PENDING_USER_ACTION");
                        Toast.makeText(MainActivity.this, "설치 확인창을 열지 못했어요", Toast.LENGTH_LONG).show();
                    }
                    return;
                }
                Log.d("MainActivity", "installStatusReceiver: final status=" + status);
                getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE).edit()
                        .putInt(PREF_LAST_INSTALL_STATUS, status).apply();
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_INSTALL_STATUS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(installStatusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(installStatusReceiver, filter);
        }
    }

    // Capacitor's WebView has no built-in file-download support, so
    // Content-Disposition: attachment responses (the APK update) are downloaded
    // via DownloadManager and installed via PackageInstaller.Session once complete.
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
                SharedPreferences prefs = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
                long pendingId = prefs.getLong(PREF_PENDING_APK_ID, -1);
                if (id == -1 || id != pendingId) return;
                if (downloadStatus(id) == DownloadManager.STATUS_FAILED) {
                    // 실패한 채로 놔두면 installDownloadedApk()이 파일을 못 찾고 매번
                    // 조용히 아무 것도 안 하고 끝나 버튼을 계속 눌러도 반응이 없어 보인다
                    // — 여기서 정리해 다음 시도가 새로 다운로드를 받게 한다.
                    Log.d("MainActivity", "apkDownloadReceiver: download failed, clearing pending state");
                    getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE).edit()
                            .remove(PREF_PENDING_APK_ID).remove(PREF_PENDING_APK_FILE)
                            .remove(PREF_PENDING_APK_STARTED_AT).remove(PREF_PENDING_APK_VERSION)
                            .remove(PREF_INSTALL_RETRY_COUNT).apply();
                    Toast.makeText(MainActivity.this, "업데이트 다운로드에 실패했어요, 다시 시도해주세요", Toast.LENGTH_LONG).show();
                    return;
                }
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

    private int downloadStatus(long downloadId) {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        try (android.database.Cursor c = dm.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (c == null || !c.moveToFirst()) return -1;
            return c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        } catch (Exception e) {
            return -1;
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
        long pendingId = prefs.getLong(PREF_PENDING_APK_ID, -1);
        // 기록만 남고 실제 다운로드는 실패/삭제된 경우 재사용하면 영구히 무반응
        // 상태가 되니, DownloadManager에 물어봐서 정말 살아있는 다운로드인지 확인한다.
        int status = pendingId != -1 ? downloadStatus(pendingId) : -1;
        boolean reusable = status != -1 && status != DownloadManager.STATUS_FAILED;
        if (pendingFile != null && !stale && sameVersion && reusable) {
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
            Toast.makeText(this, "설정 화면 열기 실패, 앱 정보로 이동", Toast.LENGTH_LONG).show();
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
            // 차단 판정 후 재시도(설정에서 돌아왔을 때 등)를 걸기 전에, 사실 직전 설치가
            // 느리게라도 이미 성공했는지부터 확인한다 — 아니면 이미 최신인데도 확인창을
            // 또 띄워버린다(뒤로 돌아왔을 때 업데이트 다이얼로그가 두 번 뜨던 원인).
            String pendingVersionStr = prefs.getString(PREF_PENDING_APK_VERSION, null);
            if (pendingVersionStr != null) {
                try {
                    if (currentVersionCode() >= Integer.parseInt(pendingVersionStr)) {
                        Log.d("MainActivity", "installDownloadedApk: already up to date, skipping reinstall");
                        clearPendingDownload(prefs);
                        Toast.makeText(this, "업데이트 완료!", Toast.LENGTH_SHORT).show();
                        return;
                    }
                } catch (NumberFormatException ignored) {}
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
            prefs.edit().putInt(PREF_INSTALL_ATTEMPT_VERSION, currentVersionCode())
                    .putLong(PREF_INSTALL_ATTEMPT_AT, System.currentTimeMillis())
                    .remove(PREF_LAST_INSTALL_STATUS).apply();

            PackageInstaller installer = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                    new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            int sessionId = installer.createSession(params);
            prefs.edit().putInt(PREF_ACTIVE_SESSION_ID, sessionId).apply();
            PackageInstaller.Session session = installer.openSession(sessionId);
            try {
                try (InputStream in = new FileInputStream(file);
                     OutputStream out = session.openWrite("gaegyebu-update", 0, file.length())) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
                    session.fsync(out);
                }
                Intent statusIntent = new Intent(ACTION_INSTALL_STATUS).setPackage(getPackageName());
                // 시스템이 이 PendingIntent를 다시 보낼 때 EXTRA_STATUS 등을 채워 넣어야
                // 해서 FLAG_MUTABLE이 필수 — IMMUTABLE로 두면 결과를 못 받는다.
                int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                        | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent statusPi = PendingIntent.getBroadcast(this, sessionId, statusIntent, piFlags);
                session.commit(statusPi.getIntentSender());
            } finally {
                session.close();
            }
            // 시스템 설치 확인창 버튼을 누르는 순간은 우리 코드가 감지할 수 없어
            // "진행 중" 토스트는 따로 띄우지 않는다 — 실제로 설치가 끝났을 때만 알려준다.

            // 실제 성공/취소/차단 여부는 installStatusReceiver가 받아서 저장해두고,
            // checkInstallOutcome()이 다음 onResume에서 그 값과 버전 코드 변화를 같이 확인한다.
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to launch APK installer", e);
        }
    }

    private void clearInstallAttempt(SharedPreferences prefs) {
        prefs.edit()
                .remove(PREF_INSTALL_ATTEMPT_VERSION)
                .remove(PREF_INSTALL_ATTEMPT_AT)
                .remove(PREF_LAST_INSTALL_RESULT)
                .remove(PREF_LAST_INSTALL_STATUS)
                .apply();
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
                .remove(PREF_INSTALL_RETRY_COUNT).remove(PREF_ACTIVE_SESSION_ID)
                .remove(PREF_USER_CONFIRMED_INSTALL).remove(PREF_AWAITING_SETTINGS_RETURN).apply();
    }

    private int currentVersionCode() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return -1;
        }
    }

    // STATUS_SUCCESS/STATUS_FAILURE_BLOCKED/STATUS_FAILURE_ABORTED 값 그대로
    // 성공/차단/취소를 구분한다 — 콜백이 끝까지 안 오면 자동으로 아무 화면도 띄우지
    // 않고 그대로 둔다.
    //
    // 단, 자동 차단이 꺼져 있는 정상 설치에서도 onResume이 콜백 브로드캐스트보다
    // 먼저 도착하는 순간이 있어(둘 다 메인 스레드 큐에 올라가는 별개의 메시지라
    // 순서가 보장 안 됨) 이 시점엔 아직 "안 옴"과 "곧 옴"을 구분할 수 없다 —
    // 그래서 바로 차단으로 단정하지 않고 잠깐 기다렸다가 재확인한다.
    //
    // 실기기 테스트로 추가 확인: 구글 Play 프로텍트가 출처를 알 수 없는 APK를 검사하며
    // "무시하고 설치하기" 확인창을 한 번 더 띄우는 경우가 있는데, 이건 검사 자체보다
    // 사용자가 그 창을 읽고 누르기까지의 시간이 더 크게 좌우한다 — 6초로도 부족한
    // 사례가 실기기에서 확인돼 총 대기 시간을 24초로 더 넉넉히 늘린다.
    private static final long INSTALL_OUTCOME_GRACE_MS = 3000;
    private static final int INSTALL_OUTCOME_MAX_GRACE_ROUNDS = 8;

    private boolean checkInstallOutcome() {
        SharedPreferences prefs = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
        if (!prefs.contains(PREF_INSTALL_ATTEMPT_VERSION)) return false;
        int versionBefore = prefs.getInt(PREF_INSTALL_ATTEMPT_VERSION, -1);
        if (currentVersionCode() != versionBefore) {
            // 설치 성공 — 더 이상 필요 없는 다운로드 기록·파일 정리
            prefs.edit().remove(PREF_INSTALL_ATTEMPT_VERSION).remove(PREF_INSTALL_ATTEMPT_AT)
                    .remove(PREF_LAST_INSTALL_RESULT).remove(PREF_LAST_INSTALL_STATUS).apply();
            clearPendingDownload(prefs);
            Toast.makeText(this, "업데이트 완료!", Toast.LENGTH_SHORT).show();
            return false;
        }
        resolveInstallOutcome(prefs, versionBefore, 0);
        return true;
    }

    private void resolveInstallOutcome(SharedPreferences prefs, int versionBefore, int graceRound) {
        if (!prefs.contains(PREF_INSTALL_ATTEMPT_VERSION)) return;

        // 업데이트 성공
        if (currentVersionCode() != versionBefore) {
            clearInstallAttempt(prefs);
            clearPendingDownload(prefs);
            Toast.makeText(this, "업데이트 완료!", Toast.LENGTH_SHORT).show();
            return;
        }

        // 아직 설치 결과가 오지 않음
        if (!prefs.contains(PREF_LAST_INSTALL_STATUS)) {
            if (graceRound < INSTALL_OUTCOME_MAX_GRACE_ROUNDS) {
                new android.os.Handler(getMainLooper())
                        .postDelayed(
                                () -> resolveInstallOutcome(
                                        prefs,
                                        versionBefore,
                                        graceRound + 1
                                ),
                                INSTALL_OUTCOME_GRACE_MS
                        );
            } else {
                Log.d("MainActivity", "resolveInstallOutcome: no callback after max grace");
                clearInstallAttempt(prefs);
                showInstallFailedDialog(prefs);
            }
            return;
        }

        int status = prefs.getInt(
                PREF_LAST_INSTALL_STATUS,
                Integer.MIN_VALUE
        );

        clearInstallAttempt(prefs);
        Log.d("MainActivity", "resolveInstallOutcome: status=" + status);

        if (status == PackageInstaller.STATUS_SUCCESS) {
            clearPendingDownload(prefs);
            Toast.makeText(this, "업데이트 완료!", Toast.LENGTH_SHORT).show();
        } else {
            // 실기기 확인 결과 취소와 자동 차단이 똑같은 status로 와서 코드만으로는
            // 구분이 안 된다 — 어느 쪽인지 단정하지 않고, 자동 차단이 원인이라면
            // 직접 설정에서 끌 수 있게 안내만 하고 강제로 이동시키지는 않는다.
            showInstallFailedDialog(prefs);
        }
    }

    private void showInstallFailedDialog(SharedPreferences prefs) {
        android.view.View view = getLayoutInflater().inflate(R.layout.dialog_install_failed, null);
        android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this)
                .setView(view)
                .create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT));
        }
        view.findViewById(R.id.dialog_btn_dismiss).setOnClickListener(v -> {
            clearPendingDownload(prefs);
            dialog.dismiss();
        });
        view.findViewById(R.id.dialog_btn_settings).setOnClickListener(v -> {
            // 다운로드된 파일·기록은 지우지 않고 남겨둔다 — 설정에서 자동
            // 차단을 끄고 뒤로가기로 돌아오면 onResume()의 재시도 경로가
            // 자동으로 다시 설치를 시도한다. 이 플래그가 있을 때만 재시도가
            // 동작하므로, 그냥 나중에 앱을 여는 것만으로는 재시도되지 않는다.
            prefs.edit().remove(PREF_INSTALL_RETRY_COUNT)
                    .putBoolean(PREF_AWAITING_SETTINGS_RETURN, true).apply();
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS));
            } catch (Exception ignored) {}
            dialog.dismiss();
        });
        dialog.show();
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
        if (installStatusReceiver != null) {
            try {
                unregisterReceiver(installStatusReceiver);
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

        SharedPreferences prefs =
                getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);

        // 1. 설치 권한 설정 화면에서 돌아온 경우
        String pendingUrl =
                prefs.getString(PREF_PENDING_APK_URL, null);

        boolean canInstall =
                Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                        || getPackageManager().canRequestPackageInstalls();

        if (pendingUrl != null && canInstall) {
            Log.d(
                    "MainActivity",
                    "onResume: install permission granted, starting deferred download"
            );

            prefs.edit()
                    .remove(PREF_PENDING_APK_URL)
                    .apply();

            enqueueApkDownload(pendingUrl);
            return;
        }

        // 아직 권한을 허용하지 않았다면 아무것도 하지 않는다.
        if (pendingUrl != null) {
            return;
        }

        // 2. 자동 차단 설정 화면에 "설정으로 이동" 버튼으로 다녀온 경우에만 재시도
        // — 이 플래그 없이 단순히 pending 파일만 남아있는 상태로 다시 앱을 열었을
        // 땐 재시도하지 않는다(안 그러면 아무 때나 앱을 켜도 확인창이 다시 뜬다).
        if (prefs.getBoolean(PREF_AWAITING_SETTINGS_RETURN, false)) {
            if (!prefs.contains(PREF_PENDING_APK_FILE)) {
                prefs.edit().remove(PREF_AWAITING_SETTINGS_RETURN).apply();
            } else {
                int retries = prefs.getInt(PREF_INSTALL_RETRY_COUNT, 0);
                if (retries >= MAX_AUTO_INSTALL_RETRIES) {
                    Log.d("MainActivity", "onResume: giving up auto-install after " + retries + " retries");
                    clearPendingDownload(prefs);
                } else {
                    prefs.edit().putInt(PREF_INSTALL_RETRY_COUNT, retries + 1).apply();
                    installDownloadedApk();
                }
            }
        } else if (prefs.contains(PREF_PENDING_APK_FILE)) {
            // 플래그 없이 남은 낡은 pending 파일 — 조용히 정리만 한다.
            Log.d("MainActivity", "onResume: stale pending file without settings-return flag, clearing");
            clearPendingDownload(prefs);
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
        GoalWidget.updateAll(this);
    }
}
