package com.zhafx.soundclear.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.os.bundleOf
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionToken
import com.zhafx.soundclear.data.remote.ActiveStreamMeta
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.SoundClearNetwork
import com.zhafx.soundclear.domain.AudioMath
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlin.math.sin

@Serializable
data class ServicePlaybackSnapshot(
    val queue: List<MediaItem> = emptyList(),
    val queueIndex: Int = -1,
    val sourceLabel: String? = null,
    val shuffle: Boolean = false,
    val repeatMode: String = "off",
    val isBuffering: Boolean = false,
    val volume: Float = 1f,
    val isMuted: Boolean = false,
    val activeStreamMeta: ActiveStreamMeta? = null,
    val activeMixConfig: PlaylistMixSettings? = null,
    val sleepTimerMode: String = "off",
    val sleepTimerRemainingSec: Int = 0,
    val errorMessage: String? = null
)

data class PlaybackUiState(
    val connected: Boolean = false,
    val queue: List<MediaItem> = emptyList(),
    val queueIndex: Int = -1,
    val currentTrack: MediaItem? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val sourceLabel: String? = null,
    val shuffle: Boolean = false,
    val repeatMode: String = "off",
    val playbackSpeed: Float = 1f,
    val volume: Float = 1f,
    val isMuted: Boolean = false,
    val activeStreamMeta: ActiveStreamMeta? = null,
    val activeMixConfig: PlaylistMixSettings? = null,
    val sleepTimerMode: String = "off",
    val sleepTimerRemainingSec: Int = 0,
    val errorMessage: String? = null,
    val activeTestTone: String? = null, // null | "sweep" | "pink_noise"
    val spectrumBars: List<Float> = List(16) { 0.12f }
)

/**
 * Klien Media3 MediaController yang menghubungkan UI Jetpack Compose / ViewModel
 * ke PlaybackService melalui StateFlow tanpa menyimpan ExoPlayer di Activity.
 */
