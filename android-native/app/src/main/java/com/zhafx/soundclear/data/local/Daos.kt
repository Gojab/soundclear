package com.zhafx.soundclear.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface LikedTrackDao {
    @Query("SELECT * FROM liked_tracks ORDER BY addedAt DESC")
    fun observeAll(): Flow<List<LikedTrackEntity>>

    @Query("SELECT * FROM liked_tracks ORDER BY addedAt DESC")
    suspend fun getAll(): List<LikedTrackEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM liked_tracks WHERE id = :id)")
    suspend fun isLiked(id: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: LikedTrackEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<LikedTrackEntity>)

    @Query("DELETE FROM liked_tracks WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM liked_tracks")
    suspend fun clearAll()
}

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlists ORDER BY pinned DESC, updatedAt DESC")
    fun observeAll(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlists WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<PlaylistEntity?>

    @Query("SELECT * FROM playlists ORDER BY pinned DESC, updatedAt DESC")
    suspend fun getAll(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): PlaylistEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PlaylistEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<PlaylistEntity>)

    @Update
    suspend fun update(entity: PlaylistEntity)

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM playlists")
    suspend fun clearAll()
}

@Dao
interface PlaylistFolderDao {
    @Query("SELECT * FROM playlist_folders ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<PlaylistFolderEntity>>

    @Query("SELECT * FROM playlist_folders ORDER BY createdAt DESC")
    suspend fun getAll(): List<PlaylistFolderEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PlaylistFolderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<PlaylistFolderEntity>)

    @Query("DELETE FROM playlist_folders WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM playlist_folders")
    suspend fun clearAll()
}

@Dao
interface SavedAlbumDao {
    @Query("SELECT * FROM saved_albums ORDER BY pinned DESC, savedAt DESC")
    fun observeAll(): Flow<List<SavedAlbumEntity>>

    @Query("SELECT * FROM saved_albums ORDER BY pinned DESC, savedAt DESC")
    suspend fun getAll(): List<SavedAlbumEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SavedAlbumEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<SavedAlbumEntity>)

    @Query("DELETE FROM saved_albums WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM saved_albums")
    suspend fun clearAll()
}

@Dao
interface FollowedArtistDao {
    @Query("SELECT * FROM followed_artists ORDER BY pinned DESC, followedAt DESC")
    fun observeAll(): Flow<List<FollowedArtistEntity>>

    @Query("SELECT * FROM followed_artists ORDER BY pinned DESC, followedAt DESC")
    suspend fun getAll(): List<FollowedArtistEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: FollowedArtistEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<FollowedArtistEntity>)

    @Query("DELETE FROM followed_artists WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM followed_artists")
    suspend fun clearAll()
}

@Dao
interface SavedPodcastDao {
    @Query("SELECT * FROM saved_podcasts ORDER BY pinned DESC, savedAt DESC")
    fun observeAll(): Flow<List<SavedPodcastEntity>>

    @Query("SELECT * FROM saved_podcasts ORDER BY pinned DESC, savedAt DESC")
    suspend fun getAll(): List<SavedPodcastEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SavedPodcastEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<SavedPodcastEntity>)

    @Query("DELETE FROM saved_podcasts WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM saved_podcasts")
    suspend fun clearAll()
}

@Dao
interface EpisodeProgressDao {
    @Query("SELECT * FROM episode_progress ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<EpisodeProgressEntity>>

    @Query("SELECT * FROM episode_progress WHERE episodeId = :episodeId LIMIT 1")
    suspend fun getById(episodeId: String): EpisodeProgressEntity?

    @Query("SELECT * FROM episode_progress ORDER BY updatedAt DESC")
    suspend fun getAll(): List<EpisodeProgressEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: EpisodeProgressEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<EpisodeProgressEntity>)

    @Query("DELETE FROM episode_progress")
    suspend fun clearAll()
}

@Dao
interface PlayHistoryDao {
    @Query("SELECT * FROM play_history ORDER BY playedAt DESC")
    fun observeAll(): Flow<List<PlayHistoryEntity>>

    @Query("SELECT * FROM play_history ORDER BY playedAt DESC LIMIT :limit")
    suspend fun getRecent(limit: Int = 500): List<PlayHistoryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: PlayHistoryEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(entities: List<PlayHistoryEntity>)

    @Query("DELETE FROM play_history")
    suspend fun clearAll()
}

@Dao
interface RecentSearchDao {
    @Query("SELECT * FROM recent_searches ORDER BY searchedAt DESC LIMIT 12")
    fun observeAll(): Flow<List<RecentSearchEntity>>

    @Query("SELECT * FROM recent_searches ORDER BY searchedAt DESC")
    suspend fun getAll(): List<RecentSearchEntity>

    @Query("DELETE FROM recent_searches WHERE LOWER(query) = LOWER(:query)")
    suspend fun deleteByQuery(query: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: RecentSearchEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(entities: List<RecentSearchEntity>)

    @Query("DELETE FROM recent_searches")
    suspend fun clearAll()
}

@Dao
interface HiddenTrackDao {
    @Query("SELECT * FROM hidden_tracks ORDER BY hiddenAt DESC")
    fun observeAll(): Flow<List<HiddenTrackEntity>>

    @Query("SELECT id FROM hidden_tracks")
    suspend fun getAllIds(): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: HiddenTrackEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<HiddenTrackEntity>)

    @Query("DELETE FROM hidden_tracks WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM hidden_tracks")
    suspend fun clearAll()
}

@Dao
interface LocalAudioFileDao {
    @Query("SELECT * FROM local_audio_files ORDER BY addedAt DESC")
    fun observeAll(): Flow<List<LocalAudioFileEntity>>

    @Query("SELECT * FROM local_audio_files WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): LocalAudioFileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: LocalAudioFileEntity)

    @Query("DELETE FROM local_audio_files WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface OfflineDownloadDao {
    @Query("SELECT * FROM offline_downloads ORDER BY downloadedAt DESC")
    fun observeAll(): Flow<List<OfflineDownloadEntity>>

    @Query("SELECT * FROM offline_downloads WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): OfflineDownloadEntity?

    @Query("SELECT * FROM offline_downloads ORDER BY downloadedAt DESC")
    suspend fun getAll(): List<OfflineDownloadEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: OfflineDownloadEntity)

    @Query("DELETE FROM offline_downloads WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM offline_downloads")
    suspend fun clearAll()
}

@Dao
interface KvStateDao {
    @Query("SELECT * FROM kv_state WHERE `key` = :key LIMIT 1")
    fun observe(key: String): Flow<KvStateEntity?>

    @Query("SELECT * FROM kv_state WHERE `key` = :key LIMIT 1")
    suspend fun get(key: String): KvStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(entity: KvStateEntity)

    @Query("DELETE FROM kv_state WHERE `key` = :key")
    suspend fun delete(key: String)
}
