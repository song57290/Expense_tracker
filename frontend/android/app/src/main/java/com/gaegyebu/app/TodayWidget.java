package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

public class TodayWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "TodayWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean dayStale  = isStale(prefs.getString("today_key", ""), currentTodayKey());
            String todayDate  = dayStale ? currentTodayLabel() : prefs.getString("today_date",  "--월 --일");
            String todayTotal = dayStale ? "0" : prefs.getString("today_total", "0");
            String todayCats  = dayStale ? "" : prefs.getString("today_cats",  "");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);
            WidgetTheme.applyBg(views, R.id.widget_today_root, theme, context);
            if (!isSystem) {
                views.setTextColor(R.id.today_date,  WidgetTheme.primary(dark));
                views.setTextColor(R.id.today_total, WidgetTheme.expense(dark));
                views.setTextColor(R.id.today_empty, WidgetTheme.hint(dark));
                views.setInt(R.id.today_divider, "setBackgroundColor",
                        dark ? 0x33FFFFFF : 0x33000000);
            }

            views.setTextViewText(R.id.today_date,  todayDate);
            long totalAmt = parseLong(todayTotal);
            views.setTextViewText(R.id.today_total,
                    totalAmt > 0 ? "-" + fmt(totalAmt) + "원" : "0원");

            // 카테고리 TOP 5 파싱 ("식비:23000,교통:8400,기타:16400,...")
            int[] rowIds  = {R.id.today_row1,      R.id.today_row2,      R.id.today_row3,      R.id.today_row4,      R.id.today_row5};
            int[] nameIds = {R.id.today_cat1_name, R.id.today_cat2_name, R.id.today_cat3_name, R.id.today_cat4_name, R.id.today_cat5_name};
            int[] amtIds  = {R.id.today_cat1_amt,  R.id.today_cat2_amt,  R.id.today_cat3_amt,  R.id.today_cat4_amt,  R.id.today_cat5_amt};

            String[] entries = todayCats.isEmpty() ? new String[0] : todayCats.split(",");

            for (int i = 0; i < 5; i++) {
                if (i < entries.length) {
                    String[] parts = entries[i].split(":", 2);
                    String catName = parts.length > 0 ? parts[0] : "";
                    long   catAmt  = parts.length > 1 ? parseLong(parts[1]) : 0;
                    views.setViewVisibility(rowIds[i], View.VISIBLE);
                    if (!isSystem) {
                        views.setTextColor(nameIds[i], WidgetTheme.text(dark));
                        views.setTextColor(amtIds[i], WidgetTheme.expense(dark));
                    }
                    views.setTextViewText(nameIds[i], catName);
                    views.setTextViewText(amtIds[i],  "-" + fmt(catAmt) + "원");
                } else {
                    views.setViewVisibility(rowIds[i], View.GONE);
                }
            }

            // 오늘 지출 없을 때
            views.setViewVisibility(R.id.today_empty,
                    entries.length == 0 ? View.VISIBLE : View.GONE);

            // minWidth 180dp / minHeight 110dp는 선언일 뿐, 실제로 받는 크기는
            // 화면·홈 화면 그리드 밀도에 따라 그보다 작을 수 있다. 카테고리가
            // 5개까지 쌓이면 특히 세로 공간이 빠듯해지므로, 좁게/낮게 받은
            // 경우 글씨 크기와 줄 간격을 줄인다.
            int widthDp = grantedWidthDp(manager, widgetId, 180);
            int heightDp = grantedHeightDp(manager, widgetId, 110);
            boolean tight = widthDp < 160 || heightDp < 95;

            views.setTextViewTextSize(R.id.today_date, android.util.TypedValue.COMPLEX_UNIT_DIP, tight ? 12f : 14f);
            views.setTextViewTextSize(R.id.today_total, android.util.TypedValue.COMPLEX_UNIT_DIP, tight ? 16f : 20f);
            for (int i = 0; i < 5; i++) {
                views.setTextViewTextSize(nameIds[i], android.util.TypedValue.COMPLEX_UNIT_DIP, tight ? 11f : 13f);
                views.setTextViewTextSize(amtIds[i], android.util.TypedValue.COMPLEX_UNIT_DIP, tight ? 11f : 13f);
            }
            views.setViewPadding(R.id.widget_today_root,
                    dpToPx(context, tight ? 10 : 14), dpToPx(context, tight ? 10 : 14),
                    dpToPx(context, tight ? 10 : 14), dpToPx(context, tight ? 10 : 14));
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                views.setViewLayoutMargin(R.id.today_divider, RemoteViews.MARGIN_TOP, tight ? 6 : 10, android.util.TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.today_row1, RemoteViews.MARGIN_TOP, tight ? 6 : 10, android.util.TypedValue.COMPLEX_UNIT_DIP);
                for (int i = 1; i < 5; i++) {
                    views.setViewLayoutMargin(rowIds[i], RemoteViews.MARGIN_TOP, tight ? 3 : 5, android.util.TypedValue.COMPLEX_UNIT_DIP);
                }
            }

            // 클릭 → 앱 실행
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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

    @Override
    protected void refreshAll(Context context) {
        updateAll(context);
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
