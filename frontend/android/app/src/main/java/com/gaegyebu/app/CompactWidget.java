package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.util.TypedValue;
import android.widget.RemoteViews;

public class CompactWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "CompactWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateWidget(context, manager, id);
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            boolean monthStale = isStale(prefs.getString("month_key", ""), currentMonthKey());
            String income = monthStale ? "0" : prefs.getString("income", "0");
            String expense = monthStale ? "0" : prefs.getString("expense", "0");
            String balance = monthStale ? "0" : prefs.getString("balance", "0");
            String month = monthStale ? currentMonthLabel() : prefs.getString("month", "--월");
            String updated = prefs.getString("updated", "");

            RemoteViews views = new RemoteViews(
                    context.getPackageName(),
                    R.layout.widget_compact
            );

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);

            // 배경
            WidgetTheme.applyBg(
                    views,
                    R.id.widget_compact_root,
                    theme,
                    context
            );

            if (!isSystem) {
                // 상단
                views.setTextColor(R.id.compact_month,         WidgetTheme.primary(dark));
                views.setTextColor(R.id.compact_updated,       WidgetTheme.hint(dark));
                // 잔액
                views.setTextColor(R.id.compact_balance_label, WidgetTheme.text(dark));
                views.setTextColor(R.id.compact_balance,       WidgetTheme.primary(dark));
                // 카드 패널 배경
                WidgetTheme.applyCardBg(views,
                        R.id.compact_income_card, R.id.compact_expense_card, dark);
                // 카드 내 텍스트
                views.setTextColor(R.id.compact_income_label,  WidgetTheme.income(dark));
                views.setTextColor(R.id.compact_income,        WidgetTheme.income(dark));
                views.setTextColor(R.id.compact_expense_label, WidgetTheme.expense(dark));
                views.setTextColor(R.id.compact_expense,       WidgetTheme.expense(dark));
            }

            // 데이터
            views.setTextViewText(
                    R.id.compact_month,
                    month
            );

            views.setTextViewText(
                    R.id.compact_updated,
                    updated
            );

            views.setTextViewText(
                    R.id.compact_balance,
                    formatSigned(balance) + "원"
            );

            views.setTextViewText(
                    R.id.compact_income,
                    formatUnsigned(income) + "원"
            );

            views.setTextViewText(
                    R.id.compact_expense,
                    formatUnsigned(expense) + "원"
            );

            // 이 위젯은 4칸(minWidth 250dp)을 선언하지만 그건 힌트일 뿐, 실제로
            // 받는 픽셀 너비는 기기 화면·홈 화면 그리드 밀도에 따라 그보다 좁을
            // 수 있다 (예: 폴드처럼 화면이 넓은 기기 대비 일반 플래그십). 좁게
            // 받은 경우 글씨·여백을 줄여서 겹치거나 잘리지 않도록 한다.
            int widthDp = grantedWidthDp(manager, widgetId, 250);
            boolean tight = widthDp < 230;

            views.setTextViewTextSize(R.id.compact_balance,       TypedValue.COMPLEX_UNIT_DIP, tight ? 16f : 20f);
            views.setTextViewTextSize(R.id.compact_income_label,  TypedValue.COMPLEX_UNIT_DIP, tight ? 12f : 14f);
            views.setTextViewTextSize(R.id.compact_expense_label, TypedValue.COMPLEX_UNIT_DIP, tight ? 12f : 14f);
            views.setTextViewTextSize(R.id.compact_income,        TypedValue.COMPLEX_UNIT_DIP, tight ? 13f : 16f);
            views.setTextViewTextSize(R.id.compact_expense,       TypedValue.COMPLEX_UNIT_DIP, tight ? 13f : 16f);

            int padH = dpToPx(context, tight ? 6 : 10);
            int padEnd = dpToPx(context, tight ? 5 : 8);
            int padV = dpToPx(context, tight ? 5 : 7);
            views.setViewPadding(R.id.compact_income_card, padH, padV, padEnd, padV);
            views.setViewPadding(R.id.compact_expense_card, padH, padV, padEnd, padV);

            // 위젯 클릭 → 앱 실행
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context,
                    1,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT
                            | PendingIntent.FLAG_IMMUTABLE
            );

            views.setOnClickPendingIntent(
                    R.id.widget_compact_root,
                    pendingIntent
            );

            manager.updateAppWidget(
                    widgetId,
                    views
            );

            Log.d(
                    TAG,
                    "Compact widget updated: "
                            + widgetId
                            + " theme="
                            + theme
                            + " dark="
                            + dark
            );

        } catch (Exception e) {
            Log.e(
                    TAG,
                    "Compact widget update failed",
                    e
            );
        }
    }

    @Override
    protected void refreshAll(Context context) {
        updateAll(context);
    }

    public static void updateAll(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);

            ComponentName component = new ComponentName(
                    context,
                    CompactWidget.class
            );

            int[] ids = manager.getAppWidgetIds(component);

            Log.d(
                    TAG,
                    "updateAll: "
                            + ids.length
                            + " compact widgets"
            );

            for (int id : ids) {
                updateWidget(
                        context,
                        manager,
                        id
                );
            }

        } catch (Exception e) {
            Log.e(
                    TAG,
                    "updateAll failed",
                    e
            );
        }
    }

    private static String formatSigned(String value) {
        try {
            long number = Long.parseLong(
                    value.replace(",", "").trim()
            );

            return String.format(
                    "%,d",
                    number
            );

        } catch (Exception e) {
            return value;
        }
    }

    private static String formatUnsigned(String value) {
        try {
            long number = Long.parseLong(
                    value.replace(",", "").trim()
            );

            return String.format(
                    "%,d",
                    Math.abs(number)
            );

        } catch (Exception e) {
            return value;
        }
    }
}