package com.zhafx.soundclear.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zhafx.soundclear.AppContainer
import com.zhafx.soundclear.data.remote.ChartsResponse
import com.zhafx.soundclear.data.remote.DailyMixSummary
import com.zhafx.soundclear.data.remote.HomeSection
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.MoodCategoryItem
import com.zhafx.soundclear.domain.AudioMath
import com.zhafx.soundclear.domain.MixCurator
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar

data class HomeUiState(
    val selectedCategory: String = "all", // all | music | podcast | local
    val greeting: String = AudioMath.getGreetingByHour(Calendar.getInstance().get(Calendar.HOUR_OF_DAY)),
    val isLoading: Boolean = true,
    val error: String? = null,
    val sections: List<HomeSection> = emptyList(),
    val charts: ChartsResponse? = null,
    val moodHighlights: List<MoodCategoryItem> = emptyList(),
    val dailyMixes: List<DailyMixSummary> = emptyList(),
    val recentTracks: List<MediaItem> = emptyList(),
    val frequentTracks: List<MediaItem> = emptyList(),
    val localTracks: List<MediaItem> = emptyList(),
    val homeSectionOrder: List<String> = emptyList()
)

class HomeViewModel(private val container: AppContainer) : ViewModel() {

    private val selectedCategory = MutableStateFlow("all")
    private val isLoading = MutableStateFlow(true)
    private val error = MutableStateFlow<String?>(null)
    private val rawSections = MutableStateFlow<List<HomeSection>>(emptyList())
    private val charts = MutableStateFlow<ChartsResponse?>(null)
    private val moodHighlights = MutableStateFlow<List<MoodCategoryItem>>(emptyList())

    private val localAndFeedCombined = combine(
        container.libraryRepository.likedTracks,
        container.libraryRepository.playHistory,
        container.libraryRepository.localAudioFiles,
        container.libraryRepository.hiddenTrackIds,
        container.settingsRepository.userSettings
    ) { liked, history, locals, hiddenIds, settings ->
        HomeLocalTuple(liked, history, locals, hiddenIds, settings)
    }

    val uiState: StateFlow<HomeUiState> = combine(
        selectedCategory,
        isLoading,
        error,
        combine(rawSections, charts, moodHighlights) { s, c, m -> Triple(s, c, m) },
        localAndFeedCombined
    ) { cat, loading, err, remoteTuple, localTuple ->
        val (sectionsRaw, chartRes, moods) = remoteTuple
        val hideExplicit = localTuple.settings.hideExplicit
        val hiddenSet = localTuple.hiddenIds + localTuple.settings.excludedTasteIds.toSet()

        val cleanedSections = sectionsRaw.map { sec ->
            sec.copy(items = AudioMath.filterPreferredFeedItems(sec.items, hideExplicit, hiddenSet))
        }.filter { it.items.isNotEmpty() }

        val historyTracks = localTuple.history.map { it.toMediaItem() }.distinctBy { it.playableVideoId }
        val freqTracks = localTuple.history
            .groupBy { it.trackId }
            .entries
            .sortedByDescending { it.value.size }
            .mapNotNull { it.value.firstOrNull()?.toMediaItem() }
            .take(12)

        val homeSongs = cleanedSections.flatMap { it.items }.filter { it.type in setOf("song", "video") }
        val chartSongs = chartRes?.songs.orEmpty()
        val mixes = MixCurator.buildDailyMixes(
            likedTracks = localTuple.liked,
            historyTracks = historyTracks,
            homeFeedTracks = homeSongs,
            chartSongs = chartSongs
        )

        HomeUiState(
            selectedCategory = cat,
            greeting = AudioMath.getGreetingByHour(Calendar.getInstance().get(Calendar.HOUR_OF_DAY)),
            isLoading = loading,
            error = err,
            sections = cleanedSections,
            charts = chartRes,
            moodHighlights = moods.take(10),
            dailyMixes = mixes,
            recentTracks = historyTracks.take(12),
            frequentTracks = freqTracks,
            localTracks = localTuple.locals.map { it.toMediaItem() },
            homeSectionOrder = localTuple.settings.homeSectionOrder
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HomeUiState())

    init {
        refresh()
    }

    fun selectCategory(cat: String) {
        selectedCategory.value = cat
    }

    fun refresh() {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            val homeJob = async { container.musicRepository.getHome(10) }
            val chartsJob = async { container.musicRepository.getCharts("ID") }
            val moodsJob = async { container.musicRepository.getMoods() }

            val homeRes = homeJob.await()
            val chartsRes = chartsJob.await()
            val moodsRes = moodsJob.await()

            homeRes.onSuccess { rawSections.value = it.sections }
            chartsRes.onSuccess { charts.value = it }
            moodsRes.onSuccess { resp ->
                moodHighlights.value = resp.groups.flatMap { it.items }
            }

            if (homeRes.isFailure && chartsRes.isFailure) {
                error.value = homeRes.exceptionOrNull()?.localizedMessage
                    ?: "Gagal memuat beranda SoundClear."
            }
            isLoading.value = false
        }
    }

    private data class HomeLocalTuple(
        val liked: List<MediaItem>,
        val history: List<com.zhafx.soundclear.data.local.PlayHistoryEntity>,
        val locals: List<com.zhafx.soundclear.data.local.LocalAudioFileEntity>,
        val hiddenIds: Set<String>,
        val settings: com.zhafx.soundclear.data.remote.UserSettings
    )
}
