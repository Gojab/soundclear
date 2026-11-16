package com.zhafx.soundclear.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ArtistRef(
    val id: String? = null,
    val name: String = ""
)

@Serializable
data class AlbumRef(
    val id: String? = null,
    val name: String = ""
)

@Serializable
data class MediaItem(
    val id: String = "",
    val title: String = "",
    val artists: List<ArtistRef> = emptyList(),
    val album: AlbumRef? = null,
    val duration: String? = null,
    val durationSeconds: Int? = null,
    val thumbnail: String? = null,
    val type: String = "song", // song | video | album | artist | playlist | podcast | episode | local
    val year: String? = null,
    val views: String? = null,
    val isExplicit: Boolean = false,
    val playlistId: String? = null,
    val videoId: String? = null,
    val browseId: String? = null,
    val description: String? = null,
    val published: String? = null,
    val podcastId: String? = null,
    val creditsBrowseId: String? = null,
    val genre: String? = null,
    val localFileId: String? = null,
    val localUri: String? = null
) {
    val playableVideoId: String
        get() = videoId?.takeIf { it.isNotBlank() } ?: id

    val primaryArtistName: String
        get() = artists.joinToString(", ") { it.name }.ifBlank { "Artis tidak diketahui" }

    fun displayThumbnail(dataSaver: Boolean = false): String? {
        val raw = thumbnail?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val sizeParam = if (dataSaver) "=w120-h120-l90-rj" else "=w544-h544-l90-rj"
        return if (raw.contains("googleusercontent.com") || raw.contains("ggpht.com")) {
            val base = raw.replace(Regex("=[wh]\\d+[^&?]*"), "")
            "$base$sizeParam"
        } else {
            raw
        }
    }
}

@Serializable
data class HomeSection(
    val title: String = "",
    val items: List<MediaItem> = emptyList()
)

@Serializable
data class HomeResponse(
    val sections: List<HomeSection> = emptyList()
)

@Serializable
data class ChartsResponse(
    val country: String = "ID",
    val songs: List<MediaItem> = emptyList(),
    val videos: List<MediaItem> = emptyList(),
    val artists: List<MediaItem> = emptyList(),
    val trending: List<MediaItem> = emptyList()
)

@Serializable
data class MoodCategoryItem(
    val title: String = "",
    val params: String = ""
)

@Serializable
data class MoodCategoryGroup(
    val title: String = "",
    val items: List<MoodCategoryItem> = emptyList()
)

@Serializable
data class MoodsResponse(
    val groups: List<MoodCategoryGroup> = emptyList()
)

@Serializable
data class MoodPlaylistsResponse(
    val params: String = "",
    val playlists: List<MediaItem> = emptyList()
)

@Serializable
data class SearchResponse(
    val query: String = "",
    val filter: String? = null,
    val items: List<MediaItem> = emptyList()
)

@Serializable
data class SuggestResponse(
    val query: String = "",
    val suggestions: List<String> = emptyList()
)

@Serializable
data class SongCredit(
    val role: String = "",
    val names: List<String> = emptyList()
)

@Serializable
data class ArtistDetailResponse(
    val id: String = "",
    val name: String = "",
    val description: String? = null,
    val subscribers: String? = null,
    val views: String? = null,
    val thumbnail: String? = null,
    val shuffleId: String? = null,
    val radioId: String? = null,
    val songs: List<MediaItem> = emptyList(),
    val albums: List<MediaItem> = emptyList(),
    val singles: List<MediaItem> = emptyList(),
    val compilations: List<MediaItem> = emptyList(),
    val appearsOn: List<MediaItem> = emptyList(),
    val videos: List<MediaItem> = emptyList(),
    val related: List<MediaItem> = emptyList()
)

@Serializable
data class AlbumDetailResponse(
    val id: String = "",
    val title: String = "",
    val artists: List<ArtistRef> = emptyList(),
    val year: String? = null,
    val trackCount: Int? = null,
    val duration: String? = null,
    val description: String? = null,
    val thumbnail: String? = null,
    val audioPlaylistId: String? = null,
    val credits: List<SongCredit> = emptyList(),
    val moreFromArtist: List<MediaItem> = emptyList(),
    val tracks: List<MediaItem> = emptyList()
)

