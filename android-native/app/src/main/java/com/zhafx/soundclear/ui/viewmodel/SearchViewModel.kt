package com.zhafx.soundclear.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zhafx.soundclear.AppContainer
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.domain.AudioMath
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SearchUiState(
    val query: String = "",
    val filter: String = "all",
    val suggestions: List<String> = emptyList(),
    val recentSearches: List<String> = emptyList(),
    val results: List<MediaItem> = emptyList(),
    val topResult: MediaItem? = null,
    val relatedFollowUps: List<MediaItem> = emptyList(),
    val isSearching: Boolean = false,
    val hasSearched: Boolean = false,
    val error: String? = null
)

class SearchViewModel(private val container: AppContainer) : ViewModel() {

    private val query = MutableStateFlow("")
    private val filter = MutableStateFlow("all")
    private val suggestions = MutableStateFlow<List<String>>(emptyList())
    private val rawResults = MutableStateFlow<List<MediaItem>>(emptyList())
    private val relatedFollowUps = MutableStateFlow<List<MediaItem>>(emptyList())
    private val isSearching = MutableStateFlow(false)
    private val hasSearched = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)

    private var suggestJob: Job? = null
    private var searchJob: Job? = null

    val uiState: StateFlow<SearchUiState> = combine(
        combine(query, filter, suggestions, rawResults) { q, f, s, r -> SearchQuad(q, f, s, r) },
        combine(relatedFollowUps, isSearching, hasSearched, error) { rel, loading, searched, err ->
            SearchStatusQuad(rel, loading, searched, err)
        },
        container.libraryRepository.recentSearches,
        container.libraryRepository.hiddenTrackIds,
        container.settingsRepository.userSettings
    ) { main, status, recents, hidden, settings ->
        val filtered = AudioMath.filterPreferredFeedItems(
            main.results,
            hideExplicit = settings.hideExplicit,
            hiddenIds = hidden
        )
        val top = if (main.filter == "all") filtered.firstOrNull() else null
        val rest = if (top != null) filtered.drop(1) else filtered
        SearchUiState(
            query = main.query,
            filter = main.filter,
            suggestions = main.suggestions,
            recentSearches = recents.map { it.query },
            results = rest,
            topResult = top,
            relatedFollowUps = status.related,
            isSearching = status.isSearching,
            hasSearched = status.hasSearched,
            error = status.error
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchUiState())

    fun onQueryChanged(newQuery: String) {
        query.value = newQuery
        suggestJob?.cancel()
        if (newQuery.trim().isEmpty()) {
            suggestions.value = emptyList()
            hasSearched.value = false
            rawResults.value = emptyList()
            relatedFollowUps.value = emptyList()
            return
        }
        suggestJob = viewModelScope.launch {
            delay(220L)
            container.musicRepository.suggest(newQuery.trim()).onSuccess {
                suggestions.value = it.suggestions.take(6)
            }
        }
    }

    fun selectFilter(newFilter: String) {
        filter.value = newFilter
        val q = query.value.trim()
        if (q.isNotEmpty()) {
            executeSearch(q, newFilter)
        }
    }

    fun executeSearch(targetQuery: String = query.value, targetFilter: String = filter.value) {
        val clean = targetQuery.trim()
        if (clean.isEmpty()) return
        query.value = clean
        filter.value = targetFilter
        suggestions.value = emptyList()
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            isSearching.value = true
            hasSearched.value = true
            error.value = null
            container.libraryRepository.addRecentSearch(clean)

            container.musicRepository.search(clean, targetFilter)
                .onSuccess { res ->
                    rawResults.value = res.items
                    val firstSong = res.items.firstOrNull { it.type in setOf("song", "video") }
                    if (firstSong != null && firstSong.playableVideoId.isNotBlank()) {
                        launch {
                            container.musicRepository.getSongRelated(firstSong.playableVideoId)
                                .onSuccess { rel -> relatedFollowUps.value = rel.tracks.take(10) }
                        }
                    } else {
                        relatedFollowUps.value = emptyList()
                    }
                }
                .onFailure {
                    error.value = it.localizedMessage ?: "Pencarian gagal."
                }
            isSearching.value = false
        }
    }

    fun removeRecentSearch(q: String) {
        viewModelScope.launch { container.libraryRepository.removeRecentSearch(q) }
    }

    fun clearRecentSearches() {
        viewModelScope.launch { container.libraryRepository.clearRecentSearches() }
    }

    private data class SearchQuad(
        val query: String,
        val filter: String,
        val suggestions: List<String>,
        val results: List<MediaItem>
    )

    private data class SearchStatusQuad(
        val related: List<MediaItem>,
        val isSearching: Boolean,
        val hasSearched: Boolean,
        val error: String?
    )
}
