package com.zhafx.soundclear.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zhafx.soundclear.AppContainer
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.MoodCategoryItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class CreateMixUiState(
    val mode: String = "track", // track | genre | blend
    val seedTracks: List<MediaItem> = emptyList(),
    val selectedGenres: List<String> = emptyList(),
    val customTitle: String = "",
    val targetCount: Int = 25,
    val searchQuery: String = "",
    val searchResults: List<MediaItem> = emptyList(),
    val isSearching: Boolean = false,
    val isGenerating: Boolean = false,
    val generatedTracks: List<MediaItem> = emptyList(),
    val generatedTitle: String = "",
    val generatedSubtitle: String = "",
    val shuffleOffset: Int = 0,
    val savedToast: String? = null
)

class CreateMixViewModel(private val container: AppContainer) : ViewModel() {

    private val _uiState = MutableStateFlow(CreateMixUiState())
    val uiState: StateFlow<CreateMixUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null
    private var moodCategories: List<MoodCategoryItem> = emptyList()
    private var fallbackPool: List<MediaItem> = emptyList()

    init {
        viewModelScope.launch {
            container.musicRepository.getMoods().onSuccess {
                moodCategories = it.groups.flatMap { g -> g.items }
            }
            val liked = container.libraryRepository.likedTracks.first()
            val history = container.libraryRepository.playHistory.first().map { it.toMediaItem() }
            fallbackPool = (liked + history).distinctBy { it.playableVideoId }
        }
    }

    fun setMode(mode: String) {
        _uiState.value = _uiState.value.copy(mode = mode)
    }

    fun setTargetCount(count: Int) {
        _uiState.value = _uiState.value.copy(targetCount = count)
    }

    fun setCustomTitle(title: String) {
        _uiState.value = _uiState.value.copy(customTitle = title)
    }

    fun addSeedTrack(track: MediaItem) {
        val current = _uiState.value.seedTracks
        if (current.size >= 3 || current.any { it.playableVideoId == track.playableVideoId }) return
        _uiState.value = _uiState.value.copy(seedTracks = current + track)
    }

    fun removeSeedTrack(videoId: String) {
        _uiState.value = _uiState.value.copy(
            seedTracks = _uiState.value.seedTracks.filterNot { it.playableVideoId == videoId }
        )
    }

    fun toggleGenre(genreLabel: String) {
        val current = _uiState.value.selectedGenres
        val updated = when {
            genreLabel in current -> current - genreLabel
            current.size < 2 -> current + genreLabel
            else -> current.drop(1) + genreLabel
        }
        _uiState.value = _uiState.value.copy(selectedGenres = updated)
    }

    fun searchSeedTracks(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        searchJob?.cancel()
        if (query.trim().length < 2) {
            _uiState.value = _uiState.value.copy(searchResults = emptyList(), isSearching = false)
            return
        }
        searchJob = viewModelScope.launch {
            delay(250L)
            _uiState.value = _uiState.value.copy(isSearching = true)
            container.musicRepository.search(query.trim(), "songs")
                .onSuccess {
                    _uiState.value = _uiState.value.copy(searchResults = it.items.take(10), isSearching = false)
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isSearching = false)
                }
        }
    }

    fun generateMix(incrementShuffle: Boolean = false) {
        val state = _uiState.value
        val offset = if (incrementShuffle) state.shuffleOffset + 1 else state.shuffleOffset
        viewModelScope.launch {
            _uiState.value = state.copy(isGenerating = true, shuffleOffset = offset, savedToast = null)
            val hidden = container.libraryRepository.hiddenTrackIds.first()
            val settings = container.settingsRepository.userSettings.value
            val tracks = container.musicRepository.generateCuratedMix(
                mode = state.mode,
                seedTracks = state.seedTracks,
                selectedGenres = state.selectedGenres,
                moodCategories = moodCategories,
                targetCount = state.targetCount,
                hiddenIds = hidden,
                excludedTasteIds = settings.excludedTasteIds.toSet(),
                hideExplicit = settings.hideExplicit,
                shuffleOffset = offset,
                fallbackPool = fallbackPool
            )
            val autoTitle = state.customTitle.trim().ifBlank {
                when (state.mode) {
                    "genre" -> "Mix ${state.selectedGenres.joinToString(" x ").ifBlank { "Genre Pilihan" }}"
                    "blend" -> "Blend: ${state.seedTracks.firstOrNull()?.title ?: "Favorit"} & ${state.selectedGenres.firstOrNull() ?: "Hits"}"
                    else -> "Mix ${state.seedTracks.firstOrNull()?.title ?: "SoundClear"}"
                }
            }
            val sub = buildString {
                if (state.seedTracks.isNotEmpty()) append(state.seedTracks.joinToString(", ") { it.primaryArtistName })
                if (state.selectedGenres.isNotEmpty()) {
                    if (isNotEmpty()) append(" • ")
                    append(state.selectedGenres.joinToString(", "))
                }
            }.ifBlank { "${tracks.size} lagu pilihan otomatis" }

            _uiState.value = _uiState.value.copy(
                isGenerating = false,
                generatedTracks = tracks,
                generatedTitle = autoTitle,
                generatedSubtitle = sub
            )
        }
    }

    fun shuffleGeneratedOrder() {
        val current = _uiState.value.generatedTracks
        if (current.size <= 1) return
        _uiState.value = _uiState.value.copy(generatedTracks = current.shuffled())
    }

    fun saveAsPlaylist(onSaved: (String) -> Unit) {
        val state = _uiState.value
        if (state.generatedTracks.isEmpty()) return
        viewModelScope.launch {
            val playlist = container.libraryRepository.createPlaylist(
                name = state.generatedTitle.ifBlank { "Mix Pilihan SoundClear" },
                description = state.generatedSubtitle,
                initialTracks = state.generatedTracks
            )
            _uiState.value = state.copy(savedToast = "Tersimpan ke Pustaka: ${playlist.name}")
            onSaved(playlist.id)
        }
    }
}
