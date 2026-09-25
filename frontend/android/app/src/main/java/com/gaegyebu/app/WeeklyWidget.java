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
import android.os.Build;
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

            int widthDp = grantedWidthDp(manager, widgetId, 250);
            int heightDp = grantedHeightDp(manager, widgetId, 110);
            // 1f로 위쪽을 완전히 막지는 않되, 실제 위젯이 기본보다 훨씬 크게 배치된
            // 경우까지 글씨가 과도하게 커지지 않도록 1.3f를 상한으로 둔다.
            float scale = Math.max(0.6f, Math.min(1.3f, Math.min(widthDp / 250f, heightDp / 110f)));
            // 위젯 설정 화면에서 사용자가 직접 고른 글자 크기(작게/보통/크게) — 자동 배율
            // 위에 추가로 곱해진다.
            scale *= WidgetTheme.textScaleMultiplier(WidgetTheme.getTextSizePref(prefs, widgetId));
            // 자동 배율에 '크게' 설정까지 곱해지면 라벨이 겹칠 만큼 커지므로 상한을 다시 건다.
            scale = Math.min(scale, 1.45f);

            // 막대그래프는 고정 크기 비트맵을 fitXY로 늘려서 채우는데, 실제로 배정된
            // 폭:높이 비율이 그 고정 비율이랑 많이 다르면(특히 위젯이 넓게 배치된 경우)
            // 숫자가 세로로 눌려 보인다 — 다른 요소들이 차지할 공간을 대략 뺀 나머지를
            // 막대 영역의 실제 크기로 추정해 그 비율 그대로 비트맵을 그린다.
            float titleRowDp = Math.max(12f * scale, 9f * scale + 2f + 9f * scale) * 1.25f;
            float totalRowDp = -2f * scale + 28f * scale * 1.25f;
            float dayRowDp = 2f + 11f * scale * 1.25f;
            float nonBarsDp = 14f * scale * 2f + titleRowDp + totalRowDp + 8f + dayRowDp;
            float barsHeightDp = Math.max(30f, heightDp - nonBarsDp);
            float barsWidthDp = Math.max(60f, widthDp - 14f * scale * 2f);
            int barsWpx = dpToPx(context, barsWidthDp);
            int barsHpx = dpToPx(context, barsHeightDp);
            float barLabelTextSizePx = dpToPx(context, 16f * scale);
            views.setImageViewBitmap(R.id.weekly_bars, createBarsBitmap(context, barsWpx, barsHpx, daily, todayIndex, accentColor, mutedColor, barLabelTextSizePx));

            views.setTextViewTextSize(R.id.weekly_title, TypedValue.COMPLEX_UNIT_DIP, 12f * scale);
            views.setTextViewTextSize(R.id.weekly_updated, TypedValue.COMPLEX_UNIT_DIP, 9f * scale);
            views.setTextViewTextSize(R.id.weekly_total, TypedValue.COMPLEX_UNIT_DIP, 28f * scale);
            views.setTextViewTextSize(R.id.weekly_avg, TypedValue.COMPLEX_UNIT_DIP, 9f * scale);
            for (int i = 0; i < 7; i++) {
                views.setTextViewTextSize(dayIds[i], TypedValue.COMPLEX_UNIT_DIP, 11f * scale);
            }
            views.setViewPadding(R.id.widget_weekly_root,
                    dpToPx(context, 14 * scale), dpToPx(context, 14 * scale),
                    dpToPx(context, 14 * scale), dpToPx(context, 14 * scale));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // 제목-총액 사이 간격이 위젯이 클수록(글씨가 커질수록) 덩달아 커 보인다는
                // 피드백 — XML 고정 -2dp 대신 scale에 비례해 더 끌어올린다.
                views.setViewLayoutMargin(R.id.weekly_total, RemoteViews.MARGIN_TOP, -4f * scale, TypedValue.COMPLEX_UNIT_DIP);
            }

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

    static Bitmap createBarsBitmap(Context context, int w, int h, long[] daily, int todayIndex, int accentColor, int mutedColor, float labelTextSizePx) {
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
        // 막대 영역(h)은 다른 행들이 차지하는 공간을 뺀 나머지를 추정한 값이라 사용자가
        // 글자 크기를 작게 고르면 오히려 막대 영역이 넓어져 h 비례 글자가 커지는 역전이
        // 생긴다 — 그래서 h가 아니라 호출부에서 넘겨주는, scale에 직접 비례한 크기를 쓴다.
        labelPaint.setTextSize(labelTextSizePx);
        // 높이(글자 크기)는 그대로 두고 너비만 살짝 좁혀서 조금 더 슬림하게 보이도록.
        labelPaint.setTextScaleX(0.92f);

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
