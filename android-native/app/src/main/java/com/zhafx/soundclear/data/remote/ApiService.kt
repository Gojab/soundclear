package com.zhafx.soundclear.data.remote

import android.net.Uri
import com.zhafx.soundclear.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONArray
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Seluruh endpoint backend SoundClear (https://soundclear-lyart.vercel.app) dikumpulkan
 * dalam satu antarmuka Retrofit + factory OkHttp & kotlinx.serialization.
 */
interface ApiService {

    @GET("api/health")
    suspend fun getHealth(): HealthResponse

    @GET("api/home")
    suspend fun getHome(
        @Query("limit") limit: Int = 10
    ): HomeResponse

    @GET("api/charts")
    suspend fun getCharts(
        @Query("country") country: String = "ID"
    ): ChartsResponse

    @GET("api/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("filter") filter: String? = null,
        @Query("limit") limit: Int = 25
    ): SearchResponse

    @GET("api/suggest")
    suspend fun suggest(
        @Query("q") query: String
    ): SuggestResponse

    @GET("api/moods")
    suspend fun getMoods(): MoodsResponse

    @GET("api/moods/{params}")
    suspend fun getMoodPlaylists(
        @Path("params") params: String,
        @Query("title") title: String? = null
    ): MoodPlaylistsResponse

    @GET("api/artist/{artistId}")
    suspend fun getArtist(
        @Path("artistId") artistId: String,
        @Query("q") fallbackQuery: String? = null
    ): ArtistDetailResponse

    @GET("api/artist/{artistId}/albums")
    suspend fun getArtistAlbums(
        @Path("artistId") artistId: String,
        @Query("params") params: String
    ): List<MediaItem>

    @GET("api/album/{albumId}")
    suspend fun getAlbum(
        @Path("albumId") albumId: String,
        @Query("q") fallbackQuery: String? = null
    ): AlbumDetailResponse

    @GET("api/playlist/{playlistId}")
    suspend fun getPlaylist(
        @Path("playlistId") playlistId: String,
        @Query("limit") limit: Int = 100,
        @Query("q") fallbackQuery: String? = null
    ): PlaylistDetailResponse

    @GET("api/watch/{videoId}")
    suspend fun getWatchPlaylist(
        @Path("videoId") videoId: String,
        @Query("radio") radio: Boolean = true,
        @Query("playlistId") playlistId: String? = null,
        @Query("limit") limit: Int = 25
    ): WatchPlaylistResponse

    @GET("api/lyrics")
    suspend fun getLyricsByQuery(
        @Query("browseId") browseId: String? = null,
        @Query("videoId") videoId: String? = null,
        @Query("title") title: String? = null,
        @Query("artist") artist: String? = null,
        @Query("album") album: String? = null,
        @Query("durationSeconds") durationSeconds: Int? = null
    ): LyricsResponse

    @GET("api/lyrics/{browseId}")
    suspend fun getLyricsByBrowseId(
        @Path("browseId") browseId: String,
        @Query("videoId") videoId: String? = null,
        @Query("title") title: String? = null,
        @Query("artist") artist: String? = null,
        @Query("album") album: String? = null,
        @Query("durationSeconds") durationSeconds: Int? = null
    ): LyricsResponse

    @GET("api/song/{videoId}/credits")
    suspend fun getSongCredits(
        @Path("videoId") videoId: String,
        @Query("albumId") albumId: String? = null,
        @Query("creditsBrowseId") creditsBrowseId: String? = null
    ): SongCreditsResponse

    @GET("api/song/{videoId}/related")
    suspend fun getSongRelated(
        @Path("videoId") videoId: String
    ): SongRelatedResponse

    @GET("api/podcast/{podcastId}")
    suspend fun getPodcast(
        @Path("podcastId") podcastId: String,
        @Query("limit") limit: Int = 100,
        @Query("q") fallbackQuery: String? = null
    ): PodcastDetailResponse

    @GET("api/episode/{videoId}")
    suspend fun getEpisode(
        @Path("videoId") videoId: String,
        @Query("q") fallbackQuery: String? = null
    ): EpisodeDetailResponse

    @GET("api/channel/{channelId}/episodes")
    suspend fun getChannelEpisodes(
        @Path("channelId") channelId: String,
        @Query("params") params: String
    ): List<MediaItem>

    @GET("api/account/status")
    suspend fun getAccountStatus(): AccountStatusResponse

    @GET("api/account/library")
    suspend fun getAccountLibrary(): AccountLibraryResponse

    @POST("api/account/rate")
    suspend fun postAccountRate(
        @Body body: RateBody
    ): SyncResponse

    @POST("api/account/playlist")
    suspend fun postAccountCreatePlaylist(
        @Body body: CreatePlaylistBody
    ): SyncResponse

    @POST("api/account/playlist/items")
    suspend fun postAccountAddPlaylistItems(
        @Body body: AddPlaylistItemsBody
    ): SyncResponse

    @POST("api/account/subscribe")
    suspend fun postAccountSubscribe(
        @Body body: SubscribeBody
    ): SyncResponse

    @GET("api/account/audio-settings")
    suspend fun getAccountAudioSettings(
        @Query("accountKey") accountKey: String? = null
    ): ServerAudioSettingsResponse

    @PUT("api/account/audio-settings")
    suspend fun putAccountAudioSettings(
        @Body body: AudioSettingsBody
    ): ServerAudioSettingsResponse

    @POST("api/account/audio-settings/reset")
    suspend fun resetAccountAudioSettings(
        @Query("accountKey") accountKey: String? = null
    ): ServerAudioSettingsResponse

    @GET("api/artwork-color")
    suspend fun getArtworkColor(
        @Query("url") url: String
    ): ArtworkColorResponse

    @GET("api/play/resolve")
    suspend fun resolvePlay(
        @Query("id") id: String,
        @Query("title") title: String = "",
        @Query("artist") artist: String = "",
        @Query("type") type: String = "song",
        @Query("durationSeconds") durationSeconds: Int? = null,
        @Query("fallback") fallback: Boolean = false,
        @Query("exclude") exclude: String? = null
    ): PlayResolveResponse

    @GET("api/stream/{videoId}/meta")
    suspend fun getStreamAudioMeta(
        @Path("videoId") videoId: String,
        @Query("title") title: String = "",
        @Query("artist") artist: String = "",
        @Query("durationSeconds") durationSeconds: Int? = null,
        @Query("quality") quality: String = "high"
    ): StreamAudioMetaResponse

    @GET("api/background/session")
    suspend fun getBackgroundSession(
        @Query("sessionId") sessionId: String = "default"
    ): BackgroundSessionResponse

    @POST("api/background/session")
    suspend fun postBackgroundSession(
        @Body payload: BackgroundSessionPayload
    ): BackgroundSessionSyncResponse

    @DELETE("api/background/session")
    suspend fun deleteBackgroundSession(
        @Query("sessionId") sessionId: String = "default"
    ): BackgroundSessionDeleteResponse
}

object SoundClearNetwork {

    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }

    val okHttpClient: OkHttpClient by lazy {
        val logger = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .addInterceptor(logger)
            .build()
    }

    fun normalizeBaseUrl(rawUrl: String?): String {
        val candidate = rawUrl?.trim().orEmpty()
            .ifBlank { BuildConfig.API_BASE_URL }
            .trimEnd('/')
        return "$candidate/"
    }

    fun createApiService(baseUrl: String = BuildConfig.API_BASE_URL): ApiService {
        val contentType = "application/json; charset=UTF-8".toMediaType()
        return Retrofit.Builder()
            .baseUrl(normalizeBaseUrl(baseUrl))
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
            .create(ApiService::class.java)
    }

    fun buildDirectStreamUrl(
        baseUrl: String,
        videoId: String,
        title: String = "",
        artist: String = "",
        durationSeconds: Int? = null,
        quality: String = "high"
    ): String {
        val normalized = normalizeBaseUrl(baseUrl)
        val encodedId = URLEncoder.encode(videoId, StandardCharsets.UTF_8.name())
        val params = buildList {
            if (title.isNotBlank()) add("title=${URLEncoder.encode(title, StandardCharsets.UTF_8.name())}")
            if (artist.isNotBlank()) add("artist=${URLEncoder.encode(artist, StandardCharsets.UTF_8.name())}")
            if (durationSeconds != null && durationSeconds > 0) add("durationSeconds=$durationSeconds")
            if (quality.isNotBlank()) add("quality=${URLEncoder.encode(quality, StandardCharsets.UTF_8.name())}")
        }
        val query = if (params.isNotEmpty()) "?${params.joinToString("&")}" else ""
        return "${normalized}api/stream/$encodedId$query"
    }
}

