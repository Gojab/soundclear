package com.zhafx.soundclear.data.repository

import android.content.Context
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import com.zhafx.soundclear.data.local.EpisodeProgressEntity
import com.zhafx.soundclear.data.local.FollowedArtistEntity
import com.zhafx.soundclear.data.local.HiddenTrackEntity
import com.zhafx.soundclear.data.local.KvStateEntity
import com.zhafx.soundclear.data.local.LikedTrackEntity
import com.zhafx.soundclear.data.local.LocalAudioFileEntity
import com.zhafx.soundclear.data.local.OfflineDownloadEntity
import com.zhafx.soundclear.data.local.PlayHistoryEntity
import com.zhafx.soundclear.data.local.PlaylistEntity
import com.zhafx.soundclear.data.local.PlaylistFolderEntity
import com.zhafx.soundclear.data.local.RecentSearchEntity
import com.zhafx.soundclear.data.local.SavedAlbumEntity
import com.zhafx.soundclear.data.local.SavedPodcastEntity
import com.zhafx.soundclear.data.local.SoundClearDatabase
import com.zhafx.soundclear.data.remote.DirectStreamResolver
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.RateBody
import com.zhafx.soundclear.data.remote.SoundClearNetwork
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import okhttp3.Request
import java.io.File
import java.util.UUID

@Serializable
data class SoundClearBackupData(
    val version: Int = 3,
    val exportedAt: Long = System.currentTimeMillis(),
    val likedTracks: List<MediaItem> = emptyList(),
    val playlists: List<BackupPlaylist> = emptyList(),
    val folders: List<BackupFolder> = emptyList(),
    val savedAlbums: List<MediaItem> = emptyList(),
    val followedArtists: List<MediaItem> = emptyList(),
    val savedPodcasts: List<MediaItem> = emptyList(),
    val hiddenTrackIds: List<String> = emptyList(),
    val recentSearches: List<String> = emptyList()
)

@Serializable
data class BackupPlaylist(
    val id: String,
    val name: String,
    val description: String = "",
    val coverUrl: String? = null,
    val folderId: String? = null,
    val pinned: Boolean = false,
    val tracks: List<MediaItem> = emptyList(),
    val mixConfig: PlaylistMixSettings = PlaylistMixSettings()
)

@Serializable
data class BackupFolder(
    val id: String,
    val name: String,
    val createdAt: Long
)