@Serializable
data class PlaylistDetailResponse(
    val id: String = "",
    val title: String = "",
    val author: String? = null,
    val description: String? = null,
    val year: String? = null,
    val trackCount: Int? = null,
    val duration: String? = null,
    val thumbnail: String? = null,
    val tracks: List<MediaItem> = emptyList()
)

@Serializable
data class WatchPlaylistResponse(
    val videoId: String = "",
    val playlistId: String? = null,
    val lyricsBrowseId: String? = null,
    val relatedBrowseId: String? = null,
    val tracks: List<MediaItem> = emptyList()
)

@Serializable
data class LyricLine(
    val text: String = "",
    val startTimeMs: Long = 0L,
    val endTimeMs: Long = 0L
)

@Serializable
data class LyricsResponse(
    val browseId: String = "",
    val hasTimestamps: Boolean = false,
    val source: String? = null,
    val lines: List<LyricLine> = emptyList(),
    val plainText: String? = null
)

@Serializable
data class SongCreditsResponse(
    val videoId: String = "",
    val title: String = "",
    val credits: List<SongCredit> = emptyList()
)

@Serializable
data class SongRelatedResponse(
    val videoId: String = "",
    val tracks: List<MediaItem> = emptyList(),
    val playlists: List<MediaItem> = emptyList(),
    val artists: List<MediaItem> = emptyList()
)

@Serializable
data class PodcastEpisode(
    val id: String = "",
    val videoId: String = "",
    val title: String = "",
    val description: String? = null,
    val duration: String? = null,
    val durationSeconds: Int? = null,
    val published: String? = null,
    val thumbnail: String? = null,
    val podcastId: String? = null,
    val podcastTitle: String? = null
) {
    fun toMediaItem(fallbackAuthor: String? = null): MediaItem = MediaItem(
        id = id.ifBlank { videoId },
        videoId = videoId.ifBlank { id },
        title = title,
        artists = listOfNotNull(
            (podcastTitle ?: fallbackAuthor)?.takeIf { it.isNotBlank() }?.let { ArtistRef(id = podcastId, name = it) }
        ),
        duration = duration,
        durationSeconds = durationSeconds,
        thumbnail = thumbnail,
        type = "episode",
        description = description,
        published = published,
        podcastId = podcastId
    )
}

@Serializable
data class PodcastDetailResponse(
    val id: String = "",
    val title: String = "",
    val author: String? = null,
    val authorId: String? = null,
    val description: String? = null,
    val thumbnail: String? = null,
    val episodes: List<PodcastEpisode> = emptyList()
)

@Serializable
data class EpisodeDetailResponse(
    val id: String = "",
    val videoId: String = "",
    val title: String = "",
    val description: String? = null,
    val duration: String? = null,
    val durationSeconds: Int? = null,
    val published: String? = null,
    val thumbnail: String? = null,
    val podcastId: String? = null,
    val podcastTitle: String? = null,
    val author: String? = null,
    val authorId: String? = null
) {
    fun toMediaItem(): MediaItem = MediaItem(
        id = id.ifBlank { videoId },
        videoId = videoId.ifBlank { id },
        title = title,
        artists = listOfNotNull(
            (author ?: podcastTitle)?.takeIf { it.isNotBlank() }?.let { ArtistRef(id = authorId ?: podcastId, name = it) }
        ),
        duration = duration,
        durationSeconds = durationSeconds,
        thumbnail = thumbnail,
        type = "episode",
        description = description,
        published = published,
        podcastId = podcastId
    )
}

@Serializable
data class ArtworkColorResponse(
    val r: Int = 10,
    val g: Int = 211,
    val b: Int = 108,
    val hex: String = "#0AD36C"
)

