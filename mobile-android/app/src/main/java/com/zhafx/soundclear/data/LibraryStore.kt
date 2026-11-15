package com.zhafx.soundclear.data

import android.content.Context
import com.zhafx.soundclear.model.TrackItem
import org.json.JSONArray
import org.json.JSONObject

class LibraryStore(context: Context) {
    private val prefs = context.getSharedPreferences("soundclear_library", Context.MODE_PRIVATE)

    fun getLikedTracks(): List<TrackItem> = readTrackList("liked_tracks")

    fun toggleLike(track: TrackItem): List<TrackItem> {
        val current = getLikedTracks().toMutableList()
        val existingIndex = current.indexOfFirst { it.id == track.id }
        if (existingIndex >= 0) {
            current.removeAt(existingIndex)
        } else {
            current.add(0, track)
        }
        writeTrackList("liked_tracks", current)
        return current
    }

    fun getHistory(): List<TrackItem> = readTrackList("play_history")

    fun recordPlay(track: TrackItem): List<TrackItem> {
        val current = getHistory().toMutableList()
        current.removeAll { it.id == track.id }
        current.add(0, track)
        val trimmed = current.take(50)
        writeTrackList("play_history", trimmed)
        return trimmed
    }

    fun getRecentSearches(): List<String> {
        val raw = prefs.getString("recent_searches", null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            List(arr.length()) { arr.optString(it) }.filter { it.isNotBlank() }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun addRecentSearch(query: String): List<String> {
        val clean = query.trim()
        if (clean.isEmpty()) return getRecentSearches()
        val current = getRecentSearches().toMutableList()
        current.removeAll { it.equals(clean, ignoreCase = true) }
        current.add(0, clean)
        val trimmed = current.take(10)
        prefs.edit().putString("recent_searches", JSONArray(trimmed).toString()).apply()
        return trimmed
    }

    fun getDspPreset(): String = prefs.getString("dsp_preset", "Flat") ?: "Flat"

    fun saveDspPreset(name: String) {
        prefs.edit().putString("dsp_preset", name).apply()
    }

    fun getBassBoostStrength(): Int = prefs.getInt("bass_boost", 0)

    fun saveBassBoostStrength(strength: Int) {
        prefs.edit().putInt("bass_boost", strength.coerceIn(0, 1000)).apply()
    }

    private fun readTrackList(key: String): List<TrackItem> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val list = mutableListOf<TrackItem>()
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                list.add(
                    TrackItem(
                        id = obj.optString("id"),
                        videoId = obj.optString("videoId"),
                        title = obj.optString("title"),
                        artist = obj.optString("artist"),
                        album = obj.optString("album").takeIf { it.isNotBlank() },
                        durationText = obj.optString("durationText").takeIf { it.isNotBlank() },
                        durationSeconds = if (obj.has("durationSeconds") && !obj.isNull("durationSeconds")) obj.optInt("durationSeconds") else null,
                        thumbnailUrl = obj.optString("thumbnailUrl").takeIf { it.isNotBlank() },
                        localUri = obj.optString("localUri").takeIf { it.isNotBlank() },
                        isLocal = obj.optBoolean("isLocal", false)
                    )
                )
            }
            list
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun writeTrackList(key: String, tracks: List<TrackItem>) {
        val arr = JSONArray()
        for (t in tracks) {
            arr.put(JSONObject().apply {
                put("id", t.id)
                put("videoId", t.videoId)
                put("title", t.title)
                put("artist", t.artist)
                put("album", t.album ?: "")
                put("durationText", t.durationText ?: "")
                if (t.durationSeconds != null) put("durationSeconds", t.durationSeconds)
                put("thumbnailUrl", t.thumbnailUrl ?: "")
                put("localUri", t.localUri ?: "")
                put("isLocal", t.isLocal)
            })
        }
        prefs.edit().putString(key, arr.toString()).apply()
    }
}