/**
 * Menyelesaikan sumber audio langsung untuk Media3 ExoPlayer tanpa WebView / YouTube IFrame:
 * 1. Mengecek /api/play/resolve (beserta daftar kandidat alternatif & fallback=true) dan
 *    /api/stream/{videoId}/meta pada backend SoundClear.
 * 2. Jika backend mengembalikan available=true -> pakai endpoint langsung /api/stream/{videoId}.
 * 3. Jika backend mengembalikan fallbackMode="youtube-iframe" (HTTP 403 pada server cloud),
 *    resolver mencoba mengambil URL stream audio langsung (audio/mp4, audio/webm, atau HLS .m3u8)
 *    melalui InnerTube langsung dari IP perangkat pengguna via OkHttp (tanpa iframe/WebView).
 */
class DirectStreamResolver(
    private val okHttpClient: OkHttpClient = SoundClearNetwork.okHttpClient
) {
    data class ResolvedStream(
        val uri: Uri,
        val resolvedVideoId: String,
        val codec: String,
        val bitrateKbps: Int?,
        val sampleRateHz: Int?,
        val sourceMode: String, // "backend" | "innertube"
        val userAgentHeader: String? = null,
        val originHeader: String? = null,
        val isHls: Boolean = false
    )

    private data class CachedDirectUrl(
        val url: String,
        val userAgent: String,
        val origin: String,
        val codec: String,
        val bitrateKbps: Int,
        val isHls: Boolean,
        val expiresAtMs: Long
    ) {
        fun isExpired(): Boolean = System.currentTimeMillis() >= expiresAtMs
    }

    private data class ClientProfile(
        val name: String,
        val clientId: String,
        val version: String,
        val userAgent: String,
        val origin: String
    )

    private val clientProfiles = listOf(
        ClientProfile(
            name = "ANDROID_VR",
            clientId = "28",
            version = "1.62.27",
            userAgent = "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
            origin = "https://www.youtube.com"
        ),
        ClientProfile(
            name = "IOS",
            clientId = "5",
            version = "20.10.4",
            userAgent = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
            origin = "https://www.youtube.com"
        ),
        ClientProfile(
            name = "ANDROID_MUSIC",
            clientId = "21",
            version = "7.29.52",
            userAgent = "com.google.android.apps.youtube.music/7.29.52 (Linux; U; Android 14) gzip",
            origin = "https://music.youtube.com"
        ),
        ClientProfile(
            name = "ANDROID",
            clientId = "3",
            version = "20.10.38",
            userAgent = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
            origin = "https://www.youtube.com"
        )
    )

    private val streamCache = ConcurrentHashMap<String, CachedDirectUrl>()
    @Volatile
    private var cachedVisitorData: String = ""
    @Volatile
    private var visitorDataExpiresAtMs: Long = 0L

    fun invalidateCache(videoId: String) {
        if (videoId.isNotBlank()) {
            streamCache.remove(videoId)
        }
    }

    suspend fun resolveStream(
        apiService: ApiService,
        baseUrl: String,
        track: MediaItem,
        quality: String,
        forceRefresh: Boolean = false
    ): Result<ResolvedStream> = withContext(Dispatchers.IO) {
        val rawId = track.playableVideoId.trim()
        if (rawId.isBlank()) {
            return@withContext Result.failure(IllegalArgumentException("ID trek kosong."))
        }
        if (forceRefresh) {
            streamCache.remove(rawId)
        }

        // 1. Resolusi ID kanonik & daftar kandidat melalui /api/play/resolve
        val initialResolve = runCatching {
            apiService.resolvePlay(
                id = rawId,
                title = track.title,
                artist = track.primaryArtistName,
                type = track.type,
                durationSeconds = track.durationSeconds
            )
        }.getOrNull()

        val candidateQueue = LinkedHashSet<String>().apply {
            initialResolve?.youtubeVideoId?.trim()?.takeIf { it.isNotBlank() }?.let(::add)
            initialResolve?.candidates.orEmpty().forEach { c ->
                c.trim().takeIf { it.isNotBlank() }?.let(::add)
            }
            add(rawId)
        }.toMutableList()

        val triedIds = LinkedHashSet<String>()
        var lastMetaReason: String? = null
        var primaryResolvedId = candidateQueue.firstOrNull() ?: rawId

        // 2. Uji setiap kandidat: backend /api/stream/{id}/meta -> lalu ekstraksi langsung InnerTube perangkat
        suspend fun tryCandidateList(ids: List<String>): ResolvedStream? {
            for (candId in ids) {
                if (!triedIds.add(candId)) continue
                if (forceRefresh) streamCache.remove(candId)

                val meta = runCatching {
                    apiService.getStreamAudioMeta(
                        videoId = candId,
                        title = track.title,
                        artist = track.primaryArtistName,
                        durationSeconds = track.durationSeconds,
                        quality = quality
                    )
                }.getOrNull()

                if (meta != null && meta.available) {
                    val streamUrl = SoundClearNetwork.buildDirectStreamUrl(
                        baseUrl = baseUrl,
                        videoId = candId,
                        title = track.title,
                        artist = track.primaryArtistName,
                        durationSeconds = track.durationSeconds,
                        quality = quality
                    )
                    val isHlsUrl = streamUrl.contains(".m3u8", ignoreCase = true)
                    return ResolvedStream(
                        uri = Uri.parse(streamUrl),
                        resolvedVideoId = candId,
                        codec = meta.codec,
                        bitrateKbps = meta.bitrateKbps,
                        sampleRateHz = meta.sampleRateHz,
                        sourceMode = "backend",
                        userAgentHeader = null,
                        originHeader = null,
                        isHls = isHlsUrl
                    )
                }

                if (meta?.reason?.isNotBlank() == true) {
                    lastMetaReason = meta.reason
                }

                val direct = resolveViaInnerTube(candId)
                if (direct != null) {
                    return ResolvedStream(
                        uri = Uri.parse(direct.url),
                        resolvedVideoId = candId,
                        codec = direct.codec,
                        bitrateKbps = direct.bitrateKbps,
                        sampleRateHz = 48000,
                        sourceMode = "innertube",
                        userAgentHeader = direct.userAgent,
                        originHeader = direct.origin,
                        isHls = direct.isHls
                    )
                }
            }
            return null
        }

        tryCandidateList(candidateQueue)?.let { return@withContext Result.success(it) }

        // 3. Coba kandidat fallback alternatif bila semua kandidat awal dibatasi / gagal
        if (track.title.isNotBlank()) {
            val fallbackResolve = runCatching {
                apiService.resolvePlay(
                    id = rawId,
                    title = track.title,
                    artist = track.primaryArtistName,
                    type = track.type,
                    durationSeconds = track.durationSeconds,
                    fallback = true,
                    exclude = triedIds.joinToString(",")
                )
            }.getOrNull()

            if (fallbackResolve != null) {
                val extraIds = buildList {
                    fallbackResolve.youtubeVideoId.trim().takeIf { it.isNotBlank() }?.let(::add)
                    fallbackResolve.candidates.forEach { c ->
                        c.trim().takeIf { it.isNotBlank() }?.let(::add)
                    }
                }.filter { it !in triedIds }

                if (extraIds.isNotEmpty()) {
                    primaryResolvedId = extraIds.first()
                    tryCandidateList(extraIds)?.let { return@withContext Result.success(it) }
                }
            }
        }

        val reason = lastMetaReason?.takeIf { it.isNotBlank() }
            ?: "Backend mengembalikan fallbackMode=youtube-iframe."
        Result.failure(
            IllegalStateException(
                "$reason Endpoint /api/stream/$primaryResolvedId harus mengembalikan URL/stream audio langsung (saat ini HTTP 403 / youtube-iframe dan ekstraksi InnerTube perangkat juga diblokir)."
            )
        )
    }

    private fun getVisitorData(): String {
        val now = System.currentTimeMillis()
        if (cachedVisitorData.isNotBlank() && now < visitorDataExpiresAtMs) {
            return cachedVisitorData
        }
        // 1. Coba halaman music.youtube.com (menyematkan VISITOR_DATA terbaru)
        runCatching {
            val req = Request.Builder()
                .url("https://music.youtube.com/")
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
                )
                .build()
            okHttpClient.newCall(req).execute().use { res ->
                val html = res.body?.string().orEmpty()
                val match = Regex("\"VISITOR_DATA\":\"([^\"]{10,256})\"").find(html)
                val token = match?.groupValues?.getOrNull(1).orEmpty()
                if (token.isNotBlank()) {
                    cachedVisitorData = token
                    visitorDataExpiresAtMs = now + 30L * 60L * 1000L
                    return cachedVisitorData
                }
            }
        }
        // 2. Fallback ke sw.js_data
        runCatching {
            val req = Request.Builder()
                .url("https://www.youtube.com/sw.js_data")
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36"
                )
                .build()
            okHttpClient.newCall(req).execute().use { res ->
                val raw = res.body?.string().orEmpty()
                val idx = raw.indexOf("\"Cg")
                if (idx >= 0) {
                    val end = raw.indexOf('"', idx + 1)
                    if (end > idx + 3) {
                        val candidate = raw.substring(idx + 1, end)
                        if (candidate.length in 10..256) {
                            cachedVisitorData = candidate
                            visitorDataExpiresAtMs = now + 30L * 60L * 1000L
                        }
                    }
                }
            }
        }
        return cachedVisitorData
    }

    private fun resolveViaInnerTube(videoId: String): CachedDirectUrl? {
        streamCache[videoId]?.takeUnless { it.isExpired() }?.let { return it }

        val visitorData = getVisitorData()
        val jsonMediaType = "application/json; charset=utf-8".toMediaType()

        for (profile in clientProfiles) {
            val found = runCatching {
                val clientJson = JSONObject().apply {
                    put("clientName", profile.name)
                    put("clientVersion", profile.version)
                    put("hl", "id")
                    put("gl", "ID")
                    if (visitorData.isNotBlank()) put("visitorData", visitorData)
                    when {
                        profile.name == "ANDROID_VR" -> {
                            put("androidSdkVersion", 32)
                            put("deviceMake", "Oculus")
                            put("deviceModel", "Quest 3")
                            put("osName", "Android")
                            put("osVersion", "12L")
                        }
                        profile.name.startsWith("ANDROID") -> {
                            put("androidSdkVersion", 34)
                        }
                        profile.name == "IOS" -> {
                            put("deviceMake", "Apple")
                            put("deviceModel", "iPhone16,2")
                            put("osName", "iPhone")
                            put("osVersion", "18.3.2.22D82")
                        }
                    }
                }
                val payload = JSONObject().apply {
                    put("context", JSONObject().put("client", clientJson))
                    put("videoId", videoId)
                    put("contentCheckOk", true)
                    put("racyCheckOk", true)
                }

                val reqBuilder = Request.Builder()
                    .url("${profile.origin}/youtubei/v1/player?prettyPrint=false")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .header("Content-Type", "application/json")
                    .header("Origin", profile.origin)
                    .header("Referer", "${profile.origin}/")
                    .header("User-Agent", profile.userAgent)
                    .header("X-YouTube-Client-Name", profile.clientId)
                    .header("X-YouTube-Client-Version", profile.version)
                if (visitorData.isNotBlank()) {
                    reqBuilder.header("X-Goog-Visitor-Id", visitorData)
                }

                okHttpClient.newCall(reqBuilder.build()).execute().use { res ->
                    if (!res.isSuccessful) return@runCatching null
                    val bodyStr = res.body?.string().orEmpty()
                    if (bodyStr.isBlank()) return@runCatching null
                    val json = JSONObject(bodyStr)
                    val playability = json.optJSONObject("playabilityStatus")
                    if (playability != null && playability.optString("status") != "OK") {
                        return@runCatching null
                    }
                    val streamingData = json.optJSONObject("streamingData") ?: return@runCatching null
                    val candidates = mutableListOf<JSONObject>()
                    collectArray(streamingData.optJSONArray("adaptiveFormats"), candidates)
                    collectArray(streamingData.optJSONArray("formats"), candidates)

                    val audioOnly = candidates.filter { fmt ->
                        fmt.optString("url").isNotBlank() && fmt.optString("mimeType").startsWith("audio/")
                    }.sortedWith(
                        compareByDescending<JSONObject> { it.optString("mimeType").contains("mp4a") }
                            .thenByDescending { it.optInt("bitrate", 0) }
                    )

                    val best = audioOnly.firstOrNull()
                        ?: candidates.firstOrNull { it.optString("url").isNotBlank() }

                    if (best != null) {
                        val streamUrl = best.optString("url")
                        if (streamUrl.isNotBlank()) {
                            val rawMime = best.optString("mimeType", "audio/mp4")
                            val codec = when {
                                rawMime.contains("opus") -> "Opus"
                                rawMime.contains("mp4a") -> "AAC"
                                else -> "M4A"
                            }
                            val bitrateKbps = (best.optInt("bitrate", 128_000) / 1000).coerceAtLeast(64)
                            return@runCatching CachedDirectUrl(
                                url = streamUrl,
                                userAgent = profile.userAgent,
                                origin = profile.origin,
                                codec = codec,
                                bitrateKbps = bitrateKbps,
                                isHls = streamUrl.contains(".m3u8", ignoreCase = true),
                                expiresAtMs = System.currentTimeMillis() + 90L * 60L * 1000L
                            )
                        }
                    }

                    // Fallback HLS manifest (sering tersedia di klien IOS)
                    val hlsUrl = streamingData.optString("hlsManifestUrl")
                    if (hlsUrl.isNotBlank()) {
                        return@runCatching CachedDirectUrl(
                            url = hlsUrl,
                            userAgent = profile.userAgent,
                            origin = profile.origin,
                            codec = "HLS AAC",
                            bitrateKbps = 128,
                            isHls = true,
                            expiresAtMs = System.currentTimeMillis() + 60L * 60L * 1000L
                        )
                    }
                    null
                }
            }.getOrNull()

            if (found != null) {
                streamCache[videoId] = found
                return found
            }
        }
        return null
    }

    private fun collectArray(arr: JSONArray?, out: MutableList<JSONObject>) {
        if (arr == null) return
        for (i in 0 until arr.length()) {
            arr.optJSONObject(i)?.let(out::add)
        }
    }
}
