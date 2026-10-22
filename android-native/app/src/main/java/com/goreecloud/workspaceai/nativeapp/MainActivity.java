package com.goreecloud.workspaceai.nativeapp;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

// Genuine Android Views. No WebView, browser shell, credentials or external requests.
// This is a visual/interaction prototype, NOT a connected AI product.
public final class MainActivity extends Activity {
    private static final int BRAND = Color.rgb(81, 69, 217);
    private static final int TEXT = Color.rgb(32, 36, 58);
    private static final int SECONDARY = Color.rgb(95, 101, 123);
    private static final int BG = Color.rgb(249, 250, 253);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(18), dp(20), dp(18), dp(18));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                int bars = insets.getInsets(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()).bottom;
                int top = insets.getInsets(WindowInsets.Type.statusBars()).top;
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                root.setPadding(dp(18), top + dp(16), dp(18), Math.max(bars, keyboard) + dp(14));
                return insets;
            });
        }
        setContentView(root);

        TextView eyebrow = label("GOREECLOUD  /  NATIVE ANDROID PREVIEW", 11, BRAND);
        eyebrow.setLetterSpacing(.11f);
        root.addView(eyebrow);

        TextView title = label("Workspace AI", 29, TEXT);
        title.setTypeface(null, 1);
        title.setPadding(0, dp(9), 0, dp(6));
        root.addView(title);

        TextView status = label("Offline developer preview · No AI connection", 13, SECONDARY);
        status.setPadding(0, 0, 0, dp(20));
        root.addView(status);

        LinearLayout navigation = new LinearLayout(this);
        navigation.setOrientation(LinearLayout.HORIZONTAL);
        Button chats = button("Chat");
        chats.setEnabled(false);
        navigation.addView(chats, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button projects = button("Projects");
        navigation.addView(projects, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button settings = button("Settings");
        navigation.addView(settings, new LinearLayout.LayoutParams(0, dp(48), 1));
        root.addView(navigation);

        ScrollView content = new ScrollView(this);
        content.setFillViewport(true);
        LinearLayout intro = new LinearLayout(this);
        intro.setOrientation(LinearLayout.VERTICAL);
        intro.setGravity(Gravity.CENTER);
        intro.setPadding(dp(12), dp(24), dp(12), dp(24));
        TextView heading = label("Good ideas start here.", 28, TEXT);
        heading.setGravity(Gravity.CENTER);
        heading.setTypeface(null, 1);
        intro.addView(heading);
        TextView description = label(
            "A native Android workspace is being developed. Your text stays on this screen only. " +
            "Account sign-in, AI sending, sync and project storage are not yet connected.",
            15, SECONDARY);
        description.setGravity(Gravity.CENTER);
        description.setPadding(0, dp(16), 0, 0);
        intro.addView(description);
        content.addView(intro);
        root.addView(content, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        TextView composeLabel = label("Message draft  ·  device only", 13, SECONDARY);
        root.addView(composeLabel);

        EditText draft = new EditText(this);
        draft.setHint("Ask anything…");
        draft.setTextSize(16);
        draft.setTextColor(TEXT);
        draft.setHintTextColor(SECONDARY);
        draft.setSingleLine(false);
        draft.setMinLines(2);
        draft.setMaxLines(5);
        draft.setGravity(Gravity.TOP);
        draft.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
                           android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE |
                           android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        draft.setContentDescription("Workspace AI message draft");
        root.addView(draft, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button send = button("Send (connection required)");
        send.setEnabled(false);
        send.setContentDescription("Send disabled until a secure AI connection is configured");
        root.addView(send, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(50)));

        TextView disclaimer = label(
            "Native UI preview only · No credentials, network access or local history storage.",
            12, SECONDARY);
        disclaimer.setGravity(Gravity.CENTER);
        disclaimer.setPadding(0, dp(9), 0, 0);
        root.addView(disclaimer);

        projects.setOnClickListener(v -> new AlertDialog.Builder(this)
            .setTitle("Projects")
            .setMessage("Native project storage and account boundaries are not implemented. " +
                        "No browser data has been read or imported.")
            .setPositiveButton("OK", null).show());
        settings.setOnClickListener(v -> new AlertDialog.Builder(this)
            .setTitle("Development settings")
            .setMessage("This preview is offline and cannot sign in or send model requests. " +
                        "Only the genuine Android interface is under test.")
            .setPositiveButton("OK", null).show());
    }

    private TextView label(String content, float size, int color) {
        TextView view = new TextView(this);
        view.setText(content);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private Button button(String content) {
        Button view = new Button(this);
        view.setText(content);
        view.setAllCaps(false);
        return view;
    }

    private int dp(int size) {
        return Math.round(size * getResources().getDisplayMetrics().density);
    }
}
