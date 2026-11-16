package com.zhafx.soundclear;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.text.TextUtils;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;
import java.io.InputStream;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Foreground Service (foregroundServiceType="mediaPlayback") that keeps SoundClear alive while
 * switching apps, pressing Home, locking the screen, or leaving the Activity. Supports native
 * MediaPlayer playback directly inside the service so background playback never depends on
 * WebView lifecycle, while also supporting passive notification sync for local/offline blobs.
 */
public class MediaPlaybackService extends Service {

    public static final String CHANNEL_ID = "soundclear_media_playback";
    public static final int NOTIFICATION_ID = 7001;

    public static final String ACTION_UPDATE_STATE = "com.zhafx.soundclear.action.UPDATE_STATE";
    public static final String ACTION_PLAY = "com.zhafx.soundclear.action.PLAY";
    public static final String ACTION_PAUSE = "com.zhafx.soundclear.action.PAUSE";
    public static final String ACTION_TOGGLE = "com.zhafx.soundclear.action.TOGGLE";
    public static final String ACTION_NEXT = "com.zhafx.soundclear.action.NEXT";
    public static final String ACTION_PREV = "com.zhafx.soundclear.action.PREV";
    public static final String ACTION_STOP = "com.zhafx.soundclear.action.STOP";

    public static final String ACTION_LOAD_AND_PLAY = "com.zhafx.soundclear.action.LOAD_AND_PLAY";
    public static final String ACTION_PAUSE_NATIVE = "com.zhafx.soundclear.action.PAUSE_NATIVE";
    public static final String ACTION_RESUME_NATIVE = "com.zhafx.soundclear.action.RESUME_NATIVE";
    public static final String ACTION_STOP_NATIVE = "com.zhafx.soundclear.action.STOP_NATIVE";
    public static final String ACTION_SEEK_NATIVE = "com.zhafx.soundclear.action.SEEK_NATIVE";
    public static final String ACTION_SET_VOLUME_NATIVE = "com.zhafx.soundclear.action.SET_VOLUME_NATIVE";
    public static final String ACTION_SET_RATE_NATIVE = "com.zhafx.soundclear.action.SET_RATE_NATIVE";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ALBUM = "album";
    public static final String EXTRA_ARTWORK_URL = "artworkUrl";
    public static final String EXTRA_IS_PLAYING = "isPlaying";
    public static final String EXTRA_DURATION_MS = "durationMs";
    public static final String EXTRA_POSITION_MS = "positionMs";
    public static final String EXTRA_PLAYBACK_RATE = "playbackRate";
    public static final String EXTRA_STREAM_URL = "streamUrl";
    public static final String EXTRA_VOLUME = "volume";

    private static volatile boolean serviceRunning = false;

    public static boolean isServiceRunning() {
        return serviceRunning;
    }

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final OkHttpClient artworkHttp = new OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build();

    private MediaPlayer mediaPlayer;
    private boolean nativePlayerActive = false;
    private boolean nativePlayerPrepared = false;
    private boolean nativeBuffering = false;
    private boolean shouldPlayWhenPrepared = true;
    private long pendingSeekMs = 0L;
    private int loadGeneration = 0;

