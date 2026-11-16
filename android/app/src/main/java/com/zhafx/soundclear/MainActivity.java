package com.zhafx.soundclear;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int REQ_POST_NOTIFICATIONS = 9001;
    private static final String PREFS_NAME = "soundclear_android_prefs";
    private static final String KEY_BATTERY_PROMPT_SHOWN = "battery_opt_prompt_shown";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundAudioPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
        configureWebViewForBackgroundAudio();
        requestFirstLaunchBackgroundSetup(false);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebViewForBackgroundAudio() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }

    /**
     * Keep WebView timers and HTML5 <audio> alive when user switches apps, presses Home,
     * or locks the screen. NEVER call webView.onPause() or webView.pauseTimers().
     */
    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAwake();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAwake();
    }

    private void keepWebViewAwake() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        webView.onResume();
        webView.resumeTimers();
    }

    public void requestFirstLaunchBackgroundSetup(boolean forceBatteryPrompt) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    REQ_POST_NOTIFICATIONS
                );
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                boolean alreadyShown = prefs.getBoolean(KEY_BATTERY_PROMPT_SHOWN, false);
                if (forceBatteryPrompt || !alreadyShown) {
                    prefs.edit().putBoolean(KEY_BATTERY_PROMPT_SHOWN, true).apply();
                    showBatteryOptimizationDialog();
                }
            }
        }
    }

    private void showBatteryOptimizationDialog() {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
            .setTitle("Izinkan Pemutaran Latar Belakang")
            .setMessage(
                "Agar musik SoundClear tetap berjalan lancar saat pindah aplikasi, menekan tombol Home, atau layar terkunci, nonaktifkan penghemat baterai (Battery Optimization) untuk aplikasi ini."
            )
            .setPositiveButton("Izinkan", (dialog, which) -> launchIgnoreBatteryOptimizationSettings())
            .setNegativeButton("Nanti", (dialog, which) -> dialog.dismiss())
            .show();
    }

    @SuppressLint("BatteryLife")
    public void launchIgnoreBatteryOptimizationSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception ignored) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivity(fallback);
            } catch (Exception ignored2) {
                // Ignore if OEM blocks battery settings intent
            }
        }
    }
}
