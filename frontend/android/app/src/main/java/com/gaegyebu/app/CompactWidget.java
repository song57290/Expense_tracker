package com.gaegyebu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.DisplayMetrics;
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

            // 글씨 크기는 위젯에 배정된 dp가 아니라 기기 화면 너비 기준
            DisplayMetrics dm = context.getResources().getDisplayMetrics();
            int screenWidthDp = Math.round(dm.widthPixels / dm.density);
            float scale = screenWidthDp / 360f; // 360dp = 흔한 기준 폰 너비
            scale = Math.max(0.85f, Math.min(1.15f, scale));

            // 세로로 위젯을 작게 리사이즈했을 때만 한 번 더 줄여 잘림 방지
            // (예: w480 h124 → 1.15가 나와야 하는데 1.0으로 고정됨).
            // 위쪽은 열어두고 아래쪽(잘림 방지 최소치)만 막음
            int heightDp = grantedHeightDp(manager, widgetId, 85);
            float heightGuard = Math.max(0.4f, heightDp / 85f);
            scale = Math.min(scale, heightGuard);

            views.setTextViewTextSize(R.id.compact_month,         TypedValue.COMPLEX_UNIT_DIP, 15f * scale);
            views.setTextViewTextSize(R.id.compact_balance_label, TypedValue.COMPLEX_UNIT_DIP, 12f * scale);
            views.setTextViewTextSize(R.id.compact_balance,       TypedValue.COMPLEX_UNIT_DIP, 16f * scale);
            views.setTextViewTextSize(R.id.compact_income_label,  TypedValue.COMPLEX_UNIT_DIP, 13f * scale);
            views.setTextViewTextSize(R.id.compact_expense_label, TypedValue.COMPLEX_UNIT_DIP, 13f * scale);
            views.setTextViewTextSize(R.id.compact_income,        TypedValue.COMPLEX_UNIT_DIP, 14f * scale);
            views.setTextViewTextSize(R.id.compact_expense,       TypedValue.COMPLEX_UNIT_DIP, 14f * scale);

            int padH = dpToPx(context, 10 * scale);
            int padEnd = dpToPx(context, 8 * scale);
            // 계산으로 맞춘 값들이 실제 기기에서 계속 안 맞아서, 라벨 글씨를 줄이고
            // 위아래 패딩 합(6dp)을 여유 있게 잡아뒀다. 합은 그대로 두고 위:아래
            // 비율만 바꿔(2:4) 안쪽 글씨를 살짝 위로 올린다.
            int padTop = dpToPx(context, 2 * scale);
            int padBottom = dpToPx(context, 4 * scale);
            views.setViewPadding(R.id.compact_income_card, padH, padTop, padEnd, padBottom);
            views.setViewPadding(R.id.compact_expense_card, padH, padTop, padEnd, padBottom);

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