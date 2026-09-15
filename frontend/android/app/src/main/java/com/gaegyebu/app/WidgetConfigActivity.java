package com.gaegyebu.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class WidgetConfigActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "gaegyebu_widget";

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private String selectedTheme = WidgetTheme.SYSTEM;
    private String widgetClass = "";

    private String prefsMonth = "--월";
    private String prefsUpdated = "";

    // 미리보기용 고정 샘플 값 — 실제 계정 데이터를 쓰면 테마를 고를 때마다(그리고
    // 사람마다) 금액이 들쭉날쭉해 크기·레이아웃을 비교하기 어려워서, 항상 같은
    // 예시 값으로 보여준다.
    private static final long PREVIEW_INCOME = 3200000;
    private static final long PREVIEW_EXPENSE = 1850000;
    private static final long PREVIEW_BUDGET = 2000000;
    private static final long PREVIEW_TODAY_TOTAL = 32000;
    private static final long[] PREVIEW_WEEK_DAILY = {45000, 12000, 38000, 0, 95000, 60000, 35000};
    private static final int PREVIEW_WEEK_TODAY_INDEX = 4;

    // 1.3배까지 키웠더니 너무 커서 읽기 부담스럽다는 피드백으로 1.0(기본 크기)로 되돌림 —
    // 대신 상자 자체를 넉넉하게 키워뒀으니(아래 updatePreview) 글씨는 원래 크기 그대로
    // 두고 여백만 넓어지는 효과를 낸다. 이후 여기에 사용자가 고른 글자 크기 배율이
    // updatePreview()에서 곱해져 들어간다.
    private float previewScale = 1.0f;
    private String selectedTextSize = WidgetTheme.TEXT_MEDIUM;

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

        try {
            AppWidgetProviderInfo info = AppWidgetManager.getInstance(this)
                    .getAppWidgetInfo(appWidgetId);

            if (info != null) {
                widgetClass = info.provider.getClassName();
            }
        } catch (Exception ignored) {}

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        selectedTheme = WidgetTheme.getTheme(prefs, appWidgetId);
        selectedTextSize = WidgetTheme.getTextSizePref(prefs, appWidgetId);
        prefsMonth = prefs.getString("month", "--월");
        prefsUpdated = prefs.getString("updated", "");

        setContentView(R.layout.activity_widget_config);

        WidgetTheme.applyWindowTheme(this);

        updateThemeChecks();
        updateTextSizeChecks();
        updatePreview();

        findViewById(R.id.opt_transparent).setOnClickListener(v -> {
            selectedTheme = WidgetTheme.TRANSPARENT;
            updateThemeChecks();
            updatePreview();
        });

        findViewById(R.id.opt_system).setOnClickListener(v -> {
            selectedTheme = WidgetTheme.SYSTEM;
            updateThemeChecks();
            updatePreview();
        });

        findViewById(R.id.opt_white).setOnClickListener(v -> {
            selectedTheme = WidgetTheme.WHITE;
            updateThemeChecks();
            updatePreview();
        });

        findViewById(R.id.opt_black).setOnClickListener(v -> {
            selectedTheme = WidgetTheme.BLACK;
            updateThemeChecks();
            updatePreview();
        });

        findViewById(R.id.opt_text_small).setOnClickListener(v -> {
            selectedTextSize = WidgetTheme.TEXT_SMALL;
            updateTextSizeChecks();
            updatePreview();
        });

        findViewById(R.id.opt_text_medium).setOnClickListener(v -> {
            selectedTextSize = WidgetTheme.TEXT_MEDIUM;
            updateTextSizeChecks();
            updatePreview();
        });

        findViewById(R.id.opt_text_large).setOnClickListener(v -> {
            selectedTextSize = WidgetTheme.TEXT_LARGE;
            updateTextSizeChecks();
            updatePreview();
        });

        findViewById(R.id.btn_cancel).setOnClickListener(v -> finish());
        findViewById(R.id.btn_save).setOnClickListener(v -> save());
    }

    private void updatePreview() {
        FrameLayout container = findViewById(R.id.preview_container);
        container.removeAllViews();

        float dp = getResources().getDisplayMetrics().density;
        boolean dark = WidgetTheme.isDark(selectedTheme, this);
        previewScale = WidgetTheme.textScaleMultiplier(selectedTextSize);

        boolean isBudget = widgetClass.contains("Budget");
        boolean isToday = widgetClass.contains("Today");
        boolean isPace = widgetClass.contains("Pace");
        boolean isWeekly = widgetClass.contains("Weekly");

        int layoutRes = isBudget
                ? R.layout.widget_budget
                : isToday
                ? R.layout.widget_today
                : isPace
                ? R.layout.widget_pace
                : isWeekly
                ? R.layout.widget_weekly
                : R.layout.widget_compact;

        View wv = LayoutInflater.from(this).inflate(layoutRes, container, false);

        int contH;
        int wW;
        int wH;

        // 테마 고르는 화면에서 미리보기가 너무 작아 잘 안 보인다는 피드백으로 전체적으로 확대.
        // 예산·지출 추이는 글씨를 1.3배로 키운 만큼(previewScale) 상자도 더 넉넉히 줘야
        // 안 겹치고 안 잘린다 — 190/220dp로는 부족해서 다른 위젯과 같이 240dp로 맞춘다.
        if (isBudget) {
            contH = (int) (240 * dp);
            wW = (int) (240 * dp);
            wH = (int) (240 * dp);
        } else if (isToday) {
            contH = (int) (240 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
            wH = (int) (240 * dp);
        } else if (isPace) {
            contH = (int) (240 * dp);
            wW = (int) (240 * dp);
            wH = (int) (240 * dp);
        } else if (isWeekly) {
            contH = (int) (240 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
            wH = (int) (240 * dp);
        } else {
            contH = (int) (170 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
            wH = (int) (170 * dp);
        }

        ViewGroup.LayoutParams clp = container.getLayoutParams();
        clp.height = contH;
        container.setLayoutParams(clp);

        FrameLayout.LayoutParams wlp = new FrameLayout.LayoutParams(wW, wH);
        wlp.gravity = Gravity.CENTER;
        wv.setLayoutParams(wlp);

        int rootId = isBudget
                ? R.id.widget_budget_root
                : isToday
                ? R.id.widget_today_root
                : isPace
                ? R.id.widget_pace_root
                : isWeekly
                ? R.id.widget_weekly_root
                : R.id.widget_compact_root;

        View root = wv.findViewById(rootId);
        applyPreviewBackground(root, dark, dp);

        long expenseLong = PREVIEW_EXPENSE;
        float pct = (float) expenseLong / PREVIEW_BUDGET;
        int pctInt = Math.round(pct * 100);
        int arcColor = getArcColor(pct, dark);

        if (isBudget) {
            setupBudgetPreview(wv, dark, pct, pctInt, arcColor, expenseLong);
        } else if (isToday) {
            setupTodayPreview(wv, dark);
        } else if (isPace) {
            setupPacePreview(wv, dark, expenseLong);
        } else if (isWeekly) {
            setupWeeklyPreview(wv, dark);
        } else {
            setupCompactPreview(wv, dark);
        }

        container.addView(wv);
    }

    private void applyPreviewBackground(View root, boolean dark, float dp) {
        int bgColor;

        if (WidgetTheme.TRANSPARENT.equals(selectedTheme)) {
            bgColor = 0x22AAAAAA;
        } else if (WidgetTheme.WHITE.equals(selectedTheme)) {
            bgColor = 0xFFFFFFFF;
        } else if (WidgetTheme.BLACK.equals(selectedTheme)) {
            bgColor = 0xFF000000;
        } else {
            bgColor = dark ? 0xFF000000 : 0xFFFFFFFF;
        }

        GradientDrawable gd = new GradientDrawable();
        gd.setColor(bgColor);
        gd.setCornerRadius(14 * dp);

        if (WidgetTheme.TRANSPARENT.equals(selectedTheme)) {
            gd.setStroke(
                    (int) (1.5f * dp),
                    0x88AAAAAA,
                    6 * dp,
                    3 * dp
            );
        }

        root.setBackground(gd);
    }

    private int getArcColor(float pct, boolean dark) {
        if (pct < 0.7f) {
            return dark ? 0xFFB088F9 : 0xFF6832C0;
        }

        if (pct < 0.9f) {
            return dark ? 0xFFFFCC44 : 0xFFB8860B;
        }

        return dark ? 0xFFFF6B6B : 0xFFCC2222;
    }

    private void setupCompactPreview(View wv, boolean dark) {
        int primary = WidgetTheme.primary(dark);
        int text = WidgetTheme.text(dark);
        int hint = WidgetTheme.hint(dark);
        int income = WidgetTheme.income(dark);
        int expense = WidgetTheme.expense(dark);

        // 간편 위젯은 실제로 배정된 dp가 아니라 "이 기기의 화면 너비"를 기준으로 글씨
        // 배율을 정한다(CompactWidget.java와 동일 공식) — 고정 1.15배(최댓값)로 미리보기를
        // 그리면 화면이 작은 기기에서는 실제 위젯보다 미리보기가 부자연스럽게 커 보인다.
        float dm = getResources().getDisplayMetrics().density;
        int screenWidthDp = Math.round(getResources().getDisplayMetrics().widthPixels / dm);
        float compactScale = Math.max(0.85f, Math.min(1.15f, screenWidthDp / 360f)) * previewScale;

        TextView month = wv.findViewById(R.id.compact_month);
        month.setTextColor(primary);
        month.setText(prefsMonth);
        month.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f * compactScale);

        TextView updated = wv.findViewById(R.id.compact_updated);
        updated.setTextColor(hint);
        updated.setText(prefsUpdated);

        TextView balanceLabel = wv.findViewById(R.id.compact_balance_label);
        if (balanceLabel != null) {
            balanceLabel.setTextColor(text);
            balanceLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f * compactScale);
        }

        TextView balance = wv.findViewById(R.id.compact_balance);
        balance.setTextColor(primary);
        balance.setText(fmtSigned(String.valueOf(PREVIEW_INCOME - PREVIEW_EXPENSE)) + "원");
        balance.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16f * compactScale);

        // 카드 패널 배경 (다크/라이트 드로어블 전환)
        View incomeCard = wv.findViewById(R.id.compact_income_card);
        View expenseCard = wv.findViewById(R.id.compact_expense_card);
        if (incomeCard != null) {
            incomeCard.setBackgroundResource(
                    dark ? R.drawable.widget_income_bg : R.drawable.widget_income_bg_light);
        }
        if (expenseCard != null) {
            expenseCard.setBackgroundResource(
                    dark ? R.drawable.widget_expense_bg : R.drawable.widget_expense_bg_light);
        }

        TextView incomeLabel = wv.findViewById(R.id.compact_income_label);
        if (incomeLabel != null) {
            incomeLabel.setTextColor(income);
            incomeLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f * compactScale);
        }

        TextView incomeValue = wv.findViewById(R.id.compact_income);
        incomeValue.setTextColor(income);
        incomeValue.setText(fmtUnsigned(String.valueOf(PREVIEW_INCOME)) + "원");
        incomeValue.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f * compactScale);

        TextView expenseLabel = wv.findViewById(R.id.compact_expense_label);
        if (expenseLabel != null) {
            expenseLabel.setTextColor(expense);
            expenseLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f * compactScale);
        }

        TextView expenseValue = wv.findViewById(R.id.compact_expense);
        expenseValue.setTextColor(expense);
        expenseValue.setText(fmtUnsigned(String.valueOf(PREVIEW_EXPENSE)) + "원");
        expenseValue.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f * compactScale);
    }

    private void setupBudgetPreview(
            View wv,
            boolean dark,
            float pct,
            int pctInt,
            int arcColor,
            long expenseLong
    ) {
        TextView month = wv.findViewById(R.id.budget_month);
        month.setTextColor(WidgetTheme.primary(dark));
        month.setText(prefsMonth);
        month.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f * previewScale);

        // 실제 위젯은 D-day를 링 비트맵 안에 직접 그려서 "사용" 라벨을 숨기는데, 미리보기는
        // 이걸 안 숨겨서 링 위 "93%" 글자와 "사용" 글자가 겹쳐 보이던 게 진짜 원인이었다.
        View usageLabel = wv.findViewById(R.id.budget_usage_label);
        if (usageLabel != null) usageLabel.setVisibility(View.GONE);

        java.util.Calendar cal = java.util.Calendar.getInstance();
        int daysLeft = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH) - cal.get(java.util.Calendar.DAY_OF_MONTH);
        Bitmap ring = BudgetWidget.createRingBitmap(
                this,
                300,
                pct,
                arcColor,
                pctInt,
                dark,
                daysLeft
        );

        ImageView ringView = wv.findViewById(R.id.budget_ring);
        ringView.setImageBitmap(ring);

        float density = getResources().getDisplayMetrics().density;

        // 연/월(budget_month)만 빼고 나머지(링·남음·업데이트)를 다 같이 살짝 아래로.
        View ringFrame = wv.findViewById(R.id.budget_ring_frame);
        ViewGroup.MarginLayoutParams ringFrameLp = (ViewGroup.MarginLayoutParams) ringFrame.getLayoutParams();
        ringFrameLp.topMargin = (int) (11 * previewScale * density);
        ringFrameLp.bottomMargin = (int) (2 * previewScale * density);
        ringFrame.setLayoutParams(ringFrameLp);

        View budgetRoot = wv.findViewById(R.id.widget_budget_root);
        int rootPad = (int) (6 * previewScale * density);
        budgetRoot.setPadding(rootPad, rootPad, rootPad, rootPad);

        long remainingValue = PREVIEW_BUDGET - expenseLong;
        String remainingText;
        int remainingColor;

        if (remainingValue >= 0) {
            remainingText = fmt(remainingValue) + "원 남음";
            remainingColor = arcColor;
        } else {
            remainingText = fmt(-remainingValue) + "원 초과";
            remainingColor = WidgetTheme.expense(dark);
        }

        TextView remaining = wv.findViewById(R.id.budget_remaining);
        remaining.setTextColor(remainingColor);
        remaining.setText(remainingText);
        remaining.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 10f * previewScale);
        ViewGroup.MarginLayoutParams remainingLp = (ViewGroup.MarginLayoutParams) remaining.getLayoutParams();
        remainingLp.topMargin = (int) (9 * previewScale * density);
        remaining.setLayoutParams(remainingLp);

        TextView updated = wv.findViewById(R.id.budget_updated);
        updated.setTextColor(WidgetTheme.hint(dark));
        updated.setText(prefsUpdated);
        updated.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 6.5f * previewScale);
        ViewGroup.MarginLayoutParams updatedLp = (ViewGroup.MarginLayoutParams) updated.getLayoutParams();
        updatedLp.topMargin = (int) (4 * previewScale * density);
        updated.setLayoutParams(updatedLp);
    }

    private void setupTodayPreview(View wv, boolean dark) {
        int primary = WidgetTheme.primary(dark);
        int text = WidgetTheme.text(dark);
        int hint = WidgetTheme.hint(dark);
        int expense = WidgetTheme.expense(dark);

        TextView title = wv.findViewById(R.id.today_title);
        title.setTextColor(primary);
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f * previewScale);

        java.util.Calendar cal = java.util.Calendar.getInstance();
        TextView date = wv.findViewById(R.id.today_date);
        date.setTextColor(hint);
        date.setText((cal.get(java.util.Calendar.MONTH) + 1) + "월 " + cal.get(java.util.Calendar.DAY_OF_MONTH) + "일");
        date.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f * previewScale);

        TextView updated = wv.findViewById(R.id.today_updated);
        updated.setTextColor(hint);
        updated.setText(prefsUpdated);
        updated.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 9f * previewScale);

        TextView total = wv.findViewById(R.id.today_total);
        total.setTextColor(expense);
        total.setText(fmt(PREVIEW_TODAY_TOTAL) + "원");
        total.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 22f * previewScale);

        TextView empty = wv.findViewById(R.id.today_empty);
        empty.setTextColor(hint);
        empty.setVisibility(View.GONE);

        // 레이아웃엔 카테고리 행이 5개까지 있는데 미리보기 샘플은 3개뿐이라, 나머지
        // 2개는 실제 위젯처럼(내용 없을 때) 숨겨야 빈 줄이 남지 않는다.
        View row4 = wv.findViewById(R.id.today_row4);
        View row5 = wv.findViewById(R.id.today_row5);
        if (row4 != null) row4.setVisibility(View.GONE);
        if (row5 != null) row5.setVisibility(View.GONE);

        String[] previewNames = {"식비", "카페", "교통"};
        long[] previewAmounts = {18000, 6500, 7500};

        int[] nameIds = {
                R.id.today_cat1_name,
                R.id.today_cat2_name,
                R.id.today_cat3_name
        };

        int[] amountIds = {
                R.id.today_cat1_amt,
                R.id.today_cat2_amt,
                R.id.today_cat3_amt
        };

        for (int i = 0; i < 3; i++) {
            TextView name = wv.findViewById(nameIds[i]);
            TextView amount = wv.findViewById(amountIds[i]);

            name.setTextColor(text);
            name.setText(previewNames[i]);
            name.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f * previewScale);
            amount.setTextColor(expense);
            amount.setText(fmt(previewAmounts[i]) + "원");
            amount.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f * previewScale);
        }
    }

    private void setupPacePreview(View wv, boolean dark, long expenseLong) {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int today = cal.get(java.util.Calendar.DAY_OF_MONTH);
        int daysInMonth = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH);
        long dailyAvg = today > 0 ? expenseLong / today : 0;
        long projected = dailyAvg * daysInMonth;

        TextView title = wv.findViewById(R.id.pace_title);
        title.setTextColor(WidgetTheme.dim(dark));
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f * previewScale);

        TextView daily = wv.findViewById(R.id.pace_daily);
        daily.setTextColor(WidgetTheme.text(dark));
        daily.setText(fmt(dailyAvg) + "원");
        daily.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 26f * previewScale);

        TextView dailyLabel = wv.findViewById(R.id.pace_daily_label);
        dailyLabel.setTextColor(WidgetTheme.hint(dark));
        dailyLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f * previewScale);

        TextView projLabel = wv.findViewById(R.id.pace_proj_label);
        projLabel.setTextColor(WidgetTheme.hint(dark));
        projLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f * previewScale);

        TextView proj = wv.findViewById(R.id.pace_proj);
        proj.setTextColor(dark ? 0xFF7BAFF0 : 0xFF0D6EFD);
        proj.setText(fmt(projected) + "원");
        proj.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f * previewScale);

        TextView updated = wv.findViewById(R.id.pace_updated);
        updated.setTextColor(WidgetTheme.hint(dark));
        updated.setText(prefsUpdated);
        updated.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 9f * previewScale);
    }

    private void setupWeeklyPreview(View wv, boolean dark) {
        int accentColor = dark ? 0xFF7BAFF0 : 0xFF0D6EFD;
        int hint = WidgetTheme.hint(dark);
        String[] dayLabels = {"월", "화", "수", "목", "금", "토", "일"};

        TextView title = wv.findViewById(R.id.weekly_title);
        title.setTextColor(WidgetTheme.dim(dark));
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f * previewScale);

        TextView updated = wv.findViewById(R.id.weekly_updated);
        updated.setTextColor(hint);
        updated.setText(prefsUpdated);
        updated.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 9f * previewScale);

        long weekTotal = 0;
        for (long v : PREVIEW_WEEK_DAILY) weekTotal += v;
        long weekAvg = weekTotal / (PREVIEW_WEEK_TODAY_INDEX + 1);

        TextView total = wv.findViewById(R.id.weekly_total);
        total.setTextColor(WidgetTheme.text(dark));
        total.setText(fmt(weekTotal) + "원");
        total.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 28f * previewScale);
        ViewGroup.MarginLayoutParams totalLp = (ViewGroup.MarginLayoutParams) total.getLayoutParams();
        totalLp.topMargin = (int) (-4f * previewScale * getResources().getDisplayMetrics().density);
        total.setLayoutParams(totalLp);

        TextView avg = wv.findViewById(R.id.weekly_avg);
        avg.setTextColor(hint);
        avg.setText("평균 " + fmt(weekAvg) + "원/일");
        avg.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 9f * previewScale);

        int[] dayIds = {R.id.weekly_day1, R.id.weekly_day2, R.id.weekly_day3, R.id.weekly_day4,
                R.id.weekly_day5, R.id.weekly_day6, R.id.weekly_day7};
        for (int i = 0; i < 7; i++) {
            TextView day = wv.findViewById(dayIds[i]);
            day.setText(dayLabels[i]);
            day.setTextColor(i == PREVIEW_WEEK_TODAY_INDEX ? accentColor : hint);
            day.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f * previewScale);
        }

        int mutedColor = dark ? 0x66FFFFFF : 0x33000000;
        ImageView bars = wv.findViewById(R.id.weekly_bars);
        // 고정 700x220 비트맵을 fitXY로 늘려 채우다 보니, 미리보기처럼 화면 폭 전체로
        // 넓어진(비율이 700:220과 많이 다른) 박스에서는 숫자가 세로로 눌려 보였다 —
        // 레이아웃이 끝난 뒤 실제 이 뷰의 픽셀 크기로 그려서 늘어남 자체를 없앤다.
        float barLabelTextSizePx = 16f * previewScale * getResources().getDisplayMetrics().density;
        bars.post(() -> {
            int w = bars.getWidth();
            int h = bars.getHeight();
            if (w <= 0 || h <= 0) { w = 700; h = 220; }
            bars.setImageBitmap(WeeklyWidget.createBarsBitmap(this, w, h, PREVIEW_WEEK_DAILY, PREVIEW_WEEK_TODAY_INDEX, accentColor, mutedColor, barLabelTextSizePx));
        });
    }

    private void updateThemeChecks() {
        int[] ids = {
                R.id.check_transparent,
                R.id.check_system,
                R.id.check_white,
                R.id.check_black
        };

        String[] values = {
                WidgetTheme.TRANSPARENT,
                WidgetTheme.SYSTEM,
                WidgetTheme.WHITE,
                WidgetTheme.BLACK
        };

        for (int i = 0; i < ids.length; i++) {
            findViewById(ids[i]).setVisibility(
                    values[i].equals(selectedTheme)
                            ? View.VISIBLE
                            : View.GONE
            );
        }
    }

    private void updateTextSizeChecks() {
        int[] ids = {R.id.check_text_small, R.id.check_text_medium, R.id.check_text_large};
        String[] values = {WidgetTheme.TEXT_SMALL, WidgetTheme.TEXT_MEDIUM, WidgetTheme.TEXT_LARGE};

        for (int i = 0; i < ids.length; i++) {
            findViewById(ids[i]).setVisibility(
                    values[i].equals(selectedTextSize) ? View.VISIBLE : View.GONE
            );
        }
    }

    private void save() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(
                        WidgetTheme.PREF_KEY + appWidgetId,
                        selectedTheme
                )
                .putString(
                        WidgetTheme.TEXTSIZE_PREF_KEY + appWidgetId,
                        selectedTextSize
                )
                .apply();

        AppWidgetManager manager = AppWidgetManager.getInstance(this);

        try {
            AppWidgetProviderInfo info = manager.getAppWidgetInfo(appWidgetId);
            String className = info.provider.getClassName();

            if (className.contains("CompactWidget")) {
                CompactWidget.updateWidget(this, manager, appWidgetId);
            } else if (className.contains("Budget")) {
                BudgetWidget.updateWidget(this, manager, appWidgetId);
            } else if (className.contains("Today")) {
                TodayWidget.updateWidget(this, manager, appWidgetId);
            } else if (className.contains("Pace")) {
                PaceWidget.updateWidget(this, manager, appWidgetId);
            } else if (className.contains("Weekly")) {
                WeeklyWidget.updateWidget(this, manager, appWidgetId);
            }
        } catch (Exception e) {
            CompactWidget.updateAll(this);
            BudgetWidget.updateAll(this);
            TodayWidget.updateAll(this);
            PaceWidget.updateAll(this);
            WeeklyWidget.updateAll(this);
        }

        Intent result = new Intent();
        result.putExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                appWidgetId
        );

        setResult(RESULT_OK, result);
        finish();
    }

    private String fmtSigned(String raw) {
        try {
            return String.format(
                    "%,d",
                    Long.parseLong(raw.replace(",", "").trim())
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
                                    raw.replace(",", "").trim()
                            )
                    )
            );
        } catch (Exception e) {
            return raw;
        }
    }

    private String fmt(long n) {
        return String.format("%,d", n);
    }
}