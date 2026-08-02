package com.gaegyebu.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.appwidget.AppWidgetProvider;
import android.util.Log;

public abstract class BaseWidget extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        if (!Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())) return;

        int currentNight = context.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;

        SharedPreferences prefs = context.getSharedPreferences(
                "gaegyebu_widget", Context.MODE_PRIVATE);
        int lastNight = prefs.getInt("last_night_mode", -1);

        if (currentNight == lastNight) return;

        prefs.edit().putInt("last_night_mode", currentNight).apply();

        Log.d("BaseWidget", "Night mode changed → refreshing widgets (nightMode=" + currentNight + ")");
        refreshAll(context);
    }

    protected abstract void refreshAll(Context context);
}
