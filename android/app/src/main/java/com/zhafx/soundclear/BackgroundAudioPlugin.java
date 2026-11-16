package com.zhafx.soundclear;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Capacitor native plugin bridging web audio state <-> Android Foreground Service (MediaPlaybackService),
 * AudioFocus callbacks, battery optimization checks, and local HTTP direct audio proxy resolution.
 */
@CapacitorPlugin(name = "SoundClearBackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    private static volatile BackgroundAudioPlugin activeInstance;
    private final ExecutorService resolverExecutor = Executors.newCachedThreadPool();

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        resolverExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    public static void dispatchMediaAction(String action, Double seekTimeSeconds) {
        BackgroundAudioPlugin plugin = activeInstance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (seekTimeSeconds != null) {
            data.put("seekTime", seekTimeSeconds);
        }
        plugin.notifyListeners("mediaAction", data);
    }

    public static void dispatchAudioFocusChange(String state) {
        BackgroundAudioPlugin plugin = activeInstance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("state", state);
        plugin.notifyListeners("audioFocusChange", data);
    }

    @PluginMethod
    public void syncPlaybackState(PluginCall call) {
        Context context = getContext();
        String title = call.getString("title", "SoundClear");
        String artist = call.getString("artist", "SoundClear");
        String album = call.getString("album", "SoundClear");
        String artworkUrl = call.getString("artworkUrl", "");
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        double durationSec = call.getDouble("durationSeconds", 0.0);
        double currentTimeSec = call.getDouble("currentTimeSeconds", 0.0);
        double rate = call.getDouble("playbackRate", 1.0);

        if (!isPlaying && !MediaPlaybackService.isServiceRunning()) {
            call.resolve();
            return;
        }

        Intent intent = new Intent(context, MediaPlaybackService.class);
        intent.setAction(MediaPlaybackService.ACTION_UPDATE_STATE);
        intent.putExtra(MediaPlaybackService.EXTRA_TITLE, title);
        intent.putExtra(MediaPlaybackService.EXTRA_ARTIST, artist);
        intent.putExtra(MediaPlaybackService.EXTRA_ALBUM, album);
        intent.putExtra(MediaPlaybackService.EXTRA_ARTWORK_URL, artworkUrl);
        intent.putExtra(MediaPlaybackService.EXTRA_IS_PLAYING, isPlaying);
        intent.putExtra(MediaPlaybackService.EXTRA_DURATION_MS, Math.max(0L, Math.round(durationSec * 1000.0)));
        intent.putExtra(MediaPlaybackService.EXTRA_POSITION_MS, Math.max(0L, Math.round(currentTimeSec * 1000.0)));
        intent.putExtra(MediaPlaybackService.EXTRA_PLAYBACK_RATE, (float) rate);

        if (MediaPlaybackService.isServiceRunning()) {
            context.startService(intent);
        } else {
            ContextCompat.startForegroundService(context, intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void setIdle(PluginCall call) {
        Context context = getContext();
        if (MediaPlaybackService.isServiceRunning()) {
            Intent intent = new Intent(context, MediaPlaybackService.class);
            intent.setAction(MediaPlaybackService.ACTION_STOP);
            context.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void resolveDirectAudioUrl(PluginCall call) {
        String videoId = call.getString("videoId", "");
        if (videoId == null || videoId.trim().isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("available", false);
            call.resolve(empty);
            return;
        }

        resolverExecutor.submit(() -> {
            LocalAudioStreamProxy.ResolvedAudioResult resolved =
                LocalAudioStreamProxy.getInstance().resolveForVideo(videoId.trim());
            JSObject out = new JSObject();
            if (resolved == null) {
                out.put("available", false);
            } else {
                out.put("available", true);
                out.put("url", resolved.proxyUrl);
                out.put("mimeType", resolved.mimeType);
                out.put("bitrateKbps", resolved.bitrateKbps);
                out.put("codec", resolved.codec);
            }
            call.resolve(out);
        });
    }

    @PluginMethod
    public void requestBackgroundPermissions(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            activity.runOnUiThread(() -> ((MainActivity) activity).requestFirstLaunchBackgroundSetup(true));
        }
        call.resolve();
    }

    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        Context context = getContext();
        boolean ignoring = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                ignoring = pm.isIgnoringBatteryOptimizations(context.getPackageName());
            }
        }
        JSObject res = new JSObject();
        res.put("ignoring", ignoring);
        call.resolve(res);
    }

    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            activity.runOnUiThread(() -> ((MainActivity) activity).launchIgnoreBatteryOptimizationSettings());
        }
        call.resolve();
    }
}
