package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.widget.RemoteViews;

public class HomeWidget extends AppWidgetProvider {

    static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "HomeWidget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    static void updateWidget(Context ctx, AppWidgetManager mgr, int widgetId) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String income   = prefs.getString("income",  "---");
            String expense  = prefs.getString("expense", "---");
            String balance  = prefs.getString("balance", "---");
            String month    = prefs.getString("month",   "--월");
            String updated  = prefs.getString("updated", "");

            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_home);
            views.setTextViewText(R.id.widget_month,   month);
            views.setTextViewText(R.id.widget_income,  income + "원");
            views.setTextViewText(R.id.widget_expense, expense + "원");
            views.setTextViewText(R.id.widget_balance, balance + "원");
            views.setTextViewText(R.id.widget_updated, updated);

            Intent intent = new Intent(ctx, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);

            mgr.updateAppWidget(widgetId, views);
            Log.d(TAG, "Widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Widget update failed", e);
        }
    }

    public static void updateAll(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            android.content.ComponentName comp =
                    new android.content.ComponentName(ctx, HomeWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " widgets");
            for (int id : ids) updateWidget(ctx, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
