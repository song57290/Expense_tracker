package com.gaegyebu.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RingerModePlugin.class);
        registerPlugin(WidgetDataPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        refreshWidgets();
        storeWidgetNav(getIntent());
        setupDownloadListener();
    }

    // Capacitor's WebView has no built-in file-download support — a request whose
    // response is Content-Disposition: attachment (e.g. the APK update download)
    // is silently dropped otherwise. Hand it off to the system browser instead.
    private void setupDownloadListener() {
        WebView webView = getBridge().getWebView();
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                Log.e("MainActivity", "Failed to hand off download to browser", e);
            }
        });
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
        DashboardWidget.updateAll(this);
        TodayWidget.updateAll(this);
    }
}
