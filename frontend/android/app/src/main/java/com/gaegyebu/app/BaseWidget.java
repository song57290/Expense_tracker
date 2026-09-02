package com.gaegyebu.app;

import android.content.Context;
import android.content.Intent;
import android.appwidget.AppWidgetProvider;
import android.util.Log;

import java.util.Calendar;

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

    // Cached widget data is only ever pushed while the app runs (Home/Calendar/Edit
    // screens call the WidgetData Capacitor plugin). Since the OS still wakes this
    // provider's onUpdate() roughly every 30 minutes (see updatePeriodMillis in the
    // widget's appwidget-provider XML) even with the app closed, these let each widget
    // compare the device's real current month/day against the last-synced values and
    // fall back to a zeroed, fresh-period display instead of showing stale numbers
    // carried over from last month.

    protected static String currentMonthKey() {
        Calendar cal = Calendar.getInstance();
        return String.format("%04d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1);
    }

    protected static String currentTodayKey() {
        Calendar cal = Calendar.getInstance();
        return String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    protected static String currentMonthLabel() {
        Calendar cal = Calendar.getInstance();
        return cal.get(Calendar.YEAR) + "년 " + (cal.get(Calendar.MONTH) + 1) + "월";
    }

    protected static String currentTodayLabel() {
        Calendar cal = Calendar.getInstance();
        return (cal.get(Calendar.MONTH) + 1) + "월 " + cal.get(Calendar.DAY_OF_MONTH) + "일";
    }

    // True once we know a baseline (storedKey non-empty) and it no longer matches today's key.
    protected static boolean isStale(String storedKey, String currentKey) {
        return storedKey != null && !storedKey.isEmpty() && !storedKey.equals(currentKey);
    }
}