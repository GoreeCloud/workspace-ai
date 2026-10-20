package com.goreecloud.workspaceai;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final String BASE = "http://127.0.0.1:3031/";
    private WebView webView;
    private LinearLayout frame;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(15, 21, 37));
        getWindow().setNavigationBarColor(Color.rgb(15, 21, 37));
        frame = new LinearLayout(this);
        frame.setOrientation(LinearLayout.VERTICAL);
        frame.setBackgroundColor(Color.rgb(15, 21, 37));
        setContentView(frame);
        webView = new WebView(this);
        WebSettings cfg = webView.getSettings();
        cfg.setJavaScriptEnabled(true);
        cfg.setDomStorageEnabled(true);
        cfg.setAllowFileAccess(false);
        cfg.setAllowContentAccess(false);
        cfg.setJavaScriptCanOpenWindowsAutomatically(false);
        cfg.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == 3031) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame()) showDisconnected();
            }
        });
        reconnect();
    }
    private void reconnect() {
        frame.removeAllViews();
        frame.addView(webView, new LinearLayout.LayoutParams(-1, -1));
        webView.loadUrl(BASE);
    }
    private void showDisconnected() {
        frame.removeView(webView);
        frame.removeAllViews();
        frame.setPadding(dp(24), dp(36), dp(24), dp(24));
        TextView heading = new TextView(this);
        heading.setText("Workspace AI needs its local server");
        heading.setTextSize(24);
        heading.setTextColor(Color.WHITE);
        frame.addView(heading);
        TextView body = new TextView(this);
        body.setText("This is a USB-assisted development build, not a standalone Android application. On the laptop, start the Workspace AI server and connect the phone with USB debugging. Then run:\n\n  adb reverse tcp:3031 tcp:3031\n\nPress Reconnect to load the workspace. Sign-in may require a browser-compatible implementation before release.");
        body.setTextSize(15);
        body.setTextColor(Color.rgb(198, 207, 223));
        LinearLayout.LayoutParams textP = new LinearLayout.LayoutParams(-1, -2);
        textP.topMargin = dp(24);
        frame.addView(body, textP);
        Button retry = new Button(this);
        retry.setText("Reconnect");
        LinearLayout.LayoutParams btnP = new LinearLayout.LayoutParams(-1, -2);
        btnP.topMargin = dp(30);
        frame.addView(retry, btnP);
        retry.setOnClickListener(v -> reconnect());
    }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    @Override public void onBackPressed() {
        if (webView != null && webView.getParent() == frame && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (webView != null) { if (webView.getParent() == frame) frame.removeView(webView); webView.destroy(); }
        super.onDestroy();
    }
}
