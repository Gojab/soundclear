package com.zhafx.soundclear.ui.viewmodel

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zhafx.soundclear.AppContainer
import com.zhafx.soundclear.data.local.FollowedArtistEntity
import com.zhafx.soundclear.data.local.LocalAudioFileEntity
import com.zhafx.soundclear.data.local.OfflineDownloadEntity
import com.zhafx.soundclear.data.local.PlayHistoryEntity
import com.zhafx.soundclear.data.local.PlaylistEntity
import com.zhafx.soundclear.data.local.PlaylistFolderEntity
import com.zhafx.soundclear.data.local.SavedAlbumEntity
import com.zhafx.soundclear.data.local.SavedPodcastEntity
import com.zhafx.soundclear.data.remote.CustomBackgroundSettings
import com.zhafx.soundclear.data.remote.EqPreset
import com.zhafx.soundclear.data.remote.LocalAudioProfile
import com.zhafx.soundclear.data.remote.LyricLine
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.SongCredit
import com.zhafx.soundclear.data.remote.UserSettings
import com.zhafx.soundclear.domain.AudioMath
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ===================== LIBRARY VIEWMODEL =====================

data class LibraryUiState(
    val filter: String = "all", // all | playlist | album | artist | podcast | offline | local
    val sort: String = "newest", // newest | alpha | last_played
    val selectedFolderId: String? = null,
    val playlists: List<PlaylistEntity> = emptyList(),
    val folders: List<PlaylistFolderEntity> = emptyList(),
    val savedAlbums: List<SavedAlbumEntity> = emptyList(),
    val followedArtists: List<FollowedArtistEntity> = emptyList(),
    val savedPodcasts: List<SavedPodcastEntity> = emptyList(),
    val likedTracks: List<MediaItem> = emptyList(),
    val localAudioFiles: List<LocalAudioFileEntity> = emptyList(),
    val offlineDownloads: List<OfflineDownloadEntity> = emptyList()
)

class LibraryViewModel(private val container: AppContainer) : ViewModel() {
    private val filter = MutableStateFlow("all")
    private val sort = MutableStateFlow("newest")
    private val selectedFolderId = MutableStateFlow<String?>(null)

    private val coreCollections = combine(
        container.libraryRepository.playlists,
        container.libraryRepository.folders,
        container.libraryRepository.savedAlbums,
        container.libraryRepository.followedArtists,
        container.libraryRepository.savedPodcasts
    ) { pl, fld, alb, art, pod -> LibraryCore(pl, fld, alb, art, pod) }

    private val extraCollections = combine(
        container.libraryRepository.likedTracks,
        container.libraryRepository.localAudioFiles,
        container.libraryRepository.offlineDownloads
    ) { liked, local, offline -> Triple(liked, local, offline) }

    val uiState: StateFlow<LibraryUiState> = combine(
        filter,
        sort,
        selectedFolderId,
        coreCollections,
        extraCollections
    ) { f, s, folderId, core, extra ->
        val sortedPlaylists = core.playlists
            .filter { folderId == null || it.folderId == folderId }
            .let { list ->
                when (s) {
                    "alpha" -> list.sortedWith(compareByDescending<PlaylistEntity> { it.pinned }.thenBy { it.name.lowercase() })
                    "last_played" -> list.sortedWith(compareByDescending<PlaylistEntity> { it.pinned }.thenByDescending { it.lastPlayedAt ?: it.updatedAt })
                    else -> list.sortedWith(compareByDescending<PlaylistEntity> { it.pinned }.thenByDescending { it.createdAt })
                }
            }
        LibraryUiState(
            filter = f,
            sort = s,
            selectedFolderId = folderId,
            playlists = sortedPlaylists,
            folders = core.folders,
            savedAlbums = core.albums,
            followedArtists = core.artists,
            savedPodcasts = core.podcasts,
            likedTracks = extra.first,
            localAudioFiles = extra.second,
            offlineDownloads = extra.third
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), LibraryUiState())

