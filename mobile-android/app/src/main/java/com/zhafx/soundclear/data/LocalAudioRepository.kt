package com.zhafx.soundclear.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import com.zhafx.soundclear.model.TrackItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LocalAudioRepository(private val context: Context) {

    suspend fun scanDeviceAudio(): List<TrackItem> = withContext(Dispatchers.IO) {
        val tracks = mutableListOf<TrackItem>()
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION
        )

        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
        val sortOrder = "${MediaStore.Audio.Media.TITLE} ASC"

        try {
            context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
                val durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val title = cursor.getString(titleCol) ?: "Audio Lokal"
                    val artist = cursor.getString(artistCol)?.takeIf { it != "<unknown>" } ?: "Artis Lokal"
                    val album = cursor.getString(albumCol)
                    val albumId = cursor.getLong(albumIdCol)
                    val durationMs = cursor.getLong(durationCol)
                    val durationSec = (durationMs / 1000L).toInt().coerceAtLeast(0)
                    if (durationSec < 5) continue

                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        id
                    )
                    val albumArtUri = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"),
                        albumId
                    )

                    tracks.add(
                        TrackItem(
                            id = "local-$id",
                            videoId = "local-$id",
                            title = title,
                            artist = artist,
                            album = album,
                            durationText = formatSec(durationSec),
                            durationSeconds = durationSec,
                            thumbnailUrl = albumArtUri.toString(),
                            localUri = contentUri.toString(),
                            isLocal = true
                        )
                    )
                }
            }
        } catch (_: SecurityException) {
            return@withContext emptyList()
        } catch (_: Exception) {
            return@withContext emptyList()
        }

        tracks
    }

    private fun formatSec(seconds: Int): String {
        val m = seconds / 60
        val s = seconds % 60
        return "%d:%02d".format(m, s)
    }
}
