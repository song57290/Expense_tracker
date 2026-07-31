package com.gaegyebu.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class WidgetConfigActivity extends AppCompatActivity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private String selectedTheme = WidgetTheme.SYSTEM;
    private String selectedShape = WidgetTheme.SHAPE_R14;
    private String widgetClass   = "";

    // 실제 위젯 데이터 (미리보기용)
    private String prefsMonth   = "--월";
    private String prefsUpdated = "";
    private String prefsIncome  = "0";
    private String prefsExpense = "0";
    private String prefsBalance = "0";
    private long   prefsBudget  = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        // 위젯 타입 감지
        try {
            AppWidgetProviderInfo winfo = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId);
            if (winfo != null) widgetClass = winfo.provider.getClassName();
        } catch (Exception ignored) {}

        SharedPreferences prefs = getSharedPreferences("gaegyebu_widget", MODE_PRIVATE);
        selectedTheme = WidgetTheme.getTheme(prefs, appWidgetId);
        selectedShape = WidgetTheme.getShape(prefs, appWidgetId);

        // 실제 위젯 데이터 로드
        prefsMonth   = prefs.getString("month",   "--월");
        prefsUpdated = prefs.getString("updated", "");
        prefsIncome  = prefs.getString("income",  "0");
        prefsExpense = prefs.getString("expense", "0");
        prefsBalance = prefs.getString("balance", "0");
        prefsBudget  = parseLong(prefs.getString("budget", "0"));

        setContentView(R.layout.activity_widget_config);

        // 라이트 모드에서 상태바 아이콘을 어두운 색으로 설정
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat wic = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        boolean isLightMode = !WidgetTheme.isDark(WidgetTheme.SYSTEM, this);
        wic.setAppearanceLightStatusBars(isLightMode);

        updateThemeChecks();
        updateShapeChecks();
        updatePreview();

        // 배경 선택
        findViewById(R.id.opt_transparent).setOnClickListener(v -> { selectedTheme = WidgetTheme.TRANSPARENT; updateThemeChecks(); updatePreview(); });
        findViewById(R.id.opt_system).setOnClickListener(v ->      { selectedTheme = WidgetTheme.SYSTEM;      updateThemeChecks(); updatePreview(); });
        findViewById(R.id.opt_white).setOnClickListener(v ->       { selectedTheme = WidgetTheme.WHITE;       updateThemeChecks(); updatePreview(); });
        findViewById(R.id.opt_black).setOnClickListener(v ->       { selectedTheme = WidgetTheme.BLACK;       updateThemeChecks(); updatePreview(); });

        // 모양 선택
        findViewById(R.id.opt_shape_r24).setOnClickListener(v -> { selectedShape = WidgetTheme.SHAPE_R24;   updateShapeChecks(); updatePreview(); });
        findViewById(R.id.opt_shape_r14).setOnClickListener(v -> { selectedShape = WidgetTheme.SHAPE_R14;   updateShapeChecks(); updatePreview(); });
        findViewById(R.id.opt_shape_r6).setOnClickListener(v ->  { selectedShape = WidgetTheme.SHAPE_R6;    updateShapeChecks(); updatePreview(); });
        findViewById(R.id.opt_shape_r0).setOnClickListener(v ->  { selectedShape = WidgetTheme.SHAPE_SHARP; updateShapeChecks(); updatePreview(); });

        findViewById(R.id.btn_cancel).setOnClickListener(v -> finish());
        findViewById(R.id.btn_save).setOnClickListener(v -> save());
    }

    private void updatePreview() {
        FrameLayout container = (FrameLayout) findViewById(R.id.preview_container);
        container.removeAllViews();

        float dp = getResources().getDisplayMetrics().density;
        boolean dark = WidgetTheme.isDark(selectedTheme, this);

        boolean isBudget  = widgetClass.contains("Budget");
        boolean isDash    = widgetClass.contains("Dashboard");
        boolean isToday   = widgetClass.contains("Today");

        // 위젯 타입에 맞는 레이아웃 인플레이트
        int layoutRes = isBudget ? R.layout.widget_budget
                      : isDash   ? R.layout.widget_dashboard
                      : isToday  ? R.layout.widget_today
                                 : R.layout.widget_compact;

        View wv = LayoutInflater.from(this).inflate(layoutRes, container, false);

        // 미리보기 크기: 2x2 예산은 정사각형, 나머지는 가로형
        int contH, wW, wH;
        if (isBudget) {
            contH = wW = wH = (int)(130 * dp);
        } else if (isDash || isToday) {
            contH = wH = (int)(100 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
        } else {
            contH = wH = (int)(70 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
        }

        // 컨테이너 높이 조정
        ViewGroup.LayoutParams clp = container.getLayoutParams();
        clp.height = contH;
        container.requestLayout();

        // 위젯 뷰 크기 + 가운데 정렬
        FrameLayout.LayoutParams wlp = new FrameLayout.LayoutParams(wW, wH);
        wlp.gravity = Gravity.CENTER;
        wv.setLayoutParams(wlp);

        // 배경 (GradientDrawable)
        int rootId = isBudget ? R.id.widget_budget_root
                   : isDash   ? R.id.widget_dashboard_root
                   : isToday  ? R.id.widget_today_root
                              : R.id.widget_compact_root;
        View wRoot = wv.findViewById(rootId);

        float radius;
        switch (selectedShape) {
            case WidgetTheme.SHAPE_R24: radius = 24 * dp; break;
            case WidgetTheme.SHAPE_R14: radius = 14 * dp; break;
            case WidgetTheme.SHAPE_R6:  radius = 6  * dp; break;
            default:                    radius = 0;        break;
        }
        int bgColor;
        if (WidgetTheme.TRANSPARENT.equals(selectedTheme)) {
            bgColor = 0x22AAAAAA;
        } else {
            switch (selectedTheme) {
                case WidgetTheme.WHITE: bgColor = 0xF0FFFFFF; break;
                case WidgetTheme.BLACK: bgColor = 0xCC000000; break;
                default: bgColor = dark ? 0xCC2D1B69 : 0xFFE8E0FF; break;
            }
        }
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(bgColor);
        gd.setCornerRadius(radius);
        if (WidgetTheme.TRANSPARENT.equals(selectedTheme)) {
            gd.setStroke((int)(1.5f * dp), 0x88AAAAAA, 6 * dp, 3 * dp);
        }
        wRoot.setBackground(gd);

        // 색상
        int primary = WidgetTheme.primary(dark);
        int hint    = WidgetTheme.hint(dark);
        int incomeC = WidgetTheme.income(dark);
        int expC    = WidgetTheme.expense(dark);

        // 퍼센트 + 아크 색상 (공통)
        long expLong = parseLong(prefsExpense);
        float pct    = prefsBudget > 0 ? (float) expLong / prefsBudget : 0f;
        int   pctInt = Math.round(pct * 100);
        int arcColor = pct < 0.7f ? (dark ? 0xFFB088F9 : 0xFF6832C0)
                     : pct < 0.9f ? (dark ? 0xFFFFCC44 : 0xFFB8860B)
                                  : (dark ? 0xFFFF6B6B : 0xFFCC2222);

        // --- 위젯 타입별 데이터 바인딩 ---
        if (isBudget) {
            ((TextView) wv.findViewById(R.id.budget_month)).setTextColor(primary);
            ((TextView) wv.findViewById(R.id.budget_month)).setText(prefsMonth);

            Bitmap ring = BudgetWidget.createRingBitmap(300, pct, arcColor, pctInt, dark);
            ((ImageView) wv.findViewById(R.id.budget_ring)).setImageBitmap(ring);

            long rem = prefsBudget - expLong;
            String remText; int remColor;
            if (prefsBudget == 0) {
                remText = "예산 미설정"; remColor = hint;
            } else if (rem >= 0) {
                remText = fmt(rem) + "원 남음"; remColor = arcColor;
            } else {
                remText = fmt(-rem) + "원 초과"; remColor = 0xFFFF6B6B;
            }
            ((TextView) wv.findViewById(R.id.budget_remaining)).setTextColor(remColor);
            ((TextView) wv.findViewById(R.id.budget_remaining)).setText(remText);

        } else if (isDash) {
            ((TextView) wv.findViewById(R.id.dash_month)).setTextColor(primary);
            ((TextView) wv.findViewById(R.id.dash_month)).setText(prefsMonth);
            ((TextView) wv.findViewById(R.id.dash_updated)).setTextColor(hint);
            ((TextView) wv.findViewById(R.id.dash_updated)).setText(prefsUpdated);
            ((TextView) wv.findViewById(R.id.dash_balance)).setTextColor(primary);
            ((TextView) wv.findViewById(R.id.dash_balance)).setText(fmtSigned(prefsBalance) + "원");
            ((TextView) wv.findViewById(R.id.dash_income)).setTextColor(incomeC);
            ((TextView) wv.findViewById(R.id.dash_income)).setText(fmtUnsigned(prefsIncome) + "원");
            ((TextView) wv.findViewById(R.id.dash_expense)).setTextColor(expC);
            ((TextView) wv.findViewById(R.id.dash_expense)).setText(fmtUnsigned(prefsExpense) + "원");
            if (prefsBudget > 0) {
                ((TextView) wv.findViewById(R.id.dash_percent)).setTextColor(arcColor);
                ((TextView) wv.findViewById(R.id.dash_percent)).setText(pctInt + "%");
            } else {
                ((TextView) wv.findViewById(R.id.dash_percent)).setTextColor(hint);
                ((TextView) wv.findViewById(R.id.dash_percent)).setText("미설정");
            }
            Bitmap bar = DashboardWidget.createBarBitmap(pct, arcColor, dark);
            ((ImageView) wv.findViewById(R.id.dash_bar)).setImageBitmap(bar);

        } else {
            // Compact (& Today fallback)
            ((TextView) wv.findViewById(R.id.compact_month)).setTextColor(primary);
            ((TextView) wv.findViewById(R.id.compact_month)).setText(prefsMonth);
            ((TextView) wv.findViewById(R.id.compact_updated)).setTextColor(hint);
            ((TextView) wv.findViewById(R.id.compact_updated)).setText(prefsUpdated);
            ((TextView) wv.findViewById(R.id.compact_balance)).setTextColor(primary);
            ((TextView) wv.findViewById(R.id.compact_balance)).setText(fmtSigned(prefsBalance) + "원");
            ((TextView) wv.findViewById(R.id.compact_income)).setText(fmtUnsigned(prefsIncome) + "원");
            ((TextView) wv.findViewById(R.id.compact_expense)).setText(fmtUnsigned(prefsExpense) + "원");
        }

        container.addView(wv);
    }

    private void updateThemeChecks() {
        int[] ids     = { R.id.check_transparent, R.id.check_system, R.id.check_white, R.id.check_black };
        String[] vals = { WidgetTheme.TRANSPARENT, WidgetTheme.SYSTEM, WidgetTheme.WHITE, WidgetTheme.BLACK };
        for (int i = 0; i < ids.length; i++)
            findViewById(ids[i]).setVisibility(vals[i].equals(selectedTheme) ? View.VISIBLE : View.GONE);
    }

    private void updateShapeChecks() {
        int[] checkIds = { R.id.check_shape_r24, R.id.check_shape_r14, R.id.check_shape_r6, R.id.check_shape_r0 };
        int[] optIds   = { R.id.opt_shape_r24,   R.id.opt_shape_r14,   R.id.opt_shape_r6,   R.id.opt_shape_r0   };
        String[] vals  = { WidgetTheme.SHAPE_R24, WidgetTheme.SHAPE_R14, WidgetTheme.SHAPE_R6, WidgetTheme.SHAPE_SHARP };
        for (int i = 0; i < checkIds.length; i++) {
            boolean sel = vals[i].equals(selectedShape);
            findViewById(checkIds[i]).setVisibility(sel ? View.VISIBLE : View.GONE);
            findViewById(optIds[i]).setAlpha(sel ? 1.0f : 0.35f);
        }
    }

    private void save() {
        getSharedPreferences("gaegyebu_widget", MODE_PRIVATE)
                .edit()
                .putString(WidgetTheme.PREF_KEY       + appWidgetId, selectedTheme)
                .putString(WidgetTheme.PREF_SHAPE_KEY + appWidgetId, selectedShape)
                .apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(this);
        try {
            AppWidgetProviderInfo info = mgr.getAppWidgetInfo(appWidgetId);
            String cls = info.provider.getClassName();
            if      (cls.contains("CompactWidget"))  CompactWidget.updateWidget(this, mgr, appWidgetId);
            else if (cls.contains("Budget"))         BudgetWidget.updateWidget(this, mgr, appWidgetId);
            else if (cls.contains("Dashboard"))      DashboardWidget.updateWidget(this, mgr, appWidgetId);
            else if (cls.contains("Today"))          TodayWidget.updateWidget(this, mgr, appWidgetId);
        } catch (Exception e) {
            CompactWidget.updateWidget(this, mgr, appWidgetId);
            BudgetWidget.updateWidget(this, mgr, appWidgetId);
            DashboardWidget.updateWidget(this, mgr, appWidgetId);
            TodayWidget.updateWidget(this, mgr, appWidgetId);
        }

        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private String fmtSigned(String raw) {
        try { return String.format("%,d", Long.parseLong(raw.replace(",", "").trim())); }
        catch (Exception e) { return raw; }
    }

    private String fmtUnsigned(String raw) {
        try { return String.format("%,d", Math.abs(Long.parseLong(raw.replace(",", "").trim()))); }
        catch (Exception e) { return raw; }
    }

    private String fmt(long n) { return String.format("%,d", n); }

    private long parseLong(String s) {
        try { return Long.parseLong(s.replace(",", "").replace("-", "").trim()); }
        catch (Exception e) { return 0; }
    }
}
