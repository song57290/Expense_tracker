package com.gaegyebu.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // super.onCreate()보다 먼저 Window 배경을 지정
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor("#A86AF6")));

        registerPlugin(RingerModePlugin.class);
        registerPlugin(WidgetDataPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.parseColor("#A86AF6"));
        }
        createNotificationChannel();
        refreshWidgets();
        storeWidgetNav(getIntent());
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