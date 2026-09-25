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

    // 글자 크기 — 배경 색상과 같은 방식(위젯 인스턴스별)으로 저장하는 사용자 선택값.
    // 위젯 크기에 따라 자동으로 붙는 scale과는 별개로, 그 위에 곱해지는 배율이다.
    static final String TEXTSIZE_PREF_KEY = "widget_textsize_";
    static final String TEXT_SMALL = "small";
    static final String TEXT_MEDIUM = "medium";
    static final String TEXT_LARGE = "large";

    static String getTextSizePref(SharedPreferences prefs, int widgetId) {
        return prefs.getString(TEXTSIZE_PREF_KEY + widgetId, TEXT_MEDIUM);
    }

    static float textScaleMultiplier(String pref) {
        if (TEXT_SMALL.equals(pref)) return 0.72f;
        if (TEXT_LARGE.equals(pref)) return 1.15f;
        return 1.0f;
    }

    // 링 그래프(예산/저축 목표 위젯) 크기 — 글자 크기와는 별개로 위젯 인스턴스별로 저장한다.
    static final String RINGSIZE_PREF_KEY = "widget_ringsize_";
    static final String RING_SMALL = "small";
    static final String RING_MEDIUM = "medium";
    static final String RING_LARGE = "large";

    static String getRingSizePref(SharedPreferences prefs, int widgetId) {
        return prefs.getString(RINGSIZE_PREF_KEY + widgetId, RING_MEDIUM);
    }

    // 링 ImageView(fitCenter)에 줄 여백 dp — 여백이 클수록 프레임 안에서 링이 작게 보인다.
    // 프레임을 벗어나게 키울 순 없으므로(레이아웃 자체를 건드려야 함), '크게'는 여백 0으로
    // 프레임을 꽉 채우는 최댓값, '작게'는 여백을 넉넉히 둬서 체감 크기를 줄인다.
    static float ringPaddingDp(String pref) {
        if (RING_SMALL.equals(pref)) return 20f;
        if (RING_LARGE.equals(pref)) return 0f;
        return 8f;
    }

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

    // 예산 퍼센트 → 아크/막대 색상 (BudgetWidget 전용)
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