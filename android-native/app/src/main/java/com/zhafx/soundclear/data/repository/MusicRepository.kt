package com.zhafx.soundclear.data.repository

import com.zhafx.soundclear.data.remote.AccountLibraryResponse
import com.zhafx.soundclear.data.remote.AccountStatusResponse
import com.zhafx.soundclear.data.remote.AlbumDetailResponse
import com.zhafx.soundclear.data.remote.ApiService
import com.zhafx.soundclear.data.remote.ArtistDetailResponse
import com.zhafx.soundclear.data.remote.ArtworkColorResponse
import com.zhafx.soundclear.data.remote.ChartsResponse
import com.zhafx.soundclear.data.remote.EpisodeDetailResponse
import com.zhafx.soundclear.data.remote.HomeResponse
import com.zhafx.soundclear.data.remote.LyricsResponse
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.MoodCategoryItem
import com.zhafx.soundclear.data.remote.MoodPlaylistsResponse
import com.zhafx.soundclear.data.remote.MoodsResponse
import com.zhafx.soundclear.data.remote.PlaylistDetailResponse
import com.zhafx.soundclear.data.remote.PodcastDetailResponse
import com.zhafx.soundclear.data.remote.SearchResponse
import com.zhafx.soundclear.data.remote.SongCreditsResponse
import com.zhafx.soundclear.data.remote.SongRelatedResponse
import com.zhafx.soundclear.data.remote.SuggestResponse
import com.zhafx.soundclear.data.remote.WatchPlaylistResponse
import com.zhafx.soundclear.domain.MixCurator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext

