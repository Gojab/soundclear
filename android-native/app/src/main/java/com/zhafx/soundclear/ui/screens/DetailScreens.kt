package com.zhafx.soundclear.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.BookmarkAdded
import androidx.compose.material.icons.rounded.DownloadForOffline
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.components.SoundClearMediaCard
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.viewmodel.DetailViewModel

@Composable
fun ArtistDetailScreen(
    artistId: String,
    fallbackQuery: String?,
    viewModel: DetailViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenItem: (MediaItem) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val artist by viewModel.artistDetail.collectAsState()
    val followed by viewModel.followedArtists.collectAsState(emptyList())
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(artistId) {
        viewModel.loadArtist(artistId, fallbackQuery)
    }

    val isFollowed = followed.any { it.id == artistId }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 140.dp)
    ) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
        }
        if (isLoading && artist == null) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(220.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        artist?.let { art ->
            item {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    ArtworkImage(
                        url = art.thumbnail,
                        contentDescription = art.name,
                        modifier = Modifier.size(164.dp),
                        isCircle = true
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(art.name, style = MaterialTheme.typography.displaySmall)
                    val meta = listOfNotNull(art.subscribers, art.views).joinToString(" • ")
                    if (meta.isNotBlank()) {
                        Text(meta, style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = {
                                if (art.songs.isNotEmpty()) {
                                    onPlayTrack(art.songs.first(), art.songs, art.name)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Putar", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = { viewModel.toggleFollowArtist(art) }) {
                            Text(if (isFollowed) "Mengikuti" else "Ikuti", color = if (isFollowed) EmeraldBright else MintTextSecondary)
                        }
                        if (art.songs.isNotEmpty()) {
                            OutlinedButton(onClick = {
                                val shuffled = art.songs.shuffled()
                                onPlayTrack(shuffled.first(), shuffled, "Radio: ${art.name}")
                            }) {
                                Icon(Icons.Rounded.Radio, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Radio", color = EmeraldBright)
                            }
                        }
                    }
                }
            }

            if (art.songs.isNotEmpty()) {
                item {
                    Text("Lagu Populer", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
                }
                itemsIndexed(art.songs.take(15), key = { idx, t -> "art-song-$idx-${t.playableVideoId}" }) { idx, track ->
                    TrackRowItem(
                        track = track,
                        index = idx,
                        isPlayingNow = track.playableVideoId == currentPlayingId,
                        isLiked = track.playableVideoId in likedTrackIds,
                        dataSaver = dataSaver,
                        onClick = { onPlayTrack(track, art.songs, art.name) },
                        onToggleLike = { onToggleLike(track) },
                        onMoreClick = { onOpenTrackMenu(track) },
                        modifier = Modifier.padding(horizontal = 6.dp)
                    )
                }
            }

            listOf(
                "Album" to art.albums,
                "Single & EP" to art.singles,
                "Kompilasi" to art.compilations,
                "Video Musik" to art.videos,
                "Tampil Di" to art.appearsOn,
                "Artis Terkait" to art.related
            ).forEach { (title, itemsList) ->
                if (itemsList.isNotEmpty()) {
                    item {
                        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
                        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(itemsList, key = { "$title-${it.id}-${it.title}" }) { item ->
                                SoundClearMediaCard(item = item, dataSaver = dataSaver, onClick = {
                                    if (item.type in setOf("song", "video")) {
                                        onPlayTrack(item, itemsList, art.name)
                                    } else {
                                        onOpenItem(item)
                                    }
                                })
                            }
                        }
                    }
                }
            }

            art.description?.takeIf { it.isNotBlank() }?.let { desc ->
                item {
                    GlassCard(modifier = Modifier.padding(16.dp)) {
                        Text("Tentang ${art.name}", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        Text(desc, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun AlbumDetailScreen(
    albumId: String,
    fallbackQuery: String?,
    viewModel: DetailViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenItem: (MediaItem) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val album by viewModel.albumDetail.collectAsState()
    val savedAlbums by viewModel.savedAlbums.collectAsState(emptyList())
    val offline by viewModel.offlineDownloads.collectAsState(emptyList())
    val isDownloading by viewModel.offlineDownloading.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(albumId) { viewModel.loadAlbum(albumId, fallbackQuery) }

    val isSaved = savedAlbums.any { it.id == albumId }
    val offlineIds = offline.map { it.id }.toSet()

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
        }
        if (isLoading && album == null) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        album?.let { alb ->
            item {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    ArtworkImage(url = alb.thumbnail, contentDescription = alb.title, modifier = Modifier.size(180.dp), cornerRadius = 16.dp)
                    Spacer(Modifier.height(14.dp))
                    Text(alb.title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        text = listOfNotNull(
                            alb.artists.joinToString(", ") { it.name }.ifBlank { null },
                            alb.year,
                            alb.duration
                        ).joinToString(" • "),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { if (alb.tracks.isNotEmpty()) onPlayTrack(alb.tracks.first(), alb.tracks, alb.title) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Putar", fontWeight = FontWeight.Bold)
                        }
                        IconButton(onClick = { viewModel.toggleSaveAlbum(alb) }) {
                            Icon(
                                if (isSaved) Icons.Rounded.BookmarkAdded else Icons.Rounded.BookmarkAdd,
                                contentDescription = "Simpan Album",
                                tint = if (isSaved) EmeraldBright else MintTextSecondary
                            )
                        }
                        IconButton(onClick = { viewModel.downloadTracksOffline(alb.tracks) }, enabled = !isDownloading) {
                            Icon(Icons.Rounded.DownloadForOffline, contentDescription = "Unduh Offline", tint = EmeraldBright)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
            itemsIndexed(alb.tracks, key = { idx, t -> "alb-$idx-${t.playableVideoId}" }) { idx, track ->
                TrackRowItem(
                    track = track,
                    index = idx,
                    isPlayingNow = track.playableVideoId == currentPlayingId,
                    isLiked = track.playableVideoId in likedTrackIds,
                    isOffline = track.playableVideoId in offlineIds,
                    dataSaver = dataSaver,
                    onClick = { onPlayTrack(track, alb.tracks, alb.title) },
                    onToggleLike = { onToggleLike(track) },
                    onMoreClick = { onOpenTrackMenu(track) },
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
            }
            if (alb.moreFromArtist.isNotEmpty()) {
                item {
                    Text("Lainnya dari Artis", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(alb.moreFromArtist) { item ->
                            SoundClearMediaCard(item = item, dataSaver = dataSaver, onClick = { onOpenItem(item) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PlaylistDetailScreen(
    playlistId: String,
    fallbackQuery: String?,
    viewModel: DetailViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?, PlaylistMixSettings?) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val playlist by viewModel.playlistDetail.collectAsState()
    val offline by viewModel.offlineDownloads.collectAsState(emptyList())
    val isLoading by viewModel.isLoading.collectAsState()
    var mixConfig by remember { mutableStateOf(PlaylistMixSettings()) }

    LaunchedEffect(playlistId) { viewModel.loadPlaylist(playlistId, fallbackQuery) }

    val offlineIds = offline.map { it.id }.toSet()

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
        }
        if (isLoading && playlist == null) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        playlist?.let { pl ->
            item {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    ArtworkImage(url = pl.thumbnail, contentDescription = pl.title, modifier = Modifier.size(180.dp), cornerRadius = 16.dp)
                    Spacer(Modifier.height(14.dp))
                    Text(pl.title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOfNotNull(pl.author, "${pl.tracks.size} lagu", pl.duration).joinToString(" • "),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { if (pl.tracks.isNotEmpty()) onPlayTrack(pl.tracks.first(), pl.tracks, pl.title, mixConfig) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Putar", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = {
                            if (pl.tracks.isNotEmpty()) {
                                val shuffled = pl.tracks.shuffled()
                                onPlayTrack(shuffled.first(), shuffled, pl.title, mixConfig)
                            }
                        }) {
                            Icon(Icons.Rounded.Shuffle, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Acak", color = EmeraldBright)
                        }
                        IconButton(onClick = { viewModel.downloadTracksOffline(pl.tracks) }) {
                            Icon(Icons.Rounded.DownloadForOffline, contentDescription = "Unduh Offline", tint = EmeraldBright)
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    GlassCard(modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Tune, contentDescription = null, tint = EmeraldBright)
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Mode Mix DJ / Crossfade Playlist", style = MaterialTheme.typography.titleMedium, fontSize = 14.sp)
                                Text("Transisi ${mixConfig.transitionStyle} (${mixConfig.durationSeconds} dtk)", style = MaterialTheme.typography.bodySmall)
                            }
                            Switch(
                                checked = mixConfig.enabled,
                                onCheckedChange = { mixConfig = mixConfig.copy(enabled = it) },
                                colors = SwitchDefaults.colors(checkedThumbColor = ObsidianBlack, checkedTrackColor = EmeraldBright)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            itemsIndexed(pl.tracks, key = { idx, t -> "pl-$idx-${t.playableVideoId}" }) { idx, track ->
                TrackRowItem(
                    track = track,
                    index = idx,
                    isPlayingNow = track.playableVideoId == currentPlayingId,
                    isLiked = track.playableVideoId in likedTrackIds,
                    isOffline = track.playableVideoId in offlineIds,
                    dataSaver = dataSaver,
                    onClick = { onPlayTrack(track, pl.tracks, pl.title, mixConfig) },
                    onToggleLike = { onToggleLike(track) },
                    onMoreClick = { onOpenTrackMenu(track) },
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
            }
        }
    }
}
