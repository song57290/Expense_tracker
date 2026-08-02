package com.gaegyebu.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.widget.RemoteViews;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class WidgetTheme {

    static final String PREF_KEY = "widget_bg_";

    static final String TRANSPARENT = "transparent";
    static final String SYSTEM = "system";
    static final String WHITE = "white";
    static final String BLACK = "black";

    // 다크 배경용 색상
    static final int D_PRIMARY = 0xFFFFFFFF;   // 흰색 — 어두운/투명 배경에서 가독성 최우선
    static final int D_ACCENT  = 0xFFB088F9;   // 브랜드 보라 — arc/링 등 강조 요소 전용
    static final int D_INCOME = 0xFF34C759;
    static final int D_EXPENSE = 0xFFFF6B6B;
    static final int D_TEXT = 0xFFFFFFFF;
    static final int D_DIM = 0xCCFFFFFF;
    static final int D_HINT = 0xAAFFFFFF;

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

    // Activity 상태바 아이콘 색상 + edge-to-edge 적용 (라이트/다크 자동)
    static void applyWindowTheme(Activity activity) {
        WindowCompat.setDecorFitsSystemWindows(activity.getWindow(), false);
        WindowInsetsControllerCompat wic = new WindowInsetsControllerCompat(
                activity.getWindow(), activity.getWindow().getDecorView());
        wic.setAppearanceLightStatusBars(!isSystemDark(activity));
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
        // TRANSPARENT: 배경화면 위에 올라가므로 항상 밝은(다크 팔레트) 색상 사용
        if (TRANSPARENT.equals(theme)) return true;
        // SYSTEM: 렌더 시점의 실제 시스템 야간모드 즉시 반영
        if (SYSTEM.equals(theme)) return isSystemDark(context);
        // 기타: 앱이 기록한 resolved_theme 참고, 없으면 시스템 야간모드 폴백
        SharedPreferences prefs = context.getSharedPreferences(
                "gaegyebu_widget",
                Context.MODE_PRIVATE
        );
        String resolvedTheme = prefs.getString("resolved_theme", null);
        return resolvedTheme != null ? "dark".equals(resolvedTheme) : isSystemDark(context);
    }

    // 예산 퍼센트 → 아크/막대 색상 (BudgetWidget·DashboardWidget 공용)
    static int arcColor(float percent, boolean dark) {
        if (percent < 0.7f) return dark ? 0xFFB088F9 : 0xFF6832C0;
        if (percent < 0.9f) return dark ? 0xFFFFCC44 : 0xFFB8860B;
        return dark ? 0xFFFF6B6B : 0xFFCC2222;
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
        } else if (SYSTEM.equals(theme)) {
            resId = R.drawable.wbg_system_r14;
        } else {
            resId = isDark(theme, context)
                    ? R.drawable.wbg_black_r14
                    : R.drawable.wbg_white_r14;
        }

        views.setInt(rootId, "setBackgroundResource", resId);
    }

    // 수입/지출 카드 패널 배경 — 다크는 밝은 반투명, 라이트는 어두운 반투명
    static void applyCardBg(RemoteViews views, int incomeViewId, int expenseViewId, boolean dark) {
        views.setInt(incomeViewId,  "setBackgroundResource",
                dark ? R.drawable.widget_income_bg       : R.drawable.widget_income_bg_light);
        views.setInt(expenseViewId, "setBackgroundResource",
                dark ? R.drawable.widget_expense_bg      : R.drawable.widget_expense_bg_light);
    }

    // 미리보기 등에서 배경 리소스가 필요한 경우
    static int getBgResId(String theme, boolean dark) {
        if (TRANSPARENT.equals(theme)) return R.drawable.wbg_transparent_r14;
        if (WHITE.equals(theme))       return R.drawable.wbg_white_r14;
        if (BLACK.equals(theme))       return R.drawable.wbg_black_r14;
        if (SYSTEM.equals(theme))      return R.drawable.wbg_system_r14;
        return dark ? R.drawable.wbg_black_r14 : R.drawable.wbg_white_r14;
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