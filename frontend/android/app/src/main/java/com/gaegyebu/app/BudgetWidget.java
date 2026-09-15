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

import java.util.Calendar;

public class BudgetWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "BudgetWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean monthStale = isStale(prefs.getString("month_key", ""), currentMonthKey());
            String month   = monthStale ? currentMonthLabel() : prefs.getString("month", "--월");
            long   budget  = parseLong(prefs.getString("budget", "0"));
            long   expense = monthStale ? 0 : parseLong(prefs.getString("expense", "0"));
            String updated = prefs.getString("updated", "");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_budget);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);

            WidgetTheme.applyBg(
                    views,
                    R.id.widget_budget_root,
                    theme,
                    context
            );

            if (!isSystem) {
                views.setTextColor(
                        R.id.budget_month,
                        WidgetTheme.primary(dark)
                );
                views.setTextColor(R.id.budget_updated, WidgetTheme.hint(dark));
            }

            views.setTextViewText(R.id.budget_month, month);
            views.setTextViewText(R.id.budget_updated, updated);

            float percent    = (budget > 0) ? (float) expense / budget : 0f;
            int   percentInt = Math.round(percent * 100);
            int   arcColor   = WidgetTheme.arcColor(percent, dark);

            // 원형 링 비트맵 생성 (퍼센트 텍스트 + 이번 달 남은 일수 포함)
            views.setImageViewBitmap(R.id.budget_ring, createRingBitmap(context, 300, percent, arcColor, percentInt, dark, daysLeftInMonth()));

            // 하단 남은/초과 금액
            long   remaining = budget - expense;
            String remainText;
            int    remainColor;
            if (budget == 0) {
                remainText = "예산 미설정";
                remainColor = dark ? 0x99FFFFFF : 0x88000000;
            } else if (remaining >= 0) {
                remainText = fmt(remaining) + "원 남음";
                remainColor = dark ? 0x99FFFFFF : arcColor;
            } else {
                remainText = fmt(-remaining) + "원 초과";
                remainColor = dark ? 0xFFFF6B6B : 0xFFCC2222;
            }

            views.setTextViewText(R.id.budget_remaining, remainText);
            views.setTextColor(R.id.budget_remaining, remainColor);

            // minWidth/minHeight 110dp(2x2)는 선언일 뿐, 실제로 받는 픽셀 크기는
            // 기기 화면·홈 화면 그리드 밀도에 따라 그보다 작을 수도, 클 수도 있다. 좁다/
            // 넉넉하다 이분법 대신 실제 받은 크기 비율(scale)만큼 연속적으로 같이 늘고
            // 줄이되, 위젯이 과도하게 크게 배치된 경우까지 글씨가 커지지 않도록 1.3f를 상한으로 둔다.
            int widthDp = grantedWidthDp(manager, widgetId, 110);
            int heightDp = grantedHeightDp(manager, widgetId, 110);
            float scale = Math.max(0.75f, Math.min(1.3f, Math.min(widthDp / 110f, heightDp / 110f)));
            scale *= WidgetTheme.textScaleMultiplier(WidgetTheme.getTextSizePref(prefs, widgetId));

            views.setTextViewTextSize(R.id.budget_month, TypedValue.COMPLEX_UNIT_DIP, 13f * scale);
            views.setTextViewTextSize(R.id.budget_remaining, TypedValue.COMPLEX_UNIT_DIP, 10f * scale);
            views.setTextViewTextSize(R.id.budget_updated, TypedValue.COMPLEX_UNIT_DIP, 6.5f * scale);
            views.setViewVisibility(R.id.budget_usage_label, android.view.View.GONE);
            views.setViewPadding(R.id.widget_budget_root,
                    dpToPx(context, 6 * scale), dpToPx(context, 6 * scale),
                    dpToPx(context, 6 * scale), dpToPx(context, 6 * scale));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // 연/월(budget_month)만 빼고 나머지(링·남음·업데이트)를 다 같이 살짝 아래로.
                views.setViewLayoutMargin(R.id.budget_ring_frame, RemoteViews.MARGIN_TOP, 11 * scale, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.budget_ring_frame, RemoteViews.MARGIN_BOTTOM, 2 * scale, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.budget_remaining, RemoteViews.MARGIN_TOP, 9 * scale, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.budget_updated, RemoteViews.MARGIN_TOP, 4 * scale, TypedValue.COMPLEX_UNIT_DIP);
            }

            // 클릭 → 앱 실행 (예산 미설정 시 예산 설정 화면으로 이동)
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (budget == 0) intent.putExtra("widget_nav", "budget");
            PendingIntent pi = PendingIntent.getActivity(context, 2, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_budget_root, pi);

            manager.updateAppWidget(widgetId, views);
            Log.d(TAG, "Budget widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Budget widget update failed", e);
        }
    }

    private static int daysLeftInMonth() {
        Calendar cal = Calendar.getInstance();
        int today = cal.get(Calendar.DAY_OF_MONTH);
        int lastDay = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
        return lastDay - today;
    }

    static Bitmap createRingBitmap(Context context, int size, float percent, int arcColor, int percentInt, boolean dark, int daysLeft) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        float stroke = size * 0.13f;
        // margin이 stroke/2보다 작아지면 선(stroke)이 비트맵 바깥으로 잘려 나가므로
        // stroke/2를 하한으로 유지 — 이게 원이 캔버스를 최대한 꽉 채우는 한계치.
        float margin = stroke / 2f;
        RectF oval = new RectF(margin, margin, size - margin, size - margin);

        // 배경 트랙
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        // The light-theme track needs enough contrast to remain visible on white.
        track.setColor(dark ? 0x55FFFFFF : 0x336832C0);
        canvas.drawArc(oval, 0, 360, false, track);

        // 프로그레스 아크 (12시 방향에서 시작)
        if (percent > 0) {
            Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(stroke);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setColor(arcColor);
            float sweep = 360f * Math.min(percent, 1f);
            canvas.drawArc(oval, -90f, sweep, false, arc);
        }

        // 중앙 텍스트(%)
        Paint pct = new Paint(Paint.ANTI_ALIAS_FLAG);
        pct.setTextAlign(Paint.Align.CENTER);
        pct.setTextSize(size * 0.2f);
        pct.setTypeface(boldTypeface(context));
        pct.setFakeBoldText(true);
        pct.setColor(arcColor);
        float cy = size / 2f + pct.getTextSize() * 0.25f;
        canvas.drawText(percentInt + "%", size / 2f, cy, pct);

        // 이번 달 남은 일수(D-day) — % 글자와 같은 비트맵에, 그 크기에 비례한 위치로 배치
        Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        label.setTextAlign(Paint.Align.CENTER);
        label.setTextSize(pct.getTextSize() * 0.38f);
        label.setColor(dark ? 0x99FFFFFF : 0x88000000);
        float labelY = cy + pct.getTextSize() * 0.85f;
        canvas.drawText("D-" + daysLeft, size / 2f, labelY, label);

        return bmp;
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
                    new android.content.ComponentName(context, BudgetWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " budget widgets");
            for (int id : ids) updateWidget(context, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
