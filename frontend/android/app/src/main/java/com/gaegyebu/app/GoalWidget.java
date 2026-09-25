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

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public class GoalWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "GoalWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String name       = prefs.getString("goal_name", "");
            long   target     = parseLong(prefs.getString("goal_target", "0"));
            long   current    = parseLong(prefs.getString("goal_current", "0"));
            String targetDate = prefs.getString("goal_target_date", "");
            String updated    = prefs.getString("updated", "");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_goal);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);

            WidgetTheme.applyBg(views, R.id.widget_goal_root, theme, context);

            boolean hasGoal = !name.isEmpty();

            if (!isSystem) {
                views.setTextColor(R.id.goal_name, WidgetTheme.primary(dark));
                views.setTextColor(R.id.goal_updated, WidgetTheme.hint(dark));
            }

            views.setTextViewText(R.id.goal_name, hasGoal ? name : "저축 목표 없음");
            views.setTextViewText(R.id.goal_updated, hasGoal ? updated : "");

            float percent    = (hasGoal && target > 0) ? (float) current / target : 0f;
            int   percentInt = Math.round(percent * 100);
            int   ringColor  = goalColor(percent, dark);
            Integer daysLeft = (hasGoal && !targetDate.isEmpty()) ? daysUntil(targetDate) : null;

            views.setImageViewBitmap(R.id.goal_ring, createRingBitmap(context, 300, hasGoal ? percent : 0f, ringColor, percentInt, dark, daysLeft));

            String progressText;
            int    progressColor;
            if (!hasGoal) {
                progressText = "목표를 추가해보세요";
                progressColor = dark ? 0x99FFFFFF : 0x88000000;
            } else {
                progressText = fmt(current) + " / " + fmt(target) + "원";
                progressColor = dark ? 0x99FFFFFF : ringColor;
            }

            views.setTextViewText(R.id.goal_progress, progressText);
            views.setTextColor(R.id.goal_progress, progressColor);

            // 1.3f를 상한으로, 0.75f를 하한으로 해서 위젯 크기에 따라 글자 크기 조정 (BudgetWidget과 동일 공식)
            int widthDp = grantedWidthDp(manager, widgetId, 110);
            int heightDp = grantedHeightDp(manager, widgetId, 110);
            float scale = Math.max(0.75f, Math.min(1.3f, Math.min(widthDp / 110f, heightDp / 110f)));
            scale *= WidgetTheme.textScaleMultiplier(WidgetTheme.getTextSizePref(prefs, widgetId));
            scale = Math.min(scale, 1.45f);

            views.setTextViewTextSize(R.id.goal_name, TypedValue.COMPLEX_UNIT_DIP, 13f * scale);
            views.setTextViewTextSize(R.id.goal_progress, TypedValue.COMPLEX_UNIT_DIP, 10f * scale);
            views.setTextViewTextSize(R.id.goal_updated, TypedValue.COMPLEX_UNIT_DIP, 6.5f * scale);
            views.setViewVisibility(R.id.goal_usage_label, android.view.View.GONE);
            // 그래프 크기는 글자 크기와 별개의 설정(설정 화면 "그래프 크기")으로, 링
            // ImageView(fitCenter)의 여백을 늘리거나 줄여서 프레임 안에서 링 자체의
            // 체감 크기를 조정한다.
            String ringSizePref = WidgetTheme.getRingSizePref(prefs, widgetId);
            int ringPad = dpToPx(context, WidgetTheme.ringPaddingDp(ringSizePref));
            views.setViewPadding(R.id.goal_ring, ringPad, ringPad, ringPad, ringPad);
            views.setViewPadding(R.id.widget_goal_root,
                    dpToPx(context, 6 * scale), dpToPx(context, 6 * scale),
                    dpToPx(context, 6 * scale), dpToPx(context, 6 * scale));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                views.setViewLayoutMargin(R.id.goal_ring_frame, RemoteViews.MARGIN_TOP, 11 * scale, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.goal_ring_frame, RemoteViews.MARGIN_BOTTOM, 2 * scale, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.goal_progress, RemoteViews.MARGIN_TOP, 9 * scale, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutMargin(R.id.goal_updated, RemoteViews.MARGIN_TOP, 4 * scale, TypedValue.COMPLEX_UNIT_DIP);
            }

            // 클릭 → 앱 실행 (목표 미설정 시 예산 탭의 저축 목표 화면으로 이동)
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (!hasGoal) intent.putExtra("widget_nav", "goal");
            PendingIntent pi = PendingIntent.getActivity(context, 2, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_goal_root, pi);

            manager.updateAppWidget(widgetId, views);
            Log.d(TAG, "Goal widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Goal widget update failed", e);
        }
    }

    // 목표 달성 여부에 따른 링 색상 — 예산 위젯과 달리 퍼센트가 높을수록(목표에 가까울수록)
    // 좋은 신호이므로 경고색 그라데이션 대신 "진행 중(보라)/달성(초록)" 2단계만 쓴다.
    private static int goalColor(float percent, boolean dark) {
        if (percent >= 1f) return WidgetTheme.income(dark);
        return dark ? 0xFFB088F9 : 0xFF6832C0;
    }

    private static int daysUntil(String dateStr) {
        try {
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            fmt.setLenient(false);
            Date target = fmt.parse(dateStr);
            if (target == null) return 0;

            Calendar today = Calendar.getInstance();
            today.set(Calendar.HOUR_OF_DAY, 0);
            today.set(Calendar.MINUTE, 0);
            today.set(Calendar.SECOND, 0);
            today.set(Calendar.MILLISECOND, 0);

            long diffMs = target.getTime() - today.getTimeInMillis();
            return (int) Math.round(diffMs / 86400000.0);
        } catch (ParseException e) {
            return 0;
        }
    }

    static Bitmap createRingBitmap(Context context, int size, float percent, int ringColor, int percentInt, boolean dark, Integer daysLeft) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        float stroke = size * 0.13f;
        float margin = stroke / 2f;
        RectF oval = new RectF(margin, margin, size - margin, size - margin);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(dark ? 0x55FFFFFF : 0x336832C0);
        canvas.drawArc(oval, 0, 360, false, track);

        if (percent > 0) {
            Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(stroke);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setColor(ringColor);
            float sweep = 360f * Math.min(percent, 1f);
            canvas.drawArc(oval, -90f, sweep, false, arc);
        }

        Paint pct = new Paint(Paint.ANTI_ALIAS_FLAG);
        pct.setTextAlign(Paint.Align.CENTER);
        pct.setTextSize(size * 0.2f);
        pct.setTypeface(boldTypeface(context));
        pct.setFakeBoldText(true);
        pct.setColor(ringColor);
        float cy = size / 2f + pct.getTextSize() * 0.25f;
        canvas.drawText(percentInt + "%", size / 2f, cy, pct);

        // D-day — 목표일을 등록하지 않았으면 그리지 않는다(BudgetWidget은 매달 마감일이
        // 항상 있어 무조건 그리지만, 저축 목표는 목표일이 선택 항목이라 null일 수 있다).
        if (daysLeft != null) {
            Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
            label.setTextAlign(Paint.Align.CENTER);
            label.setTextSize(pct.getTextSize() * 0.38f);
            label.setColor(dark ? 0x99FFFFFF : 0x88000000);
            float labelY = cy + pct.getTextSize() * 0.85f;
            String dayText = daysLeft >= 0 ? ("D-" + daysLeft) : ("D+" + (-daysLeft));
            canvas.drawText(dayText, size / 2f, labelY, label);
        }

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
                    new android.content.ComponentName(context, GoalWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " goal widgets");
            for (int id : ids) updateWidget(context, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
