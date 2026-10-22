package com.goreecloud.workspaceai.nativeapp;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

// Native Android UI; offline-only. No WebView, storage, credentials or network actions.
public final class MainActivity extends Activity {
    private static final int CANVAS = 0xFFF9FAFD;
    private static final int SURFACE = Color.WHITE;
    private static final int INK = 0xFF20243A;
    private static final int SOFT = 0xFF5F657B;
    private static final int BRAND = 0xFF5145D9;
    private static final int PALE = 0xFFE8E6FF;
    private static final int BORDER = 0xFFD5DBEA;
    private static final int MUTED = 0xFF9DA4B9;
    private FrameLayout content;
    private LinearLayout composer, nav;
    private EditText draft;
    private LinearLayout[] tabs;
    private TextView[] tabLabels;
    private IconView[] tabIcons;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(CANVAS);
        getWindow().setNavigationBarColor(CANVAS);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        LinearLayout root = column();
        root.setBackgroundColor(CANVAS);
        root.setFocusableInTouchMode(true);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int top = insets.getInsets(WindowInsets.Type.statusBars()).top;
                int bars = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                root.setPadding(0, top, 0, Math.max(bars, keyboard));
                if (nav != null) nav.setVisibility(keyboard > bars + dp(90) ? View.GONE : View.VISIBLE);
                return insets;
            });
        }
        setContentView(root);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        root.addView(makeHeader());
        View divider = new View(this);
        divider.setBackgroundColor(BORDER);
        root.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        composer = makeComposer();
        root.addView(composer);
        nav = makeNavigation();
        root.addView(nav);
        showTab(0);
    }

    private View makeHeader() {
        LinearLayout bar = row();
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(20), dp(12), dp(18), dp(12));
        bar.setBackgroundColor(SURFACE);
        FrameLayout logo = new FrameLayout(this);
        logo.setBackground(round(BRAND, 14, 0));
        logo.addView(new IconView(3, SURFACE), new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER));
        bar.addView(logo, new LinearLayout.LayoutParams(dp(45), dp(45)));
        LinearLayout brand = column();
        brand.setPadding(dp(12), 0, 0, 0);
        brand.addView(label("Workspace AI", 18, INK, true));
        TextView subtitle = label("GoreeCloud · Native Android", 11, SOFT, false);
        subtitle.setPadding(0, dp(3), 0, 0);
        brand.addView(subtitle);
        bar.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        FrameLayout settings = new FrameLayout(this);
        settings.setBackground(touch(0xFFF2F4FA, 13));
        settings.addView(new IconView(2, INK), new FrameLayout.LayoutParams(dp(23), dp(23), Gravity.CENTER));
        settings.setContentDescription("Settings");
        settings.setOnClickListener(v -> showTab(2));
        bar.addView(settings, new LinearLayout.LayoutParams(dp(43), dp(43)));
        return bar;
    }

    private LinearLayout makeComposer() {
        LinearLayout wrapper = column();
        wrapper.setPadding(dp(18), dp(8), dp(18), dp(9));
        LinearLayout card = column();
        card.setPadding(dp(15), dp(10), dp(12), dp(10));
        card.setBackground(round(SURFACE, 18, BORDER));
        wrapper.addView(card);
        draft = new EditText(this);
        draft.setTextSize(15);
        draft.setTextColor(INK);
        draft.setHintTextColor(MUTED);
        draft.setHint("Write a message…");
        draft.setBackgroundColor(Color.TRANSPARENT);
        draft.setPadding(0, dp(2), 0, dp(6));
        draft.setSingleLine(false);
        draft.setMinLines(2);
        draft.setMaxLines(5);
        draft.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE |
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        draft.setContentDescription("Local message draft");
        card.addView(draft);
        LinearLayout actions = row();
        actions.setGravity(Gravity.CENTER_VERTICAL);
        TextView mode = label("●  Draft only · offline", 11, SOFT, false);
        actions.addView(mode, new LinearLayout.LayoutParams(0, -2, 1));
        FrameLayout send = new FrameLayout(this);
        send.setBackground(round(0xFFEBECF5, 12, 0));
        send.addView(new IconView(4, MUTED),
                new FrameLayout.LayoutParams(dp(21), dp(21), Gravity.CENTER));
        send.setEnabled(false);
        send.setContentDescription("Send disabled until secure AI connection is available");
        actions.addView(send, new LinearLayout.LayoutParams(dp(42), dp(42)));
        card.addView(actions);
        return wrapper;
    }

    private LinearLayout makeNavigation() {
        LinearLayout bar = row();
        bar.setPadding(dp(12), dp(5), dp(12), dp(5));
        bar.setBackgroundColor(SURFACE);
        tabs = new LinearLayout[3];
        tabIcons = new IconView[3];
        tabLabels = new TextView[3];
        String[] titles = {"Chat", "Projects", "Settings"};
        for (int i = 0; i < titles.length; i++) {
            final int selected = i;
            LinearLayout tab = column();
            tab.setGravity(Gravity.CENTER);
            IconView icon = new IconView(i, SOFT);
            tab.addView(icon, new LinearLayout.LayoutParams(dp(22), dp(22)));
            TextView name = label(titles[i], 11, SOFT, false);
            name.setPadding(0, dp(3), 0, 0);
            name.setGravity(Gravity.CENTER);
            tab.addView(name, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            tab.setContentDescription(titles[i] + " tab");
            // Preserve each native tab as a separate accessibility target.
            tab.setFocusable(true);
            tab.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
            tab.setOnClickListener(v -> showTab(selected));
            bar.addView(tab, new LinearLayout.LayoutParams(0, dp(59), 1));
            tabs[i] = tab;
            tabIcons[i] = icon;
            tabLabels[i] = name;
        }
        return bar;
    }

    private void showTab(int selected) {
        // Switching away from Chat must not leave a hidden editor owning the IME.
        if (selected != 0 && draft != null && draft.hasFocus()) {
            InputMethodManager keyboard =
                (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.hideSoftInputFromWindow(draft.getWindowToken(), 0);
            draft.clearFocus();
        }
        for (int i = 0; i < tabs.length; i++) {
            boolean active = selected == i;
            tabs[i].setBackground(navSurface(active ? PALE : SURFACE));
            tabIcons[i].setInk(active ? BRAND : SOFT);
            tabLabels[i].setTextColor(active ? BRAND : SOFT);
            tabLabels[i].setTypeface(Typeface.create(active ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
            tabs[i].setSelected(active);
            if (Build.VERSION.SDK_INT >= 30) {
                tabs[i].setStateDescription(active ? "Selected" : "Not selected");
            }
        }
        composer.setVisibility(selected == 0 ? View.VISIBLE : View.GONE);
        content.removeAllViews();
        if (Build.VERSION.SDK_INT >= 28) {
            content.setAccessibilityPaneTitle(selected == 0 ? "Chat" : selected == 1 ? "Projects" : "Settings");
        }
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout page = column();
        page.setPadding(dp(22), dp(25), dp(22), dp(24));
        scroll.addView(page);
        content.addView(scroll);
        if (selected == 0) showChat(page);
        else if (selected == 1) showProjects(page);
        else showSettings(page);
    }

    private void showChat(LinearLayout page) {
        page.addView(eyebrow("YOUR SPACE TO THINK"));
        page.addView(space(10));
        page.addView(sectionHeading("Make room for what’s next.", 29));
        page.addView(space(9));
        page.addView(label("Bring questions, ideas, and plans together in one place.", 14, SOFT, false));
        page.addView(space(24));
        LinearLayout hero = column();
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xFF5145D9, 0xFF7663ED});
        background.setCornerRadius(dp(23));
        hero.setBackground(background);
        hero.setPadding(dp(21), dp(23), dp(21), dp(22));
        hero.addView(new IconView(3, SURFACE), new LinearLayout.LayoutParams(dp(29), dp(29)));
        hero.addView(space(19));
        hero.addView(label("Ideas deserve a great home.", 20, SURFACE, true));
        hero.addView(space(8));
        hero.addView(label("Offline developer preview. Secure AI messaging is not connected yet.", 13, 0xFFF0EDFF, false));
        page.addView(hero);
        page.addView(space(26));
        page.addView(label("Start with a draft", 17, INK, true));
        page.addView(space(6));
        page.addView(label("Try an idea — nothing is sent.", 12, SOFT, false));
        page.addView(space(13));
        page.addView(prompt("Plan a new project", "Help me outline the goals and milestones for a new project."));
        page.addView(space(10));
        page.addView(prompt("Brainstorm ideas", "Help me brainstorm some fresh ideas and different approaches."));
    }

    private View prompt(String title, String content) {
        LinearLayout card = row();
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setBackground(touch(SURFACE, 16));
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout copy = column();
        copy.addView(label(title, 14, INK, true));
        TextView hint = label("Tap to prepare a draft", 11, SOFT, false);
        hint.setPadding(0, dp(5), 0, 0);
        copy.addView(hint);
        card.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        card.addView(new IconView(5, BRAND), new LinearLayout.LayoutParams(dp(21), dp(21)));
        card.setContentDescription(title + ". Fill message editor.");
        card.setOnClickListener(v -> {
            draft.setText(content);
            draft.setSelection(draft.length());
            draft.requestFocus();
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(draft, InputMethodManager.SHOW_IMPLICIT);
        });
        return card;
    }

    private void showProjects(LinearLayout page) {
        page.addView(eyebrow("YOUR WORKSPACE"));
        page.addView(space(11));
        page.addView(sectionHeading("Projects", 30));
        page.addView(space(9));
        page.addView(label("A place for all your connected work.", 14, SOFT, false));
        page.addView(space(28));
        page.addView(emptyState("Your projects will live here",
                "Project storage is not yet available in this offline preview. No browser data has been imported.", 1));
    }

    private void showSettings(LinearLayout page) {
        page.addView(eyebrow("WORKSPACE PREFERENCES"));
        page.addView(space(11));
        page.addView(sectionHeading("Settings", 30));
        page.addView(space(9));
        page.addView(label("Know exactly what this build can do.", 14, SOFT, false));
        page.addView(space(26));
        page.addView(infoRow("Connection", "Offline developer preview", 3));
        page.addView(space(11));
        page.addView(infoRow("Privacy", "Drafts remain in this app session", 0));
        page.addView(space(11));
        page.addView(infoRow("Appearance", "Light theme", 2));
        page.addView(space(20));
        TextView about = label("About this native preview  ↗", 14, BRAND, true);
        about.setPadding(dp(15), dp(16), dp(15), dp(16));
        about.setBackground(touch(PALE, 14));
        about.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Workspace AI · offline preview")
                .setMessage("This is a genuinely native Android UI under development. AI messaging, account sign-in, sync, and project storage are not connected. This build requests no Internet permission.")
                .setPositiveButton("Close", null).show());
        page.addView(about);
    }

    private View infoRow(String title, String value, int icon) {
        LinearLayout card = row();
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(17), dp(16), dp(17));
        card.setBackground(round(SURFACE, 16, BORDER));
        card.addView(new IconView(icon, BRAND), new LinearLayout.LayoutParams(dp(23), dp(23)));
        LinearLayout copy = column();
        copy.setPadding(dp(13), 0, 0, 0);
        copy.addView(label(title, 14, INK, true));
        TextView subtitle = label(value, 12, SOFT, false);
        subtitle.setPadding(0, dp(5), 0, 0);
        copy.addView(subtitle);
        card.addView(copy);
        return card;
    }

    private View emptyState(String title, String body, int icon) {
        LinearLayout card = column();
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(20), dp(29), dp(20), dp(29));
        card.setBackground(round(SURFACE, 20, BORDER));
        FrameLayout image = new FrameLayout(this);
        image.setBackground(round(PALE, 17, 0));
        image.addView(new IconView(icon, BRAND), new FrameLayout.LayoutParams(dp(29), dp(29), Gravity.CENTER));
        card.addView(image, new LinearLayout.LayoutParams(dp(62), dp(62)));
        card.addView(space(20));
        TextView name = label(title, 19, INK, true);
        name.setGravity(Gravity.CENTER);
        card.addView(name);
        card.addView(space(10));
        TextView description = label(body, 13, SOFT, false);
        description.setGravity(Gravity.CENTER);
        card.addView(description);
        return card;
    }

    private TextView sectionHeading(String content, int textSize) {
        TextView heading = label(content, textSize, INK, true);
        if (Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
        return heading;
    }

    private TextView eyebrow(String s) {
        TextView v = label(s, 11, BRAND, true);
        v.setLetterSpacing(.11f);
        return v;
    }
    private TextView label(String s, int size, int color, boolean strong) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextColor(color);
        v.setTextSize(size);
        v.setLineSpacing(dp(2), 1.05f);
        v.setTypeface(Typeface.create(strong ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        return v;
    }
    private LinearLayout row() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.HORIZONTAL);
        return v;
    }
    private LinearLayout column() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        return v;
    }
    private View space(int height) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(1), dp(height)));
        return v;
    }
    private GradientDrawable round(int color, int radius, int stroke) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(radius));
        if (stroke != 0) bg.setStroke(dp(1), stroke);
        return bg;
    }
    private RippleDrawable navSurface(int color) {
        // Navigation is one unified bar, not three bordered tiles.
        return new RippleDrawable(ColorStateList.valueOf(0x205145D9),
                round(color, 13, 0), null);
    }
    private RippleDrawable touch(int color, int radius) {
        return new RippleDrawable(ColorStateList.valueOf(0x205145D9),
                round(color, radius, color == SURFACE ? BORDER : 0), null);
    }
    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class IconView extends View {
        private final Paint pen = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int kind;
        private int tint;
        IconView(int kind, int tint) { super(MainActivity.this); this.kind = kind; this.tint = tint; }
        void setInk(int color) { tint = color; invalidate(); }
        @Override protected void onDraw(Canvas c) {
            super.onDraw(c);
            c.save();
            float side = Math.min(getWidth(), getHeight());
            c.translate((getWidth() - side)/2f, (getHeight() - side)/2f);
            c.scale(side/24f, side/24f);
            pen.setColor(tint); pen.setStyle(Paint.Style.STROKE);
            pen.setStrokeWidth(1.9f); pen.setStrokeCap(Paint.Cap.ROUND); pen.setStrokeJoin(Paint.Join.ROUND);
            if (kind == 0) {
                c.drawRoundRect(3,3,21,18,3,3,pen);
                c.drawLine(6,18,5,21,pen);
                c.drawLine(7,9,17,9,pen); c.drawLine(7,13,14,13,pen);
            } else if (kind == 1) {
                Path f = new Path(); f.moveTo(2.5f,7); f.lineTo(9,7); f.lineTo(11,9.5f);
                f.lineTo(21.5f,9.5f); f.lineTo(21.5f,20); f.lineTo(2.5f,20); f.close();
                c.drawPath(f,pen);
            } else if (kind == 2) {
                c.drawCircle(12,12,3,pen);
                for (int i=0;i<8;i++) {
                    double a=i*Math.PI/4;
                    float x=(float)Math.cos(a),y=(float)Math.sin(a);
                    c.drawLine(12+x*7,12+y*7,12+x*10,12+y*10,pen);
                }
            } else if (kind == 3) {
                Path star=new Path();star.moveTo(12,2.5f);star.lineTo(14.5f,9.5f);
                star.lineTo(21.5f,12);star.lineTo(14.5f,14.5f);star.lineTo(12,21.5f);
                star.lineTo(9.5f,14.5f);star.lineTo(2.5f,12);star.lineTo(9.5f,9.5f);star.close();
                c.drawPath(star,pen);
            } else if (kind == 4) {
                c.drawLine(12,19,12,5,pen); c.drawLine(6,11,12,5,pen); c.drawLine(18,11,12,5,pen);
            } else {
                // Starter prompts navigate into the draft; they do not send it.
                c.drawLine(8,5,15,12,pen); c.drawLine(15,12,8,19,pen);
            }
            c.restore();
        }
    }
}
