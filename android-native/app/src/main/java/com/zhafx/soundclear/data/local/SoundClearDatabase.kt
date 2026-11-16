package com.zhafx.soundclear.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        LikedTrackEntity::class,
        PlaylistEntity::class,
        PlaylistFolderEntity::class,
        SavedAlbumEntity::class,
        FollowedArtistEntity::class,
        SavedPodcastEntity::class,
        EpisodeProgressEntity::class,
        PlayHistoryEntity::class,
        RecentSearchEntity::class,
        HiddenTrackEntity::class,
        LocalAudioFileEntity::class,
        OfflineDownloadEntity::class,
        KvStateEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class SoundClearDatabase : RoomDatabase() {
    abstract fun likedTrackDao(): LikedTrackDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun playlistFolderDao(): PlaylistFolderDao
    abstract fun savedAlbumDao(): SavedAlbumDao
    abstract fun followedArtistDao(): FollowedArtistDao
    abstract fun savedPodcastDao(): SavedPodcastDao
    abstract fun episodeProgressDao(): EpisodeProgressDao
    abstract fun playHistoryDao(): PlayHistoryDao
    abstract fun recentSearchDao(): RecentSearchDao
    abstract fun hiddenTrackDao(): HiddenTrackDao
    abstract fun localAudioFileDao(): LocalAudioFileDao
    abstract fun offlineDownloadDao(): OfflineDownloadDao
    abstract fun kvStateDao(): KvStateDao

    companion object {
        @Volatile
        private var instance: SoundClearDatabase? = null

        fun getInstance(context: Context): SoundClearDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    SoundClearDatabase::class.java,
                    "soundclear_native.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
        }
    }
}
