package com.gaegyebu.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.util.Log;

public class WidgetThemeChangeReceiver extends BroadcastReceiver {

    private static final String TAG = "WidgetThemeChange";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();

        // 앱 업데이트로 APK가 교체돼도 위젯 프로바이더는 자동으로 다시 그려지지 않고,
        // 다음 30분 주기 갱신이나 syncWidget() 호출 전까지 예전 화면을 그대로 보여준다 —
        // 업데이트 직후 바로 최신 코드로 다시 그리도록 여기서 강제로 한 번 갱신한다.
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Log.d(TAG, "App updated → refreshing all widgets");
            CompactWidget.updateAll(context);
            BudgetWidget.updateAll(context);
            TodayWidget.updateAll(context);
            PaceWidget.updateAll(context);
            WeeklyWidget.updateAll(context);
            return;
        }

        if (!Intent.ACTION_CONFIGURATION_CHANGED.equals(action)) return;

        int currentNight = context.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;

        // 야간모드가 실제로 바뀐 경우에만 갱신
        SharedPreferences prefs = context.getSharedPreferences(
                "gaegyebu_widget", Context.MODE_PRIVATE);
        int lastNight = prefs.getInt("last_night_mode", -1);

        if (currentNight == lastNight) return;

        prefs.edit().putInt("last_night_mode", currentNight).apply();

        Log.d(TAG, "Night mode changed → updating all widgets (nightMode=" + currentNight + ")");

        CompactWidget.updateAll(context);
        BudgetWidget.updateAll(context);
        TodayWidget.updateAll(context);
        PaceWidget.updateAll(context);
        WeeklyWidget.updateAll(context);
    }
}
