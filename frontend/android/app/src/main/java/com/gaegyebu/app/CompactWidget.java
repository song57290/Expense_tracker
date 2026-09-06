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

            // 너비·높이 중 더 좁게 받은 쪽 비율(scale)로 같이 줄인다.
            int widthDp = grantedWidthDp(manager, widgetId, 250);
            int heightDp = grantedHeightDp(manager, widgetId, 60);
            // 런처가 실제로 보고하는 위젯 크기를 화면에서 바로 확인하기 위한 임시 진단 표시
            views.setTextViewText(R.id.compact_updated, updated + " [" + widthDp + "x" + heightDp + "]");
            float scale = Math.min(1f, Math.min(widthDp / 250f, heightDp / 60f));
            
            // 카드 높이를 넘겨 잘리는 사례가 있어 하한 낮춤
            scale = Math.max(scale, 0.4f);

            views.setTextViewTextSize(R.id.compact_balance,       TypedValue.COMPLEX_UNIT_DIP, 20f * scale);
            views.setTextViewTextSize(R.id.compact_income_label,  TypedValue.COMPLEX_UNIT_DIP, 14f * scale);
            views.setTextViewTextSize(R.id.compact_expense_label, TypedValue.COMPLEX_UNIT_DIP, 14f * scale);
            views.setTextViewTextSize(R.id.compact_income,        TypedValue.COMPLEX_UNIT_DIP, 16f * scale);
            views.setTextViewTextSize(R.id.compact_expense,       TypedValue.COMPLEX_UNIT_DIP, 16f * scale);

            int padH = dpToPx(context, 10 * scale);
            int padEnd = dpToPx(context, 8 * scale);
            int padV = dpToPx(context, 7 * scale);
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