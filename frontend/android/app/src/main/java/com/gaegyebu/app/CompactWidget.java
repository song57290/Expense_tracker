package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.widget.RemoteViews;

public class CompactWidget extends AppWidgetProvider {

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

            String income = prefs.getString("income", "0");
            String expense = prefs.getString("expense", "0");
            String balance = prefs.getString("balance", "0");
            String month = prefs.getString("month", "--월");
            String updated = prefs.getString("updated", "");

            RemoteViews views = new RemoteViews(
                    context.getPackageName(),
                    R.layout.widget_compact
            );

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);

            // 배경
            WidgetTheme.applyBg(
                    views,
                    R.id.widget_compact_root,
                    theme,
                    context
            );

            // 상단
            views.setTextColor(
                    R.id.compact_month,
                    WidgetTheme.primary(dark)
            );

            views.setTextColor(
                    R.id.compact_updated,
                    WidgetTheme.hint(dark)
            );

            // 잔액
            views.setTextColor(
                    R.id.compact_balance_label,
                    WidgetTheme.text(dark)
            );

            views.setTextColor(
                    R.id.compact_balance,
                    WidgetTheme.primary(dark)
            );

            // 수입
            views.setTextColor(
                    R.id.compact_income_label,
                    WidgetTheme.income(dark)
            );

            views.setTextColor(
                    R.id.compact_income,
                    WidgetTheme.income(dark)
            );

            // 지출
            views.setTextColor(
                    R.id.compact_expense_label,
                    WidgetTheme.expense(dark)
            );

            views.setTextColor(
                    R.id.compact_expense,
                    WidgetTheme.expense(dark)
            );

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

            // 위젯 클릭 → 앱 실행
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            );

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