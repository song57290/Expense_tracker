package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.Log;
import android.util.TypedValue;
import android.widget.RemoteViews;

public class WeeklyWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "WeeklyWidget";
    private static final String[] DAY_LABELS = {"월", "화", "수", "목", "금", "토", "일"};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String weekDailyStr = prefs.getString("week_daily", "");
            int todayIndex = parseInt(prefs.getString("week_today_index", "0"));
            long weekTotal = parseLong(prefs.getString("week_total", "0"));
            long weekAvg = parseLong(prefs.getString("week_avg", "0"));
            String updated = prefs.getString("updated", "");

            long[] daily = new long[7];
            if (!weekDailyStr.isEmpty()) {
                String[] parts = weekDailyStr.split(",");
                for (int i = 0; i < 7 && i < parts.length; i++) daily[i] = parseLong(parts[i]);
            }

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_weekly);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);
            WidgetTheme.applyBg(views, R.id.widget_weekly_root, theme, context);

            int[] dayIds = {R.id.weekly_day1, R.id.weekly_day2, R.id.weekly_day3, R.id.weekly_day4,
                    R.id.weekly_day5, R.id.weekly_day6, R.id.weekly_day7};
            int accentColor = 0xFF0D6EFD;

            if (!isSystem) {
                views.setTextColor(R.id.weekly_title, WidgetTheme.dim(dark));
                views.setTextColor(R.id.weekly_updated, WidgetTheme.hint(dark));
                views.setTextColor(R.id.weekly_total, WidgetTheme.text(dark));
                views.setTextColor(R.id.weekly_avg, WidgetTheme.hint(dark));
                for (int i = 0; i < 7; i++) {
                    views.setTextColor(dayIds[i], i == todayIndex ? accentColor : WidgetTheme.hint(dark));
                }
            }

            views.setTextViewText(R.id.weekly_updated, updated);
            views.setTextViewText(R.id.weekly_total, fmt(weekTotal) + "원");
            views.setTextViewText(R.id.weekly_avg, "평균 " + fmt(weekAvg) + "원/일");
            for (int i = 0; i < 7; i++) views.setTextViewText(dayIds[i], DAY_LABELS[i]);

            int mutedColor = dark ? 0x66FFFFFF : 0x33000000;
            views.setImageViewBitmap(R.id.weekly_bars, createBarsBitmap(context, 700, 220, daily, todayIndex, accentColor, mutedColor));

            int widthDp = grantedWidthDp(manager, widgetId, 250);
            int heightDp = grantedHeightDp(manager, widgetId, 110);
            float scale = Math.min(1f, Math.min(widthDp / 250f, heightDp / 110f));
            scale = Math.max(scale, 0.6f);

            views.setTextViewTextSize(R.id.weekly_title, TypedValue.COMPLEX_UNIT_DIP, 12f * scale);
            views.setTextViewTextSize(R.id.weekly_updated, TypedValue.COMPLEX_UNIT_DIP, 9f * scale);
            views.setTextViewTextSize(R.id.weekly_total, TypedValue.COMPLEX_UNIT_DIP, 36f * scale);
            views.setTextViewTextSize(R.id.weekly_avg, TypedValue.COMPLEX_UNIT_DIP, 9f * scale);
            for (int i = 0; i < 7; i++) {
                views.setTextViewTextSize(dayIds[i], TypedValue.COMPLEX_UNIT_DIP, 11f * scale);
            }
            views.setViewPadding(R.id.widget_weekly_root,
                    dpToPx(context, 14 * scale), dpToPx(context, 14 * scale),
                    dpToPx(context, 14 * scale), dpToPx(context, 14 * scale));

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(context, 6, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_weekly_root, pi);

            manager.updateAppWidget(widgetId, views);
            Log.d(TAG, "Weekly widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Weekly widget update failed", e);
        }
    }

    static Bitmap createBarsBitmap(Context context, int w, int h, long[] daily, int todayIndex, int accentColor, int mutedColor) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        long max = 1;
        for (long v : daily) if (v > max) max = v;

        int cols = daily.length;
        float colW = (float) w / cols;
        float barW = colW * 0.34f;
        float maxBarH = h * 0.68f;
        float minBarH = h * 0.06f;
        float baseY = h - h * 0.04f;

        Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        labelPaint.setTextAlign(Paint.Align.CENTER);
        labelPaint.setTypeface(boldTypeface(context));
        // 실제 기기의 위젯 높이/너비와 무관하게 비율(h에 대한 %)로 정의 — 비트맵이
        // fitXY로 위젯의 실제 크기에 맞춰 늘어나므로 이 비율만 지키면 어떤 위젯
        // 크기에서도 총액 대비 상대적으로 같은 비율의 글자 크기를 유지한다.
        labelPaint.setTextSize(h * 0.09f);

        for (int i = 0; i < cols; i++) {
            float cx = colW * i + colW / 2f;
            float ratio = daily[i] / (float) max;
            float barH = Math.max(minBarH, ratio * maxBarH);
            boolean isToday = i == todayIndex;

            Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
            bar.setColor(isToday ? accentColor : mutedColor);
            RectF rect = new RectF(cx - barW / 2f, baseY - barH, cx + barW / 2f, baseY);
            canvas.drawRoundRect(rect, barW / 2f, barW / 2f, bar);

            if (isToday && daily[i] > 0) {
                labelPaint.setColor(accentColor);
                String label = fmt(daily[i]) + "원";
                // 좌우 끝 칸(월/일)에서는 글자 중심을 그대로 두면 비트맵 경계 밖으로
                // 잘려나가므로, 측정한 폭만큼 안쪽으로 당겨 항상 캔버스 안에 들어오게 한다.
                float labelW = labelPaint.measureText(label);
                float labelCx = Math.max(labelW / 2f, Math.min(w - labelW / 2f, cx));
                canvas.drawText(label, labelCx, baseY - barH - h * 0.06f, labelPaint);
            }
        }

        return bmp;
    }

    private static int parseInt(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return 0;
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
                    new android.content.ComponentName(context, WeeklyWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " weekly widgets");
            for (int id : ids) updateWidget(context, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
