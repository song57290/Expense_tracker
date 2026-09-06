package com.gaegyebu.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetData")
public class WidgetDataPlugin extends Plugin {

    private static final String PREFS_NAME = "gaegyebu_widget";

    @PluginMethod
    public void update(PluginCall call) {
        String income = call.getString("income", "0");
        String expense = call.getString("expense", "0");
        String balance = call.getString("balance", "0");
        String month = call.getString("month", "");
        String monthKey = call.getString("month_key", "");
        String updated = call.getString("updated", "");
        String budget = call.getString("budget", "0");
        String todayTotal = call.getString("today_total", "0");
        String todayDate = call.getString("today_date", "");
        String todayKey = call.getString("today_key", "");
        String todayCats = call.getString("today_cats", "");
        String weekDaily = call.getString("week_daily", "");
        String weekTodayIndex = call.getString("week_today_index", "0");
        String weekTotal = call.getString("week_total", "0");
        String weekAvg = call.getString("week_avg", "0");
        String weekIncome = call.getString("week_income", "0");

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        prefs.edit()
                .putString("income", income)
                .putString("expense", expense)
                .putString("balance", balance)
                .putString("month", month)
                .putString("month_key", monthKey)
                .putString("updated", updated)
                .putString("budget", budget)
                .putString("today_total", todayTotal)
                .putString("today_date", todayDate)
                .putString("today_key", todayKey)
                .putString("today_cats", todayCats)
                .putString("week_daily", weekDaily)
                .putString("week_today_index", weekTodayIndex)
                .putString("week_total", weekTotal)
                .putString("week_avg", weekAvg)
                .putString("week_income", weekIncome)
                .apply();

        updateAllWidgets(ctx);
        call.resolve();
    }

    @PluginMethod
    public void updateTheme(PluginCall call) {
        String theme = call.getString("theme", "system");
        String resolvedTheme = call.getString("resolvedTheme", "light");

        // 잘못된 값이 들어오는 경우 방지
        if (!theme.equals("light") && !theme.equals("dark") && !theme.equals("system")) {
            theme = "system";
        }

        if (!resolvedTheme.equals("light") && !resolvedTheme.equals("dark")) {
            resolvedTheme = "light";
        }

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        prefs.edit()
                .putString("app_theme", theme)
                .putString("resolved_theme", resolvedTheme)
                .apply();

        updateAllWidgets(ctx);
        call.resolve();
    }

    @PluginMethod
    public void getPendingNavigation(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String nav = prefs.getString("widget_nav", "");
        if (!nav.isEmpty()) prefs.edit().remove("widget_nav").apply();
        JSObject result = new JSObject();
        result.put("navigate", nav);
        call.resolve(result);
    }

    private void updateAllWidgets(Context ctx) {
        CompactWidget.updateAll(ctx);
        BudgetWidget.updateAll(ctx);
        TodayWidget.updateAll(ctx);
        PaceWidget.updateAll(ctx);
        WeeklyWidget.updateAll(ctx);
    }
}