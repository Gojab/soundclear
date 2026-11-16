package com.zhafx.soundclear.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zhafx.soundclear.AppContainer
import com.zhafx.soundclear.data.local.EpisodeProgressEntity
import com.zhafx.soundclear.data.local.PlaylistEntity
import com.zhafx.soundclear.data.remote.AlbumDetailResponse
import com.zhafx.soundclear.data.remote.ArtistDetailResponse
import com.zhafx.soundclear.data.remote.EpisodeDetailResponse
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.MoodCategoryGroup
import com.zhafx.soundclear.data.remote.PlaylistDetailResponse
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.PodcastDetailResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DetailViewModel(private val container: AppContainer) : ViewModel() {

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _artistDetail = MutableStateFlow<ArtistDetailResponse?>(null)
    val artistDetail: StateFlow<ArtistDetailResponse?> = _artistDetail.asStateFlow()

    private val _albumDetail = MutableStateFlow<AlbumDetailResponse?>(null)
    val albumDetail: StateFlow<AlbumDetailResponse?> = _albumDetail.asStateFlow()

    private val _playlistDetail = MutableStateFlow<PlaylistDetailResponse?>(null)
    val playlistDetail: StateFlow<PlaylistDetailResponse?> = _playlistDetail.asStateFlow()

    private val _podcastDetail = MutableStateFlow<PodcastDetailResponse?>(null)
    val podcastDetail: StateFlow<PodcastDetailResponse?> = _podcastDetail.asStateFlow()

    private val _episodeDetail = MutableStateFlow<EpisodeDetailResponse?>(null)
    val episodeDetail: StateFlow<EpisodeDetailResponse?> = _episodeDetail.asStateFlow()

    private val _moodGroups = MutableStateFlow<List<MoodCategoryGroup>>(emptyList())
    val moodGroups: StateFlow<List<MoodCategoryGroup>> = _moodGroups.asStateFlow()

    private val _moodPlaylists = MutableStateFlow<List<MediaItem>>(emptyList())
    val moodPlaylists: StateFlow<List<MediaItem>> = _moodPlaylists.asStateFlow()

    private val _localPlaylist = MutableStateFlow<PlaylistEntity?>(null)
    val localPlaylist: StateFlow<PlaylistEntity?> = _localPlaylist.asStateFlow()

    private val _offlineDownloading = MutableStateFlow(false)
    val offlineDownloading: StateFlow<Boolean> = _offlineDownloading.asStateFlow()

    val savedAlbums = container.libraryRepository.savedAlbums
    val followedArtists = container.libraryRepository.followedArtists
    val savedPodcasts = container.libraryRepository.savedPodcasts
    val episodeProgress = container.libraryRepository.episodeProgress
    val likedTrackIds = container.libraryRepository.likedTrackIds
    val offlineDownloads = container.libraryRepository.offlineDownloads
    val userSettings = container.settingsRepository.userSettings

    fun loadArtist(id: String, fallbackQuery: String? = null) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getArtist(id, fallbackQuery)
                .onSuccess { _artistDetail.value = it }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun loadAlbum(id: String, fallbackQuery: String? = null) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getAlbum(id, fallbackQuery)
                .onSuccess { _albumDetail.value = it }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun loadPlaylist(id: String, fallbackQuery: String? = null) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getPlaylist(id, fallbackQuery)
                .onSuccess { _playlistDetail.value = it }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun loadPodcast(id: String, fallbackQuery: String? = null) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getPodcast(id, fallbackQuery)
                .onSuccess { _podcastDetail.value = it }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun loadEpisode(id: String, fallbackQuery: String? = null) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getEpisode(id, fallbackQuery)
                .onSuccess { _episodeDetail.value = it }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun loadMoods() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getMoods()
                .onSuccess { _moodGroups.value = it.groups }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun loadMoodPlaylists(params: String, title: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            container.musicRepository.getMoodPlaylists(params, title)
                .onSuccess { _moodPlaylists.value = it.playlists }
                .onFailure { _error.value = it.localizedMessage }
            _isLoading.value = false
        }
    }

    fun observeLocalPlaylist(id: String) {
        viewModelScope.launch {
            container.libraryRepository.observePlaylist(id).collect {
                _localPlaylist.value = it
            }
        }
    }

    fun toggleFollowArtist(artist: ArtistDetailResponse) {
        viewModelScope.launch {
            container.libraryRepository.toggleFollowArtist(
                MediaItem(
                    id = artist.id,
                    title = artist.name,
                    thumbnail = artist.thumbnail,
                    type = "artist"
                )
            )
        }
    }

    fun toggleSaveAlbum(album: AlbumDetailResponse) {
        viewModelScope.launch {
            container.libraryRepository.toggleSaveAlbum(
                MediaItem(
                    id = album.id,
                    title = album.title,
                    artists = album.artists,
                    year = album.year,
                    thumbnail = album.thumbnail,
                    type = "album"
                )
            )
        }
    }

    fun toggleSavePodcast(podcast: PodcastDetailResponse) {
        viewModelScope.launch {
            container.libraryRepository.toggleSavePodcast(
                MediaItem(
                    id = podcast.id,
                    title = podcast.title,
                    artists = listOfNotNull(podcast.author?.let { com.zhafx.soundclear.data.remote.ArtistRef(name = it) }),
                    thumbnail = podcast.thumbnail,
                    type = "podcast"
                )
            )
        }
    }

    fun markEpisodeCompleted(episodeId: String, podcastId: String?, completed: Boolean) {
        viewModelScope.launch {
            container.libraryRepository.saveEpisodeProgress(
                episodeId = episodeId,
                podcastId = podcastId,
                positionSeconds = 0L,
                durationSeconds = 0L,
                completed = completed
            )
        }
    }

    fun setEpisodePlaybackRate(episodeId: String, rate: Float) {
        container.settingsRepository.updateUserSettings { settings ->
            val updated = settings.episodePlaybackRates.toMutableMap()
            updated[episodeId] = rate
            settings.copy(episodePlaybackRates = updated)
        }
        val currentTrackId = container.playbackController.uiState.value.currentTrack?.playableVideoId
        if (currentTrackId == episodeId) {
            container.playbackController.setPlaybackSpeed(rate)
        }
    }

    fun downloadTracksOffline(tracks: List<MediaItem>) {
        if (_offlineDownloading.value || tracks.isEmpty()) return
        viewModelScope.launch {
            _offlineDownloading.value = true
            val quality = container.settingsRepository.audioProfile.value.downloadQuality
            tracks.forEach { track ->
                container.libraryRepository.downloadTrackForOffline(track, quality)
            }
            _offlineDownloading.value = false
        }
    }

    fun updateLocalPlaylistMix(playlistId: String, config: PlaylistMixSettings) {
        viewModelScope.launch {
            container.libraryRepository.updatePlaylistMixConfig(playlistId, config)
        }
    }

    fun moveLocalPlaylistTrack(playlistId: String, from: Int, to: Int) {
        viewModelScope.launch {
            container.libraryRepository.moveTrackInPlaylist(playlistId, from, to)
        }
    }

    fun removeLocalPlaylistTrack(playlistId: String, index: Int) {
        viewModelScope.launch {
            container.libraryRepository.removeTrackFromPlaylist(playlistId, index)
        }
    }

    fun removeDuplicateTracks(playlistId: String) {
        viewModelScope.launch {
            container.libraryRepository.removeDuplicateTracksFromPlaylist(playlistId)
        }
    }

    fun deleteLocalPlaylist(playlistId: String, onDone: () -> Unit) {
        viewModelScope.launch {
            container.libraryRepository.deletePlaylist(playlistId)
            onDone()
        }
    }
}
