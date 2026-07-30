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

    @PluginMethod
    public void update(PluginCall call) {
        String income  = call.getString("income",  "0");
        String expense = call.getString("expense", "0");
        String balance = call.getString("balance", "0");
        String month   = call.getString("month",   "");
        String updated = call.getString("updated", "");

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(
                HomeWidget.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString("income",  income)
                .putString("expense", expense)
                .putString("balance", balance)
                .putString("month",   month)
                .putString("updated", updated)
                .apply();

        HomeWidget.updateAll(ctx);
        call.resolve();
    }
}