class LibraryRepository(
    private val context: Context,
    private val db: SoundClearDatabase,
    private val settingsRepository: SettingsRepository,
    private val streamResolver: DirectStreamResolver
) {
    private val json = SoundClearNetwork.json
    private val offlineDir: File by lazy {
        File(context.filesDir, "offline_audio").apply { mkdirs() }
    }

    val likedTracks: Flow<List<MediaItem>> = db.likedTrackDao().observeAll().map { list ->
        list.map { it.toMediaItem() }
    }

    val likedTrackIds: Flow<Set<String>> = likedTracks.map { list ->
        list.map { it.playableVideoId }.toSet()
    }

    val playlists: Flow<List<PlaylistEntity>> = db.playlistDao().observeAll()
    val folders: Flow<List<PlaylistFolderEntity>> = db.playlistFolderDao().observeAll()
    val savedAlbums: Flow<List<SavedAlbumEntity>> = db.savedAlbumDao().observeAll()
    val followedArtists: Flow<List<FollowedArtistEntity>> = db.followedArtistDao().observeAll()
    val savedPodcasts: Flow<List<SavedPodcastEntity>> = db.savedPodcastDao().observeAll()
    val episodeProgress: Flow<List<EpisodeProgressEntity>> = db.episodeProgressDao().observeAll()
    val playHistory: Flow<List<PlayHistoryEntity>> = db.playHistoryDao().observeAll()
    val recentSearches: Flow<List<RecentSearchEntity>> = db.recentSearchDao().observeAll()
    val hiddenTrackIds: Flow<Set<String>> = db.hiddenTrackDao().observeAll().map { it.map { h -> h.id }.toSet() }
    val localAudioFiles: Flow<List<LocalAudioFileEntity>> = db.localAudioFileDao().observeAll()
    val offlineDownloads: Flow<List<OfflineDownloadEntity>> = db.offlineDownloadDao().observeAll()

    fun observePlaylist(id: String): Flow<PlaylistEntity?> = db.playlistDao().observeById(id)

    suspend fun isLiked(trackId: String): Boolean = db.likedTrackDao().isLiked(trackId)

    suspend fun toggleLike(track: MediaItem): Boolean {
        val id = track.playableVideoId
        if (id.isBlank()) return false
        val currentlyLiked = db.likedTrackDao().isLiked(id)
        if (currentlyLiked) {
            db.likedTrackDao().deleteById(id)
        } else {
            db.likedTrackDao().upsert(LikedTrackEntity.from(track))
        }
        // Opsional sinkronisasi ke backend jika akun YT Music terautentikasi
        runCatching {
            settingsRepository.getApiService().postAccountRate(
                RateBody(videoId = id, rating = if (currentlyLiked) "INDIFFERENT" else "LIKE")
            )
        }
        return !currentlyLiked
    }

    suspend fun createPlaylist(
        name: String,
        description: String = "",
        initialTracks: List<MediaItem> = emptyList(),
        folderId: String? = null,
        coverUrl: String? = null
    ): PlaylistEntity {
        val now = System.currentTimeMillis()
        val id = "pl-${UUID.randomUUID().toString().take(8)}"
        val entity = PlaylistEntity(
            id = id,
            name = name.trim().ifBlank { "Playlist Baru" },
            description = description.trim(),
            coverUrl = coverUrl ?: initialTracks.firstOrNull()?.thumbnail,
            folderId = folderId,
            pinned = false,
            createdAt = now,
            updatedAt = now,
            tracksJson = json.encodeToString(initialTracks)
        )
        db.playlistDao().upsert(entity)
        return entity
    }

    suspend fun addTrackToPlaylist(playlistId: String, track: MediaItem, allowDuplicate: Boolean = true): Boolean {
        val pl = db.playlistDao().getById(playlistId) ?: return false
        val tracks = pl.tracksList().toMutableList()
        if (!allowDuplicate && tracks.any { it.playableVideoId == track.playableVideoId }) {
            return false
        }
        tracks.add(track)
        db.playlistDao().update(pl.copyWithTracks(tracks))
        return true
    }

    suspend fun removeTrackFromPlaylist(playlistId: String, index: Int) {
        val pl = db.playlistDao().getById(playlistId) ?: return
        val tracks = pl.tracksList().toMutableList()
        if (index in tracks.indices) {
            tracks.removeAt(index)
            db.playlistDao().update(pl.copyWithTracks(tracks))
        }
    }

    suspend fun moveTrackInPlaylist(playlistId: String, fromIndex: Int, toIndex: Int) {
        val pl = db.playlistDao().getById(playlistId) ?: return
        val tracks = pl.tracksList().toMutableList()
        if (fromIndex !in tracks.indices || toIndex !in tracks.indices) return
        val moved = tracks.removeAt(fromIndex)
        tracks.add(toIndex, moved)
        db.playlistDao().update(pl.copyWithTracks(tracks))
    }

    suspend fun removeDuplicateTracksFromPlaylist(playlistId: String): Int {
        val pl = db.playlistDao().getById(playlistId) ?: return 0
        val original = pl.tracksList()
        val deduped = original.distinctBy { it.playableVideoId }
        val removed = original.size - deduped.size
        if (removed > 0) {
            db.playlistDao().update(pl.copyWithTracks(deduped))
        }
        return removed
    }

    suspend fun updatePlaylistMeta(
        playlistId: String,
        name: String,
        description: String,
        folderId: String?
    ) {
        val pl = db.playlistDao().getById(playlistId) ?: return
        db.playlistDao().update(
            pl.copy(
                name = name.trim().ifBlank { pl.name },
                description = description.trim(),
                folderId = folderId,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun updatePlaylistMixConfig(playlistId: String, config: PlaylistMixSettings) {
        val pl = db.playlistDao().getById(playlistId) ?: return
        db.playlistDao().update(pl.copyWithMixConfig(config))
    }

    suspend fun togglePlaylistPinned(playlistId: String) {
        val pl = db.playlistDao().getById(playlistId) ?: return
        db.playlistDao().update(pl.copy(pinned = !pl.pinned))
    }

    suspend fun deletePlaylist(playlistId: String) {
        db.playlistDao().deleteById(playlistId)
    }

    suspend fun createFolder(name: String): PlaylistFolderEntity {
        val entity = PlaylistFolderEntity(
            id = "fld-${UUID.randomUUID().toString().take(8)}",
            name = name.trim().ifBlank { "Folder Baru" },
            createdAt = System.currentTimeMillis()
        )
        db.playlistFolderDao().upsert(entity)
        return entity
    }

    suspend fun deleteFolder(folderId: String) {
        val playlistsInFolder = db.playlistDao().getAll().filter { it.folderId == folderId }
        playlistsInFolder.forEach { pl ->
            db.playlistDao().update(pl.copy(folderId = null))
        }
        db.playlistFolderDao().deleteById(folderId)
    }

    suspend fun toggleSaveAlbum(album: MediaItem): Boolean {
        val existing = db.savedAlbumDao().getAll().any { it.id == album.id }
        if (existing) {
            db.savedAlbumDao().deleteById(album.id)
            return false
        }
        db.savedAlbumDao().upsert(
            SavedAlbumEntity(
                id = album.id,
                savedAt = System.currentTimeMillis(),
                itemJson = json.encodeToString(album)
            )
        )
        return true
    }

    suspend fun toggleFollowArtist(artist: MediaItem): Boolean {
        val existing = db.followedArtistDao().getAll().any { it.id == artist.id }
        if (existing) {
            db.followedArtistDao().deleteById(artist.id)
            return false
        }
        db.followedArtistDao().upsert(
            FollowedArtistEntity(
                id = artist.id,
                followedAt = System.currentTimeMillis(),
                itemJson = json.encodeToString(artist)
            )
        )
        return true
    }

    suspend fun toggleSavePodcast(podcast: MediaItem): Boolean {
        val existing = db.savedPodcastDao().getAll().any { it.id == podcast.id }
        if (existing) {
            db.savedPodcastDao().deleteById(podcast.id)
            return false
        }
        db.savedPodcastDao().upsert(
            SavedPodcastEntity(
                id = podcast.id,
                savedAt = System.currentTimeMillis(),
                itemJson = json.encodeToString(podcast)
            )
        )
        return true
    }

    suspend fun saveEpisodeProgress(
        episodeId: String,
        podcastId: String?,
        positionSeconds: Long,
        durationSeconds: Long,
        completed: Boolean? = null
    ) {
        val prev = db.episodeProgressDao().getById(episodeId)
        val isDone = completed ?: (durationSeconds > 30 && positionSeconds >= durationSeconds - 15)
        db.episodeProgressDao().upsert(
            EpisodeProgressEntity(
                episodeId = episodeId,
                podcastId = podcastId ?: prev?.podcastId,
                positionSeconds = if (isDone) 0L else positionSeconds.coerceAtLeast(0L),
                durationSeconds = durationSeconds.coerceAtLeast(prev?.durationSeconds ?: 0L),
                completed = isDone,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun getEpisodeProgress(episodeId: String): EpisodeProgressEntity? =
        db.episodeProgressDao().getById(episodeId)

    suspend fun recordPlayHistory(track: MediaItem, durationListenedSec: Int) {
        val id = track.playableVideoId
        if (id.isBlank() || durationListenedSec < 15) return
        db.playHistoryDao().insert(
            PlayHistoryEntity(
                trackId = id,
                playedAt = System.currentTimeMillis(),
                durationListenedSec = durationListenedSec,
                sourceType = if (track.type == "episode") "episode" else "song",
                genreHint = track.genre,
                trackJson = json.encodeToString(track)
            )
        )
    }

    suspend fun clearPlayHistory() {
        db.playHistoryDao().clearAll()
    }

    suspend fun addRecentSearch(query: String) {
        val clean = query.trim()
        if (clean.isBlank()) return
        db.recentSearchDao().deleteByQuery(clean)
        db.recentSearchDao().insert(
            RecentSearchEntity(query = clean, searchedAt = System.currentTimeMillis())
        )
    }

    suspend fun removeRecentSearch(query: String) {
        db.recentSearchDao().deleteByQuery(query)
    }

    suspend fun clearRecentSearches() {
        db.recentSearchDao().clearAll()
    }

    suspend fun hideTrack(trackId: String) {
        if (trackId.isBlank()) return
        db.hiddenTrackDao().upsert(HiddenTrackEntity(id = trackId))
    }

    suspend fun unhideTrack(trackId: String) {
        db.hiddenTrackDao().deleteById(trackId)
    }

    suspend fun getOfflineDownload(trackId: String): OfflineDownloadEntity? =
        db.offlineDownloadDao().getById(trackId)

    suspend fun downloadTrackForOffline(track: MediaItem, quality: String): Result<OfflineDownloadEntity> =
        withContext(Dispatchers.IO) {
            val id = track.playableVideoId
            if (id.isBlank()) return@withContext Result.failure(IllegalArgumentException("ID trek tidak valid."))
            val resolved = streamResolver.resolveStream(
                apiService = settingsRepository.getApiService(),
                baseUrl = settingsRepository.apiBaseUrl.value,
                track = track,
                quality = quality
            ).getOrElse { return@withContext Result.failure(it) }

            if (resolved.isHls) {
                return@withContext Result.failure(
                    IllegalStateException("Unduh offline belum mendukung format HLS (.m3u8).")
                )
            }

            runCatching {
                val reqBuilder = Request.Builder().url(resolved.uri.toString())
                resolved.userAgentHeader?.let { reqBuilder.header("User-Agent", it) }
                resolved.originHeader?.let {
                    reqBuilder.header("Origin", it)
                    reqBuilder.header("Referer", "$it/")
                }
                val destFile = File(offlineDir, "$id.m4a")
                SoundClearNetwork.okHttpClient.newCall(reqBuilder.build()).execute().use { res ->
                    if (!res.isSuccessful) error("Gagal mengunduh audio (${res.code})")
                    val body = res.body ?: error("Respons audio kosong")
                    destFile.outputStream().use { out ->
                        body.byteStream().copyTo(out)
                    }
                }
                val entity = OfflineDownloadEntity(
                    id = id,
                    localFilePath = destFile.absolutePath,
                    fileSize = destFile.length(),
                    mimeType = "audio/mp4",
                    qualityTier = quality,
                    codec = resolved.codec,
                    bitrateKbps = resolved.bitrateKbps,
                    downloadedAt = System.currentTimeMillis(),
                    trackJson = json.encodeToString(track)
                )
                db.offlineDownloadDao().upsert(entity)
                entity
            }
        }

    suspend fun deleteOfflineDownload(trackId: String) = withContext(Dispatchers.IO) {
        val existing = db.offlineDownloadDao().getById(trackId)
        if (existing != null) {
            runCatching { File(existing.localFilePath).delete() }
            db.offlineDownloadDao().deleteById(trackId)
        }
    }

    suspend fun clearAllOfflineDownloads() = withContext(Dispatchers.IO) {
        offlineDir.listFiles()?.forEach { runCatching { it.delete() } }
        db.offlineDownloadDao().clearAll()
    }

    suspend fun importLocalAudioUri(uri: Uri): Result<LocalAudioFileEntity> = withContext(Dispatchers.IO) {
        runCatching {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
            var displayName = "Audio Lokal"
            var fileSize = 0L
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameCol = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (cursor.moveToFirst()) {
                    if (nameCol >= 0) displayName = cursor.getString(nameCol) ?: displayName
                    if (sizeCol >= 0) fileSize = cursor.getLong(sizeCol)
                }
            }
            val mimeType = context.contentResolver.getType(uri) ?: "audio/mpeg"
            val mmr = MediaMetadataRetriever()
            var title = displayName.substringBeforeLast('.')
            var artist = "Audio Lokal"
            var album = "Penyimpanan Perangkat"
            var durationSec = 0
            var bitrateKbps: Int? = null

            runCatching {
                mmr.setDataSource(context, uri)
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.takeIf { it.isNotBlank() }?.let {
                    title = it
                }
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.takeIf { it.isNotBlank() }?.let {
                    artist = it
                }
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.takeIf { it.isNotBlank() }?.let {
                    album = it
                }
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let {
                    durationSec = (it / 1000L).toInt()
                }
                mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()?.let {
                    bitrateKbps = it / 1000
                }
            }
            runCatching { mmr.release() }

            val id = "local-${UUID.nameUUIDFromBytes(uri.toString().toByteArray()).toString().take(12)}"
            val entity = LocalAudioFileEntity(
                id = id,
                contentUri = uri.toString(),
                fileName = displayName,
                mimeType = mimeType,
                fileSize = fileSize,
                title = title,
                artist = artist,
                album = album,
                durationSeconds = durationSec,
                codec = mimeType.substringAfter('/').uppercase(),
                bitrateKbps = bitrateKbps
            )
            db.localAudioFileDao().upsert(entity)
            entity
        }
    }

    suspend fun deleteLocalAudioFile(id: String) {
        db.localAudioFileDao().deleteById(id)
    }

    suspend fun exportBackupJson(): String = withContext(Dispatchers.IO) {
        val payload = SoundClearBackupData(
            likedTracks = db.likedTrackDao().getAll().map { it.toMediaItem() },
            playlists = db.playlistDao().getAll().map {
                BackupPlaylist(
                    id = it.id,
                    name = it.name,
                    description = it.description,
                    coverUrl = it.coverUrl,
                    folderId = it.folderId,
                    pinned = it.pinned,
                    tracks = it.tracksList(),
                    mixConfig = it.mixConfig()
                )
            },
            folders = db.playlistFolderDao().getAll().map {
                BackupFolder(it.id, it.name, it.createdAt)
            },
            savedAlbums = db.savedAlbumDao().getAll().map { it.toMediaItem() },
            followedArtists = db.followedArtistDao().getAll().map { it.toMediaItem() },
            savedPodcasts = db.savedPodcastDao().getAll().map { it.toMediaItem() },
            hiddenTrackIds = db.hiddenTrackDao().getAllIds(),
            recentSearches = db.recentSearchDao().getAll().map { it.query }
        )
        json.encodeToString(payload)
    }

    suspend fun importBackupJson(rawJson: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val data = json.decodeFromString<SoundClearBackupData>(rawJson)
            db.likedTrackDao().upsertAll(data.likedTracks.mapIndexed { i, t ->
                LikedTrackEntity.from(t, System.currentTimeMillis() - i * 10L)
            })
            val now = System.currentTimeMillis()
            db.playlistFolderDao().upsertAll(data.folders.map {
                PlaylistFolderEntity(it.id, it.name, it.createdAt)
            })
            db.playlistDao().upsertAll(data.playlists.map {
                PlaylistEntity(
                    id = it.id,
                    name = it.name,
                    description = it.description,
                    coverUrl = it.coverUrl,
                    folderId = it.folderId,
                    pinned = it.pinned,
                    createdAt = now,
                    updatedAt = now,
                    tracksJson = json.encodeToString(it.tracks),
                    mixConfigJson = json.encodeToString(it.mixConfig)
                )
            })
            db.savedAlbumDao().upsertAll(data.savedAlbums.map {
                SavedAlbumEntity(it.id, false, now, null, json.encodeToString(it))
            })
            db.followedArtistDao().upsertAll(data.followedArtists.map {
                FollowedArtistEntity(it.id, false, now, null, json.encodeToString(it))
            })
            db.savedPodcastDao().upsertAll(data.savedPodcasts.map {
                SavedPodcastEntity(it.id, false, now, null, json.encodeToString(it))
            })
            db.hiddenTrackDao().upsertAll(data.hiddenTrackIds.map { HiddenTrackEntity(it, now) })
            Unit
        }
    }

    suspend fun saveKv(key: String, value: String) {
        db.kvStateDao().put(KvStateEntity(key, value))
    }
}
