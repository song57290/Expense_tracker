package com.gaegyebu.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.appwidget.AppWidgetProvider;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.Log;

import androidx.core.content.res.ResourcesCompat;

import java.util.Calendar;

public abstract class BaseWidget extends AppWidgetProvider {

    private static Typeface boldTypeface;

    // 위젯 숫자는 RemoteViews가 아니라 Canvas/Paint로 직접 그리는데, Typeface.DEFAULT_BOLD는
    // 제조사별 시스템 폰트 설정(예: 삼성 "글자 스타일" 변경)에 따라 굵기/모양이 기기마다 달라
    // 보인다. res/font에 내장한 폰트를 써서 항상 같은 폰트로 그리도록 고정한다 — 같은
    // 리소스를 widget_weekly.xml의 android:fontFamily에서도 참조해 RemoteViews 텍스트뷰와
    // 캔버스 텍스트가 동일한 폰트를 쓰게 한다.
    protected static synchronized Typeface boldTypeface(Context context) {
        if (boldTypeface == null) {
            try {
                boldTypeface = ResourcesCompat.getFont(context, R.font.gothic_a1_bold);
            } catch (Exception e) {
                boldTypeface = null;
            }
            if (boldTypeface == null) boldTypeface = Typeface.DEFAULT_BOLD;
        }
        return boldTypeface;
    }

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

    // Granted widget size varies by launcher/screen density, not just declared cell
    // count — re-render on change so grantedWidthDp/grantedHeightDp reflect it.
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        onUpdate(context, appWidgetManager, new int[]{appWidgetId});
    }

    protected abstract void refreshAll(Context context);

    // dp actually granted to this widget instance right now — NOT the minWidth/
    // minHeight declared in the widget's appwidget-provider XML, which is only a
    // hint the launcher is free to undercut (or exceed).
    protected static int grantedWidthDp(AppWidgetManager manager, int widgetId, int fallbackDp) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int w = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        return w > 0 ? w : fallbackDp;
    }

    protected static int grantedHeightDp(AppWidgetManager manager, int widgetId, int fallbackDp) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int h = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) : 0;
        return h > 0 ? h : fallbackDp;
    }

    protected static int dpToPx(Context context, float dp) {
        return Math.round(dp * context.getResources().getDisplayMetrics().density);
    }

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