    fun setFilter(newFilter: String) { filter.value = newFilter }
    fun setSort(newSort: String) { sort.value = newSort }
    fun selectFolder(id: String?) { selectedFolderId.value = if (selectedFolderId.value == id) null else id }

    fun createPlaylist(name: String, description: String = "", folderId: String? = null) {
        viewModelScope.launch {
            container.libraryRepository.createPlaylist(name, description, folderId = folderId)
        }
    }

    fun createFolder(name: String) {
        viewModelScope.launch {
            container.libraryRepository.createFolder(name)
        }
    }

    fun togglePinPlaylist(id: String) {
        viewModelScope.launch { container.libraryRepository.togglePlaylistPinned(id) }
    }

    fun importLocalAudio(uri: Uri) {
        viewModelScope.launch { container.libraryRepository.importLocalAudioUri(uri) }
    }

    fun deleteLocalAudio(id: String) {
        viewModelScope.launch { container.libraryRepository.deleteLocalAudioFile(id) }
    }

    fun deleteOfflineDownload(id: String) {
        viewModelScope.launch { container.libraryRepository.deleteOfflineDownload(id) }
    }

    private data class LibraryCore(
        val playlists: List<PlaylistEntity>,
        val folders: List<PlaylistFolderEntity>,
        val albums: List<SavedAlbumEntity>,
        val artists: List<FollowedArtistEntity>,
        val podcasts: List<SavedPodcastEntity>
    )
}

// ===================== RECAP VIEWMODEL =====================

data class RecapRankItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val thumbnail: String?,
    val playCount: Int,
    val minutes: Int,
    val mediaItem: MediaItem? = null
)

data class RecapUiState(
    val range: String = "4w", // 4w | 6m | all
    val totalMinutes: Int = 0,
    val totalPlays: Int = 0,
    val uniqueArtists: Int = 0,
    val uniqueSongs: Int = 0,
    val monthlyBars: List<Pair<String, Int>> = emptyList(),
    val topTracks: List<RecapRankItem> = emptyList(),
    val topArtists: List<RecapRankItem> = emptyList(),
    val topGenres: List<Pair<String, Int>> = emptyList()
)

class RecapViewModel(private val container: AppContainer) : ViewModel() {
    private val range = MutableStateFlow("4w")

    val uiState: StateFlow<RecapUiState> = combine(
        range,
        container.libraryRepository.playHistory
    ) { r, history ->
        computeRecap(r, history)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), RecapUiState())

    fun setRange(newRange: String) {
        range.value = newRange
    }

    private fun computeRecap(range: String, all: List<PlayHistoryEntity>): RecapUiState {
        val now = System.currentTimeMillis()
        val cutoff = when (range) {
            "4w" -> now - 28L * 86_400_000L
            "6m" -> now - 180L * 86_400_000L
            else -> 0L
        }
        val filtered = all.filter { it.playedAt >= cutoff }
        val totalMinutes = filtered.sumOf { it.durationListenedSec } / 60
        val tracksParsed = filtered.map { it to it.toMediaItem() }

        val topTracks = tracksParsed
            .groupBy { it.first.trackId }
            .entries
            .map { (id, list) ->
                val sample = list.first().second
                RecapRankItem(
                    id = id,
                    title = sample.title,
                    subtitle = sample.primaryArtistName,
                    thumbnail = sample.displayThumbnail(),
                    playCount = list.size,
                    minutes = (list.sumOf { it.first.durationListenedSec } / 60).coerceAtLeast(1),
                    mediaItem = sample
                )
            }
            .sortedByDescending { it.playCount }
            .take(10)

        val topArtists = tracksParsed
            .groupBy { it.second.primaryArtistName }
            .entries
            .filter { it.key.isNotBlank() && it.key != "Artis tidak diketahui" }
            .map { (artistName, list) ->
                val sample = list.first().second
                RecapRankItem(
                    id = sample.artists.firstOrNull()?.id ?: artistName,
                    title = artistName,
                    subtitle = "${list.size} pemutaran",
                    thumbnail = sample.displayThumbnail(),
                    playCount = list.size,
                    minutes = (list.sumOf { it.first.durationListenedSec } / 60).coerceAtLeast(1),
                    mediaItem = sample
                )
            }
            .sortedByDescending { it.playCount }
            .take(8)

        val sdf = SimpleDateFormat("MMM", Locale("id", "ID"))
        val monthly = filtered
            .groupBy { sdf.format(Date(it.playedAt)) }
            .entries
            .map { it.key to (it.value.sumOf { e -> e.durationListenedSec } / 60).coerceAtLeast(1) }
            .takeLast(6)

        val genres = filtered
            .mapNotNull { it.genreHint?.takeIf { g -> g.isNotBlank() } }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .map { it.key to it.value }
            .take(6)

        return RecapUiState(
            range = range,
            totalMinutes = totalMinutes,
            totalPlays = filtered.size,
            uniqueArtists = topArtists.size.coerceAtLeast(tracksParsed.map { it.second.primaryArtistName }.distinct().size),
            uniqueSongs = tracksParsed.map { it.first.trackId }.distinct().size,
            monthlyBars = monthly,
            topTracks = topTracks,
            topArtists = topArtists,
            topGenres = genres
        )
    }
}

