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
import android.util.Log;
import android.widget.RemoteViews;

public class DashboardWidget extends BaseWidget {

    private static final String PREFS_NAME = "gaegyebu_widget";
    private static final String TAG = "DashboardWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String month      = prefs.getString("month",       "--월");
            String updated    = prefs.getString("updated",     "");
            String income     = prefs.getString("income",      "---");
            String expense    = prefs.getString("expense",     "---");
            String balance    = prefs.getString("balance",     "---");
            long   budget     = parseLong(prefs.getString("budget",      "0"));
            long   expLong    = parseLong(expense);
            long   balLong    = parseLongSigned(balance);
            String todayTotal = prefs.getString("today_total", "0");
            String todayCats  = prefs.getString("today_cats",  "");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_dashboard);

            String theme = WidgetTheme.getTheme(prefs, widgetId);
            boolean dark = WidgetTheme.isDark(theme, context);
            boolean isSystem = WidgetTheme.SYSTEM.equals(theme);
            WidgetTheme.applyBg(views, R.id.widget_dashboard_root, theme, context);
            if (!isSystem) {
                views.setTextColor(R.id.dash_month,   WidgetTheme.primary(dark));
                views.setTextColor(R.id.dash_updated, WidgetTheme.hint(dark));
                views.setTextColor(R.id.dash_income,  WidgetTheme.income(dark));
                views.setTextColor(R.id.dash_expense, WidgetTheme.expense(dark));
            }

            views.setTextViewText(R.id.dash_month,   month);
            views.setTextViewText(R.id.dash_updated, updated);
            views.setTextViewText(R.id.dash_income,  income  + "원");
            views.setTextViewText(R.id.dash_expense, expense + "원");

            // 잔액 색상
            views.setTextViewText(R.id.dash_balance, balance + "원");
            views.setTextColor(R.id.dash_balance, balLong >= 0 ? WidgetTheme.primary(dark) : WidgetTheme.expense(dark));

            // 예산 퍼센트
            float percent    = (budget > 0) ? (float) expLong / budget : 0f;
            int   percentInt = Math.round(percent * 100);
            int   arcColor   = WidgetTheme.arcColor(percent, dark);

            if (budget > 0) {
                views.setTextViewText(R.id.dash_percent, percentInt + "%");
                views.setTextColor(R.id.dash_percent, arcColor);
            } else {
                views.setTextViewText(R.id.dash_percent, "미설정");
                views.setTextColor(R.id.dash_percent, WidgetTheme.hint(dark));
            }

            // 프로그레스 바 비트맵
            views.setImageViewBitmap(R.id.dash_bar, createBarBitmap(percent, arcColor, dark));

            // 오늘 지출 요약
            if (!isSystem) {
                views.setTextColor(R.id.dash_today_label,  WidgetTheme.hint(dark));
                views.setTextColor(R.id.dash_today_amount, WidgetTheme.expense(dark));
                views.setTextColor(R.id.dash_today_cats,   WidgetTheme.text(dark));
            }
            long todayAmt = parseLong(todayTotal);
            views.setTextViewText(R.id.dash_today_amount,
                    todayAmt > 0 ? "-" + fmt(todayAmt) + "원" : "0원");
            String catsLabel = "";
            if (!todayCats.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                for (String entry : todayCats.split(",")) {
                    String[] parts = entry.split(":", 2);
                    if (parts.length > 0 && !parts[0].isEmpty()) {
                        if (sb.length() > 0) sb.append(" · ");
                        sb.append(parts[0]);
                    }
                }
                catsLabel = sb.toString();
            }
            views.setTextViewText(R.id.dash_today_cats, catsLabel);

            // 예산 미설정 탭 → 예산 설정 화면으로
            if (budget == 0) {
                Intent budgetIntent = new Intent(context, MainActivity.class);
                budgetIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                budgetIntent.putExtra("widget_nav", "budget");
                PendingIntent budgetPi = PendingIntent.getActivity(context, 31, budgetIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.dash_percent, budgetPi);
                views.setOnClickPendingIntent(R.id.dash_budget_label, budgetPi);
            }

            // 클릭 → 앱 실행
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(context, 3, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_dashboard_root, pi);

            manager.updateAppWidget(widgetId, views);
            Log.d(TAG, "Dashboard widget updated: " + widgetId);
        } catch (Exception e) {
            Log.e(TAG, "Dashboard widget update failed", e);
        }
    }

    static Bitmap createBarBitmap(float percent, int fillColor, boolean dark) {
        int w = 400, h = 14;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        float radius = h / 2f;

        // 배경 트랙: 다크는 반투명 흰색, 라이트는 반투명 검정
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(dark ? 0x55FFFFFF : 0x22000000);
        canvas.drawRoundRect(new RectF(0, 0, w, h), radius, radius, bg);

        // 채움
        if (percent > 0) {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(fillColor);
            float fillW = Math.max(h, w * Math.min(percent, 1f)); // 최소 반원 크기 유지
            canvas.drawRoundRect(new RectF(0, 0, fillW, h), radius, radius, fill);
        }

        return bmp;
    }

    private static String fmt(long n) {
        return String.format("%,d", n);
    }

    // 콤마 제거 후 파싱 (부호 없는 값)
    private static long parseLong(String s) {
        try {
            return Long.parseLong(s.replace(",", "").replace("-", "").trim());
        } catch (Exception e) {
            return 0;
        }
    }

    // 부호 포함 파싱 (잔액용)
    private static long parseLongSigned(String s) {
        try {
            return Long.parseLong(s.replace(",", "").trim());
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    protected void refreshAll(Context context) {
        updateAll(context);
    }

    public static void updateAll(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            android.content.ComponentName comp =
                    new android.content.ComponentName(context, DashboardWidget.class);
            int[] ids = mgr.getAppWidgetIds(comp);
            Log.d(TAG, "updateAll: " + ids.length + " dashboard widgets");
            for (int id : ids) updateWidget(context, mgr, id);
        } catch (Exception e) {
            Log.e(TAG, "updateAll failed", e);
        }
    }
}
