package com.gaegyebu.app;

import android.content.Context;
import android.content.SharedPreferences;

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
        String updated = call.getString("updated", "");
        String budget = call.getString("budget", "0");
        String todayTotal = call.getString("today_total", "0");
        String todayDate = call.getString("today_date", "");
        String todayCats = call.getString("today_cats", "");

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        prefs.edit()
                .putString("income", income)
                .putString("expense", expense)
                .putString("balance", balance)
                .putString("month", month)
                .putString("updated", updated)
                .putString("budget", budget)
                .putString("today_total", todayTotal)
                .putString("today_date", todayDate)
                .putString("today_cats", todayCats)
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

    private void updateAllWidgets(Context ctx) {
        CompactWidget.updateAll(ctx);
        BudgetWidget.updateAll(ctx);
        DashboardWidget.updateAll(ctx);
        TodayWidget.updateAll(ctx);
    }
}