class PlaybackController(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val json = SoundClearNetwork.json
    private val testToneProcessor = AudioDspProcessor()

    private var mediaController: MediaController? = null
    private var snapshot = ServicePlaybackSnapshot()
    private var isConnecting: Boolean = false
    private var pendingTogglePlay: Boolean = false
    private val pendingCommands = mutableListOf<Pair<String, Bundle>>()

    private val _uiState = MutableStateFlow(PlaybackUiState())
    val uiState: StateFlow<PlaybackUiState> = _uiState.asStateFlow()

    init {
        connectToService()
        startProgressTicker()
    }

    private fun connectToService(warmService: Boolean = false) {
        if (warmService) {
            runCatching {
                context.startService(Intent(context, PlaybackService::class.java))
            }
        }
        if (mediaController != null || isConnecting) return
        isConnecting = true
        scope.launch {
            try {
                val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
                val controller = MediaController.Builder(context, token)
                    .setListener(object : MediaController.Listener {
                        override fun onExtrasChanged(controller: MediaController, extras: Bundle) {
                            parseSnapshotFromBundle(extras)
                        }

                        override fun onDisconnected(controller: MediaController) {
                            mediaController = null
                            _uiState.value = _uiState.value.copy(connected = false)
                        }
                    })
                    .buildAsync()
                    .await()

                mediaController = controller
                controller.addListener(object : Player.Listener {
                    override fun onEvents(player: Player, events: Player.Events) {
                        syncFromController()
                    }
                })
                parseSnapshotFromBundle(controller.sessionExtras)
                syncFromController()
                flushPendingCommands(controller)
            } catch (_: Throwable) {
                // Retry on next command or togglePlayPause
            } finally {
                isConnecting = false
            }
        }
    }

    private fun flushPendingCommands(controller: MediaController) {
        if (pendingCommands.isNotEmpty()) {
            val copy = pendingCommands.toList()
            pendingCommands.clear()
            copy.forEach { (action, args) ->
                controller.sendCustomCommand(SessionCommand(action, Bundle.EMPTY), args)
            }
        }
        if (pendingTogglePlay) {
            pendingTogglePlay = false
            if (controller.isPlaying) {
                controller.pause()
            } else {
                controller.play()
            }
            syncFromController()
        }
    }

    private fun startProgressTicker() {
        scope.launch {
            var frame = 0
            while (isActive) {
                delay(250L)
                frame += 1
                val ctrl = mediaController
                val playing = ctrl?.isPlaying == true
                val pos = ctrl?.currentPosition?.coerceAtLeast(0L) ?: _uiState.value.positionMs
                val dur = ctrl?.duration?.takeIf { it > 0L }
                    ?: _uiState.value.currentTrack?.durationSeconds?.let { it * 1000L }
                    ?: 0L

                val bars = if (playing) {
                    List(16) { i ->
                        val wave = sin((frame * 0.45 + i * 0.72)).toFloat() * 0.32f
                        (0.45f + wave + ((i % 3) * 0.08f)).coerceIn(0.12f, 0.96f)
                    }
                } else {
                    List(16) { 0.1f }
                }

                _uiState.value = _uiState.value.copy(
                    isPlaying = playing,
                    positionMs = pos,
                    durationMs = dur,
                    playbackSpeed = ctrl?.playbackParameters?.speed ?: _uiState.value.playbackSpeed,
                    spectrumBars = bars
                )
            }
        }
    }

    private fun parseSnapshotFromBundle(bundle: Bundle) {
        val raw = bundle.getString(PlaybackService.EXTRA_STATE_JSON) ?: return
        runCatching { json.decodeFromString<ServicePlaybackSnapshot>(raw) }.getOrNull()?.let {
            snapshot = it
            syncFromController()
        }
    }

    private fun syncFromController() {
        val ctrl = mediaController
        val track = snapshot.queue.getOrNull(snapshot.queueIndex)
        val durationFallback = track?.durationSeconds?.let { it * 1000L } ?: 0L
        _uiState.value = _uiState.value.copy(
            connected = ctrl != null,
            queue = snapshot.queue,
            queueIndex = snapshot.queueIndex,
            currentTrack = track,
            isPlaying = ctrl?.isPlaying == true,
            isBuffering = snapshot.isBuffering,
            positionMs = ctrl?.currentPosition?.coerceAtLeast(0L) ?: 0L,
            durationMs = ctrl?.duration?.takeIf { it > 0L } ?: durationFallback,
            sourceLabel = snapshot.sourceLabel,
            shuffle = snapshot.shuffle,
            repeatMode = snapshot.repeatMode,
            playbackSpeed = ctrl?.playbackParameters?.speed ?: 1f,
            volume = snapshot.volume,
            isMuted = snapshot.isMuted,
            activeStreamMeta = snapshot.activeStreamMeta,
            activeMixConfig = snapshot.activeMixConfig,
            sleepTimerMode = snapshot.sleepTimerMode,
            sleepTimerRemainingSec = snapshot.sleepTimerRemainingSec,
            errorMessage = snapshot.errorMessage
        )
    }

    private fun sendCommand(action: String, args: Bundle = Bundle.EMPTY) {
        val ctrl = mediaController
        if (ctrl == null) {
            if (action == PlaybackService.CMD_PLAY_QUEUE) {
                pendingCommands.removeAll { it.first == PlaybackService.CMD_PLAY_QUEUE }
            }
            pendingCommands.add(action to args)
            connectToService(warmService = action == PlaybackService.CMD_PLAY_QUEUE)
            return
        }
        ctrl.sendCustomCommand(SessionCommand(action, Bundle.EMPTY), args)
    }

    fun playTrack(track: MediaItem, sourceLabel: String? = null) {
        playQueue(listOf(track), startIndex = 0, sourceLabel = sourceLabel)
    }

    fun playQueue(
        tracks: List<MediaItem>,
        startIndex: Int = 0,
        sourceLabel: String? = null,
        mixConfig: PlaylistMixSettings? = null
    ) {
        if (tracks.isEmpty()) return
        val safeIdx = startIndex.coerceIn(0, tracks.lastIndex)
        snapshot = snapshot.copy(
            queue = tracks,
            queueIndex = safeIdx,
            sourceLabel = sourceLabel,
            isBuffering = true,
            errorMessage = null
        )
        // Perbarui state optimis segera agar MiniPlayer & indikator memuat langsung muncul
        _uiState.value = _uiState.value.copy(
            queue = tracks,
            queueIndex = safeIdx,
            currentTrack = tracks[safeIdx],
            sourceLabel = sourceLabel,
            isBuffering = true,
            errorMessage = null
        )
        val args = bundleOf(
            PlaybackService.EXTRA_QUEUE_JSON to json.encodeToString(tracks),
            PlaybackService.EXTRA_START_INDEX to safeIdx,
            PlaybackService.EXTRA_SOURCE_LABEL to sourceLabel,
            PlaybackService.EXTRA_MIX_JSON to mixConfig?.let { json.encodeToString(it) }
        )
        sendCommand(PlaybackService.CMD_PLAY_QUEUE, args)
    }

    fun togglePlayPause() {
        val ctrl = mediaController
        if (ctrl == null) {
            pendingTogglePlay = true
            connectToService(warmService = true)
            return
        }
        if (ctrl.isPlaying) {
            ctrl.pause()
        } else if (ctrl.mediaItemCount == 0 && snapshot.queueIndex in snapshot.queue.indices) {
            sendCommand(
                PlaybackService.CMD_SELECT_INDEX,
                bundleOf(PlaybackService.EXTRA_INDEX to snapshot.queueIndex)
            )
        } else {
            ctrl.play()
        }
        syncFromController()
    }

    fun seekTo(positionMs: Long) {
        mediaController?.seekTo(positionMs.coerceAtLeast(0L))
        _uiState.value = _uiState.value.copy(positionMs = positionMs.coerceAtLeast(0L))
    }

    fun next() = sendCommand(PlaybackService.CMD_NEXT_TRACK)

    fun previous() = sendCommand(PlaybackService.CMD_PREV_TRACK)

    fun selectQueueIndex(index: Int) = sendCommand(
        PlaybackService.CMD_SELECT_INDEX,
        bundleOf(PlaybackService.EXTRA_INDEX to index)
    )

    fun addNext(track: MediaItem) = sendCommand(
        PlaybackService.CMD_ADD_NEXT,
        bundleOf(PlaybackService.EXTRA_TRACK_JSON to json.encodeToString(track))
    )

    fun addToQueue(track: MediaItem) = sendCommand(
        PlaybackService.CMD_ADD_END,
        bundleOf(PlaybackService.EXTRA_TRACK_JSON to json.encodeToString(track))
    )

    fun removeFromQueue(index: Int) = sendCommand(
        PlaybackService.CMD_REMOVE_AT,
        bundleOf(PlaybackService.EXTRA_INDEX to index)
    )

    fun moveQueueItem(from: Int, to: Int) = sendCommand(
        PlaybackService.CMD_MOVE_ITEM,
        bundleOf(
            PlaybackService.EXTRA_INDEX to from,
            PlaybackService.EXTRA_TO_INDEX to to
        )
    )

    fun clearQueue() = sendCommand(PlaybackService.CMD_CLEAR_QUEUE)

    fun toggleShuffle() = sendCommand(PlaybackService.CMD_TOGGLE_SHUFFLE)

    fun cycleRepeat() = sendCommand(PlaybackService.CMD_CYCLE_REPEAT)

    fun setPlaybackSpeed(speed: Float) {
        mediaController?.setPlaybackSpeed(speed.coerceIn(0.5f, 2f))
        syncFromController()
    }

    fun setVolume(volume: Float) = sendCommand(
        PlaybackService.CMD_SET_VOLUME,
        bundleOf(PlaybackService.EXTRA_VOLUME to volume.coerceIn(0f, 1f))
    )

    fun toggleMute() = sendCommand(PlaybackService.CMD_SET_MUTE)

    fun setSleepTimerMinutes(minutes: Int) = sendCommand(
        PlaybackService.CMD_SET_SLEEP_TIMER,
        bundleOf(
            PlaybackService.EXTRA_SLEEP_MINUTES to minutes,
            PlaybackService.EXTRA_SLEEP_END_OF_TRACK to false
        )
    )

    fun setSleepTimerEndOfTrack() = sendCommand(
        PlaybackService.CMD_SET_SLEEP_TIMER,
        bundleOf(
            PlaybackService.EXTRA_SLEEP_MINUTES to 0,
            PlaybackService.EXTRA_SLEEP_END_OF_TRACK to true
        )
    )

    fun cancelSleepTimer() = sendCommand(
        PlaybackService.CMD_SET_SLEEP_TIMER,
        bundleOf(
            PlaybackService.EXTRA_SLEEP_MINUTES to 0,
            PlaybackService.EXTRA_SLEEP_END_OF_TRACK to false
        )
    )

    fun updateActiveMixConfig(config: PlaylistMixSettings) = sendCommand(
        PlaybackService.CMD_SET_MIX_CONFIG,
        bundleOf(PlaybackService.EXTRA_MIX_JSON to json.encodeToString(config))
    )

    fun hydrateRadio() = sendCommand(PlaybackService.CMD_HYDRATE_RADIO)

    fun toggleTestTone(mode: String) {
        if (_uiState.value.activeTestTone == mode) {
            testToneProcessor.stopTestTone()
            _uiState.value = _uiState.value.copy(activeTestTone = null)
        } else {
            _uiState.value = _uiState.value.copy(activeTestTone = mode)
            testToneProcessor.startTestTone(mode, scope) {
                scope.launch {
                    _uiState.value = _uiState.value.copy(activeTestTone = null)
                }
            }
        }
    }

    fun currentBpmEstimate(): Int? = _uiState.value.currentTrack?.let { AudioMath.estimateBpm(it) }
}
