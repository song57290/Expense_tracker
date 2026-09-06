package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.util.TypedValue;
import android.widget.RemoteViews;

import java.util.Calendar;

public class PaceWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "PaceWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean monthStale = isStale(prefs.getString("month_key", ""), currentMonthKey());
            long expense = monthStale ? 0 : parseLong(prefs.getString("expense", "0"));
            String updated = prefs.getString("updated", "");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_pace);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);
            WidgetTheme.applyBg(views, R.id.widget_pace_root, theme, context);

            Calendar cal = Calendar.getInstance();
            int today = cal.get(Calendar.DAY_OF_MONTH);
            int daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
            long dailyAvg = today > 0 ? expense / today : 0;
            long projected = dailyAvg * daysInMonth;

            if (!isSystem) {
                views.setTextColor(R.id.pace_title, WidgetTheme.dim(dark));
                views.setTextColor(R.id.pace_daily, WidgetTheme.text(dark));
                views.setTextColor(R.id.pace_daily_label, WidgetTheme.hint(dark));
                views.setTextColor(R.id.pace_proj_label, WidgetTheme.hint(dark));
                views.setTextColor(R.id.pace_proj, dark ? 0xFF7BAFF0 : 0xFF0D6EFD);
                views.setInt(R.id.pace_divider, "setBackgroundColor", dark ? 0x33FFFFFF : 0x33000000);
                views.setTextColor(R.id.pace_updated, WidgetTheme.hint(dark));
            }

            views.setTextViewText(R.id.pace_daily, fmt(dailyAvg) + "원");
            views.setTextViewText(R.id.pace_proj, fmt(projected) + "원");
            views.setTextViewText(R.id.pace_updated, updated);

            int widthDp = grantedWidthDp(manager, widgetId, 140);
            int heightDp = grantedHeightDp(manager, widgetId, 140);
            float scale = Math.min(1f, Math.min(widthDp / 140f, heightDp / 140f));
            scale = Math.max(scale, 0.6f);

            views.setTextViewTextSize(R.id.pace_title, TypedValue.COMPLEX_UNIT_DIP, 12f * scale);
            views.setTextViewTextSize(R.id.pace_daily, TypedValue.COMPLEX_UNIT_DIP, 26f * scale);
            views.setTextViewTextSize(R.id.pace_daily_label, TypedValue.COMPLEX_UNIT_DIP, 11f * scale);
            views.setTextViewTextSize(R.id.pace_proj_label, TypedValue.COMPLEX_UNIT_DIP, 11f * scale);
            views.setTextViewTextSize(R.id.pace_proj, TypedValue.COMPLEX_UNIT_DIP, 18f * scale);
            views.setTextViewTextSize(R.id.pace_updated, TypedValue.COMPLEX_UNIT_DIP, 9f * scale);
            views.setViewPadding(R.id.widget_pace_root,
                    dpToPx(context, 14 * scale), dpToPx(context, 14 * scale),
                    dpToPx(context, 14 * scale), dpToPx(context, 14 * scale));

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(context, 5, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_pace_root, pi);

            manager.updateAppWidget(widgetId, views);
            Log.d(TAG, "Pace widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Pace widget update failed", e);
        }
    }

    private static long parseLong(String s) {
        try {
            return Long.parseLong(s.replace(",", "").trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static String fmt(long n) {
        return String.format("%,d", n);
    }

    @Override
    protected void refreshAll(Context context) {
        updateAll(context);
    }

    public static void updateAll(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            android.content.ComponentName comp =
                    new android.content.ComponentName(context, PaceWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " pace widgets");
            for (int id : ids) updateWidget(context, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
