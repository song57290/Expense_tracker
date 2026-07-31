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
    private String widgetClass = "";

    // 실제 위젯 데이터 (미리보기용)
    private String prefsMonth = "--월";
    private String prefsUpdated = "";
    private String prefsIncome = "0";
    private String prefsExpense = "0";
    private String prefsBalance = "0";
    private long prefsBudget = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setResult(RESULT_CANCELED);

        Bundle extras = getIntent().getExtras();

        if (extras != null) {
            appWidgetId = extras.getInt(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID
            );
        }

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        // 위젯 타입 감지
        try {
            AppWidgetProviderInfo winfo =
                    AppWidgetManager.getInstance(this)
                            .getAppWidgetInfo(appWidgetId);

            if (winfo != null) {
                widgetClass = winfo.provider.getClassName();
            }

        } catch (Exception ignored) {
        }

        SharedPreferences prefs =
                getSharedPreferences("gaegyebu_widget", MODE_PRIVATE);

        selectedTheme =
                WidgetTheme.getTheme(prefs, appWidgetId);

        // 실제 위젯 데이터 로드
        prefsMonth =
                prefs.getString("month", "--월");

        prefsUpdated =
                prefs.getString("updated", "");

        prefsIncome =
                prefs.getString("income", "0");

        prefsExpense =
                prefs.getString("expense", "0");

        prefsBalance =
                prefs.getString("balance", "0");

        prefsBudget =
                parseLong(prefs.getString("budget", "0"));

        setContentView(R.layout.activity_widget_config);

        // 라이트 모드에서 상태바 아이콘을 어두운 색으로 설정
        WindowCompat.setDecorFitsSystemWindows(
                getWindow(),
                false
        );

        WindowInsetsControllerCompat wic =
                new WindowInsetsControllerCompat(
                        getWindow(),
                        getWindow().getDecorView()
                );

        boolean isLightMode =
                !WidgetTheme.isDark(
                        WidgetTheme.SYSTEM,
                        this
                );

        wic.setAppearanceLightStatusBars(isLightMode);

        // 초기 UI
        updateThemeChecks();
        updatePreview();

        // -------------------------
        // 배경 선택
        // -------------------------

        findViewById(R.id.opt_transparent)
                .setOnClickListener(v -> {
                    selectedTheme = WidgetTheme.TRANSPARENT;
                    updateThemeChecks();
                    updatePreview();
                });

        findViewById(R.id.opt_system)
                .setOnClickListener(v -> {
                    selectedTheme = WidgetTheme.SYSTEM;
                    updateThemeChecks();
                    updatePreview();
                });

        findViewById(R.id.opt_white)
                .setOnClickListener(v -> {
                    selectedTheme = WidgetTheme.WHITE;
                    updateThemeChecks();
                    updatePreview();
                });

        findViewById(R.id.opt_black)
                .setOnClickListener(v -> {
                    selectedTheme = WidgetTheme.BLACK;
                    updateThemeChecks();
                    updatePreview();
                });

        // 취소
        findViewById(R.id.btn_cancel)
                .setOnClickListener(v -> finish());

        // 저장
        findViewById(R.id.btn_save)
                .setOnClickListener(v -> save());
    }


    private void updatePreview() {

        FrameLayout container =
                (FrameLayout) findViewById(
                        R.id.preview_container
                );

        container.removeAllViews();

        float dp =
                getResources()
                        .getDisplayMetrics()
                        .density;

        boolean dark =
                WidgetTheme.isDark(
                        selectedTheme,
                        this
                );

        boolean isBudget =
                widgetClass.contains("Budget");

        boolean isDash =
                widgetClass.contains("Dashboard");

        boolean isToday =
                widgetClass.contains("Today");


        // -------------------------
        // 위젯 타입에 맞는 레이아웃
        // -------------------------

        int layoutRes =
                isBudget
                        ? R.layout.widget_budget
                        : isDash
                        ? R.layout.widget_dashboard
                        : isToday
                        ? R.layout.widget_today
                        : R.layout.widget_compact;


        View wv =
                LayoutInflater
                        .from(this)
                        .inflate(
                                layoutRes,
                                container,
                                false
                        );


        // -------------------------
        // 미리보기 크기
        // -------------------------

        int contH;
        int wW;
        int wH;

        if (isBudget) {

            // 2x2 예산 위젯
            contH = (int) (130 * dp);
            wW = (int) (130 * dp);
            wH = (int) (130 * dp);

        } else if (isDash || isToday) {

            // 대시보드 / 오늘 지출
            contH = (int) (100 * dp);
            wH = (int) (100 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;

        } else {

            // Compact
            contH = (int) (130 * dp);
            wH = (int) (130 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
        }


        // 컨테이너 높이
        ViewGroup.LayoutParams clp =
                container.getLayoutParams();

        clp.height = contH;

        container.setLayoutParams(clp);


        // 위젯 크기 + 가운데 정렬
        FrameLayout.LayoutParams wlp =
                new FrameLayout.LayoutParams(
                        wW,
                        wH
                );

        wlp.gravity = Gravity.CENTER;

        wv.setLayoutParams(wlp);


        // -------------------------
        // 위젯 루트
        // -------------------------

        int rootId =
                isBudget
                        ? R.id.widget_budget_root
                        : isDash
                        ? R.id.widget_dashboard_root
                        : isToday
                        ? R.id.widget_today_root
                        : R.id.widget_compact_root;

        View wRoot =
                wv.findViewById(rootId);


        // -------------------------
        // 배경
        // 모양 선택 기능 제거
        // 14dp 고정
        // -------------------------

        float radius = 14 * dp;

        int bgColor;

        if (WidgetTheme.TRANSPARENT.equals(selectedTheme)) {

        bgColor = 0x22AAAAAA;

        } else {

        switch (selectedTheme) {

                case WidgetTheme.WHITE:
                bgColor = 0xFFFFFFFF;
                break;

                case WidgetTheme.BLACK:
                bgColor = 0xFF000000;
                break;

                case WidgetTheme.SYSTEM:
                bgColor = dark
                        ? 0xFF000000
                        : 0xFFFFFFFF;
                break;

                default:
                bgColor = 0xFF000000;
                break;
        }
        }

        GradientDrawable gd = new GradientDrawable();
        gd.setColor(bgColor);
        gd.setCornerRadius(radius);

        if (WidgetTheme.TRANSPARENT.equals(selectedTheme)) {
        gd.setStroke(
                (int) (1.5f * dp),
                0x88AAAAAA,
                6 * dp,
                3 * dp
        );
        }

        wRoot.setBackground(gd);


        // -------------------------
        // 색상
        // -------------------------

        int primary =
                WidgetTheme.primary(dark);

        int hint =
                WidgetTheme.hint(dark);

        int incomeC =
                WidgetTheme.income(dark);

        int expC =
                WidgetTheme.expense(dark);


        // -------------------------
        // 예산 퍼센트
        // -------------------------

        long expLong =
                parseLong(prefsExpense);

        float pct =
                prefsBudget > 0
                        ? (float) expLong / prefsBudget
                        : 0f;

        int pctInt =
                Math.round(pct * 100);


        int arcColor =
                pct < 0.7f
                        ? (dark
                            ? 0xFFB088F9
                            : 0xFF6832C0)

                        : pct < 0.9f
                        ? (dark
                            ? 0xFFFFCC44
                            : 0xFFB8860B)

                        : (dark
                            ? 0xFFFF6B6B
                            : 0xFFCC2222);


        // =====================================================
        // Budget Widget
        // =====================================================

        if (isBudget) {

            TextView month =
                    wv.findViewById(
                            R.id.budget_month
                    );

            month.setTextColor(primary);
            month.setText(prefsMonth);


            Bitmap ring =
                    BudgetWidget.createRingBitmap(
                            300,
                            pct,
                            arcColor,
                            pctInt,
                            dark
                    );

            ImageView ringView =
                    wv.findViewById(
                            R.id.budget_ring
                    );

            ringView.setImageBitmap(ring);


            long rem =
                    prefsBudget - expLong;

            String remText;
            int remColor;


            if (prefsBudget == 0) {

                remText = "예산 미설정";
                remColor = hint;

            } else if (rem >= 0) {

                remText =
                        fmt(rem) + "원 남음";

                remColor = arcColor;

            } else {

                remText =
                        fmt(-rem) + "원 초과";

                remColor =
                        0xFFFF6B6B;
            }


            TextView remaining =
                    wv.findViewById(
                            R.id.budget_remaining
                    );

            remaining.setTextColor(remColor);
            remaining.setText(remText);
        }


        // =====================================================
        // Dashboard Widget
        // =====================================================

        else if (isDash) {

            TextView month =
                    wv.findViewById(
                            R.id.dash_month
                    );

            month.setTextColor(primary);
            month.setText(prefsMonth);


            TextView updated =
                    wv.findViewById(
                            R.id.dash_updated
                    );

            updated.setTextColor(hint);
            updated.setText(prefsUpdated);


            TextView balance =
                    wv.findViewById(
                            R.id.dash_balance
                    );

            balance.setTextColor(primary);

            balance.setText(
                    fmtSigned(prefsBalance)
                            + "원"
            );


            TextView income =
                    wv.findViewById(
                            R.id.dash_income
                    );

            income.setTextColor(incomeC);

            income.setText(
                    fmtUnsigned(prefsIncome)
                            + "원"
            );


            TextView expense =
                    wv.findViewById(
                            R.id.dash_expense
                    );

            expense.setTextColor(expC);

            expense.setText(
                    fmtUnsigned(prefsExpense)
                            + "원"
            );


            TextView percent =
                    wv.findViewById(
                            R.id.dash_percent
                    );


            if (prefsBudget > 0) {

                percent.setTextColor(arcColor);

                percent.setText(
                        pctInt + "%"
                );

            } else {

                percent.setTextColor(hint);
                percent.setText("미설정");
            }


            Bitmap bar =
                    DashboardWidget.createBarBitmap(
                            pct,
                            arcColor,
                            dark
                    );

            ImageView barView =
                    wv.findViewById(
                            R.id.dash_bar
                    );

            barView.setImageBitmap(bar);
        }


        // =====================================================
        // Today Widget
        // =====================================================

        else if (isToday) {

            TextView date =
                    wv.findViewById(
                            R.id.today_date
                    );

            date.setTextColor(
                    WidgetTheme.dim(dark)
            );


            TextView total =
                    wv.findViewById(
                            R.id.today_total
                    );

            total.setTextColor(
                    WidgetTheme.expense(dark)
            );


            TextView empty =
                    wv.findViewById(
                            R.id.today_empty
                    );

            empty.setTextColor(
                    WidgetTheme.hint(dark)
            );


            int[] nameIds = {
                    R.id.today_cat1_name,
                    R.id.today_cat2_name,
                    R.id.today_cat3_name
            };

            int[] amtIds = {
                    R.id.today_cat1_amt,
                    R.id.today_cat2_amt,
                    R.id.today_cat3_amt
            };


            for (int i = 0; i < 3; i++) {

                TextView name =
                        wv.findViewById(
                                nameIds[i]
                        );

                TextView amount =
                        wv.findViewById(
                                amtIds[i]
                        );

                name.setTextColor(
                        WidgetTheme.text(dark)
                );

                amount.setTextColor(
                        WidgetTheme.expense(dark)
                );
            }
        }


        // =====================================================
        // Compact Widget
        // =====================================================

        else {

            TextView month =
                    wv.findViewById(
                            R.id.compact_month
                    );

            month.setTextColor(primary);
            month.setText(prefsMonth);


            TextView updated =
                    wv.findViewById(
                            R.id.compact_updated
                    );

            updated.setTextColor(hint);
            updated.setText(prefsUpdated);


            TextView balance =
                    wv.findViewById(
                            R.id.compact_balance
                    );

            balance.setTextColor(primary);

            balance.setText(
                    fmtSigned(prefsBalance)
                            + "원"
            );


            TextView income =
                    wv.findViewById(
                            R.id.compact_income
                    );

            income.setTextColor(incomeC);

            income.setText(
                    fmtUnsigned(prefsIncome)
                            + "원"
            );


            TextView expense =
                    wv.findViewById(
                            R.id.compact_expense
                    );

            expense.setTextColor(expC);

            expense.setText(
                    fmtUnsigned(prefsExpense)
                            + "원"
            );
        }


        // 미리보기 추가
        container.addView(wv);
    }


    // =========================================================
    // 테마 체크 표시
    // =========================================================

    private void updateThemeChecks() {

        int[] ids = {
                R.id.check_transparent,
                R.id.check_system,
                R.id.check_white,
                R.id.check_black
        };

        String[] vals = {
                WidgetTheme.TRANSPARENT,
                WidgetTheme.SYSTEM,
                WidgetTheme.WHITE,
                WidgetTheme.BLACK
        };


        for (int i = 0; i < ids.length; i++) {

            findViewById(ids[i])
                    .setVisibility(
                            vals[i].equals(selectedTheme)
                                    ? View.VISIBLE
                                    : View.GONE
                    );
        }
    }


    // =========================================================
    // 저장
    // =========================================================

    private void save() {

        // 배경 테마만 저장
        getSharedPreferences(
                "gaegyebu_widget",
                MODE_PRIVATE
        )
                .edit()
                .putString(
                        WidgetTheme.PREF_KEY + appWidgetId,
                        selectedTheme
                )
                .apply();

        AppWidgetManager mgr =
                AppWidgetManager.getInstance(this);

        try {
            AppWidgetProviderInfo info =
                    mgr.getAppWidgetInfo(appWidgetId);
            String cls =
                    info.provider.getClassName();

            if (cls.contains("CompactWidget")) {
                CompactWidget.updateWidget(
                        this,
                        mgr,
                        appWidgetId
                );
            } else if (cls.contains("Budget")) {
                BudgetWidget.updateWidget(
                        this,
                        mgr,
                        appWidgetId
                );
            } else if (cls.contains("Dashboard")) {
                DashboardWidget.updateWidget(
                        this,
                        mgr,
                        appWidgetId
                );
            } else if (cls.contains("Today")) {
                TodayWidget.updateWidget(
                        this,
                        mgr,
                        appWidgetId
                );
            }

        } catch (Exception e) {
            // Provider 판별 실패 시 전체 갱신
            CompactWidget.updateWidget(
                    this,
                    mgr,
                    appWidgetId
            );
            BudgetWidget.updateWidget(
                    this,
                    mgr,
                    appWidgetId
            );
            DashboardWidget.updateWidget(
                    this,
                    mgr,
                    appWidgetId
            );
            TodayWidget.updateWidget(
                    this,
                    mgr,
                    appWidgetId
            );
        }

        Intent result =
                new Intent();
        result.putExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                appWidgetId
        );
        setResult(
                RESULT_OK,
                result
        );
        finish();
    }

    // =========================================================
    // 숫자 Format
    // =========================================================

    private String fmtSigned(String raw) {
        try {
            return String.format(
                    "%,d",
                    Long.parseLong(
                            raw.replace(",", "")
                                    .trim()
                    )
            );
        } catch (Exception e) {
            return raw;
        }
    }

    private String fmtUnsigned(String raw) {
        try {
            return String.format(
                    "%,d",
                    Math.abs(
                            Long.parseLong(
                                    raw.replace(",", "")
                                            .trim()
                            )
                    )
            );
        } catch (Exception e) {
            return raw;
        }
    }

    private String fmt(long n) {
        return String.format(
                "%,d",
                n
        );
    }

    private long parseLong(String s) {
        try {
            return Long.parseLong(
                    s.replace(",", "")
                            .replace("-", "")
                            .trim()
            );
        } catch (Exception e) {
            return 0;
        }
    }
}