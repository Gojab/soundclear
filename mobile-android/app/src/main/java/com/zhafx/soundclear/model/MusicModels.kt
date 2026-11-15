package com.zhafx.soundclear.model

enum class AppTab(val label: String) {
    HOME("Beranda"),
    SEARCH("Cari"),
    LIBRARY("Pustaka"),
    DSP("Audio & Info")
}

enum class SearchFilterType(val label: String, val ytParams: String?) {
    ALL("Semua", null),
    SONGS("Lagu", "EgWKAQIIAWoMEAMQBBAJEAoQBRAV"),
    VIDEOS("Video", "EgWKAQIQAWoMEAMQBBAJEAoQBRAV")
}

enum class RepeatModeState {
    OFF,
    ALL,
    ONE
}

data class TrackItem(
    val id: String,
    val videoId: String,
    val title: String,
    val artist: String,
    val album: String? = null,
    val durationText: String? = null,
    val durationSeconds: Int? = null,
    val thumbnailUrl: String? = null,
    val localUri: String? = null,
    val isLocal: Boolean = false
)

data class HomeSection(
    val title: String,
    val subtitle: String? = null,
    val items: List<TrackItem>
)

data class LyricLine(
    val timeMs: Long,
    val text: String
)

data class LyricsData(
    val synced: Boolean = false,
    val lines: List<LyricLine> = emptyList(),
    val plainText: String? = null,
    val source: String = "LRCLIB"
)

data class EqBandState(
    val index: Int,
    val centerFreqHz: Int,
    val label: String,
    val levelMb: Int
)

data class ResolvedStream(
    val url: String,
    val userAgent: String,
    val mimeType: String,
    val bitrateKbps: Int
)

data class PlayerUiState(
    val currentTrack: TrackItem? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val currentPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val queue: List<TrackItem> = emptyList(),
    val shuffleEnabled: Boolean = false,
    val repeatMode: RepeatModeState = RepeatModeState.OFF,
    val errorMessage: String? = null,
    val streamInfoLabel: String? = null
)