// ===================== SETTINGS VIEWMODEL =====================

data class SettingsUiState(
    val userSettings: UserSettings = UserSettings(),
    val audioProfile: LocalAudioProfile = LocalAudioProfile(),
    val apiBaseUrl: String = "",
    val backendHealthy: Boolean? = null,
    val statusMessage: String? = null
)

class SettingsViewModel(private val container: AppContainer) : ViewModel() {

    private val backendHealthy = MutableStateFlow<Boolean?>(null)
    private val statusMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<SettingsUiState> = combine(
        container.settingsRepository.userSettings,
        container.settingsRepository.audioProfile,
        container.settingsRepository.apiBaseUrl,
        backendHealthy,
        statusMessage
    ) { user, profile, baseUrl, healthy, msg ->
        SettingsUiState(
            userSettings = user,
            audioProfile = profile,
            apiBaseUrl = baseUrl,
            backendHealthy = healthy,
            statusMessage = msg
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())

    val hiddenTrackIds = container.libraryRepository.hiddenTrackIds

    init {
        checkBackendHealth()
    }

    fun checkBackendHealth() {
        viewModelScope.launch {
            backendHealthy.value = runCatching {
                container.settingsRepository.getApiService().getHealth().status == "ok"
            }.getOrDefault(false)
        }
    }

    fun updateUserSettings(transform: (UserSettings) -> UserSettings) =
        container.settingsRepository.updateUserSettings(transform)

    fun updateAudioProfile(transform: (LocalAudioProfile) -> LocalAudioProfile) =
        container.settingsRepository.updateAudioProfile(transform)

    fun updateCustomBackground(transform: (CustomBackgroundSettings) -> CustomBackgroundSettings) =
        container.settingsRepository.updateCustomBackground(transform)

    fun applyEqPreset(preset: EqPreset) = container.settingsRepository.applyEqPreset(preset)
    fun saveCustomEqPreset(name: String) = container.settingsRepository.saveCustomEqPreset(name)
    fun deleteCustomEqPreset(id: String) = container.settingsRepository.deleteCustomEqPreset(id)
    fun resetEqToFlat() = container.settingsRepository.resetEqToFlat()
    fun allEqPresets(): List<EqPreset> = container.settingsRepository.allEqPresets()

    fun setApiBaseUrl(url: String) {
        container.settingsRepository.setApiBaseUrl(url)
        statusMessage.value = "URL server backend diperbarui."
        checkBackendHealth()
    }

    fun unhideTrack(id: String) {
        viewModelScope.launch { container.libraryRepository.unhideTrack(id) }
    }

    fun clearPlayHistory() {
        viewModelScope.launch {
            container.libraryRepository.clearPlayHistory()
            statusMessage.value = "Riwayat putar berhasil dihapus."
        }
    }

    fun clearRecentSearches() {
        viewModelScope.launch {
            container.libraryRepository.clearRecentSearches()
            statusMessage.value = "Riwayat pencarian dihapus."
        }
    }

    fun clearAllOfflineDownloads() {
        viewModelScope.launch {
            container.libraryRepository.clearAllOfflineDownloads()
            statusMessage.value = "Semua unduhan offline dihapus."
        }
    }

    fun exportBackup(onReady: (String) -> Unit) {
        viewModelScope.launch {
            val jsonStr = container.libraryRepository.exportBackupJson()
            onReady(jsonStr)
        }
    }

    fun importBackup(jsonStr: String) {
        viewModelScope.launch {
            container.libraryRepository.importBackupJson(jsonStr)
                .onSuccess { statusMessage.value = "Data pustaka berhasil dipulihkan dari JSON." }
                .onFailure { statusMessage.value = "Gagal impor JSON: ${it.localizedMessage}" }
        }
    }

    fun moveHomeSection(index: Int, delta: Int) {
        val current = uiState.value.userSettings.homeSectionOrder.toMutableList()
        val target = index + delta
        if (index !in current.indices || target !in current.indices) return
        val item = current.removeAt(index)
        current.add(target, item)
        updateUserSettings { it.copy(homeSectionOrder = current) }
    }

    fun clearStatusMessage() { statusMessage.value = null }
}

// ===================== PLAYER VIEWMODEL =====================

data class PlayerExtrasUiState(
    val ambientColorHex: String? = null,
    val lyricsLines: List<LyricLine> = emptyList(),
    val lyricsPlainText: String? = null,
    val lyricsSource: String? = null,
    val lyricsHasTimestamps: Boolean = false,
    val lyricsLoading: Boolean = false,
    val credits: List<SongCredit> = emptyList(),
    val creditsLoading: Boolean = false,
    val isCurrentLiked: Boolean = false,
    val isCurrentOffline: Boolean = false,
    val activeTrackMenuTarget: MediaItem? = null,
    val playlistPickerTarget: MediaItem? = null,
    val creditsModalTarget: MediaItem? = null,
    val toastMessage: String? = null
)

class PlayerViewModel(private val container: AppContainer) : ViewModel() {