@Serializable
data class HealthResponse(
    val status: String = "ok",
    val service: String = "soundclear",
    val provider: String = "soundclear-cloud",
    val copyrightOwner: String? = null,
    val copyrightProtected: Boolean = true,
    val copyrightValid: Boolean = true,
    val backgroundWorkerRunning: Boolean = false,
    val backgroundActiveSessions: Int = 0
)

@Serializable
data class AccountStatusResponse(
    val authenticated: Boolean = false,
    val mode: String = "local",
    val message: String = ""
)

@Serializable
data class AccountLibraryResponse(
    val likedSongs: List<MediaItem> = emptyList(),
    val playlists: List<MediaItem> = emptyList(),
    val albums: List<MediaItem> = emptyList(),
    val artists: List<MediaItem> = emptyList(),
    val subscriptions: List<MediaItem> = emptyList(),
    val history: List<MediaItem> = emptyList()
)

@Serializable
data class RateBody(
    val videoId: String,
    val rating: String = "LIKE"
)

@Serializable
data class CreatePlaylistBody(
    val title: String,
    val description: String = "",
    val videoIds: List<String> = emptyList()
)

@Serializable
data class AddPlaylistItemsBody(
    val playlistId: String,
    val videoIds: List<String> = emptyList()
)

@Serializable
data class SubscribeBody(
    val channelIds: List<String>,
    val subscribe: Boolean = true
)

@Serializable
data class SyncResponse(
    val synced: Boolean = false,
    val playlistId: String? = null
)

@Serializable
data class PlayResolveResponse(
    val id: String = "",
    val youtubeVideoId: String = "",
    val candidates: List<String> = emptyList()
)

@Serializable
data class StreamAudioMetaResponse(
    val trackId: String = "",
    val available: Boolean = false,
    val fallbackMode: String? = null,
    val reason: String? = null,
    val codec: String = "AAC",
    val bitrateKbps: Int? = null,
    val sampleRateHz: Int? = null,
    val ext: String = "mp4",
    val mimeType: String = "audio/mp4",
    val source: String = "SoundClear Cloud",
    val tier: String = "high",
    val cacheReady: Boolean = false
)

@Serializable
data class AudioSettingsBody(
    val accountKey: String? = null,
    val settings: JsonObject
)

@Serializable
data class ServerAudioSettingsResponse(
    val accountKey: String = "local",
    val settings: JsonObject? = null
)

@Serializable
data class BackgroundSessionPayload(
    val sessionId: String = "default",
    val updatedAtMs: Long = 0L,
    val isPlaying: Boolean = false,
    val currentTime: Double = 0.0,
    val duration: Double = 0.0,
    val playbackRate: Float = 1f,
    val repeat: String = "off",
    val shuffle: Boolean = false,
    val sourceLabel: String? = null,
    val quality: String? = "high",
    val currentTrack: MediaItem? = null,
    val manualQueue: List<MediaItem> = emptyList(),
    val sourceQueue: List<MediaItem> = emptyList(),
    val historyStack: List<MediaItem> = emptyList()
)

@Serializable
data class BackgroundSessionResponse(
    val sessionId: String = "default",
    val found: Boolean = false,
    val session: BackgroundSessionPayload? = null
)

@Serializable
data class BackgroundSessionSyncResponse(
    val synced: Boolean = false,
    val sessionId: String = "default",
    val updatedAtMs: Long = 0L,
    val isPlaying: Boolean = false
)

@Serializable
data class BackgroundSessionDeleteResponse(
    val deleted: Boolean = false,
    val sessionId: String = "default"
)

// ===== Settings, Local & Mix Models =====

@Serializable
data class PlaylistMixSettings(
    val enabled: Boolean = false,
    val durationSeconds: Int = 6,
    val transitionStyle: String = "bass-swap", // smooth | bass-swap | filter-sweep | cut
    val beatMatch: Boolean = true,
    val eqBlend: Boolean = true,
    val volumeCurve: String = "equal-power" // equal-power | s-curve | linear
)

