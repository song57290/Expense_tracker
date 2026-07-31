package com.gaegyebu.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.widget.RemoteViews;

public class WidgetTheme {

    static final String PREF_KEY       = "widget_bg_";
    static final String PREF_SHAPE_KEY = "widget_shape_";

    static final String TRANSPARENT = "transparent";
    static final String SYSTEM      = "system";
    static final String WHITE       = "white";
    static final String BLACK       = "black";

    static final String SHAPE_R24   = "r24";
    static final String SHAPE_R14   = "r14";
    static final String SHAPE_R6    = "r6";
    static final String SHAPE_SHARP = "r0";

    // 다크 배경용 색상
    static final int D_PRIMARY  = 0xFFB088F9;
    static final int D_INCOME   = 0xFF34C759;
    static final int D_EXPENSE  = 0xFFFF6B6B;
    static final int D_TEXT     = 0xCCFFFFFF;
    static final int D_DIM      = 0x88FFFFFF;
    static final int D_HINT     = 0x55FFFFFF;

    // 밝은 배경용 색상
    static final int L_PRIMARY  = 0xFF6832C0;
    static final int L_INCOME   = 0xFF1A7A3A;
    static final int L_EXPENSE  = 0xFFCC2222;
    static final int L_TEXT     = 0xDD000000;
    static final int L_DIM      = 0x88000000;
    static final int L_HINT     = 0x44000000;

    static String getTheme(SharedPreferences prefs, int widgetId) {
        return prefs.getString(PREF_KEY + widgetId, SYSTEM);
    }

    static String getShape(SharedPreferences prefs, int widgetId) {
        return prefs.getString(PREF_SHAPE_KEY + widgetId, SHAPE_R14);
    }

    static boolean isDark(String theme, Context ctx) {
        if (WHITE.equals(theme)) return false;
        if (SYSTEM.equals(theme)) {
            int flags = ctx.getResources().getConfiguration().uiMode
                        & Configuration.UI_MODE_NIGHT_MASK;
            return flags == Configuration.UI_MODE_NIGHT_YES;
        }
        return true;
    }

    static void applyBg(RemoteViews views, int rootId, String theme, String shape, Context ctx) {
        if (TRANSPARENT.equals(theme)) {
            views.setInt(rootId, "setBackgroundColor", 0x00000000);
            return;
        }
        boolean dark = isDark(theme, ctx);
        int resId = getBgResId(theme, dark, shape);
        views.setInt(rootId, "setBackgroundResource", resId);
    }

    static int getBgResId(String theme, boolean dark, String shape) {
        String colorKey = WHITE.equals(theme) ? "white" :
                          BLACK.equals(theme) ? "black" :
                          dark               ? "dark"  : "light";
        switch (colorKey + "_" + shape) {
            case "dark_r24":  return R.drawable.wbg_dark_r24;
            case "dark_r14":  return R.drawable.wbg_dark_r14;
            case "dark_r6":   return R.drawable.wbg_dark_r6;
            case "dark_r0":   return R.drawable.wbg_dark_r0;
            case "light_r24": return R.drawable.wbg_light_r24;
            case "light_r14": return R.drawable.wbg_light_r14;
            case "light_r6":  return R.drawable.wbg_light_r6;
            case "light_r0":  return R.drawable.wbg_light_r0;
            case "white_r24": return R.drawable.wbg_white_r24;
            case "white_r14": return R.drawable.wbg_white_r14;
            case "white_r6":  return R.drawable.wbg_white_r6;
            case "white_r0":  return R.drawable.wbg_white_r0;
            case "black_r24": return R.drawable.wbg_black_r24;
            case "black_r14": return R.drawable.wbg_black_r14;
            case "black_r6":  return R.drawable.wbg_black_r6;
            case "black_r0":  return R.drawable.wbg_black_r0;
            default:          return R.drawable.wbg_dark_r14;
        }
    }

    static int primary(boolean dark) { return dark ? D_PRIMARY  : L_PRIMARY; }
    static int income (boolean dark) { return dark ? D_INCOME   : L_INCOME;  }
    static int expense(boolean dark) { return dark ? D_EXPENSE  : L_EXPENSE; }
    static int text   (boolean dark) { return dark ? D_TEXT     : L_TEXT;    }
    static int dim    (boolean dark) { return dark ? D_DIM      : L_DIM;     }
    static int hint   (boolean dark) { return dark ? D_HINT     : L_HINT;    }
}
