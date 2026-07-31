package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
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
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, manager, appWidgetId);
        }
    }

    static void updateWidget(
            Context context,
            AppWidgetManager manager,
            int appWidgetId
    ) {
        try {
            SharedPreferences prefs =
                    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            String income = prefs.getString("income", "---");
            String expense = prefs.getString("expense", "---");
            String balance = prefs.getString("balance", "---");
            String month = prefs.getString("month", "--월");
            String updated = prefs.getString("updated", "");

            RemoteViews views =
                    new RemoteViews(context.getPackageName(), R.layout.widget_compact);

            // 테마 적용
            String theme = WidgetTheme.getTheme(prefs, appWidgetId);
            String shape = WidgetTheme.getShape(prefs, appWidgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            WidgetTheme.applyBg(views, R.id.widget_compact_root, theme, shape, context);
            views.setTextColor(R.id.compact_month,   WidgetTheme.primary(dark));
            views.setTextColor(R.id.compact_updated, WidgetTheme.hint(dark));
            views.setTextColor(R.id.compact_balance, WidgetTheme.primary(dark));

            // 데이터 표시
            views.setTextViewText(
                    R.id.compact_month,
                    month
            );

            views.setTextViewText(
                    R.id.compact_balance,
                    balance + "원"
            );

            views.setTextViewText(
                    R.id.compact_income,
                    income + "원"
            );

            views.setTextViewText(
                    R.id.compact_expense,
                    expense + "원"
            );

            views.setTextViewText(
                    R.id.compact_updated,
                    updated
            );

            // 위젯 클릭 → 가계부 앱 실행
            Intent intent = new Intent(context, MainActivity.class);

            intent.setFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            );

            PendingIntent pendingIntent =
                    PendingIntent.getActivity(
                            context,
                            1,
                            intent,
                            PendingIntent.FLAG_UPDATE_CURRENT |
                            PendingIntent.FLAG_IMMUTABLE
                    );

            views.setOnClickPendingIntent(
                    R.id.widget_compact_root,
                    pendingIntent
            );

            manager.updateAppWidget(
                    appWidgetId,
                    views
            );

            Log.d(TAG, "Compact widget updated: " + appWidgetId);

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Compact widget update failed",
                    e
            );
        }
    }

    /**
     * 설치된 모든 CompactWidget 갱신
     */
    public static void updateAll(Context context) {
        try {
            AppWidgetManager manager =
                    AppWidgetManager.getInstance(context);

            android.content.ComponentName component =
                    new android.content.ComponentName(
                            context,
                            CompactWidget.class
                    );

            int[] appWidgetIds =
                    manager.getAppWidgetIds(component);

            Log.d(
                    TAG,
                    "updateAll: " +
                    appWidgetIds.length +
                    " compact widgets"
            );

            for (int appWidgetId : appWidgetIds) {

                updateWidget(
                        context,
                        manager,
                        appWidgetId
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
}