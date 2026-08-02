package com.gaegyebu.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.util.Log;

public class WidgetThemeChangeReceiver extends BroadcastReceiver {

    private static final String TAG = "WidgetThemeChange";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())) return;

        int currentNight = context.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;

        // 야간모드가 실제로 바뀐 경우에만 갱신
        SharedPreferences prefs = context.getSharedPreferences(
                "gaegyebu_widget", Context.MODE_PRIVATE);
        int lastNight = prefs.getInt("last_night_mode", -1);

        if (currentNight == lastNight) return;

        prefs.edit().putInt("last_night_mode", currentNight).apply();

        Log.d(TAG, "Night mode changed → updating all widgets (nightMode=" + currentNight + ")");

        CompactWidget.updateAll(context);
        BudgetWidget.updateAll(context);
        DashboardWidget.updateAll(context);
        TodayWidget.updateAll(context);
    }
}
