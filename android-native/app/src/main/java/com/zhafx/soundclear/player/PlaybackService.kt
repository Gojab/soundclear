package com.zhafx.soundclear.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.core.os.bundleOf
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem as Media3Item
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.zhafx.soundclear.MainActivity
import com.zhafx.soundclear.R
import com.zhafx.soundclear.SoundClearApp
import com.zhafx.soundclear.data.remote.ActiveStreamMeta
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.SoundClearNetwork
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Foreground Media3 MediaSessionService dengan tipe mediaPlayback.
 * Memastikan audio terus berjalan di latar belakang saat pindah aplikasi, tekan Home,
 * atau layar terkunci, serta menangani AudioFocus (telepon masuk) dan headset dicabut.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    companion object {
        const val CHANNEL_ID = "soundclear_playback"

        const val CMD_PLAY_QUEUE = "com.zhafx.soundclear.CMD_PLAY_QUEUE"
        const val CMD_NEXT_TRACK = "com.zhafx.soundclear.CMD_NEXT_TRACK"
        const val CMD_PREV_TRACK = "com.zhafx.soundclear.CMD_PREV_TRACK"
        const val CMD_SELECT_INDEX = "com.zhafx.soundclear.CMD_SELECT_INDEX"
        const val CMD_ADD_NEXT = "com.zhafx.soundclear.CMD_ADD_NEXT"
        const val CMD_ADD_END = "com.zhafx.soundclear.CMD_ADD_END"
        const val CMD_REMOVE_AT = "com.zhafx.soundclear.CMD_REMOVE_AT"
        const val CMD_MOVE_ITEM = "com.zhafx.soundclear.CMD_MOVE_ITEM"
        const val CMD_CLEAR_QUEUE = "com.zhafx.soundclear.CMD_CLEAR_QUEUE"
        const val CMD_TOGGLE_SHUFFLE = "com.zhafx.soundclear.CMD_TOGGLE_SHUFFLE"
        const val CMD_CYCLE_REPEAT = "com.zhafx.soundclear.CMD_CYCLE_REPEAT"
        const val CMD_SET_SLEEP_TIMER = "com.zhafx.soundclear.CMD_SET_SLEEP_TIMER"
        const val CMD_SET_MUTE = "com.zhafx.soundclear.CMD_SET_MUTE"
        const val CMD_SET_VOLUME = "com.zhafx.soundclear.CMD_SET_VOLUME"
        const val CMD_SET_MIX_CONFIG = "com.zhafx.soundclear.CMD_SET_MIX_CONFIG"
        const val CMD_HYDRATE_RADIO = "com.zhafx.soundclear.CMD_HYDRATE_RADIO"

        const val EXTRA_STATE_JSON = "extra_state_json"
        const val EXTRA_QUEUE_JSON = "extra_queue_json"
        const val EXTRA_TRACK_JSON = "extra_track_json"
        const val EXTRA_START_INDEX = "extra_start_index"
        const val EXTRA_SOURCE_LABEL = "extra_source_label"
        const val EXTRA_MIX_JSON = "extra_mix_json"
        const val EXTRA_INDEX = "extra_index"
        const val EXTRA_TO_INDEX = "extra_to_index"
        const val EXTRA_SLEEP_MINUTES = "extra_sleep_minutes"
        const val EXTRA_SLEEP_END_OF_TRACK = "extra_sleep_eot"
        const val EXTRA_VOLUME = "extra_volume"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val app by lazy { application as SoundClearApp }
    private val json = SoundClearNetwork.json

    private lateinit var player: ExoPlayer
    private lateinit var sessionPlayer: Player
    private var mediaSession: MediaSession? = null
    private val dspProcessor = AudioDspProcessor()

    private val streamHeadersByUrl = ConcurrentHashMap<String, Pair<String?, String?>>()
    private val streamHeadersByHost = ConcurrentHashMap<String, Pair<String?, String?>>()

    private val streamOkHttpClient by lazy {
        SoundClearNetwork.okHttpClient.newBuilder()
            .addInterceptor { chain ->
                val req = chain.request()
                val reqUrl = req.url.toString()
                val reqHost = req.url.host
                val pair = streamHeadersByUrl[reqUrl] ?: streamHeadersByHost[reqHost]
                val ua = pair?.first
                val origin = pair?.second
                if (ua.isNullOrBlank() && origin.isNullOrBlank()) {
                    chain.proceed(req)
                } else {
                    val b = req.newBuilder()
                    if (!ua.isNullOrBlank()) b.header("User-Agent", ua)
                    if (!origin.isNullOrBlank()) {
                        b.header("Origin", origin)
                        b.header("Referer", "$origin/")
                    }
                    chain.proceed(b.build())
                }
            }
            .build()
    }

    private val okHttpDataSourceFactory by lazy {
        OkHttpDataSource.Factory(streamOkHttpClient)
    }

    private var queue: MutableList<MediaItem> = mutableListOf()
    private var queueIndex: Int = -1
    private var sourceLabel: String? = null
    private var shuffleEnabled: Boolean = false
    private var repeatMode: String = "off" // off | all | one
    private var userVolume: Float = 1f
    private var isMuted: Boolean = false
    private var isBuffering: Boolean = false
    private var activeStreamMeta: ActiveStreamMeta? = null
    private var activeMixConfig: PlaylistMixSettings? = null
    private var lastErrorMessage: String? = null
    private var sleepTimerMode: String = "off" // off | minutes | end_of_track
    private var sleepTimerRemainingSec: Int = 0

    private var playJob: Job? = null
    private var sleepTimerJob: Job? = null
    private var retriedStreamForCurrentTrack: Boolean = false
    private var trackListenStartMs: Long = 0L
    private var lastRecordedTrackId: String? = null
    private var lastProgressSaveAtMs: Long = 0L

    override fun onCreate() {
        super.onCreate()
        createNotificationChannelIfNeeded()

        val dataSourceFactory = DefaultDataSource.Factory(this, okHttpDataSourceFactory)
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        player.addListener(playerListener)

        // ForwardingPlayer memastikan tombol Next/Prev & reload saat player kosong selalu berfungsi
        sessionPlayer = object : ForwardingPlayer(player) {
            override fun getAvailableCommands(): Player.Commands {
                return super.getAvailableCommands().buildUpon()
                    .addAll(
                        Player.COMMAND_PLAY_PAUSE,
                        Player.COMMAND_SEEK_TO_NEXT,
                        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                        Player.COMMAND_SEEK_TO_PREVIOUS,
                        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM
                    )
                    .build()
            }

            override fun isCommandAvailable(command: Int): Boolean {
                return when (command) {
                    Player.COMMAND_PLAY_PAUSE -> queue.isNotEmpty() || super.isCommandAvailable(command)
                    Player.COMMAND_SEEK_TO_NEXT,
                    Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    Player.COMMAND_SEEK_TO_PREVIOUS,
                    Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> queue.isNotEmpty()
                    else -> super.isCommandAvailable(command)
                }
            }

            override fun play() {
                if ((player.mediaItemCount == 0 || player.playbackState == Player.STATE_IDLE) && queueIndex in queue.indices) {
                    loadAndPlayCurrent(autoHydrateRadio = false, forceRefreshStream = true)
                    return
                }
                super.play()
            }

            override fun setPlayWhenReady(playWhenReady: Boolean) {
                if (playWhenReady && (player.mediaItemCount == 0 || player.playbackState == Player.STATE_IDLE) && queueIndex in queue.indices) {
                    loadAndPlayCurrent(autoHydrateRadio = false, forceRefreshStream = true)
                    return
                }
                super.setPlayWhenReady(playWhenReady)
            }

            override fun hasNextMediaItem(): Boolean = queue.isNotEmpty()
            override fun hasPreviousMediaItem(): Boolean = queue.isNotEmpty()
            override fun seekToNext() = playNextTrack()
            override fun seekToNextMediaItem() = playNextTrack()
            override fun seekToPrevious() = playPreviousTrack()
            override fun seekToPreviousMediaItem() = playPreviousTrack()
        }

        val openAppIntent = PendingIntent.getActivity(
            this,
            1001,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notificationProvider = DefaultMediaNotificationProvider.Builder(this)
            .setChannelId(CHANNEL_ID)
            .setChannelName(R.string.playback_channel_name)
            .build()
            .apply {
                setSmallIcon(R.drawable.ic_stat_music)
            }
        setMediaNotificationProvider(notificationProvider)

        mediaSession = MediaSession.Builder(this, sessionPlayer)
            .setSessionActivity(openAppIntent)
            .setCallback(sessionCallback)
            .build()

        // Observasi profil audio DSP dari SettingsRepository secara real-time
        serviceScope.launch {
            app.container.settingsRepository.audioProfile.collect { profile ->
                if (player.audioSessionId > 0) {
                    dspProcessor.attachToSession(player.audioSessionId, profile)
                }
                player.skipSilenceEnabled = profile.skipSilence
            }
        }

        // Loop periodik untuk progres episode podcast, pencatatan riwayat >15 dtk, dan broadcast extras
        serviceScope.launch {
            while (isActive) {
                delay(1000L)
                tickPlaybackSideEffects()
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Musik TETAP berjalan di latar belakang jika sedang memutar atau dijeda sementara
        val player = mediaSession?.player
        if (player == null || (!player.playWhenReady && player.mediaItemCount == 0)) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        playJob?.cancel()
        sleepTimerJob?.cancel()
        dspProcessor.releaseAll()
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun createNotificationChannelIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            val existing = nm.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.playback_channel_name),
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = getString(R.string.playback_channel_desc)
                    setShowBadge(false)
                }
                nm.createNotificationChannel(channel)
            }
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            if (audioSessionId > 0) {
                dspProcessor.attachToSession(
                    audioSessionId,
                    app.container.settingsRepository.audioProfile.value
                )
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            isBuffering = playbackState == Player.STATE_BUFFERING
            if (playbackState == Player.STATE_ENDED) {
                handleTrackCompleted()
            }
            pushStateToSessionExtras()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            pushStateToSessionExtras()
        }

        override fun onPlayerError(error: PlaybackException) {
            val track = queue.getOrNull(queueIndex)
            if (!retriedStreamForCurrentTrack && track != null && track.type != "local") {
                retriedStreamForCurrentTrack = true
                app.container.streamResolver.invalidateCache(track.playableVideoId)
                loadAndPlayCurrent(autoHydrateRadio = false, forceRefreshStream = true)
                return
            }
            isBuffering = false
            lastErrorMessage = error.localizedMessage?.takeIf { it.isNotBlank() }
                ?: "Gagal memutar stream audio (${error.errorCodeName})."
            pushStateToSessionExtras()
        }

        override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
            pushStateToSessionExtras()
        }
    }

    private val sessionCallback = object : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): MediaSession.ConnectionResult {
            val customCommands = listOf(
                CMD_PLAY_QUEUE,
                CMD_NEXT_TRACK,
                CMD_PREV_TRACK,
                CMD_SELECT_INDEX,
                CMD_ADD_NEXT,
                CMD_ADD_END,
                CMD_REMOVE_AT,
                CMD_MOVE_ITEM,
                CMD_CLEAR_QUEUE,
                CMD_TOGGLE_SHUFFLE,
                CMD_CYCLE_REPEAT,
                CMD_SET_SLEEP_TIMER,
                CMD_SET_MUTE,
                CMD_SET_VOLUME,
                CMD_SET_MIX_CONFIG,
                CMD_HYDRATE_RADIO
            ).map { SessionCommand(it, Bundle.EMPTY) }

            val sessionCommands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                .buildUpon()
                .apply { customCommands.forEach { add(it) } }
                .build()

            val playerCommands = MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
                .buildUpon()
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .build()

            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(sessionCommands)
                .setAvailablePlayerCommands(playerCommands)
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle
        ): ListenableFuture<SessionResult> {
            when (customCommand.customAction) {
                CMD_PLAY_QUEUE -> {
                    val items = runCatching {
                        json.decodeFromString<List<MediaItem>>(args.getString(EXTRA_QUEUE_JSON).orEmpty())
                    }.getOrDefault(emptyList())
                    val startIdx = args.getInt(EXTRA_START_INDEX, 0).coerceIn(0, (items.size - 1).coerceAtLeast(0))
                    sourceLabel = args.getString(EXTRA_SOURCE_LABEL)
                    activeMixConfig = args.getString(EXTRA_MIX_JSON)?.let {
                        runCatching { json.decodeFromString<PlaylistMixSettings>(it) }.getOrNull()
                    }
                    if (items.isNotEmpty()) {
                        queue = items.toMutableList()
                        queueIndex = startIdx
                        loadAndPlayCurrent(autoHydrateRadio = items.size == 1)
                    }
                }
                CMD_NEXT_TRACK -> playNextTrack()
                CMD_PREV_TRACK -> playPreviousTrack()
                CMD_SELECT_INDEX -> {
                    val idx = args.getInt(EXTRA_INDEX, -1)
                    if (idx in queue.indices) {
                        queueIndex = idx
                        loadAndPlayCurrent(autoHydrateRadio = false)
                    }
                }
                CMD_ADD_NEXT -> {
                    val item = args.getString(EXTRA_TRACK_JSON)?.let {
                        runCatching { json.decodeFromString<MediaItem>(it) }.getOrNull()
                    }
                    if (item != null) {
                        if (queue.isEmpty()) {
                            queue.add(item)
                            queueIndex = 0
                            loadAndPlayCurrent(autoHydrateRadio = true)
                        } else {
                            val insertAt = (queueIndex + 1).coerceIn(0, queue.size)
                            queue.add(insertAt, item)
                            pushStateToSessionExtras()
                        }
                    }
                }
                CMD_ADD_END -> {
                    val item = args.getString(EXTRA_TRACK_JSON)?.let {
                        runCatching { json.decodeFromString<MediaItem>(it) }.getOrNull()
                    }
                    if (item != null) {
                        if (queue.isEmpty()) {
                            queue.add(item)
                            queueIndex = 0
                            loadAndPlayCurrent(autoHydrateRadio = true)
                        } else {
                            queue.add(item)
                            pushStateToSessionExtras()
                        }
                    }
                }
                CMD_REMOVE_AT -> {
                    val idx = args.getInt(EXTRA_INDEX, -1)
                    if (idx in queue.indices && idx != queueIndex) {
                        queue.removeAt(idx)
                        if (idx < queueIndex) queueIndex -= 1
                        pushStateToSessionExtras()
                    }
                }
                CMD_MOVE_ITEM -> {
                    val from = args.getInt(EXTRA_INDEX, -1)
                    val to = args.getInt(EXTRA_TO_INDEX, -1)
                    if (from in queue.indices && to in queue.indices && from != to) {
                        val moved = queue.removeAt(from)
                        queue.add(to, moved)
                        queueIndex = when (queueIndex) {
                            from -> to
                            in (to until from) -> queueIndex + 1
                            in ((from + 1)..to) -> queueIndex - 1
                            else -> queueIndex
                        }
                        pushStateToSessionExtras()
                    }
                }
                CMD_CLEAR_QUEUE -> {
                    val current = queue.getOrNull(queueIndex)
                    queue = if (current != null) mutableListOf(current) else mutableListOf()
                    queueIndex = if (current != null) 0 else -1
                    pushStateToSessionExtras()
                }
                CMD_TOGGLE_SHUFFLE -> {
                    shuffleEnabled = !shuffleEnabled
                    pushStateToSessionExtras()
                }
                CMD_CYCLE_REPEAT -> {
                    repeatMode = when (repeatMode) {
                        "off" -> "all"
                        "all" -> "one"
                        else -> "off"
                    }
                    pushStateToSessionExtras()
                }
                CMD_SET_SLEEP_TIMER -> {
                    val minutes = args.getInt(EXTRA_SLEEP_MINUTES, 0)
                    val eot = args.getBoolean(EXTRA_SLEEP_END_OF_TRACK, false)
                    configureSleepTimer(minutes, eot)
                }
                CMD_SET_MUTE -> {
                    isMuted = !isMuted
                    player.volume = if (isMuted) 0f else applyMaxCap(userVolume)
                    pushStateToSessionExtras()
                }
                CMD_SET_VOLUME -> {
                    userVolume = args.getFloat(EXTRA_VOLUME, 1f).coerceIn(0f, 1f)
                    if (!isMuted) {
                        player.volume = applyMaxCap(userVolume)
                    }
                    pushStateToSessionExtras()
                }
                CMD_SET_MIX_CONFIG -> {
                    activeMixConfig = args.getString(EXTRA_MIX_JSON)?.let {
                        runCatching { json.decodeFromString<PlaylistMixSettings>(it) }.getOrNull()
                    }
                    pushStateToSessionExtras()
                }
                CMD_HYDRATE_RADIO -> {
                    queue.getOrNull(queueIndex)?.let { current ->
                        serviceScope.launch { hydrateRadioUpNext(current) }
                    }
                }
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    private fun applyMaxCap(vol: Float): Float {
        val cap = (app.container.settingsRepository.userSettings.value.youtubeSound.maxVolumeLimit / 100f)
            .coerceIn(0.2f, 1f)
        return (vol * cap).coerceIn(0f, 1f)
    }

    private fun loadAndPlayCurrent(
        autoHydrateRadio: Boolean,
        forceRefreshStream: Boolean = false
    ) {
        val track = queue.getOrNull(queueIndex) ?: return
        playJob?.cancel()
        if (!forceRefreshStream) {
            retriedStreamForCurrentTrack = false
        }
        lastErrorMessage = null
        isBuffering = true
        trackListenStartMs = System.currentTimeMillis()
        lastRecordedTrackId = null
        pushStateToSessionExtras()

        playJob = serviceScope.launch {
            val container = app.container
            val settings = container.settingsRepository.userSettings.value
            val audioProfile = container.settingsRepository.audioProfile.value
            val requestedQuality = audioProfile.wifiQuality

            // Cek apakah file offline tersedia di perangkat
            val offline = container.libraryRepository.getOfflineDownload(track.playableVideoId)
            val offlineFile = offline?.let { File(it.localFilePath) }?.takeIf { it.exists() && it.length() > 0L }

            val resolvedUri: Uri
            val isHlsStream: Boolean
            val meta: ActiveStreamMeta

            if (track.type == "local" && !track.localUri.isNullOrBlank()) {
                resolvedUri = Uri.parse(track.localUri)
                isHlsStream = false
                meta = ActiveStreamMeta(
                    trackId = track.id,
                    requestedTier = "local",
                    actualTier = "local",
                    codec = "Lokal",
                    sourceMode = "local"
                )
            } else if (offlineFile != null) {
                resolvedUri = Uri.fromFile(offlineFile)
                isHlsStream = false
                meta = ActiveStreamMeta(
                    trackId = track.playableVideoId,
                    resolvedVideoId = track.playableVideoId,
                    requestedTier = offline.qualityTier,
                    actualTier = offline.qualityTier,
                    codec = offline.codec,
                    bitrateKbps = offline.bitrateKbps,
                    sourceMode = "offline",
                    cacheReady = true
                )
            } else {
                val res = container.streamResolver.resolveStream(
                    apiService = container.settingsRepository.getApiService(),
                    baseUrl = container.settingsRepository.apiBaseUrl.value,
                    track = track,
                    quality = requestedQuality,
                    forceRefresh = forceRefreshStream
                )
                if (res.isFailure) {
                    isBuffering = false
                    lastErrorMessage = res.exceptionOrNull()?.localizedMessage
                        ?: "Tidak dapat memuat stream audio."
                    pushStateToSessionExtras()
                    return@launch
                }
                val resolved = res.getOrThrow()
                resolvedUri = resolved.uri
                isHlsStream = resolved.isHls
                val headerPair = resolved.userAgentHeader to resolved.originHeader
                val uriStr = resolvedUri.toString()
                if (!resolved.userAgentHeader.isNullOrBlank() || !resolved.originHeader.isNullOrBlank()) {
                    streamHeadersByUrl[uriStr] = headerPair
                    resolvedUri.host?.takeIf { it.isNotBlank() }?.let { host ->
                        streamHeadersByHost[host] = headerPair
                    }
                } else {
                    streamHeadersByUrl.remove(uriStr)
                    resolvedUri.host?.let { streamHeadersByHost.remove(it) }
                }
                meta = ActiveStreamMeta(
                    trackId = track.playableVideoId,
                    resolvedVideoId = resolved.resolvedVideoId,
                    requestedTier = requestedQuality,
                    actualTier = requestedQuality,
                    codec = resolved.codec,
                    bitrateKbps = resolved.bitrateKbps,
                    sampleRateHz = resolved.sampleRateHz,
                    sourceMode = resolved.sourceMode
                )
            }

            activeStreamMeta = meta

            // Cek posisi resume episode podcast atau pengaturan kecepatan pemutaran episode
            var startPosMs = 0L
            if (track.type == "episode") {
                val progress = container.libraryRepository.getEpisodeProgress(track.playableVideoId)
                if (progress != null && !progress.completed && progress.positionSeconds > 5) {
                    startPosMs = progress.positionSeconds * 1000L
                }
                val epRate = settings.episodePlaybackRates[track.playableVideoId]
                    ?: settings.youtubeSound.defaultPlaybackRate
                player.setPlaybackSpeed(epRate)
            } else {
                player.setPlaybackSpeed(settings.youtubeSound.defaultPlaybackRate)
            }

            val artworkUri = track.displayThumbnail(settings.dataSaver)?.let { Uri.parse(it) }
            val mediaMetadata = MediaMetadata.Builder()
                .setTitle(track.title)
                .setArtist(track.primaryArtistName)
                .setAlbumTitle(track.album?.name)
                .setArtworkUri(artworkUri)
                .build()

            val media3ItemBuilder = Media3Item.Builder()
                .setMediaId(track.playableVideoId)
                .setUri(resolvedUri)
                .setMediaMetadata(mediaMetadata)
            if (isHlsStream) {
                media3ItemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8)
            }

            player.setMediaItem(media3ItemBuilder.build(), startPosMs)
            player.volume = if (isMuted) 0f else applyMaxCap(userVolume)
            player.prepare()
            player.play()
            pushStateToSessionExtras()

            if (autoHydrateRadio && track.type != "local") {
                launch { hydrateRadioUpNext(track) }
            }
        }
    }

    private suspend fun hydrateRadioUpNext(seed: MediaItem) = withContext(Dispatchers.IO) {
        val vid = seed.playableVideoId
        if (vid.isBlank()) return@withContext
        val watch = runCatching {
            app.container.settingsRepository.getApiService()
                .getWatchPlaylist(videoId = vid, radio = true, playlistId = seed.playlistId)
        }.getOrNull() ?: return@withContext

        val hidden = app.container.settingsRepository.userSettings.value.excludedTasteIds.toSet()
        val existingIds = queue.map { it.playableVideoId }.toSet()
        val candidates = watch.tracks.filter {
            it.playableVideoId.isNotBlank() &&
                it.playableVideoId !in existingIds &&
                it.playableVideoId !in hidden
        }
        if (candidates.isNotEmpty()) {
            withContext(Dispatchers.Main) {
                queue.addAll(candidates.take(20))
                pushStateToSessionExtras()
            }
        }
    }

    private fun handleTrackCompleted() {
        if (sleepTimerMode == "end_of_track") {
            sleepTimerMode = "off"
            sleepTimerRemainingSec = 0
            player.pause()
            pushStateToSessionExtras()
            return
        }

        if (repeatMode == "one") {
            player.seekTo(0L)
            player.play()
            return
        }

        val hasNext = queueIndex < queue.lastIndex || repeatMode == "all" || shuffleEnabled
        if (hasNext) {
            playNextTrack()
        } else {
            val autoplay = app.container.settingsRepository.userSettings.value.autoplay
            val current = queue.getOrNull(queueIndex)
            if (autoplay && current != null && current.type != "local") {
                serviceScope.launch {
                    hydrateRadioUpNext(current)
                    if (queueIndex < queue.lastIndex) {
                        playNextTrack()
                    }
                }
            }
        }
    }

    private fun playNextTrack() {
        if (queue.isEmpty()) return
        if (repeatMode == "one") {
            player.seekTo(0L)
            player.play()
            return
        }
        queueIndex = when {
            shuffleEnabled && queue.size > 1 -> {
                var next = queue.indices.random()
                if (next == queueIndex) next = (queueIndex + 1) % queue.size
                next
            }
            queueIndex < queue.lastIndex -> queueIndex + 1
            repeatMode == "all" -> 0
            else -> return
        }
        loadAndPlayCurrent(autoHydrateRadio = false)
    }

    private fun playPreviousTrack() {
        if (queue.isEmpty()) return
        if (player.currentPosition > 4000L) {
            player.seekTo(0L)
            return
        }
        queueIndex = when {
            queueIndex > 0 -> queueIndex - 1
            repeatMode == "all" -> queue.lastIndex
            else -> 0
        }
        loadAndPlayCurrent(autoHydrateRadio = false)
    }

    private fun configureSleepTimer(minutes: Int, endOfTrack: Boolean) {
        sleepTimerJob?.cancel()
        if (endOfTrack) {
            sleepTimerMode = "end_of_track"
            sleepTimerRemainingSec = 0
            pushStateToSessionExtras()
            return
        }
        if (minutes <= 0) {
            sleepTimerMode = "off"
            sleepTimerRemainingSec = 0
            pushStateToSessionExtras()
            return
        }
        sleepTimerMode = "minutes"
        sleepTimerRemainingSec = minutes * 60
        pushStateToSessionExtras()

        sleepTimerJob = serviceScope.launch {
            while (sleepTimerRemainingSec > 0 && isActive) {
                delay(1000L)
                sleepTimerRemainingSec -= 1
                if (sleepTimerRemainingSec % 5 == 0 || sleepTimerRemainingSec <= 10) {
                    pushStateToSessionExtras()
                }
            }
            if (isActive && sleepTimerMode == "minutes") {
                // Fade out halus sebelum jeda
                val fadeOut = app.container.settingsRepository.userSettings.value.youtubeSound.fadeOutOnSleepTimer
                if (fadeOut && player.isPlaying) {
                    for (step in 9 downTo 1) {
                        player.volume = applyMaxCap(userVolume) * (step / 10f)
                        delay(120L)
                    }
                }
                player.pause()
                player.volume = if (isMuted) 0f else applyMaxCap(userVolume)
                sleepTimerMode = "off"
                sleepTimerRemainingSec = 0
                pushStateToSessionExtras()
            }
        }
    }

    private suspend fun tickPlaybackSideEffects() {
        val track = queue.getOrNull(queueIndex) ?: return
        if (!player.isPlaying) return

        val now = System.currentTimeMillis()
        val posSec = player.currentPosition / 1000L
        val durSec = (player.duration.coerceAtLeast(0L)) / 1000L

        // Catat riwayat putar jika sudah diputar >= 15 detik
        if (lastRecordedTrackId != track.playableVideoId && (now - trackListenStartMs) >= 15_000L) {
            lastRecordedTrackId = track.playableVideoId
            val listened = ((now - trackListenStartMs) / 1000L).toInt().coerceAtLeast(15)
            serviceScope.launch(Dispatchers.IO) {
                app.container.libraryRepository.recordPlayHistory(track, listened)
            }
        }

        // Simpan progres episode setiap 5 detik
        if (track.type == "episode" && (now - lastProgressSaveAtMs) >= 5_000L) {
            lastProgressSaveAtMs = now
            serviceScope.launch(Dispatchers.IO) {
                app.container.libraryRepository.saveEpisodeProgress(
                    episodeId = track.playableVideoId,
                    podcastId = track.podcastId,
                    positionSeconds = posSec,
                    durationSeconds = durSec
                )
            }
        }
    }

    private fun pushStateToSessionExtras() {
        val session = mediaSession ?: return
        val snapshot = ServicePlaybackSnapshot(
            queue = queue.toList(),
            queueIndex = queueIndex,
            sourceLabel = sourceLabel,
            shuffle = shuffleEnabled,
            repeatMode = repeatMode,
            isBuffering = isBuffering,
            volume = userVolume,
            isMuted = isMuted,
            activeStreamMeta = activeStreamMeta,
            activeMixConfig = activeMixConfig,
            sleepTimerMode = sleepTimerMode,
            sleepTimerRemainingSec = sleepTimerRemainingSec,
            errorMessage = lastErrorMessage
        )
        val encoded = runCatching { json.encodeToString(snapshot) }.getOrNull() ?: return
        session.setSessionExtras(bundleOf(EXTRA_STATE_JSON to encoded))
    }
}
