package com.gaegyebu.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.widget.RemoteViews;

public class WidgetTheme {

    static final String PREF_KEY = "widget_bg_";

    static final String TRANSPARENT = "transparent";
    static final String SYSTEM      = "system";
    static final String WHITE       = "white";
    static final String BLACK       = "black";

    // 다크 배경용 색상
    static final int D_PRIMARY = 0xFFB088F9;
    static final int D_INCOME  = 0xFF34C759;
    static final int D_EXPENSE = 0xFFFF6B6B;
    static final int D_TEXT    = 0xCCFFFFFF;
    static final int D_DIM     = 0x88FFFFFF;
    static final int D_HINT    = 0x55FFFFFF;

    // 밝은 배경용 색상
    static final int L_PRIMARY = 0xFF1C1B20;
    static final int L_INCOME  = 0xFF1A7A3A;
    static final int L_EXPENSE = 0xFFCC2222;
    static final int L_TEXT    = 0xDD000000;
    static final int L_DIM     = 0x88000000;
    static final int L_HINT    = 0x66000000;


    // ==========================================
    // 저장된 위젯 테마 가져오기
    // ==========================================

    static String getTheme(
            SharedPreferences prefs,
            int widgetId
    ) {
        return prefs.getString(
                PREF_KEY + widgetId,
                SYSTEM
        );
    }


    // ==========================================
    // 현재 사용할 다크/라이트 색상 판단
    // ==========================================

    static boolean isDark(
            String theme,
            Context ctx
    ) {

        // 흰색 강제
        if (WHITE.equals(theme)) {
            return false;
        }

        // 검정 강제
        if (BLACK.equals(theme)) {
            return true;
        }

        // SYSTEM / TRANSPARENT
        // 현재 Android의 실제 라이트/다크 모드를 따름
        int nightMode =
                ctx.getResources()
                        .getConfiguration()
                        .uiMode
                        & Configuration.UI_MODE_NIGHT_MASK;

        return nightMode
                == Configuration.UI_MODE_NIGHT_YES;
    }


    // ==========================================
    // 실제 위젯 배경 적용
    // ==========================================

    static void applyBg(
            RemoteViews views,
            int rootId,
            String theme,
            Context ctx
    ) {

        boolean dark =
                isDark(theme, ctx);

        int resId;

        // 투명
        if (TRANSPARENT.equals(theme)) {

            resId =
                    R.drawable.wbg_transparent_r14;

        } else {

            resId =
                    getBgResId(
                            theme,
                            dark
                    );
        }

        views.setInt(
                rootId,
                "setBackgroundResource",
                resId
        );
    }


    // ==========================================
    // 배경 drawable 선택
    // ==========================================

    static int getBgResId(
            String theme,
            boolean dark
    ) {

        // 흰색 고정
        if (WHITE.equals(theme)) {

            return R.drawable.wbg_white_r14;
        }

        // 검정 고정
        if (BLACK.equals(theme)) {

            return R.drawable.wbg_black_r14;
        }

        // 시스템
        //
        // 라이트 모드 → 흰색
        // 다크 모드   → 검정
        if (SYSTEM.equals(theme)) {

            return dark
                    ? R.drawable.wbg_black_r14
                    : R.drawable.wbg_white_r14;
        }

        // fallback
        return dark
                ? R.drawable.wbg_black_r14
                : R.drawable.wbg_white_r14;
    }


    // ==========================================
    // 위젯 내부 색상
    // ==========================================

    static int primary(boolean dark) {

        return dark
                ? D_PRIMARY
                : L_PRIMARY;
    }

    static int income(boolean dark) {

        return dark
                ? D_INCOME
                : L_INCOME;
    }

    static int expense(boolean dark) {

        return dark
                ? D_EXPENSE
                : L_EXPENSE;
    }

    static int text(boolean dark) {

        return dark
                ? D_TEXT
                : L_TEXT;
    }

    static int dim(boolean dark) {

        return dark
                ? D_DIM
                : L_DIM;
    }

    static int hint(boolean dark) {

        return dark
                ? D_HINT
                : L_HINT;
    }
}