class MusicRepository(
    private val settingsRepository: SettingsRepository
) {
    private val api: ApiService
        get() = settingsRepository.getApiService()

    suspend fun getHome(limit: Int = 10): Result<HomeResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getHome(limit) }
    }

    suspend fun getCharts(country: String = "ID"): Result<ChartsResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getCharts(country) }
    }

    suspend fun getMoods(): Result<MoodsResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getMoods() }
    }

    suspend fun getMoodPlaylists(params: String, title: String? = null): Result<MoodPlaylistsResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getMoodPlaylists(params, title) }
        }

    suspend fun search(query: String, filter: String? = null): Result<SearchResponse> =
        withContext(Dispatchers.IO) {
            val cleanFilter = filter?.takeIf { it != "all" }
            runCatching { api.search(query = query, filter = cleanFilter) }
        }

    suspend fun suggest(query: String): Result<SuggestResponse> = withContext(Dispatchers.IO) {
        runCatching { api.suggest(query) }
    }

    suspend fun getArtist(id: String, fallbackQuery: String? = null): Result<ArtistDetailResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getArtist(id, fallbackQuery) }
        }

    suspend fun getArtistAlbums(id: String, params: String): Result<List<MediaItem>> =
        withContext(Dispatchers.IO) {
            runCatching { api.getArtistAlbums(id, params) }
        }

    suspend fun getAlbum(id: String, fallbackQuery: String? = null): Result<AlbumDetailResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getAlbum(id, fallbackQuery) }
        }

    suspend fun getPlaylist(id: String, fallbackQuery: String? = null): Result<PlaylistDetailResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getPlaylist(id, fallbackQuery = fallbackQuery) }
        }

    suspend fun getPodcast(id: String, fallbackQuery: String? = null): Result<PodcastDetailResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getPodcast(id, fallbackQuery = fallbackQuery) }
        }

    suspend fun getEpisode(id: String, fallbackQuery: String? = null): Result<EpisodeDetailResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getEpisode(id, fallbackQuery = fallbackQuery) }
        }

    suspend fun getWatchPlaylist(videoId: String, radio: Boolean = true, playlistId: String? = null): Result<WatchPlaylistResponse> =
        withContext(Dispatchers.IO) {
            runCatching { api.getWatchPlaylist(videoId, radio, playlistId) }
        }

    suspend fun getLyrics(track: MediaItem): Result<LyricsResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val browseId = track.browseId?.takeIf { it.isNotBlank() }
            if (browseId != null) {
                api.getLyricsByBrowseId(
                    browseId = browseId,
                    videoId = track.playableVideoId,
                    title = track.title,
                    artist = track.primaryArtistName,
                    album = track.album?.name,
                    durationSeconds = track.durationSeconds
                )
            } else {
                api.getLyricsByQuery(
                    browseId = "",
                    videoId = track.playableVideoId,
                    title = track.title,
                    artist = track.primaryArtistName,
                    album = track.album?.name,
                    durationSeconds = track.durationSeconds
                )
            }
        }
    }

    suspend fun getSongCredits(track: MediaItem): Result<SongCreditsResponse> = withContext(Dispatchers.IO) {
        runCatching {
            api.getSongCredits(
                videoId = track.playableVideoId,
                albumId = track.album?.id,
                creditsBrowseId = track.creditsBrowseId
            )
        }
    }

    suspend fun getSongRelated(videoId: String): Result<SongRelatedResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getSongRelated(videoId) }
    }

    suspend fun getArtworkColor(url: String): Result<ArtworkColorResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getArtworkColor(url) }
    }

    suspend fun getAccountStatus(): Result<AccountStatusResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getAccountStatus() }
    }

    suspend fun getAccountLibrary(): Result<AccountLibraryResponse> = withContext(Dispatchers.IO) {
        runCatching { api.getAccountLibrary() }
    }

    suspend fun generateCuratedMix(
        mode: String, // "track" | "genre" | "blend"
        seedTracks: List<MediaItem>,
        selectedGenres: List<String>,
        moodCategories: List<MoodCategoryItem>,
        targetCount: Int,
        hiddenIds: Set<String>,
        excludedTasteIds: Set<String>,
        hideExplicit: Boolean,
        shuffleOffset: Int,
        fallbackPool: List<MediaItem>
    ): List<MediaItem> = withContext(Dispatchers.IO) {
        val tasks = mutableListOf<kotlinx.coroutines.Deferred<List<MediaItem>>>()

        if (mode == "track" || mode == "blend") {
            seedTracks.take(3).forEach { seed ->
                val vid = seed.playableVideoId
                if (vid.isNotBlank()) {
                    tasks += async { runCatching { api.getWatchPlaylist(vid, true, seed.playlistId).tracks }.getOrDefault(emptyList()) }
                    tasks += async { runCatching { api.getSongRelated(vid).tracks }.getOrDefault(emptyList()) }
                }
                val artist = seed.primaryArtistName
                if (artist.isNotBlank() && artist != "Artis tidak diketahui") {
                    tasks += async { runCatching { api.search(artist, "songs").items }.getOrDefault(emptyList()) }
                }
            }
        }

        if (mode == "genre" || mode == "blend") {
            selectedGenres.take(2).forEach { genreLabel ->
                val curated = MixCurator.CURATED_MIX_GENRES.find {
                    it.label.equals(genreLabel, true) || it.id.equals(genreLabel, true)
                }
                val q = curated?.searchQuery ?: "$genreLabel hits songs"
                tasks += async { runCatching { api.search(q, "songs").items }.getOrDefault(emptyList()) }

                val matchedMood = MixCurator.findMatchingMood(genreLabel, moodCategories)
                if (matchedMood != null) {
                    tasks += async {
                        runCatching {
                            val playlists = api.getMoodPlaylists(matchedMood.params, matchedMood.title).playlists
                            val first = playlists.firstOrNull() ?: return@runCatching emptyList()
                            val pid = first.playlistId ?: first.id
                            if (pid.isBlank()) return@runCatching emptyList()
                            api.getPlaylist(pid, fallbackQuery = first.title).tracks
                        }.getOrDefault(emptyList())
                    }
                }
            }
        }

        val buckets = tasks.awaitAll().filter { it.isNotEmpty() }.toMutableList()
        if (fallbackPool.isNotEmpty()) {
            buckets += fallbackPool
        }

        MixCurator.curateCustomMixTracks(
            seedTracks = if (mode == "genre") emptyList() else seedTracks,
            buckets = buckets,
            targetCount = targetCount,
            hiddenIds = hiddenIds,
            excludedTasteIds = excludedTasteIds,
            hideExplicit = hideExplicit,
            shuffleOffset = shuffleOffset
        )
    }
}
