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
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
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
 * switching apps, pressing Home, or locking the screen, provides MediaStyle lockscreen/notification
 * controls via MediaSessionCompat, holds PARTIAL_WAKE_LOCK, and manages Android AudioFocus
 * (pausing during incoming calls and resuming afterwards).
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

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ALBUM = "album";
    public static final String EXTRA_ARTWORK_URL = "artworkUrl";
    public static final String EXTRA_IS_PLAYING = "isPlaying";
    public static final String EXTRA_DURATION_MS = "durationMs";
    public static final String EXTRA_POSITION_MS = "positionMs";
    public static final String EXTRA_PLAYBACK_RATE = "playbackRate";

    private static volatile boolean serviceRunning = false;

    public static boolean isServiceRunning() {
        return serviceRunning;
    }

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final OkHttpClient artworkHttp = new OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build();

    private String currentTitle = "SoundClear";
    private String currentArtist = "Audio Fidelitas Tinggi";
    private String currentAlbum = "SoundClear";
    private String currentArtworkUrl = "";
    private Bitmap currentArtworkBitmap = null;
    private boolean isPlaying = false;
    private long durationMs = 0L;
    private long positionMs = 0L;
    private float playbackRate = 1.0f;
    private boolean hasAudioFocus = false;
    private boolean resumeAfterFocusGain = false;
    private boolean noisyReceiverRegistered = false;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_GAIN:
                hasAudioFocus = true;
                BackgroundAudioPlugin.dispatchAudioFocusChange("unduck");
                if (resumeAfterFocusGain) {
                    resumeAfterFocusGain = false;
                    BackgroundAudioPlugin.dispatchAudioFocusChange("resume");
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                hasAudioFocus = false;
                resumeAfterFocusGain = isPlaying;
                BackgroundAudioPlugin.dispatchAudioFocusChange("pause-transient");
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                BackgroundAudioPlugin.dispatchAudioFocusChange("duck");
                break;
            case AudioManager.AUDIOFOCUS_LOSS:
                hasAudioFocus = false;
                resumeAfterFocusGain = false;
                BackgroundAudioPlugin.dispatchAudioFocusChange("pause-permanent");
                break;
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                resumeAfterFocusGain = false;
                BackgroundAudioPlugin.dispatchMediaAction("pause", null);
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
                requestAudioFocusIfNeeded();
                BackgroundAudioPlugin.dispatchMediaAction("play", null);
            }

            @Override
            public void onPause() {
                resumeAfterFocusGain = false;
                BackgroundAudioPlugin.dispatchMediaAction("pause", null);
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
                BackgroundAudioPlugin.dispatchMediaAction("seekto", pos / 1000.0);
            }

            @Override
            public void onStop() {
                resumeAfterFocusGain = false;
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
            if (ACTION_UPDATE_STATE.equals(action)) {
                String nextTitle = intent.getStringExtra(EXTRA_TITLE);
                String nextArtist = intent.getStringExtra(EXTRA_ARTIST);
                String nextAlbum = intent.getStringExtra(EXTRA_ALBUM);
                String nextArtUrl = intent.getStringExtra(EXTRA_ARTWORK_URL);

                if (!TextUtils.isEmpty(nextTitle)) currentTitle = nextTitle;
                if (!TextUtils.isEmpty(nextArtist)) currentArtist = nextArtist;
                if (!TextUtils.isEmpty(nextAlbum)) currentAlbum = nextAlbum;
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
                durationMs = Math.max(0L, intent.getLongExtra(EXTRA_DURATION_MS, 0L));
                positionMs = Math.max(0L, intent.getLongExtra(EXTRA_POSITION_MS, 0L));
                playbackRate = Math.max(0.25f, Math.min(4.0f, intent.getFloatExtra(EXTRA_PLAYBACK_RATE, 1.0f)));

                if (isPlaying) {
                    requestAudioFocusIfNeeded();
                    acquireLocks();
                } else {
                    releaseLocks();
                }

                String cleanArtUrl = nextArtUrl == null ? "" : nextArtUrl.trim();
                if (!Objects.equals(cleanArtUrl, currentArtworkUrl)) {
                    currentArtworkUrl = cleanArtUrl;
                    currentArtworkBitmap = null;
                    if (!cleanArtUrl.isEmpty()) {
                        fetchArtworkAsync(cleanArtUrl);
                    }
                }

                updateSessionAndForeground();
                return START_STICKY;
            } else if (ACTION_PLAY.equals(action)) {
                requestAudioFocusIfNeeded();
                BackgroundAudioPlugin.dispatchMediaAction("play", null);
            } else if (ACTION_PAUSE.equals(action)) {
                resumeAfterFocusGain = false;
                BackgroundAudioPlugin.dispatchMediaAction("pause", null);
            } else if (ACTION_TOGGLE.equals(action)) {
                if (isPlaying) {
                    resumeAfterFocusGain = false;
                    BackgroundAudioPlugin.dispatchMediaAction("pause", null);
                } else {
                    requestAudioFocusIfNeeded();
                    BackgroundAudioPlugin.dispatchMediaAction("play", null);
                }
            } else if (ACTION_NEXT.equals(action)) {
                BackgroundAudioPlugin.dispatchMediaAction("nexttrack", null);
            } else if (ACTION_PREV.equals(action)) {
                BackgroundAudioPlugin.dispatchMediaAction("previoustrack", null);
            } else if (ACTION_STOP.equals(action)) {
                resumeAfterFocusGain = false;
                BackgroundAudioPlugin.dispatchMediaAction("stop", null);
                stopSelfSafely();
                return START_NOT_STICKY;
            }
        }

        updateSessionAndForeground();
        return START_STICKY;
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
                updateSessionAndForeground();
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
        if (audioManager == null || hasAudioFocus) return;
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
        if (audioManager == null) return;
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
    public void onDestroy() {
        serviceRunning = false;
        releaseLocks();
        abandonAudioFocus();
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
