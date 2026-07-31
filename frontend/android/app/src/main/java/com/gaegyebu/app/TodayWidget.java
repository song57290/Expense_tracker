package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

public class TodayWidget extends AppWidgetProvider {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "TodayWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String todayDate  = prefs.getString("today_date",  "--월 --일");
            String todayTotal = prefs.getString("today_total", "0");
            String todayCats  = prefs.getString("today_cats",  "");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            WidgetTheme.applyBg(views, R.id.widget_today_root, theme, context);
            views.setTextColor(R.id.today_date,  WidgetTheme.dim(dark));
            views.setTextColor(R.id.today_total, WidgetTheme.expense(dark));
            views.setTextColor(R.id.today_empty, WidgetTheme.hint(dark));

            views.setTextViewText(R.id.today_date,  todayDate);
            views.setTextViewText(R.id.today_total, fmt(parseLong(todayTotal)) + "원");

            // 카테고리 TOP 3 파싱 ("식비:23000,교통:8400,기타:16400")
            int[] rowIds = {R.id.today_row1, R.id.today_row2, R.id.today_row3};
            int[] nameIds = {R.id.today_cat1_name, R.id.today_cat2_name, R.id.today_cat3_name};
            int[] amtIds  = {R.id.today_cat1_amt,  R.id.today_cat2_amt,  R.id.today_cat3_amt};

            String[] entries = todayCats.isEmpty() ? new String[0] : todayCats.split(",");

            for (int i = 0; i < 3; i++) {
                if (i < entries.length) {
                    String[] parts = entries[i].split(":", 2);
                    String catName = parts.length > 0 ? parts[0] : "";
                    long   catAmt  = parts.length > 1 ? parseLong(parts[1]) : 0;
                    views.setViewVisibility(rowIds[i], View.VISIBLE);
                    views.setTextColor(nameIds[i], WidgetTheme.text(dark));
                    views.setTextColor(amtIds[i], WidgetTheme.expense(dark));
                    views.setTextViewText(nameIds[i], catName);
                    views.setTextViewText(amtIds[i],  fmt(catAmt) + "원");
                } else {
                    views.setViewVisibility(rowIds[i], View.GONE);
                }
            }

            // 오늘 지출 없을 때
            views.setViewVisibility(R.id.today_empty,
                    entries.length == 0 ? View.VISIBLE : View.GONE);

            // 클릭 → 앱 실행
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(context, 4, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_today_root, pi);

            manager.updateAppWidget(widgetId, views);
            Log.d(TAG, "Today widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Today widget update failed", e);
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

    public static void updateAll(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            android.content.ComponentName comp =
                    new android.content.ComponentName(context, TodayWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " today widgets");
            for (int id : ids) updateWidget(context, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
