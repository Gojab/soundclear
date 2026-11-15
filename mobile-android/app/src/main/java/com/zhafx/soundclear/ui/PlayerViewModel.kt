package com.zhafx.soundclear.ui

import android.app.Application
import android.content.ComponentName
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.zhafx.soundclear.audio.DspAudioEngine
import com.zhafx.soundclear.audio.PlaybackService
import com.zhafx.soundclear.data.InnerTubeClient
import com.zhafx.soundclear.data.LibraryStore
import com.zhafx.soundclear.data.LocalAudioRepository
import com.zhafx.soundclear.data.LyricsClient
import com.zhafx.soundclear.model.HomeSection
import com.zhafx.soundclear.model.LyricsData
import com.zhafx.soundclear.model.PlayerUiState
import com.zhafx.soundclear.model.RepeatModeState
import com.zhafx.soundclear.model.SearchFilterType
import com.zhafx.soundclear.model.TrackItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val innerTube = InnerTubeClient()
    private val lyricsClient = LyricsClient()
    private val localRepo = LocalAudioRepository(application)
    private val libraryStore = LibraryStore(application)

    private var mediaController: MediaController? = null
    private var playJob: Job? = null
    private var lyricsJob: Job? = null

    private val _playerState = MutableStateFlow(PlayerUiState())
    val playerState: StateFlow<PlayerUiState> = _playerState.asStateFlow()

    private val _homeSections = MutableStateFlow<List<HomeSection>>(emptyList())
    val homeSections: StateFlow<List<HomeSection>> = _homeSections.asStateFlow()

    private val _homeLoading = MutableStateFlow(true)
    val homeLoading: StateFlow<Boolean> = _homeLoading.asStateFlow()

    private val _homeError = MutableStateFlow<String?>(null)
    val homeError: StateFlow<String?> = _homeError.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _searchFilter = MutableStateFlow(SearchFilterType.ALL)
    val searchFilter: StateFlow<SearchFilterType> = _searchFilter.asStateFlow()

    private val _searchResults = MutableStateFlow<List<TrackItem>>(emptyList())
    val searchResults: StateFlow<List<TrackItem>> = _searchResults.asStateFlow()

    private val _searchLoading = MutableStateFlow(false)
    val searchLoading: StateFlow<Boolean> = _searchLoading.asStateFlow()

    private val _recentSearches = MutableStateFlow(libraryStore.getRecentSearches())
    val recentSearches: StateFlow<List<String>> = _recentSearches.asStateFlow()

    private val _likedTracks = MutableStateFlow(libraryStore.getLikedTracks())
    val likedTracks: StateFlow<List<TrackItem>> = _likedTracks.asStateFlow()

    private val _historyTracks = MutableStateFlow(libraryStore.getHistory())
    val historyTracks: StateFlow<List<TrackItem>> = _historyTracks.asStateFlow()

    private val _localTracks = MutableStateFlow<List<TrackItem>>(emptyList())
    val localTracks: StateFlow<List<TrackItem>> = _localTracks.asStateFlow()

    private val _lyrics = MutableStateFlow<LyricsData?>(null)
    val lyrics: StateFlow<LyricsData?> = _lyrics.asStateFlow()

    private val _lyricsLoading = MutableStateFlow(false)
    val lyricsLoading: StateFlow<Boolean> = _lyricsLoading.asStateFlow()

    init {
        DspAudioEngine.applyPreset(libraryStore.getDspPreset())
        DspAudioEngine.setBassStrength(libraryStore.getBassBoostStrength())
        connectMediaController()
        refreshHome()
        startProgressLoop()
    }

    private fun connectMediaController() {
        val app = getApplication<Application>()
        val token = SessionToken(app, ComponentName(app, PlaybackService::class.java))
        val future = MediaController.Builder(app, token).buildAsync()
        future.addListener(
            {
                try {
                    val controller = future.get()
                    mediaController = controller
                    controller.addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            _playerState.update { it.copy(isPlaying = isPlaying) }
                        }

                        override fun onPlaybackStateChanged(playbackState: Int) {
                            val buffering = playbackState == Player.STATE_BUFFERING
                            _playerState.update { it.copy(isBuffering = buffering) }
                            if (playbackState == Player.STATE_ENDED) {
                                handleTrackEnded()
                            }
                        }

                        override fun onPlayerError(error: PlaybackException) {
                            _playerState.update {
                                it.copy(
                                    isBuffering = false,
                                    isPlaying = false,
                                    errorMessage = "Gagal memutar audio (${error.errorCodeName}). Coba lagu lain."
                                )
                            }
                        }
                    })
                } catch (_: Exception) {
                }
            },
            ContextCompat.getMainExecutor(app)
        )
    }

    private fun startProgressLoop() {
        viewModelScope.launch {
            while (isActive) {
                val controller = mediaController
                if (controller != null && _playerState.value.currentTrack != null) {
                    val pos = controller.currentPosition.coerceAtLeast(0L)
                    val dur = controller.duration.takeIf { it > 0L }
                        ?: ((_playerState.value.currentTrack?.durationSeconds ?: 0) * 1000L)
                    _playerState.update {
                        it.copy(
                            currentPositionMs = pos,
                            durationMs = dur,
                            isPlaying = controller.isPlaying
                        )
                    }
                }
                delay(400L)
            }
        }
    }

    fun refreshHome() {
        viewModelScope.launch {
            _homeLoading.value = true
            _homeError.value = null
            try {
                val sections = innerTube.fetchIndonesiaHome()
                _homeSections.value = sections
                if (sections.isEmpty()) {
                    _homeError.value = "Katalog sedang kosong. Periksa koneksi internet lalu coba muat ulang."
                }
            } catch (_: Exception) {
                _homeError.value = "Tidak dapat memuat katalog musik. Periksa koneksi internet Anda."
            } finally {
                _homeLoading.value = false
            }
        }
    }

    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setSearchFilter(filter: SearchFilterType) {
        _searchFilter.value = filter
        if (_searchQuery.value.isNotBlank()) {
            submitSearch(_searchQuery.value)
        }
    }

    fun submitSearch(query: String) {
        val clean = query.trim()
        _searchQuery.value = clean
        if (clean.isEmpty()) return
        _recentSearches.value = libraryStore.addRecentSearch(clean)
        viewModelScope.launch {
            _searchLoading.value = true
            try {
                _searchResults.value = innerTube.searchMusic(clean, _searchFilter.value)
            } finally {
                _searchLoading.value = false
            }
        }
    }

    fun scanLocalAudio() {
        viewModelScope.launch {
            _localTracks.value = localRepo.scanDeviceAudio()
        }
    }

    fun playTrack(track: TrackItem, contextQueue: List<TrackItem> = emptyList()) {
        playJob?.cancel()
        val initialQueue = if (contextQueue.isNotEmpty()) {
            contextQueue
        } else if (_playerState.value.queue.any { it.id == track.id }) {
            _playerState.value.queue
        } else {
            listOf(track)
        }

        _playerState.update {
            it.copy(
                currentTrack = track,
                queue = initialQueue,
                isBuffering = true,
                currentPositionMs = 0L,
                durationMs = (track.durationSeconds ?: 0) * 1000L,
                errorMessage = null,
                streamInfoLabel = if (track.isLocal) "Audio Lokal" else "Menyiapkan stream..."
            )
        }

        _historyTracks.value = libraryStore.recordPlay(track)
        loadLyricsForTrack(track)

        playJob = viewModelScope.launch {
            val controller = mediaController
            if (controller == null) {
                _playerState.update {
                    it.copy(
                        isBuffering = false,
                        errorMessage = "Layanan pemutar belum siap. Coba ketuk ulang."
                    )
                }
                return@launch
            }

            if (track.isLocal && !track.localUri.isNullOrBlank()) {
                val metadata = buildMediaMetadata(track)
                val mediaItem = MediaItem.Builder()
                    .setMediaId(track.id)
                    .setUri(Uri.parse(track.localUri))
                    .setMediaMetadata(metadata)
                    .build()
                controller.setMediaItem(mediaItem)
                controller.prepare()
                controller.play()
                _playerState.update { it.copy(isBuffering = false, streamInfoLabel = "Berkas Lokal Offline") }
                return@launch
            }

            val stream = innerTube.resolveAudioStream(track.videoId)
            if (stream == null) {
                _playerState.update {
                    it.copy(
                        isBuffering = false,
                        isPlaying = false,
                        streamInfoLabel = null,
                        errorMessage = "Stream audio tidak tersedia untuk lagu ini. Coba lagu lain."
                    )
                }
                return@launch
            }

            PlaybackService.updateStreamUserAgent(stream.userAgent)
            val metadata = buildMediaMetadata(track)
            val mediaItem = MediaItem.Builder()
                .setMediaId(track.videoId)
                .setUri(Uri.parse(stream.url))
                .setMediaMetadata(metadata)
                .build()

            controller.setMediaItem(mediaItem)
            controller.prepare()
            controller.play()

            val codecName = if (stream.mimeType.contains("mp4")) "AAC/MP4" else "OPUS/WebM"
            _playerState.update {
                it.copy(
                    streamInfoLabel = "$codecName · ${stream.bitrateKbps} kbps"
                )
            }

            if (initialQueue.size <= 1) {
                val radio = innerTube.fetchRadioNext(track.videoId)
                if (radio.isNotEmpty()) {
                    _playerState.update { state ->
                        if (state.currentTrack?.id == track.id) {
                            state.copy(queue = (listOf(track) + radio).distinctBy { it.id })
                        } else {
                            state
                        }
                    }
                }
            }
        }
    }

    private fun buildMediaMetadata(track: TrackItem): MediaMetadata {
        return MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.artist)
            .setAlbumTitle(track.album ?: "SoundClear")
            .apply {
                track.thumbnailUrl?.let { setArtworkUri(Uri.parse(it)) }
            }
            .build()
    }

    private fun loadLyricsForTrack(track: TrackItem) {
        lyricsJob?.cancel()
        _lyrics.value = null
        _lyricsLoading.value = true
        lyricsJob = viewModelScope.launch {
            try {
                _lyrics.value = lyricsClient.fetchLyrics(
                    title = track.title,
                    artist = track.artist,
                    durationSeconds = track.durationSeconds
                )
            } finally {
                _lyricsLoading.value = false
            }
        }
    }

    fun togglePlayPause() {
        val controller = mediaController ?: return
        if (controller.isPlaying) {
            controller.pause()
        } else {
            if (controller.playbackState == Player.STATE_IDLE && _playerState.value.currentTrack != null) {
                playTrack(_playerState.value.currentTrack!!, _playerState.value.queue)
            } else {
                controller.play()
            }
        }
    }

    fun seekTo(positionMs: Long) {
        mediaController?.seekTo(positionMs.coerceAtLeast(0L))
        _playerState.update { it.copy(currentPositionMs = positionMs.coerceAtLeast(0L)) }
    }

    fun skipNext() {
        val state = _playerState.value
        val current = state.currentTrack ?: return
        val q = state.queue
        if (q.isEmpty()) return

        val nextTrack = if (state.shuffleEnabled && q.size > 1) {
            q.filter { it.id != current.id }.randomOrNull() ?: q.first()
        } else {
            val idx = q.indexOfFirst { it.id == current.id }
            if (idx in 0 until q.lastIndex) {
                q[idx + 1]
            } else if (state.repeatMode == RepeatModeState.ALL) {
                q.first()
            } else {
                null
            }
        }
        if (nextTrack != null) {
            playTrack(nextTrack, q)
        }
    }

    fun skipPrevious() {
        val controller = mediaController
        if (controller != null && controller.currentPosition > 3500L) {
            seekTo(0L)
            return
        }
        val state = _playerState.value
        val current = state.currentTrack ?: return
        val q = state.queue
        if (q.isEmpty()) return
        val idx = q.indexOfFirst { it.id == current.id }
        val prevTrack = if (idx > 0) q[idx - 1] else q.last()
        playTrack(prevTrack, q)
    }

    private fun handleTrackEnded() {
        val state = _playerState.value
        if (state.repeatMode == RepeatModeState.ONE) {
            seekTo(0L)
            mediaController?.play()
            return
        }
        skipNext()
    }

    fun toggleShuffle() {
        _playerState.update { it.copy(shuffleEnabled = !it.shuffleEnabled) }
    }

    fun cycleRepeatMode() {
        _playerState.update {
            val next = when (it.repeatMode) {
                RepeatModeState.OFF -> RepeatModeState.ALL
                RepeatModeState.ALL -> RepeatModeState.ONE
                RepeatModeState.ONE -> RepeatModeState.OFF
            }
            it.copy(repeatMode = next)
        }
    }

    fun toggleLike(track: TrackItem) {
        _likedTracks.value = libraryStore.toggleLike(track)
    }

    fun isLiked(trackId: String): Boolean {
        return _likedTracks.value.any { it.id == trackId }
    }

    fun applyDspPreset(name: String) {
        DspAudioEngine.applyPreset(name)
        libraryStore.saveDspPreset(name)
    }

    fun setEqBandLevel(index: Int, levelMb: Int) {
        DspAudioEngine.setBandLevel(index, levelMb)
        libraryStore.saveDspPreset("Kustom")
    }

    fun setBassStrength(strength: Int) {
        DspAudioEngine.setBassStrength(strength)
        libraryStore.saveBassBoostStrength(strength)
    }

    fun setDspEnabled(enabled: Boolean) {
        DspAudioEngine.setDspEnabled(enabled)
    }

    fun clearError() {
        _playerState.update { it.copy(errorMessage = null) }
    }

    override fun onCleared() {
        mediaController?.release()
        mediaController = null
        super.onCleared()
    }
}
