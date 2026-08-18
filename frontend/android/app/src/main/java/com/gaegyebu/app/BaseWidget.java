package com.gaegyebu.app;

import android.content.Context;
import android.content.Intent;
import android.appwidget.AppWidgetProvider;
import android.util.Log;

public abstract class BaseWidget extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        if (Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())) {

            Log.d(
                    "BaseWidget",
                    "Configuration changed → refreshing widgets"
            );

            refreshAll(context);
        }
    }

    protected abstract void refreshAll(Context context);
}