@Serializable
data class EqPreset(
    val id: String = "flat",
    val name: String = "Datar (Flat)",
    val preampDb: Float = 0f,
    val bands: List<Float> = listOf(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f),
    val isCustom: Boolean = false
)

@Serializable
data class LocalAudioProfile(
    val wifiQuality: String = "auto",
    val cellularQuality: String = "normal",
    val autoAdjustQuality: Boolean = true,
    val downloadQuality: String = "high",
    val eqEnabled: Boolean = false,
    val presetId: String = "flat",
    val preampDb: Float = 0f,
    val bands: List<Float> = listOf(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f),
    val customPresets: List<EqPreset> = emptyList(),
    val bassBoostEnabled: Boolean = false,
    val bassBoostLevel: Int = 0,
    val stereoWidenerEnabled: Boolean = false,
    val stereoWidenerLevel: Int = 0,
    val normalizationTarget: String = "off", // off | quiet | normal | loud
    val useReplayGain: Boolean = true,
    val limiterEnabled: Boolean = true,
    val monoAudio: Boolean = false,
    val balance: Float = 0f,
    val outputDeviceId: String = "",
    val directMode: Boolean = false,
    val crossfadeEnabled: Boolean = true,
    val crossfadeSeconds: Int = 5,
    val gaplessPlayback: Boolean = true,
    val fadeOnPlayPause: Boolean = true,
    val skipSilence: Boolean = false,
    val djMix: PlaylistMixSettings = PlaylistMixSettings()
)

@Serializable
data class YouTubeSoundSettings(
    val maxVolumeLimit: Int = 100,
    val startupVolumeMode: String = "last", // last | fixed
    val startupFixedVolume: Int = 75,
    val defaultPlaybackRate: Float = 1f,
    val trackFadeSeconds: Int = 5,
    val fadeOnPauseResume: Boolean = true,
    val fadeOutOnSleepTimer: Boolean = true,
    val resumeLastPosition: Boolean = true,
    val autoStartOnOpen: Boolean = false
)

@Serializable
data class CustomBackgroundSettings(
    val mode: String = "default", // default | preset | ambient | color | gradient | image
    val presetId: String = "emerald-velvet",
    val solidColor: String = "#0B1612",
    val gradientFrom: String = "#0C3B28",
    val gradientTo: String = "#060908",
    val gradientAngle: Int = 145,
    val customImageUri: String? = null,
    val customImageName: String? = null,
    val blurPx: Int = 18,
    val dimOpacity: Float = 0.62f,
    val panelGlass: Boolean = true
)

@Serializable
data class UserSettings(
    val hideExplicit: Boolean = false,
    val autoplay: Boolean = true,
    val dataSaver: Boolean = false,
    val lyricsPreviewEnabled: Boolean = true,
    val homeSectionOrder: List<String> = listOf(
        "continue",
        "daily_mix",
        "frequent",
        "artist_releases",
        "for_you_mix",
        "charts",
        "home_feed",
        "moods"
    ),
    val excludedTasteIds: List<String> = emptyList(),
    val youtubeSound: YouTubeSoundSettings = YouTubeSoundSettings(),
    val episodePlaybackRates: Map<String, Float> = emptyMap(),
    val customBackground: CustomBackgroundSettings = CustomBackgroundSettings()
)

@Serializable
data class DailyMixSummary(
    val id: String,
    val mixNumber: Int,
    val title: String,
    val subtitle: String,
    val description: String,
    val accentHex: String,
    val coverUrl: String? = null,
    val secondaryArt: List<String> = emptyList(),
    val tracks: List<MediaItem> = emptyList()
)

@Serializable
data class ActiveStreamMeta(
    val trackId: String = "",
    val resolvedVideoId: String? = null,
    val requestedTier: String = "high",
    val actualTier: String = "high",
    val codec: String = "AAC",
    val bitrateKbps: Int? = 160,
    val sampleRateHz: Int? = 44100,
    val sourceMode: String = "backend", // backend | innertube | offline | local
    val cacheReady: Boolean = false
)
