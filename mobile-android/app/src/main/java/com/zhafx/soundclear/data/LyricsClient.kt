package com.zhafx.soundclear.data

import com.zhafx.soundclear.model.LyricLine
import com.zhafx.soundclear.model.LyricsData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class LyricsClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()

    private val lrcPattern = Regex("\\[(\\d{1,2}):(\\d{2})(?:\\.(\\d{1,3}))?\\](.*)")

    suspend fun fetchLyrics(title: String, artist: String, durationSeconds: Int?): LyricsData? =
        withContext(Dispatchers.IO) {
            val cleanTitle = title.replace(Regex("\\s*\\((Official|Lyric|Audio|Video).*?\\)", RegexOption.IGNORE_CASE), "").trim()
            val cleanArtist = artist.split(",", "&", "feat.", "ft.").firstOrNull()?.trim() ?: artist.trim()
            if (cleanTitle.isBlank()) return@withContext null

            val encodedTitle = URLEncoder.encode(cleanTitle, "UTF-8")
            val encodedArtist = URLEncoder.encode(cleanArtist, "UTF-8")
            val durationParam = if (durationSeconds != null && durationSeconds > 0) "&duration=$durationSeconds" else ""

            val exactUrl = "https://lrclib.net/api/get?track_name=$encodedTitle&artist_name=$encodedArtist$durationParam"
            fetchJsonObject(exactUrl)?.let { parseRecord(it) }?.let { return@withContext it }

            val searchUrl = "https://lrclib.net/api/search?track_name=$encodedTitle&artist_name=$encodedArtist"
            fetchJsonArray(searchUrl)?.let { arr ->
                for (i in 0 until arr.length()) {
                    val item = arr.optJSONObject(i) ?: continue
                    val parsed = parseRecord(item)
                    if (parsed != null) return@withContext parsed
                }
            }
            null
        }

    private fun parseRecord(record: JSONObject): LyricsData? {
        val synced = record.optString("syncedLyrics", "").trim()
        if (synced.isNotBlank()) {
            val lines = parseLrc(synced)
            if (lines.isNotEmpty()) {
                return LyricsData(synced = true, lines = lines, source = "LRCLIB")
            }
        }
        val plain = record.optString("plainLyrics", "").trim()
        if (plain.isNotBlank()) {
            return LyricsData(synced = false, plainText = plain, source = "LRCLIB")
        }
        return null
    }

    private fun parseLrc(lrc: String): List<LyricLine> {
        val result = mutableListOf<LyricLine>()
        for (rawLine in lrc.lines()) {
            val match = lrcPattern.find(rawLine.trim()) ?: continue
            val min = match.groupValues[1].toLongOrNull() ?: continue
            val sec = match.groupValues[2].toLongOrNull() ?: continue
            val fracRaw = match.groupValues[3]
            val ms = when (fracRaw.length) {
                0 -> 0L
                1 -> (fracRaw.toLongOrNull() ?: 0L) * 100L
                2 -> (fracRaw.toLongOrNull() ?: 0L) * 10L
                else -> fracRaw.take(3).toLongOrNull() ?: 0L
            }
            val text = match.groupValues[4].trim()
            if (text.isNotEmpty()) {
                result.add(LyricLine(timeMs = (min * 60 + sec) * 1000 + ms, text = text))
            }
        }
        return result.sortedBy { it.timeMs }
    }

    private fun fetchJsonObject(url: String): JSONObject? {
        val req = Request.Builder().url(url).header("User-Agent", "SoundClear-Android/1.0").build()
        return try {
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                JSONObject(res.body?.string() ?: return null)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun fetchJsonArray(url: String): JSONArray? {
        val req = Request.Builder().url(url).header("User-Agent", "SoundClear-Android/1.0").build()
        return try {
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                JSONArray(res.body?.string() ?: return null)
            }
        } catch (_: Exception) {
            null
        }
    }
}
