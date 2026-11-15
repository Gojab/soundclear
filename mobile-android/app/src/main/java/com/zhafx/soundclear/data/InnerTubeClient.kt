package com.zhafx.soundclear.data

import com.zhafx.soundclear.model.HomeSection
import com.zhafx.soundclear.model.ResolvedStream
import com.zhafx.soundclear.model.SearchFilterType
import com.zhafx.soundclear.model.TrackItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class InnerTubeClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val webRemixUa =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private fun webRemixContext(): JSONObject = JSONObject().apply {
        put("client", JSONObject().apply {
            put("clientName", "WEB_REMIX")
            put("clientVersion", "1.20241127.01.00")
            put("hl", "id")
            put("gl", "ID")
        })
    }

    private fun postJson(url: String, body: JSONObject, userAgent: String = webRemixUa, origin: String = "https://music.youtube.com"): JSONObject? {
        val req = Request.Builder()
            .url(url)
            .post(body.toString().toRequestBody(jsonMediaType))
            .header("Content-Type", "application/json")
            .header("User-Agent", userAgent)
            .header("Origin", origin)
            .header("Referer", "$origin/")
            .header("X-YouTube-Client-Name", "67")
            .header("X-YouTube-Client-Version", "1.20241127.01.00")
            .build()

        return try {
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val raw = res.body?.string() ?: return null
                JSONObject(raw)
            }
        } catch (_: Exception) {
            null
        }
    }

    suspend fun fetchIndonesiaHome(): List<HomeSection> = withContext(Dispatchers.IO) {
        val sections = mutableListOf<HomeSection>()

        val chartsJson = postJson(
            "https://music.youtube.com/youtubei/v1/browse?prettyPrint=false",
            JSONObject().apply {
                put("context", webRemixContext())
                put("browseId", "FEmusic_charts")
            }
        )
        if (chartsJson != null) {
            sections += extractSectionsFromBrowse(chartsJson, defaultTitle = "Tangga Lagu Indonesia")
        }

        if (sections.sumOf { it.items.size } < 8) {
            val homeJson = postJson(
                "https://music.youtube.com/youtubei/v1/browse?prettyPrint=false",
                JSONObject().apply {
                    put("context", webRemixContext())
                    put("browseId", "FEmusic_home")
                }
            )
            if (homeJson != null) {
                sections += extractSectionsFromBrowse(homeJson, defaultTitle = "Pilihan Cepat")
            }
        }

        if (sections.isEmpty()) {
            val trending = searchMusic("Top Lagu Indonesia Populer 2026", SearchFilterType.SONGS)
            if (trending.isNotEmpty()) {
                sections += HomeSection(
                    title = "Sedang Trending di Indonesia",
                    subtitle = "Pilihan populer harian",
                    items = trending.take(15)
                )
            }
            val chill = searchMusic("Lagu Indonesia Santai Akustik", SearchFilterType.SONGS)
            if (chill.isNotEmpty()) {
                sections += HomeSection(
                    title = "Santai & Akustik Indonesia",
                    subtitle = "Kurasi otomatis",
                    items = chill.take(15)
                )
            }
        }

        sections
            .filter { it.items.isNotEmpty() }
            .distinctBy { it.title }
    }

    suspend fun searchMusic(query: String, filter: SearchFilterType = SearchFilterType.ALL): List<TrackItem> =
        withContext(Dispatchers.IO) {
            val cleanQuery = query.trim()
            if (cleanQuery.isEmpty()) return@withContext emptyList()

            val payload = JSONObject().apply {
                put("context", webRemixContext())
                put("query", cleanQuery)
                if (filter.ytParams != null) {
                    put("params", filter.ytParams)
                }
            }
            val json = postJson("https://music.youtube.com/youtubei/v1/search?prettyPrint=false", payload)
                ?: return@withContext emptyList()

            val results = mutableListOf<TrackItem>()
            collectResponsiveListItems(json, results)
            results.distinctBy { it.videoId }
        }

    suspend fun fetchRadioNext(videoId: String): List<TrackItem> = withContext(Dispatchers.IO) {
        if (videoId.isBlank()) return@withContext emptyList()
        val payload = JSONObject().apply {
            put("context", webRemixContext())
            put("videoId", videoId)
            put("playlistId", "RDAMVM$videoId")
            put("isAudioOnly", true)
        }
        val json = postJson("https://music.youtube.com/youtubei/v1/next?prettyPrint=false", payload)
            ?: return@withContext emptyList()

        val items = mutableListOf<TrackItem>()
        collectPlaylistPanelRenderers(json, items)
        items.filter { it.videoId != videoId }.distinctBy { it.videoId }.take(25)
    }

    suspend fun resolveAudioStream(videoId: String): ResolvedStream? = withContext(Dispatchers.IO) {
        if (videoId.isBlank()) return@withContext null

        val clients = listOf(
            Triple(
                "ANDROID_VR",
                "1.60.19",
                "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"
            ),
            Triple(
                "ANDROID_MUSIC",
                "7.29.52",
                "com.google.android.apps.youtube.music/7.29.52 (Linux; U; Android 14) gzip"
            ),
            Triple(
                "IOS",
                "19.45.4",
                "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)"
            )
        )

        for ((clientName, clientVersion, userAgent) in clients) {
            val payload = JSONObject().apply {
                put("context", JSONObject().apply {
                    put("client", JSONObject().apply {
                        put("clientName", clientName)
                        put("clientVersion", clientVersion)
                        put("hl", "id")
                        put("gl", "ID")
                        if (clientName.startsWith("ANDROID")) {
                            put("androidSdkVersion", 34)
                        }
                    })
                })
                put("videoId", videoId)
                put("contentCheckOk", true)
                put("racyCheckOk", true)
            }

            val req = Request.Builder()
                .url("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .header("Content-Type", "application/json")
                .header("User-Agent", userAgent)
                .build()

            try {
                http.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) return@use
                    val raw = res.body?.string() ?: return@use
                    val json = JSONObject(raw)
                    val streamingData = json.optJSONObject("streamingData") ?: return@use

                    val candidates = mutableListOf<JSONObject>()
                    val adaptive = streamingData.optJSONArray("adaptiveFormats")
                    if (adaptive != null) {
                        for (i in 0 until adaptive.length()) {
                            adaptive.optJSONObject(i)?.let { candidates.add(it) }
                        }
                    }
                    val formats = streamingData.optJSONArray("formats")
                    if (formats != null) {
                        for (i in 0 until formats.length()) {
                            formats.optJSONObject(i)?.let { candidates.add(it) }
                        }
                    }

                    val audioOnly = candidates.filter { fmt ->
                        val url = fmt.optString("url", "")
                        val mime = fmt.optString("mimeType", "")
                        url.isNotBlank() && mime.startsWith("audio/")
                    }

                    val best = audioOnly
                        .sortedWith(
                            compareByDescending<JSONObject> {
                                it.optString("mimeType", "").contains("mp4a")
                            }.thenByDescending {
                                it.optInt("bitrate", 0)
                            }
                        )
                        .firstOrNull()
                        ?: candidates.firstOrNull { it.optString("url", "").isNotBlank() }

                    if (best != null) {
                        val streamUrl = best.optString("url", "")
                        if (streamUrl.isNotBlank()) {
                            val mime = best.optString("mimeType", "audio/mp4").substringBefore(";")
                            val bitrateKbps = (best.optInt("bitrate", 128000) / 1000).coerceAtLeast(64)
                            return@withContext ResolvedStream(
                                url = streamUrl,
                                userAgent = userAgent,
                                mimeType = mime,
                                bitrateKbps = bitrateKbps
                            )
                        }
                    }
                }
            } catch (_: Exception) {
                // try next client
            }
        }
        null
    }

    private fun extractSectionsFromBrowse(root: JSONObject, defaultTitle: String): List<HomeSection> {
        val sections = mutableListOf<HomeSection>()
        findShelvesRecursively(root, sections, defaultTitle)
        return sections
    }

    private fun findShelvesRecursively(node: Any?, out: MutableList<HomeSection>, defaultTitle: String) {
        when (node) {
            is JSONObject -> {
                val carousel = node.optJSONObject("musicCarouselShelfRenderer")
                if (carousel != null) {
                    val headerTitle = extractRunsText(
                        carousel.optJSONObject("header")
                            ?.optJSONObject("musicCarouselShelfBasicHeaderRenderer")
                            ?.optJSONObject("title")
                    ) ?: defaultTitle
                    val items = mutableListOf<TrackItem>()
                    val contents = carousel.optJSONArray("contents")
                    if (contents != null) {
                        for (i in 0 until contents.length()) {
                            val entry = contents.optJSONObject(i) ?: continue
                            entry.optJSONObject("musicResponsiveListItemRenderer")?.let {
                                parseResponsiveListItem(it)?.let(items::add)
                            }
                            entry.optJSONObject("musicTwoRowItemRenderer")?.let {
                                parseTwoRowItem(it)?.let(items::add)
                            }
                        }
                    }
                    if (items.isNotEmpty()) {
                        out.add(HomeSection(title = headerTitle, items = items.distinctBy { it.videoId }))
                    }
                }

                val shelf = node.optJSONObject("musicShelfRenderer")
                if (shelf != null) {
                    val title = extractRunsText(shelf.optJSONObject("title")) ?: defaultTitle
                    val items = mutableListOf<TrackItem>()
                    val contents = shelf.optJSONArray("contents")
                    if (contents != null) {
                        for (i in 0 until contents.length()) {
                            val entry = contents.optJSONObject(i) ?: continue
                            entry.optJSONObject("musicResponsiveListItemRenderer")?.let {
                                parseResponsiveListItem(it)?.let(items::add)
                            }
                        }
                    }
                    if (items.isNotEmpty()) {
                        out.add(HomeSection(title = title, items = items.distinctBy { it.videoId }))
                    }
                }

                val keys = node.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (key != "musicCarouselShelfRenderer" && key != "musicShelfRenderer") {
                        findShelvesRecursively(node.opt(key), out, defaultTitle)
                    }
                }
            }
            is JSONArray -> {
                for (i in 0 until node.length()) {
                    findShelvesRecursively(node.opt(i), out, defaultTitle)
                }
            }
        }
    }

    private fun collectResponsiveListItems(node: Any?, out: MutableList<TrackItem>) {
        when (node) {
            is JSONObject -> {
                val renderer = node.optJSONObject("musicResponsiveListItemRenderer")
                if (renderer != null) {
                    parseResponsiveListItem(renderer)?.let(out::add)
                }
                val keys = node.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (key != "musicResponsiveListItemRenderer") {
                        collectResponsiveListItems(node.opt(key), out)
                    }
                }
            }
            is JSONArray -> {
                for (i in 0 until node.length()) {
                    collectResponsiveListItems(node.opt(i), out)
                }
            }
        }
    }

    private fun collectPlaylistPanelRenderers(node: Any?, out: MutableList<TrackItem>) {
        when (node) {
            is JSONObject -> {
                val renderer = node.optJSONObject("playlistPanelVideoRenderer")
                if (renderer != null) {
                    val videoId = renderer.optString("videoId", "")
                    val title = extractRunsText(renderer.optJSONObject("title")) ?: ""
                    val artist = extractRunsText(renderer.optJSONObject("shortBylineText"))
                        ?: extractRunsText(renderer.optJSONObject("longBylineText"))
                        ?: "Artis"
                    val durationText = extractRunsText(renderer.optJSONObject("lengthText"))
                    val thumb = pickBestThumb(renderer.optJSONObject("thumbnail")?.optJSONArray("thumbnails"))
                    if (videoId.isNotBlank() && title.isNotBlank()) {
                        out.add(
                            TrackItem(
                                id = videoId,
                                videoId = videoId,
                                title = title,
                                artist = artist,
                                durationText = durationText,
                                durationSeconds = parseDurationToSeconds(durationText),
                                thumbnailUrl = upgradeThumbnail(thumb)
                            )
                        )
                    }
                }
                val keys = node.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (key != "playlistPanelVideoRenderer") {
                        collectPlaylistPanelRenderers(node.opt(key), out)
                    }
                }
            }
            is JSONArray -> {
                for (i in 0 until node.length()) {
                    collectPlaylistPanelRenderers(node.opt(i), out)
                }
            }
        }
    }

    private fun parseResponsiveListItem(renderer: JSONObject): TrackItem? {
        val videoId = renderer.optJSONObject("playlistItemData")?.optString("videoId", "")
            ?.takeIf { it.isNotBlank() }
            ?: renderer.optJSONObject("overlay")
                ?.optJSONObject("musicItemThumbnailOverlayRenderer")
                ?.optJSONObject("content")
                ?.optJSONObject("musicPlayButtonRenderer")
                ?.optJSONObject("playNavigationEndpoint")
                ?.optJSONObject("watchEndpoint")
                ?.optString("videoId", "")
            ?.takeIf { it.isNotBlank() }
            ?: return null

        val flexColumns = renderer.optJSONArray("flexColumns") ?: return null
        val title = flexColumns.optJSONObject(0)
            ?.optJSONObject("musicResponsiveListItemFlexColumnRenderer")
            ?.optJSONObject("text")
            ?.let(::extractRunsText)
            ?.takeIf { it.isNotBlank() }
            ?: return null

        val subLine = flexColumns.optJSONObject(1)
            ?.optJSONObject("musicResponsiveListItemFlexColumnRenderer")
            ?.optJSONObject("text")
            ?.let(::extractRunsText)
            ?: ""

        val parts = subLine.split("•").map { it.trim() }.filter { it.isNotEmpty() }
        val durationPart = parts.lastOrNull { it.matches(Regex("^\\d+:\\d{2}(:\\d{2})?$")) }
        val artistPart = parts.firstOrNull {
            it != durationPart && !it.equals("Lagu", true) && !it.equals("Song", true) && !it.equals("Video", true)
        } ?: "Artis"

        val thumb = renderer.optJSONObject("thumbnail")
            ?.optJSONObject("musicThumbnailRenderer")
            ?.optJSONObject("thumbnail")
            ?.optJSONArray("thumbnails")
            ?.let(::pickBestThumb)

        return TrackItem(
            id = videoId,
            videoId = videoId,
            title = title,
            artist = artistPart,
            durationText = durationPart,
            durationSeconds = parseDurationToSeconds(durationPart),
            thumbnailUrl = upgradeThumbnail(thumb) ?: "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
        )
    }

    private fun parseTwoRowItem(renderer: JSONObject): TrackItem? {
        val videoId = renderer.optJSONObject("navigationEndpoint")
            ?.optJSONObject("watchEndpoint")
            ?.optString("videoId", "")
            ?.takeIf { it.isNotBlank() }
            ?: return null

        val title = extractRunsText(renderer.optJSONObject("title"))?.takeIf { it.isNotBlank() } ?: return null
        val subtitle = extractRunsText(renderer.optJSONObject("subtitle")) ?: "Artis"
        val artist = subtitle.split("•").firstOrNull()?.trim()?.ifEmpty { "Artis" } ?: "Artis"
        val thumb = renderer.optJSONObject("thumbnailRenderer")
            ?.optJSONObject("musicThumbnailRenderer")
            ?.optJSONObject("thumbnail")
            ?.optJSONArray("thumbnails")
            ?.let(::pickBestThumb)

        return TrackItem(
            id = videoId,
            videoId = videoId,
            title = title,
            artist = artist,
            thumbnailUrl = upgradeThumbnail(thumb) ?: "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
        )
    }

    private fun extractRunsText(obj: JSONObject?): String? {
        if (obj == null) return null
        val simple = obj.optString("simpleText", "")
        if (simple.isNotBlank()) return simple
        val runs = obj.optJSONArray("runs") ?: return null
        val sb = StringBuilder()
        for (i in 0 until runs.length()) {
            sb.append(runs.optJSONObject(i)?.optString("text", "") ?: "")
        }
        return sb.toString().trim().takeIf { it.isNotEmpty() }
    }

    private fun pickBestThumb(thumbnails: JSONArray?): String? {
        if (thumbnails == null || thumbnails.length() == 0) return null
        var bestUrl: String? = null
        var bestWidth = -1
        for (i in 0 until thumbnails.length()) {
            val t = thumbnails.optJSONObject(i) ?: continue
            val url = t.optString("url", "")
            val width = t.optInt("width", 0)
            if (url.isNotBlank() && width >= bestWidth) {
                bestWidth = width
                bestUrl = url
            }
        }
        return bestUrl
    }

    private fun upgradeThumbnail(url: String?): String? {
        if (url.isNullOrBlank()) return null
        return url.replace(Regex("=w\\d+-h\\d+[^&?]*"), "=w544-h544-l90-rj")
    }

    private fun parseDurationToSeconds(text: String?): Int? {
        if (text.isNullOrBlank()) return null
        val parts = text.trim().split(":").mapNotNull { it.toIntOrNull() }
        return when (parts.size) {
            2 -> parts[0] * 60 + parts[1]
            3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
            else -> null
        }
    }
}