    private String currentTitle = "SoundClear";
    private String currentArtist = "Audio Fidelitas Tinggi";
    private String currentAlbum = "SoundClear";
    private String currentArtworkUrl = "";
    private Bitmap currentArtworkBitmap = null;
    private boolean isPlaying = false;
    private long durationMs = 0L;
    private long positionMs = 0L;
    private float playbackRate = 1.0f;
    private float targetVolume = 1.0f;
    private boolean isDucked = false;
    private boolean hasAudioFocus = false;
    private boolean resumeAfterFocusGain = false;
    private boolean noisyReceiverRegistered = false;

    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            if (!nativePlayerActive || !nativePlayerPrepared || mediaPlayer == null) {
                return;
            }
            try {
                boolean playingNow = mediaPlayer.isPlaying();
                int curMs = mediaPlayer.getCurrentPosition();
                int durMs = mediaPlayer.getDuration();
                if (durMs > 0) durationMs = durMs;
                if (curMs >= 0) positionMs = curMs;
                isPlaying = playingNow;
                syncMediaSessionPlaybackState();
                BackgroundAudioPlugin.dispatchNativePlaybackState(
                    true,
                    playingNow,
                    nativeBuffering,
                    positionMs / 1000.0,
                    durationMs / 1000.0,
                    false,
                    false
                );
            } catch (IllegalStateException ignored) {
                // Ignore transient state during reset/prepare
            }
            if (nativePlayerActive && isPlaying) {
                mainHandler.postDelayed(this, 450L);
            }
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (!nativePlayerActive) return;
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_GAIN:
                hasAudioFocus = true;
                isDucked = false;
                applyNativeVolume();
                if (resumeAfterFocusGain) {
                    resumeAfterFocusGain = false;
                    resumeNativeInternal();
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                hasAudioFocus = false;
                resumeAfterFocusGain = isPlaying;
                pauseNativeInternal();
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                isDucked = true;
                applyNativeVolume();
                break;
            case AudioManager.AUDIOFOCUS_LOSS:
                hasAudioFocus = false;
                resumeAfterFocusGain = false;
                pauseNativeInternal();
                break;
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                resumeAfterFocusGain = false;
                if (nativePlayerActive) {
                    pauseNativeInternal();
                } else {
                    BackgroundAudioPlugin.dispatchMediaAction("pause", null);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        serviceRunning = true;
        createNotificationChannel();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SoundClear::MediaPlaybackWakeLock");
            wakeLock.setReferenceCounted(false);
        }

        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wm.createWifiLock(mode, "SoundClear::MediaPlaybackWifiLock");
            wifiLock.setReferenceCounted(false);
        }

