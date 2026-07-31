package com.gaegyebu.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RingerModePlugin.class);
        registerPlugin(WidgetDataPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        refreshWidgets();
    }

    @Override
    public void onResume() {
        super.onResume();
        refreshWidgets();
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
