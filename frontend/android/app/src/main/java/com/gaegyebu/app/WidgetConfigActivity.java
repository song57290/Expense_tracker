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

public class WidgetConfigActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "gaegyebu_widget";

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private String selectedTheme = WidgetTheme.SYSTEM;
    private String widgetClass = "";

    private String prefsMonth = "--월";
    private String prefsUpdated = "";
    private String prefsIncome = "0";
    private String prefsExpense = "0";
    private String prefsBalance = "0";
    private long prefsBudget = 0;
    private String prefsWeekDaily = "";
    private int prefsWeekTodayIndex = 0;
    private long prefsWeekTotal = 0;
    private long prefsWeekAvg = 0;

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
        prefsMonth = prefs.getString("month", "--월");
        prefsUpdated = prefs.getString("updated", "");
        prefsIncome = prefs.getString("income", "0");
        prefsExpense = prefs.getString("expense", "0");
        prefsBalance = prefs.getString("balance", "0");
        prefsBudget = parseLong(prefs.getString("budget", "0"));
        prefsWeekDaily = prefs.getString("week_daily", "");
        prefsWeekTodayIndex = parseInt(prefs.getString("week_today_index", "0"));
        prefsWeekTotal = parseLong(prefs.getString("week_total", "0"));
        prefsWeekAvg = parseLong(prefs.getString("week_avg", "0"));

        setContentView(R.layout.activity_widget_config);

        WidgetTheme.applyWindowTheme(this);

        updateThemeChecks();
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

        findViewById(R.id.btn_cancel).setOnClickListener(v -> finish());
        findViewById(R.id.btn_save).setOnClickListener(v -> save());
    }

    private void updatePreview() {
        FrameLayout container = findViewById(R.id.preview_container);
        container.removeAllViews();

        float dp = getResources().getDisplayMetrics().density;
        boolean dark = WidgetTheme.isDark(selectedTheme, this);

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

        if (isBudget) {
            contH = (int) (130 * dp);
            wW = (int) (130 * dp);
            wH = (int) (130 * dp);
        } else if (isToday) {
            contH = (int) (190 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
            wH = (int) (190 * dp);
        } else if (isPace) {
            contH = (int) (160 * dp);
            wW = (int) (160 * dp);
            wH = (int) (160 * dp);
        } else if (isWeekly) {
            contH = (int) (190 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
            wH = (int) (190 * dp);
        } else {
            contH = (int) (130 * dp);
            wW = FrameLayout.LayoutParams.MATCH_PARENT;
            wH = (int) (130 * dp);
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

        long expenseLong = parseLong(prefsExpense);
        float pct = prefsBudget > 0 ? (float) expenseLong / prefsBudget : 0f;
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

        TextView month = wv.findViewById(R.id.compact_month);
        month.setTextColor(primary);
        month.setText(prefsMonth);

        TextView updated = wv.findViewById(R.id.compact_updated);
        updated.setTextColor(hint);
        updated.setText(prefsUpdated);

        TextView balanceLabel = wv.findViewById(R.id.compact_balance_label);
        if (balanceLabel != null) {
            balanceLabel.setTextColor(text);
        }

        TextView balance = wv.findViewById(R.id.compact_balance);
        balance.setTextColor(primary);
        balance.setText(fmtSigned(prefsBalance) + "원");

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
        }

        TextView incomeValue = wv.findViewById(R.id.compact_income);
        incomeValue.setTextColor(income);
        incomeValue.setText(fmtUnsigned(prefsIncome) + "원");

        TextView expenseLabel = wv.findViewById(R.id.compact_expense_label);
        if (expenseLabel != null) {
            expenseLabel.setTextColor(expense);
        }

        TextView expenseValue = wv.findViewById(R.id.compact_expense);
        expenseValue.setTextColor(expense);
        expenseValue.setText(fmtUnsigned(prefsExpense) + "원");
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

        java.util.Calendar cal = java.util.Calendar.getInstance();
        int daysLeft = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH) - cal.get(java.util.Calendar.DAY_OF_MONTH);
        Bitmap ring = BudgetWidget.createRingBitmap(
                300,
                pct,
                arcColor,
                pctInt,
                dark,
                daysLeft
        );

        ImageView ringView = wv.findViewById(R.id.budget_ring);
        ringView.setImageBitmap(ring);

        long remainingValue = prefsBudget - expenseLong;
        String remainingText;
        int remainingColor;

        if (prefsBudget == 0) {
            remainingText = "예산 미설정";
            remainingColor = WidgetTheme.hint(dark);
        } else if (remainingValue >= 0) {
            remainingText = fmt(remainingValue) + "원 남음";
            remainingColor = arcColor;
        } else {
            remainingText = fmt(-remainingValue) + "원 초과";
            remainingColor = WidgetTheme.expense(dark);
        }

        TextView remaining = wv.findViewById(R.id.budget_remaining);
        remaining.setTextColor(remainingColor);
        remaining.setText(remainingText);

        TextView updated = wv.findViewById(R.id.budget_updated);
        updated.setTextColor(WidgetTheme.hint(dark));
        updated.setText(prefsUpdated);
    }

    private void setupTodayPreview(View wv, boolean dark) {
        int primary = WidgetTheme.primary(dark);
        int text = WidgetTheme.text(dark);
        int hint = WidgetTheme.hint(dark);
        int expense = WidgetTheme.expense(dark);

        TextView title = wv.findViewById(R.id.today_title);
        title.setTextColor(primary);

        TextView date = wv.findViewById(R.id.today_date);
        date.setTextColor(hint);

        TextView updated = wv.findViewById(R.id.today_updated);
        updated.setTextColor(hint);
        updated.setText(prefsUpdated);

        TextView total = wv.findViewById(R.id.today_total);
        total.setTextColor(expense);

        TextView empty = wv.findViewById(R.id.today_empty);
        empty.setTextColor(hint);

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
            amount.setTextColor(expense);
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

        TextView daily = wv.findViewById(R.id.pace_daily);
        daily.setTextColor(WidgetTheme.text(dark));
        daily.setText(fmt(dailyAvg) + "원");

        TextView dailyLabel = wv.findViewById(R.id.pace_daily_label);
        dailyLabel.setTextColor(WidgetTheme.hint(dark));

        TextView projLabel = wv.findViewById(R.id.pace_proj_label);
        projLabel.setTextColor(WidgetTheme.hint(dark));

        TextView proj = wv.findViewById(R.id.pace_proj);
        proj.setTextColor(dark ? 0xFF7BAFF0 : 0xFF0D6EFD);
        proj.setText(fmt(projected) + "원");

        TextView updated = wv.findViewById(R.id.pace_updated);
        updated.setTextColor(WidgetTheme.hint(dark));
        updated.setText(prefsUpdated);
    }

    private void setupWeeklyPreview(View wv, boolean dark) {
        int accentColor = dark ? 0xFF7BAFF0 : 0xFF0D6EFD;
        int hint = WidgetTheme.hint(dark);
        String[] dayLabels = {"월", "화", "수", "목", "금", "토", "일"};

        TextView title = wv.findViewById(R.id.weekly_title);
        title.setTextColor(WidgetTheme.dim(dark));

        TextView updated = wv.findViewById(R.id.weekly_updated);
        updated.setTextColor(hint);
        updated.setText(prefsUpdated);

        TextView total = wv.findViewById(R.id.weekly_total);
        total.setTextColor(WidgetTheme.text(dark));
        total.setText(fmt(prefsWeekTotal) + "원");

        TextView avg = wv.findViewById(R.id.weekly_avg);
        avg.setTextColor(hint);
        avg.setText("평균 " + fmt(prefsWeekAvg) + "원/일");

        long[] daily = new long[7];
        if (!prefsWeekDaily.isEmpty()) {
            String[] parts = prefsWeekDaily.split(",");
            for (int i = 0; i < 7 && i < parts.length; i++) daily[i] = parseLong(parts[i]);
        }

        int[] dayIds = {R.id.weekly_day1, R.id.weekly_day2, R.id.weekly_day3, R.id.weekly_day4,
                R.id.weekly_day5, R.id.weekly_day6, R.id.weekly_day7};
        for (int i = 0; i < 7; i++) {
            TextView day = wv.findViewById(dayIds[i]);
            day.setText(dayLabels[i]);
            day.setTextColor(i == prefsWeekTodayIndex ? accentColor : hint);
        }

        int mutedColor = dark ? 0x66FFFFFF : 0x33000000;
        ImageView bars = wv.findViewById(R.id.weekly_bars);
        bars.setImageBitmap(WeeklyWidget.createBarsBitmap(700, 220, daily, prefsWeekTodayIndex, accentColor, mutedColor));
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

    private void save() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(
                        WidgetTheme.PREF_KEY + appWidgetId,
                        selectedTheme
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

    private int parseInt(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }
}