        mediaSession = new MediaSessionCompat(this, "SoundClearMediaSession");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                if (nativePlayerActive) {
                    resumeAfterFocusGain = false;
                    resumeNativeInternal();
                } else {
                    BackgroundAudioPlugin.dispatchMediaAction("play", null);
                }
            }

            @Override
            public void onPause() {
                resumeAfterFocusGain = false;
                if (nativePlayerActive) {
                    pauseNativeInternal();
                } else {
                    BackgroundAudioPlugin.dispatchMediaAction("pause", null);
                }
            }

            @Override
            public void onSkipToNext() {
                BackgroundAudioPlugin.dispatchMediaAction("nexttrack", null);
            }

            @Override
            public void onSkipToPrevious() {
                BackgroundAudioPlugin.dispatchMediaAction("previoustrack", null);
            }

            @Override
            public void onSeekTo(long pos) {
                if (nativePlayerActive) {
                    seekNativeInternal(pos);
                } else {
                    BackgroundAudioPlugin.dispatchMediaAction("seekto", pos / 1000.0);
                }
            }

            @Override
            public void onStop() {
                resumeAfterFocusGain = false;
                stopNativePlayerInternal();
                BackgroundAudioPlugin.dispatchMediaAction("stop", null);
                stopSelfSafely();
            }
        });
        mediaSession.setActive(true);

        if (!noisyReceiverRegistered) {
            IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(noisyReceiver, filter);
            }
            noisyReceiverRegistered = true;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            MediaButtonReceiver.handleIntent(mediaSession, intent);
            String action = intent.getAction();
            if (ACTION_LOAD_AND_PLAY.equals(action)) {
                applyMetadataExtras(intent);
                String streamUrl = intent.getStringExtra(EXTRA_STREAM_URL);
                long startPosMs = Math.max(0L, intent.getLongExtra(EXTRA_POSITION_MS, 0L));
                float vol = intent.getFloatExtra(EXTRA_VOLUME, targetVolume);
                float rate = intent.getFloatExtra(EXTRA_PLAYBACK_RATE, playbackRate);
                boolean autoplay = intent.getBooleanExtra(EXTRA_IS_PLAYING, true);
                loadAndPlayNative(streamUrl, startPosMs, vol, rate, autoplay);
                return START_STICKY;
            } else if (ACTION_PAUSE_NATIVE.equals(action)) {
                resumeAfterFocusGain = false;
                pauseNativeInternal();
                return START_STICKY;
            } else if (ACTION_RESUME_NATIVE.equals(action)) {
                resumeAfterFocusGain = false;
                resumeNativeInternal();
                return START_STICKY;
            } else if (ACTION_STOP_NATIVE.equals(action)) {
                resumeAfterFocusGain = false;
                stopNativePlayerInternal();
                return START_STICKY;
            } else if (ACTION_SEEK_NATIVE.equals(action)) {
                long seekMs = Math.max(0L, intent.getLongExtra(EXTRA_POSITION_MS, 0L));
                seekNativeInternal(seekMs);
                return START_STICKY;
            } else if (ACTION_SET_VOLUME_NATIVE.equals(action)) {
                targetVolume = Math.max(0.0f, Math.min(1.0f, intent.getFloatExtra(EXTRA_VOLUME, 1.0f)));
                applyNativeVolume();
                return START_STICKY;
            } else if (ACTION_SET_RATE_NATIVE.equals(action)) {
                playbackRate = Math.max(0.25f, Math.min(4.0f, intent.getFloatExtra(EXTRA_PLAYBACK_RATE, 1.0f)));
                applyNativePlaybackRate();
                syncMediaSessionPlaybackState();
                return START_STICKY;
            } else if (ACTION_UPDATE_STATE.equals(action)) {
                applyMetadataExtras(intent);
                if (!nativePlayerActive) {
                    isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
                    durationMs = Math.max(0L, intent.getLongExtra(EXTRA_DURATION_MS, 0L));
                    positionMs = Math.max(0L, intent.getLongExtra(EXTRA_POSITION_MS, 0L));
                    playbackRate = Math.max(0.25f, Math.min(4.0f, intent.getFloatExtra(EXTRA_PLAYBACK_RATE, 1.0f)));
                    if (isPlaying) {
                        acquireLocks();
                    } else {
                        releaseLocks();
                    }
                }
                updateSessionAndForeground();
                return START_STICKY;
            } else if (ACTION_PLAY.equals(action)) {
                if (nativePlayerActive) {
                    resumeAfterFocusGain = false;
                    resumeNativeInternal();
                } else {
                    BackgroundAudioPlugin.dispatchMediaAction("play", null);
                }
            } else if (ACTION_PAUSE.equals(action)) {
                resumeAfterFocusGain = false;
                if (nativePlayerActive) {
                    pauseNativeInternal();
                } else {
                    BackgroundAudioPlugin.dispatchMediaAction("pause", null);
                }
            } else if (ACTION_TOGGLE.equals(action)) {
                if (isPlaying) {
                    resumeAfterFocusGain = false;
                    if (nativePlayerActive) {
                        pauseNativeInternal();
                    } else {
                        BackgroundAudioPlugin.dispatchMediaAction("pause", null);
                    }
                } else {
                    if (nativePlayerActive) {
                        resumeAfterFocusGain = false;
                        resumeNativeInternal();
                    } else {
                        BackgroundAudioPlugin.dispatchMediaAction("play", null);
                    }
                }
            } else if (ACTION_NEXT.equals(action)) {
                BackgroundAudioPlugin.dispatchMediaAction("nexttrack", null);
            } else if (ACTION_PREV.equals(action)) {
                BackgroundAudioPlugin.dispatchMediaAction("previoustrack", null);
            } else if (ACTION_STOP.equals(action)) {
                resumeAfterFocusGain = false;
                stopNativePlayerInternal();
                BackgroundAudioPlugin.dispatchMediaAction("stop", null);
                stopSelfSafely();
                return START_NOT_STICKY;
            }
        }

        updateSessionAndForeground();
        return START_STICKY;
    }

    private void applyMetadataExtras(Intent intent) {
        String nextTitle = intent.getStringExtra(EXTRA_TITLE);
        String nextArtist = intent.getStringExtra(EXTRA_ARTIST);
        String nextAlbum = intent.getStringExtra(EXTRA_ALBUM);
        String nextArtUrl = intent.getStringExtra(EXTRA_ARTWORK_URL);

        if (!TextUtils.isEmpty(nextTitle)) currentTitle = nextTitle;
        if (!TextUtils.isEmpty(nextArtist)) currentArtist = nextArtist;
        if (!TextUtils.isEmpty(nextAlbum)) currentAlbum = nextAlbum;

        String cleanArtUrl = nextArtUrl == null ? "" : nextArtUrl.trim();
        if (!Objects.equals(cleanArtUrl, currentArtworkUrl)) {
            currentArtworkUrl = cleanArtUrl;
            currentArtworkBitmap = null;
            if (!cleanArtUrl.isEmpty()) {
                fetchArtworkAsync(cleanArtUrl);
            }
        }
    }

    private void loadAndPlayNative(
        @Nullable String streamUrl,
        long startPosMs,
        float volume,
        float rate,
        boolean autoplay
    ) {
        if (TextUtils.isEmpty(streamUrl)) {
            stopNativePlayerInternal();
            BackgroundAudioPlugin.dispatchNativePlaybackState(false, false, false, 0, 0, false, true);
            return;
        }

        final int gen = ++loadGeneration;
        mainHandler.removeCallbacks(progressTicker);

        nativePlayerActive = true;
        nativePlayerPrepared = false;
        nativeBuffering = true;
        shouldPlayWhenPrepared = autoplay;
        pendingSeekMs = Math.max(0L, startPosMs);
        positionMs = pendingSeekMs;
        durationMs = 0L;
        targetVolume = Math.max(0.0f, Math.min(1.0f, volume));
        playbackRate = Math.max(0.25f, Math.min(4.0f, rate));
        isPlaying = autoplay;
        isDucked = false;

        if (autoplay) {
            requestAudioFocusIfNeeded();
            acquireLocks();
        } else {
            releaseLocks();
        }

        updateSessionAndForeground();
        BackgroundAudioPlugin.dispatchNativePlaybackState(
            true,
            autoplay,
            true,
            positionMs / 1000.0,
            durationMs / 1000.0,
            false,
            false
        );

        try {
            if (mediaPlayer == null) {
                mediaPlayer = new MediaPlayer();
            } else {
                mediaPlayer.reset();
            }
            mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            );

            mediaPlayer.setOnPreparedListener(mp -> {
                if (gen != loadGeneration || !nativePlayerActive) return;
                nativePlayerPrepared = true;
                nativeBuffering = false;
                try {
                    int dur = mp.getDuration();
                    if (dur > 0) durationMs = dur;
                    if (pendingSeekMs > 0L) {
                        int seekTarget = (int) Math.min(pendingSeekMs, dur > 0 ? dur : pendingSeekMs);
                        mp.seekTo(seekTarget);
                        positionMs = seekTarget;
                        pendingSeekMs = 0L;
                    }
                    applyNativeVolume();
                    if (shouldPlayWhenPrepared) {
                        requestAudioFocusIfNeeded();
                        mp.start();
                        applyNativePlaybackRate();
                        isPlaying = true;
                        acquireLocks();
                        startProgressTicker();
                    } else {
                        isPlaying = false;
                        releaseLocks();
                    }
                } catch (IllegalStateException ignored) {
                    isPlaying = false;
                }
                updateSessionAndForeground();
                BackgroundAudioPlugin.dispatchNativePlaybackState(
                    true,
                    isPlaying,
                    false,
                    positionMs / 1000.0,
                    durationMs / 1000.0,
                    false,
                    false
                );
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                if (gen != loadGeneration || !nativePlayerActive) return;
                mainHandler.removeCallbacks(progressTicker);
                isPlaying = false;
                nativeBuffering = false;
                releaseLocks();
                updateSessionAndForeground();
                BackgroundAudioPlugin.dispatchNativePlaybackState(
                    true,
                    false,
                    false,
                    durationMs / 1000.0,
                    durationMs / 1000.0,
                    true,
                    false
                );
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                if (gen != loadGeneration || !nativePlayerActive) return true;
                mainHandler.removeCallbacks(progressTicker);
                nativePlayerActive = false;
                nativePlayerPrepared = false;
                nativeBuffering = false;
                isPlaying = false;
                releaseLocks();
                abandonAudioFocus();
                updateSessionAndForeground();
                BackgroundAudioPlugin.dispatchNativePlaybackState(false, false, false, 0, 0, false, true);
                return true;
            });

            mediaPlayer.setOnInfoListener((mp, what, extra) -> {
                if (gen != loadGeneration || !nativePlayerActive) return false;
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                    nativeBuffering = true;
                    BackgroundAudioPlugin.dispatchNativePlaybackState(
                        true,
                        isPlaying,
                        true,
                        positionMs / 1000.0,
                        durationMs / 1000.0,
                        false,
                        false
                    );
                } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) {
                    nativeBuffering = false;
                    BackgroundAudioPlugin.dispatchNativePlaybackState(
                        true,
                        isPlaying,
                        false,
                        positionMs / 1000.0,
                        durationMs / 1000.0,
                        false,
                        false
                    );
                }
                return false;
            });

            mediaPlayer.setOnSeekCompleteListener(mp -> {
                if (gen != loadGeneration || !nativePlayerActive) return;
                try {
                    positionMs = Math.max(0L, mp.getCurrentPosition());
                    syncMediaSessionPlaybackState();
                    BackgroundAudioPlugin.dispatchNativePlaybackState(
                        true,
                        isPlaying,
                        nativeBuffering,
                        positionMs / 1000.0,
                        durationMs / 1000.0,
                        false,
                        false
                    );
                } catch (IllegalStateException ignored) {
                    // Ignore
                }
            });

            mediaPlayer.setDataSource(this, Uri.parse(streamUrl));
            mediaPlayer.prepareAsync();
        } catch (Exception e) {
            mainHandler.removeCallbacks(progressTicker);
            nativePlayerActive = false;
            nativePlayerPrepared = false;
            nativeBuffering = false;
            isPlaying = false;
            releaseLocks();
            abandonAudioFocus();
            BackgroundAudioPlugin.dispatchNativePlaybackState(false, false, false, 0, 0, false, true);
        }
    }

    private void pauseNativeInternal() {
        shouldPlayWhenPrepared = false;
        isPlaying = false;
        mainHandler.removeCallbacks(progressTicker);
        if (nativePlayerActive && nativePlayerPrepared && mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.pause();
                }
                positionMs = Math.max(0L, mediaPlayer.getCurrentPosition());
            } catch (IllegalStateException ignored) {
                // Ignore
            }
        }
        releaseLocks();
        updateSessionAndForeground();
        if (nativePlayerActive) {
            BackgroundAudioPlugin.dispatchNativePlaybackState(
                true,
                false,
                nativeBuffering,
                positionMs / 1000.0,
                durationMs / 1000.0,
                false,
                false
            );
        }
    }

    private void resumeNativeInternal() {
        shouldPlayWhenPrepared = true;
        if (!nativePlayerActive) return;
        requestAudioFocusIfNeeded();
        if (nativePlayerPrepared && mediaPlayer != null) {
            try {
                applyNativeVolume();
                if (!mediaPlayer.isPlaying()) {
                    mediaPlayer.start();
                }
                applyNativePlaybackRate();
                isPlaying = true;
                acquireLocks();
                startProgressTicker();
            } catch (IllegalStateException ignored) {
                isPlaying = false;
            }
        } else {
            isPlaying = true;
            acquireLocks();
        }
        updateSessionAndForeground();
        BackgroundAudioPlugin.dispatchNativePlaybackState(
            true,
            isPlaying,
            nativeBuffering,
            positionMs / 1000.0,
            durationMs / 1000.0,
            false,
            false
        );
    }

    private void seekNativeInternal(long seekMs) {
        long clamped = Math.max(0L, seekMs);
        positionMs = clamped;
        if (nativePlayerActive && mediaPlayer != null) {
            if (nativePlayerPrepared) {
                try {
                    int maxMs = durationMs > 0 ? (int) Math.max(0L, durationMs - 100L) : (int) clamped;
                    int target = (int) Math.min(clamped, maxMs);
                    mediaPlayer.seekTo(target);
                    positionMs = target;
                } catch (IllegalStateException ignored) {
                    // Ignore
                }
            } else {
                pendingSeekMs = clamped;
            }
        }
        syncMediaSessionPlaybackState();
        if (nativePlayerActive) {
            BackgroundAudioPlugin.dispatchNativePlaybackState(
                true,
                isPlaying,
                nativeBuffering,
                positionMs / 1000.0,
                durationMs / 1000.0,
                false,
                false
            );
        }
    }

    private void stopNativePlayerInternal() {
        loadGeneration++;
        mainHandler.removeCallbacks(progressTicker);
        nativePlayerActive = false;
        nativePlayerPrepared = false;
        nativeBuffering = false;
        shouldPlayWhenPrepared = false;
        pendingSeekMs = 0L;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (IllegalStateException ignored) {
                // Ignore
            }
            try {
                mediaPlayer.reset();
            } catch (Exception ignored) {
                // Ignore
            }
        }
        abandonAudioFocus();
    }

    private void applyNativeVolume() {
        if (!nativePlayerActive || mediaPlayer == null) return;
        float v = isDucked ? Math.max(0.05f, targetVolume * 0.25f) : targetVolume;
        try {
            mediaPlayer.setVolume(v, v);
        } catch (IllegalStateException ignored) {
            // Ignore
        }
    }

    private void applyNativePlaybackRate() {
        if (!nativePlayerActive || !nativePlayerPrepared || mediaPlayer == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                // Only adjust PlaybackParams while actively playing so MediaPlayer doesn't auto-start when paused
                if (mediaPlayer.isPlaying()) {
                    PlaybackParams params = mediaPlayer.getPlaybackParams();
                    if (Math.abs(params.getSpeed() - playbackRate) > 0.01f) {
                        params.setSpeed(playbackRate);
                        mediaPlayer.setPlaybackParams(params);
                    }
                }
            } catch (Exception ignored) {
                // Ignore unsupported speed changes on certain OEM decoders
            }
        }
    }

    private void startProgressTicker() {
        mainHandler.removeCallbacks(progressTicker);
        if (nativePlayerActive && isPlaying) {
            mainHandler.postDelayed(progressTicker, 450L);
        }
    }

    private void updateSessionAndForeground() {
        syncMediaSessionMetadata();
        syncMediaSessionPlaybackState();
        Notification notification = buildNotification();
        try {
            int fgsType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, fgsType);
        } catch (Exception ignored) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private void syncMediaSessionMetadata() {
        if (mediaSession == null) return;
        Bitmap art = currentArtworkBitmap != null ? currentArtworkBitmap : getFallbackIconBitmap();
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
            .putLong(
                MediaMetadataCompat.METADATA_KEY_DURATION,
                durationMs > 0L ? durationMs : -1L
            );
        if (art != null) {
            meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
            meta.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, art);
        }
        mediaSession.setMetadata(meta.build());
    }

    private void syncMediaSessionPlaybackState() {
        if (mediaSession == null) return;
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        long actions =
            PlaybackStateCompat.ACTION_PLAY |
            PlaybackStateCompat.ACTION_PAUSE |
            PlaybackStateCompat.ACTION_PLAY_PAUSE |
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
            PlaybackStateCompat.ACTION_SEEK_TO |
            PlaybackStateCompat.ACTION_STOP;

        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, positionMs, isPlaying ? playbackRate : 0.0f)
            .build();
        mediaSession.setPlaybackState(playbackState);
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent prevIntent = serviceActionIntent(ACTION_PREV, 1);
        PendingIntent toggleIntent = serviceActionIntent(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 2);
        PendingIntent nextIntent = serviceActionIntent(ACTION_NEXT, 3);
        PendingIntent stopIntent = serviceActionIntent(ACTION_STOP, 4);

        Bitmap largeIcon = currentArtworkBitmap != null ? currentArtworkBitmap : getFallbackIconBitmap();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(largeIcon)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText(currentAlbum)
            .setContentIntent(contentIntent)
            .setDeleteIntent(stopIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .setShowWhen(false)
            .addAction(
                android.R.drawable.ic_media_previous,
                "Sebelumnya",
                prevIntent
            )
            .addAction(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Jeda" : "Putar",
                toggleIntent
            )
            .addAction(
                android.R.drawable.ic_media_next,
                "Berikutnya",
                nextIntent
            )
            .setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
                    .setShowCancelButton(true)
                    .setCancelButtonIntent(stopIntent)
            );

        return builder.build();
    }

    private PendingIntent serviceActionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaPlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void fetchArtworkAsync(String url) {
        final String targetUrl = url;
        artworkExecutor.submit(() -> {
            Bitmap loaded = null;
            try {
                Request req = new Request.Builder().url(targetUrl).build();
                try (Response res = artworkHttp.newCall(req).execute()) {
                    ResponseBody body = res.body();
                    if (res.isSuccessful() && body != null) {
                        try (InputStream is = body.byteStream()) {
                            Bitmap raw = BitmapFactory.decodeStream(is);
                            if (raw != null) {
                                loaded = scaleBitmapSafely(raw, 512);
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
                loaded = null;
            }
            if (loaded != null && Objects.equals(targetUrl, currentArtworkUrl)) {
                currentArtworkBitmap = loaded;
                mainHandler.post(this::updateSessionAndForeground);
            }
        });
    }

    private Bitmap scaleBitmapSafely(Bitmap source, int maxEdge) {
        int w = source.getWidth();
        int h = source.getHeight();
        if (w <= maxEdge && h <= maxEdge) return source;
        float scale = Math.min((float) maxEdge / w, (float) maxEdge / h);
        return Bitmap.createScaledBitmap(
            source,
            Math.max(1, Math.round(w * scale)),
            Math.max(1, Math.round(h * scale)),
            true
        );
    }

    private Bitmap getFallbackIconBitmap() {
        try {
            return BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
        } catch (Exception ignored) {
            return null;
        }
    }

    private void requestAudioFocusIfNeeded() {
        // Request AudioFocus ONLY when native MediaPlayer plays directly inside this service;
        // when WebView plays local blobs or YouTube iframe, WebView manages its own AudioFocus.
        if (!nativePlayerActive || audioManager == null || hasAudioFocus) return;
        int res;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(true)
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(focusListener)
                .build();
            res = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            res = audioManager.requestAudioFocus(
                focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
        }
        hasAudioFocus = (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
    }

    private void abandonAudioFocus() {
        if (audioManager == null || !hasAudioFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
        hasAudioFocus = false;
    }

    private void acquireLocks() {
        try {
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            }
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception ignored) {
            // Ignore lock errors on restricted OEMs
        }
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {
            // Ignore
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Pemutaran Musik SoundClear",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Kontrol pemutaran musik latar belakang SoundClear");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void stopSelfSafely() {
        isPlaying = false;
        releaseLocks();
        abandonAudioFocus();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (!isPlaying || !nativePlayerActive) {
            stopNativePlayerInternal();
            stopSelfSafely();
        }
    }

    @Override
    public void onDestroy() {
        serviceRunning = false;
        mainHandler.removeCallbacks(progressTicker);
        stopNativePlayerInternal();
        if (mediaPlayer != null) {
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {
                // Ignore
            }
            mediaPlayer = null;
        }
        releaseLocks();
        if (noisyReceiverRegistered) {
            try {
                unregisterReceiver(noisyReceiver);
            } catch (Exception ignored) {
                // Ignore
            }
            noisyReceiverRegistered = false;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        artworkExecutor.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
