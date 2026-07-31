package com.gaegyebu.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.widget.RemoteViews;

public class WidgetTheme {

    static final String PREF_KEY = "widget_bg_";

    static final String TRANSPARENT = "transparent";
    static final String SYSTEM = "system";
    static final String WHITE = "white";
    static final String BLACK = "black";

    // 다크 배경용 색상
    static final int D_PRIMARY = 0xFFB088F9;
    static final int D_INCOME = 0xFF34C759;
    static final int D_EXPENSE = 0xFFFF6B6B;
    static final int D_TEXT = 0xCCFFFFFF;
    static final int D_DIM = 0x88FFFFFF;
    static final int D_HINT = 0x55FFFFFF;

    // 밝은 배경용 색상
    static final int L_PRIMARY = 0xFF1C1B20;
    static final int L_INCOME = 0xFF1A7A3A;
    static final int L_EXPENSE = 0xFFCC2222;
    static final int L_TEXT = 0xDD000000;
    static final int L_DIM = 0x88000000;
    static final int L_HINT = 0x66000000;

    static String getTheme(SharedPreferences prefs, int widgetId) {
        return prefs.getString(PREF_KEY + widgetId, SYSTEM);
    }

    // 현재 Android 시스템이 다크 모드인지 확인
    static boolean isSystemDark(Context context) {
        int nightMode = context.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;

        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    // 위젯에서 사용할 다크/라이트 색상 결정
    static boolean isDark(String theme, Context context) {
        if (WHITE.equals(theme)) return false;
        if (BLACK.equals(theme)) return true;

        SharedPreferences prefs = context.getSharedPreferences(
                "gaegyebu_widget",
                Context.MODE_PRIVATE
        );

        String resolvedTheme = prefs.getString("resolved_theme", "light");

        return "dark".equals(resolvedTheme);
    }

    // 실제 위젯 배경 적용
    static void applyBg(RemoteViews views, int rootId, String theme, Context context) {
        int resId;

        if (TRANSPARENT.equals(theme)) {
            resId = R.drawable.wbg_transparent_r14;
        } else if (WHITE.equals(theme)) {
            resId = R.drawable.wbg_white_r14;
        } else if (BLACK.equals(theme)) {
            resId = R.drawable.wbg_black_r14;
        } else {
            resId = isDark(theme, context)
                    ? R.drawable.wbg_black_r14
                    : R.drawable.wbg_white_r14;
        }

        views.setInt(rootId, "setBackgroundResource", resId);
    }

    // 미리보기 등에서 배경 리소스가 필요한 경우
    static int getBgResId(String theme, boolean dark) {
        if (TRANSPARENT.equals(theme)) {
            return R.drawable.wbg_transparent_r14;
        }

        if (WHITE.equals(theme)) {
            return R.drawable.wbg_white_r14;
        }

        if (BLACK.equals(theme)) {
            return R.drawable.wbg_black_r14;
        }

        return dark
                ? R.drawable.wbg_black_r14
                : R.drawable.wbg_white_r14;
    }

    static int primary(boolean dark) {
        return dark ? D_PRIMARY : L_PRIMARY;
    }

    static int income(boolean dark) {
        return dark ? D_INCOME : L_INCOME;
    }

    static int expense(boolean dark) {
        return dark ? D_EXPENSE : L_EXPENSE;
    }

    static int text(boolean dark) {
        return dark ? D_TEXT : L_TEXT;
    }

    static int dim(boolean dark) {
        return dark ? D_DIM : L_DIM;
    }

    static int hint(boolean dark) {
        return dark ? D_HINT : L_HINT;
    }
}