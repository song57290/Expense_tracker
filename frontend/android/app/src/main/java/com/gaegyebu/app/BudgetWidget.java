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
import android.graphics.Typeface;
import android.util.Log;
import android.widget.RemoteViews;

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
            String month   = prefs.getString("month", "--월");
            long   budget  = parseLong(prefs.getString("budget", "0"));
            long   expense = parseLong(prefs.getString("expense", "0"));

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
            }

            views.setTextViewText(R.id.budget_month, month);

            float percent    = (budget > 0) ? (float) expense / budget : 0f;
            int   percentInt = Math.round(percent * 100);
            int   arcColor   = WidgetTheme.arcColor(percent, dark);

            // 원형 링 비트맵 생성 (퍼센트 텍스트 포함)
            views.setImageViewBitmap(R.id.budget_ring, createRingBitmap(300, percent, arcColor, percentInt, dark));

            // 하단 남은/초과 금액
            long   remaining = budget - expense;
            String remainText;
            int    remainColor;
            if (budget == 0) {
                remainText  = "예산 미설정";
                remainColor = WidgetTheme.hint(dark);
            } else if (remaining >= 0) {
                remainText  = fmt(remaining) + "원 남음";
                // 다크 모드(투명/검정)에서는 흰색으로 — 배경 위 보라색은 가독성 낮음
                remainColor = dark ? WidgetTheme.dim(dark) : arcColor;
            } else {
                remainText  = fmt(-remaining) + "원 초과";
                remainColor = WidgetTheme.expense(dark);
            }
            views.setTextViewText(R.id.budget_remaining, remainText);
            views.setTextColor(R.id.budget_remaining, remainColor);

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

    static Bitmap createRingBitmap(int size, float percent, int arcColor, int percentInt, boolean dark) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        float stroke = size * 0.13f;
        float margin = stroke / 2f + 8f;
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

        // 퍼센트 텍스트 (중앙)
        Paint pct = new Paint(Paint.ANTI_ALIAS_FLAG);
        pct.setTextAlign(Paint.Align.CENTER);
        pct.setTextSize(size * 0.2f);
        pct.setTypeface(Typeface.DEFAULT_BOLD);
        pct.setColor(arcColor);
        float cy = size / 2f + pct.getTextSize() * 0.35f;
        canvas.drawText(percentInt + "%", size / 2f, cy, pct);

        // "사용" 레이블
        Paint lbl = new Paint(Paint.ANTI_ALIAS_FLAG);
        lbl.setTextAlign(Paint.Align.CENTER);
        lbl.setTextSize(size * 0.09f);
        lbl.setColor(dark ? 0xCCFFFFFF : 0x88000000);
        canvas.drawText("사용", size / 2f, cy + pct.getTextSize() * 0.65f, lbl);

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