    val playbackState = container.playbackController.uiState
    val likedTrackIds = container.libraryRepository.likedTrackIds
    val playlists = container.libraryRepository.playlists
    val offlineDownloads = container.libraryRepository.offlineDownloads
    val userSettings = container.settingsRepository.userSettings
    val audioProfile = container.settingsRepository.audioProfile

    private val _extras = MutableStateFlow(PlayerExtrasUiState())
    val extras: StateFlow<PlayerExtrasUiState> = _extras.asStateFlow()

    private var lastLoadedTrackId: String? = null

    init {
        viewModelScope.launch {
            playbackState.collect { state ->
                val track = state.currentTrack
                val vid = track?.playableVideoId
                if (track != null && vid != null && vid != lastLoadedTrackId) {
                    lastLoadedTrackId = vid
                    loadTrackSideData(track)
                }
            }
        }
        viewModelScope.launch {
            combine(playbackState, likedTrackIds, offlineDownloads) { pb, liked, off ->
                val vid = pb.currentTrack?.playableVideoId.orEmpty()
                (vid in liked) to off.any { it.id == vid }
            }.collect { (isLiked, isOff) ->
                _extras.value = _extras.value.copy(
                    isCurrentLiked = isLiked,
                    isCurrentOffline = isOff
                )
            }
        }
    }

    private fun loadTrackSideData(track: MediaItem) {
        viewModelScope.launch {
            _extras.value = _extras.value.copy(
                lyricsLoading = true,
                lyricsLines = emptyList(),
                lyricsPlainText = null,
                ambientColorHex = null
            )
            track.displayThumbnail()?.let { thumb ->
                launch {
                    container.musicRepository.getArtworkColor(thumb).onSuccess { col ->
                        _extras.value = _extras.value.copy(ambientColorHex = col.hex)
                    }
                }
            }
            if (track.type != "local") {
                container.musicRepository.getLyrics(track)
                    .onSuccess { lyr ->
                        _extras.value = _extras.value.copy(
                            lyricsLines = lyr.lines,
                            lyricsPlainText = lyr.plainText,
                            lyricsSource = lyr.source,
                            lyricsHasTimestamps = lyr.hasTimestamps,
                            lyricsLoading = false
                        )
                    }
                    .onFailure {
                        _extras.value = _extras.value.copy(lyricsLoading = false)
                    }
            } else {
                _extras.value = _extras.value.copy(lyricsLoading = false)
            }
        }
    }

