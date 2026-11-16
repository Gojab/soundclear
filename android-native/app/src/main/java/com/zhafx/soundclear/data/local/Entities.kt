package com.zhafx.soundclear.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.zhafx.soundclear.data.remote.AlbumRef
import com.zhafx.soundclear.data.remote.ArtistRef
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.SoundClearNetwork
import kotlinx.serialization.encodeToString

@Entity(tableName = "liked_tracks")
data class LikedTrackEntity(
    @PrimaryKey val id: String,
    val addedAt: Long,
    val trackJson: String
) {
    fun toMediaItem(): MediaItem = SoundClearNetwork.json.decodeFromString(trackJson)

    companion object {
        fun from(track: MediaItem, addedAt: Long = System.currentTimeMillis()): LikedTrackEntity {
            val normId = track.playableVideoId
            val normalized = track.copy(id = normId)
            return LikedTrackEntity(
                id = normId,
                addedAt = addedAt,
                trackJson = SoundClearNetwork.json.encodeToString(normalized)
            )
        }
    }
}

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String = "",
    val coverUrl: String? = null,
    val folderId: String? = null,
    val pinned: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long,
    val lastPlayedAt: Long? = null,
    val tracksJson: String = "[]",
    val mixConfigJson: String? = null
) {
    fun tracksList(): List<MediaItem> =
        runCatching { SoundClearNetwork.json.decodeFromString<List<MediaItem>>(tracksJson) }.getOrDefault(emptyList())

    fun mixConfig(): PlaylistMixSettings =
        mixConfigJson?.let {
            runCatching { SoundClearNetwork.json.decodeFromString<PlaylistMixSettings>(it) }.getOrNull()
        } ?: PlaylistMixSettings()

    fun copyWithTracks(tracks: List<MediaItem>, now: Long = System.currentTimeMillis()): PlaylistEntity {
        val cover = coverUrl ?: tracks.firstOrNull()?.thumbnail
        return copy(
            coverUrl = cover,
            updatedAt = now,
            tracksJson = SoundClearNetwork.json.encodeToString(tracks)
        )
    }

    fun copyWithMixConfig(config: PlaylistMixSettings): PlaylistEntity =
        copy(
            updatedAt = System.currentTimeMillis(),
            mixConfigJson = SoundClearNetwork.json.encodeToString(config)
        )
}

@Entity(tableName = "playlist_folders")
data class PlaylistFolderEntity(
    @PrimaryKey val id: String,
    val name: String,
    val createdAt: Long
)

@Entity(tableName = "saved_albums")
data class SavedAlbumEntity(
    @PrimaryKey val id: String,
    val pinned: Boolean = false,
    val savedAt: Long,
    val lastPlayedAt: Long? = null,
    val itemJson: String
) {
    fun toMediaItem(): MediaItem = SoundClearNetwork.json.decodeFromString(itemJson)
}

@Entity(tableName = "followed_artists")
data class FollowedArtistEntity(
    @PrimaryKey val id: String,
    val pinned: Boolean = false,
    val followedAt: Long,
    val lastPlayedAt: Long? = null,
    val itemJson: String
) {
    fun toMediaItem(): MediaItem = SoundClearNetwork.json.decodeFromString(itemJson)
}

@Entity(tableName = "saved_podcasts")
data class SavedPodcastEntity(
    @PrimaryKey val id: String,
    val pinned: Boolean = false,
    val savedAt: Long,
    val lastPlayedAt: Long? = null,
    val itemJson: String
) {
    fun toMediaItem(): MediaItem = SoundClearNetwork.json.decodeFromString(itemJson)
}

@Entity(tableName = "episode_progress")
data class EpisodeProgressEntity(
    @PrimaryKey val episodeId: String,
    val podcastId: String? = null,
    val positionSeconds: Long = 0L,
    val durationSeconds: Long = 0L,
    val completed: Boolean = false,
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "play_history")
data class PlayHistoryEntity(
    @PrimaryKey(autoGenerate = true) val uid: Long = 0L,
    val trackId: String,
    val playedAt: Long,
    val durationListenedSec: Int,
    val sourceType: String = "song", // song | episode
    val genreHint: String? = null,
    val trackJson: String
) {
    fun toMediaItem(): MediaItem = SoundClearNetwork.json.decodeFromString(trackJson)
}

@Entity(tableName = "recent_searches")
data class RecentSearchEntity(
    @PrimaryKey(autoGenerate = true) val uid: Long = 0L,
    val query: String,
    val searchedAt: Long
)

@Entity(tableName = "hidden_tracks")
data class HiddenTrackEntity(
    @PrimaryKey val id: String,
    val hiddenAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "local_audio_files")
data class LocalAudioFileEntity(
    @PrimaryKey val id: String,
    val contentUri: String,
    val fileName: String,
    val mimeType: String,
    val fileSize: Long,
    val title: String,
    val artist: String,
    val album: String,
    val durationSeconds: Int,
    val codec: String = "Lokal",
    val bitrateKbps: Int? = null,
    val sampleRateHz: Int? = null,
    val addedAt: Long = System.currentTimeMillis()
) {
    fun toMediaItem(): MediaItem = MediaItem(
        id = id,
        videoId = null,
        title = title,
        artists = listOf(ArtistRef(name = artist)),
        album = AlbumRef(name = album),
        durationSeconds = durationSeconds,
        type = "local",
        localFileId = id,
        localUri = contentUri
    )
}

@Entity(tableName = "offline_downloads")
data class OfflineDownloadEntity(
    @PrimaryKey val id: String,
    val localFilePath: String,
    val fileSize: Long,
    val mimeType: String,
    val qualityTier: String,
    val codec: String,
    val bitrateKbps: Int? = null,
    val downloadedAt: Long,
    val trackJson: String
) {
    fun toMediaItem(): MediaItem = SoundClearNetwork.json.decodeFromString(trackJson)
}

@Entity(tableName = "kv_state")
data class KvStateEntity(
    @PrimaryKey val key: String,
    val valueJson: String
)