    fun openTrackMenu(track: MediaItem) {
        _extras.value = _extras.value.copy(activeTrackMenuTarget = track)
    }

    fun closeTrackMenu() {
        _extras.value = _extras.value.copy(activeTrackMenuTarget = null)
    }

    fun openPlaylistPicker(track: MediaItem) {
        _extras.value = _extras.value.copy(playlistPickerTarget = track, activeTrackMenuTarget = null)
    }

    fun closePlaylistPicker() {
        _extras.value = _extras.value.copy(playlistPickerTarget = null)
    }

    fun openCreditsModal(track: MediaItem) {
        _extras.value = _extras.value.copy(
            creditsModalTarget = track,
            activeTrackMenuTarget = null,
            creditsLoading = true,
            credits = emptyList()
        )
        viewModelScope.launch {
            container.musicRepository.getSongCredits(track)
                .onSuccess {
                    _extras.value = _extras.value.copy(credits = it.credits, creditsLoading = false)
                }
                .onFailure {
                    _extras.value = _extras.value.copy(creditsLoading = false)
                }
        }
    }

    fun closeCreditsModal() {
        _extras.value = _extras.value.copy(creditsModalTarget = null)
    }

    fun toggleLike(track: MediaItem) {
        viewModelScope.launch {
            val liked = container.libraryRepository.toggleLike(track)
            showToast(if (liked) "Ditambahkan ke Lagu Disukai" else "Dihapus dari Lagu Disukai")
        }
    }

    fun downloadOffline(track: MediaItem) {
        viewModelScope.launch {
            showToast("Mengunduh \"${track.title}\" untuk offline...")
            val quality = container.settingsRepository.audioProfile.value.downloadQuality
            container.libraryRepository.downloadTrackForOffline(track, quality)
                .onSuccess { showToast("Selesai diunduh ke penyimpanan offline.") }
                .onFailure { showToast("Gagal unduh offline: ${it.localizedMessage}") }
        }
    }

    fun addTrackToPlaylist(playlistId: String, track: MediaItem) {
        viewModelScope.launch {
            val added = container.libraryRepository.addTrackToPlaylist(playlistId, track, allowDuplicate = false)
            showToast(if (added) "Ditambahkan ke playlist" else "Lagu sudah ada di playlist")
            closePlaylistPicker()
        }
    }

    fun createPlaylistAndAdd(name: String, track: MediaItem) {
        viewModelScope.launch {
            container.libraryRepository.createPlaylist(name, initialTracks = listOf(track))
            showToast("Playlist \"$name\" dibuat")
            closePlaylistPicker()
        }
    }

    fun startRadioFromTrack(track: MediaItem) {
        container.playbackController.playTrack(track, sourceLabel = "Radio: ${track.title}")
        showToast("Memutar Radio dari ${track.title}")
    }

    fun hideTrack(track: MediaItem) {
        viewModelScope.launch {
            container.libraryRepository.hideTrack(track.playableVideoId)
            showToast("\"${track.title}\" disembunyikan")
        }
    }

    fun toggleExcludeFromTaste(track: MediaItem) {
        val excluded = container.settingsRepository.toggleExcludeFromTaste(track.playableVideoId)
        showToast(if (excluded) "Dikecualikan dari profil selera musik" else "Dikembalikan ke profil selera")
    }

    fun showToast(msg: String) {
        _extras.value = _extras.value.copy(toastMessage = msg)
    }

    fun clearToast() {
        _extras.value = _extras.value.copy(toastMessage = null)
    }

    fun updateDjMixConfig(config: PlaylistMixSettings) {
        container.playbackController.updateActiveMixConfig(config)
        container.settingsRepository.updateDjMixDefaults(config)
    }
}
