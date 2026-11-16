package com.zhafx.soundclear.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.AudioFile
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DownloadForOffline
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.theme.DangerRed
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldDeep
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.GlassBorder
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.DetailViewModel
import com.zhafx.soundclear.ui.viewmodel.LibraryViewModel

@Composable
fun LibraryScreen(
    viewModel: LibraryViewModel,
    dataSaver: Boolean,
    onOpenLiked: () -> Unit,
    onOpenLocalPlaylist: (String) -> Unit,
    onOpenItem: (MediaItem) -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenCreateMix: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    var showCreatePlaylistDialog by remember { mutableStateOf(false) }
    var showCreateFolderDialog by remember { mutableStateOf(false) }

    val audioPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        uris.forEach { viewModel.importLocalAudio(it) }
    }

    val filterTabs = listOf(
        "all" to "Semua",
        "playlist" to "Playlist",
        "album" to "Album",
        "artist" to "Artis",
        "podcast" to "Podcast",
        "offline" to "Offline",
        "local" to "Audio Lokal"
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 140.dp)
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Pustaka", style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
                IconButton(onClick = { showCreateFolderDialog = true }) {
                    Icon(Icons.Rounded.CreateNewFolder, contentDescription = "Buat Folder", tint = MintTextSecondary)
                }
                IconButton(onClick = { showCreatePlaylistDialog = true }) {
                    Icon(Icons.Rounded.Add, contentDescription = "Playlist Baru", tint = EmeraldBright)
                }
            }
        }

        // Chip Filter
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(filterTabs) { (id, label) ->
                    val selected = state.filter == id
                    FilterChip(
                        selected = selected,
                        onClick = { viewModel.setFilter(id) },
                        label = { Text(label) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = EmeraldPrimary,
                            selectedLabelColor = ObsidianBlack,
                            containerColor = ObsidianCard,
                            labelColor = MintTextSecondary
                        )
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        // Bilah Urutan & Impor Lokal
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                val nextSort = when (state.sort) {
                    "newest" -> "alpha"
                    "alpha" -> "last_played"
                    else -> "newest"
                }
                val sortLabel = when (state.sort) {
                    "alpha" -> "Urutan: A-Z"
                    "last_played" -> "Urutan: Terakhir Diputar"
                    else -> "Urutan: Terbaru"
                }
                TextButton(onClick = { viewModel.setSort(nextSort) }) {
                    Text(sortLabel, color = MintTextSecondary, fontSize = 12.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedButton(
                        onClick = { audioPicker.launch(arrayOf("audio/*")) },
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Icon(Icons.Rounded.UploadFile, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Impor Audio", color = EmeraldBright, fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = onOpenCreateMix,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text("Buat Mix", color = MintTextSecondary, fontSize = 12.sp)
                    }
                }
            }
        }

        // Folder Playlist
        if (state.folders.isNotEmpty() && (state.filter == "all" || state.filter == "playlist")) {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.folders, key = { it.id }) { folder ->
                        val active = state.selectedFolderId == folder.id
                        FilterChip(
                            selected = active,
                            onClick = { viewModel.selectFolder(folder.id) },
                            leadingIcon = { Icon(Icons.Rounded.Folder, contentDescription = null, modifier = Modifier.size(16.dp)) },
                            label = { Text(folder.name) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = EmeraldPrimary.copy(alpha = 0.25f),
                                selectedLabelColor = EmeraldBright
                            )
                        )
                    }
                }
            }
        }

        // Kartu Lagu Disukai (Selalu tampil di All & Playlist)
        if (state.filter == "all" || state.filter == "playlist") {
            item {
                GlassCard(
                    onClick = onOpenLiked,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(54.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Brush.linearGradient(listOf(EmeraldBright, EmeraldDeep))),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Rounded.Favorite, contentDescription = null, tint = ObsidianBlack, modifier = Modifier.size(26.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Lagu yang Disukai", style = MaterialTheme.typography.titleMedium)
                            Text("Playlist Disematkan • ${state.likedTracks.size} lagu", style = MaterialTheme.typography.bodySmall)
                        }
                        Icon(Icons.Rounded.PushPin, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }

        // Daftar Playlist Lokal
        if (state.filter == "all" || state.filter == "playlist") {
            items(state.playlists, key = { it.id }) { pl ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenLocalPlaylist(pl.id) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ArtworkImage(url = pl.coverUrl, contentDescription = pl.name, modifier = Modifier.size(54.dp), cornerRadius = 10.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(pl.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Playlist • ${pl.tracksList().size} lagu", style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick = { viewModel.togglePinPlaylist(pl.id) }) {
                        Icon(
                            Icons.Rounded.PushPin,
                            contentDescription = "Sematkan",
                            tint = if (pl.pinned) EmeraldBright else MintTextMuted.copy(alpha = 0.4f),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }

        // Album Tersimpan
        if (state.filter == "all" || state.filter == "album") {
            items(state.savedAlbums, key = { "alb-${it.id}" }) { entry ->
                val item = entry.toMediaItem()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenItem(item) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ArtworkImage(url = item.displayThumbnail(dataSaver), contentDescription = item.title, modifier = Modifier.size(54.dp), cornerRadius = 10.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        Text("Album • ${item.primaryArtistName}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        // Artis Diikuti
        if (state.filter == "all" || state.filter == "artist") {
            items(state.followedArtists, key = { "art-${it.id}" }) { entry ->
                val item = entry.toMediaItem()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenItem(item) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ArtworkImage(url = item.displayThumbnail(dataSaver), contentDescription = item.title, modifier = Modifier.size(54.dp), isCircle = true)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        Text("Artis", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        // Podcast Tersimpan
        if (state.filter == "all" || state.filter == "podcast") {
            items(state.savedPodcasts, key = { "pod-${it.id}" }) { entry ->
                val item = entry.toMediaItem()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenItem(item) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ArtworkImage(url = item.displayThumbnail(dataSaver), contentDescription = item.title, modifier = Modifier.size(54.dp), cornerRadius = 10.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        Text("Podcast • ${item.primaryArtistName}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        // Unduhan Offline
        if (state.filter == "offline" || (state.filter == "all" && state.offlineDownloads.isNotEmpty())) {
            item {
                Text("Unduhan Offline (${state.offlineDownloads.size})", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
            }
            val offTracks = state.offlineDownloads.map { it.toMediaItem() }
            items(state.offlineDownloads, key = { "off-${it.id}" }) { entity ->
                val item = entity.toMediaItem()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPlayTrack(item, offTracks, "Musik Offline") }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ArtworkImage(url = item.displayThumbnail(dataSaver), contentDescription = item.title, modifier = Modifier.size(48.dp), cornerRadius = 8.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        Text("${entity.codec} • ${entity.fileSize / 1024} KB • Offline", style = MaterialTheme.typography.bodySmall, color = EmeraldBright)
                    }
                    IconButton(onClick = { viewModel.deleteOfflineDownload(entity.id) }) {
                        Icon(Icons.Rounded.Delete, contentDescription = "Hapus offline", tint = MintTextMuted)
                    }
                }
            }
        }

        // File Audio Lokal
        if (state.filter == "local" || (state.filter == "all" && state.localAudioFiles.isNotEmpty())) {
            item {
                Text("Audio Lokal Perangkat (${state.localAudioFiles.size})", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
            }
            val localTracks = state.localAudioFiles.map { it.toMediaItem() }
            items(state.localAudioFiles, key = { it.id }) { entity ->
                val item = entity.toMediaItem()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPlayTrack(item, localTracks, "Audio Lokal") }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ObsidianCard),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.AudioFile, contentDescription = null, tint = EmeraldBright)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(entity.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        Text("${entity.artist} • ${entity.codec}", style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick = { viewModel.deleteLocalAudio(entity.id) }) {
                        Icon(Icons.Rounded.Delete, contentDescription = "Hapus", tint = MintTextMuted)
                    }
                }
            }
        }
    }

    if (showCreatePlaylistDialog) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreatePlaylistDialog = false },
            containerColor = ObsidianCard,
            title = { Text("Buat Playlist Baru") },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    placeholder = { Text("Nama playlist...") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.createPlaylist(name, folderId = state.selectedFolderId)
                        showCreatePlaylistDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                ) { Text("Buat") }
            },
            dismissButton = {
                TextButton(onClick = { showCreatePlaylistDialog = false }) { Text("Batal") }
            }
        )
    }

    if (showCreateFolderDialog) {
        var folderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateFolderDialog = false },
            containerColor = ObsidianCard,
            title = { Text("Buat Folder Playlist") },
            text = {
                OutlinedTextField(
                    value = folderName,
                    onValueChange = { folderName = it },
                    placeholder = { Text("Nama folder...") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.createFolder(folderName)
                        showCreateFolderDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                ) { Text("Buat") }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolderDialog = false }) { Text("Batal") }
            }
        )
    }
}

@Composable
fun LikedTracksScreen(
    libraryViewModel: LibraryViewModel,
    detailViewModel: DetailViewModel,
    currentPlayingId: String?,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val state by libraryViewModel.uiState.collectAsState()
    val offline by detailViewModel.offlineDownloads.collectAsState(emptyList())
    val offlineIds = offline.map { it.id }.toSet()

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(144.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Brush.linearGradient(listOf(EmeraldBright, EmeraldDeep))),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Rounded.Favorite, contentDescription = null, tint = ObsidianBlack, modifier = Modifier.size(64.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text("Lagu yang Disukai", style = MaterialTheme.typography.headlineMedium)
                Text("${state.likedTracks.size} lagu favorit", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { if (state.likedTracks.isNotEmpty()) onPlayTrack(state.likedTracks.first(), state.likedTracks, "Lagu Disukai") },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                    ) {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("Putar", fontWeight = FontWeight.Bold)
                    }
                    OutlinedButton(onClick = {
                        if (state.likedTracks.isNotEmpty()) {
                            val shuf = state.likedTracks.shuffled()
                            onPlayTrack(shuf.first(), shuf, "Lagu Disukai (Acak)")
                        }
                    }) {
                        Icon(Icons.Rounded.Shuffle, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Acak", color = EmeraldBright)
                    }
                    IconButton(onClick = { detailViewModel.downloadTracksOffline(state.likedTracks) }) {
                        Icon(Icons.Rounded.DownloadForOffline, contentDescription = "Unduh Semua", tint = EmeraldBright)
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        itemsIndexed(state.likedTracks, key = { _, t -> t.playableVideoId }) { idx, track ->
            TrackRowItem(
                track = track,
                index = idx,
                isPlayingNow = track.playableVideoId == currentPlayingId,
                isLiked = true,
                isOffline = track.playableVideoId in offlineIds,
                dataSaver = dataSaver,
                onClick = { onPlayTrack(track, state.likedTracks, "Lagu Disukai") },
                onToggleLike = { onToggleLike(track) },
                onMoreClick = { onOpenTrackMenu(track) },
                modifier = Modifier.padding(horizontal = 6.dp)
            )
        }
    }
}

@Composable
fun LocalPlaylistScreen(
    playlistId: String,
    viewModel: DetailViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?, PlaylistMixSettings?) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val playlist by viewModel.localPlaylist.collectAsState()
    val offline by viewModel.offlineDownloads.collectAsState(emptyList())
    val offlineIds = offline.map { it.id }.toSet()

    LaunchedEffect(playlistId) { viewModel.observeLocalPlaylist(playlistId) }

    val pl = playlist ?: return
    val tracks = pl.tracksList()
    val mix = pl.mixConfig()

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                IconButton(onClick = { viewModel.deleteLocalPlaylist(playlistId, onBack) }) {
                    Icon(Icons.Rounded.Delete, contentDescription = "Hapus Playlist", tint = DangerRed)
                }
            }
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                ArtworkImage(url = pl.coverUrl, contentDescription = pl.name, modifier = Modifier.size(160.dp), cornerRadius = 16.dp)
                Spacer(Modifier.height(12.dp))
                Text(pl.name, style = MaterialTheme.typography.headlineMedium)
                if (pl.description.isNotBlank()) {
                    Text(pl.description, style = MaterialTheme.typography.bodySmall)
                }
                Text("${tracks.size} lagu", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { if (tracks.isNotEmpty()) onPlayTrack(tracks.first(), tracks, pl.name, mix) },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                    ) {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("Putar", fontWeight = FontWeight.Bold)
                    }
                    OutlinedButton(onClick = {
                        if (tracks.isNotEmpty()) {
                            val shuf = tracks.shuffled()
                            onPlayTrack(shuf.first(), shuf, pl.name, mix)
                        }
                    }) {
                        Icon(Icons.Rounded.Shuffle, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Acak", color = EmeraldBright)
                    }
                    IconButton(onClick = { viewModel.removeDuplicateTracks(playlistId) }) {
                        Icon(Icons.Rounded.CleaningServices, contentDescription = "Hapus Duplikat", tint = MintTextSecondary)
                    }
                    IconButton(onClick = { viewModel.downloadTracksOffline(tracks) }) {
                        Icon(Icons.Rounded.DownloadForOffline, contentDescription = "Unduh Offline", tint = EmeraldBright)
                    }
                }
                Spacer(Modifier.height(10.dp))
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Tune, contentDescription = null, tint = EmeraldBright)
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Mode Mix DJ / Beatmatch", style = MaterialTheme.typography.titleMedium, fontSize = 14.sp)
                            Text("Gaya ${mix.transitionStyle} • ${mix.durationSeconds} dtk", style = MaterialTheme.typography.bodySmall)
                        }
                        Switch(
                            checked = mix.enabled,
                            onCheckedChange = { viewModel.updateLocalPlaylistMix(playlistId, mix.copy(enabled = it)) },
                            colors = SwitchDefaults.colors(checkedThumbColor = ObsidianBlack, checkedTrackColor = EmeraldBright)
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        itemsIndexed(tracks, key = { idx, t -> "lpl-$idx-${t.playableVideoId}" }) { idx, track ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TrackRowItem(
                    track = track,
                    index = idx,
                    isPlayingNow = track.playableVideoId == currentPlayingId,
                    isLiked = track.playableVideoId in likedTrackIds,
                    isOffline = track.playableVideoId in offlineIds,
                    dataSaver = dataSaver,
                    onClick = { onPlayTrack(track, tracks, pl.name, mix) },
                    onToggleLike = { onToggleLike(track) },
                    onMoreClick = { onOpenTrackMenu(track) },
                    modifier = Modifier.weight(1f)
                )
                Column {
                    if (idx > 0) {
                        IconButton(onClick = { viewModel.moveLocalPlaylistTrack(playlistId, idx, idx - 1) }, modifier = Modifier.size(26.dp)) {
                            Icon(Icons.Rounded.ArrowUpward, contentDescription = "Naik", tint = MintTextMuted, modifier = Modifier.size(16.dp))
                        }
                    }
                    if (idx < tracks.lastIndex) {
                        IconButton(onClick = { viewModel.moveLocalPlaylistTrack(playlistId, idx, idx + 1) }, modifier = Modifier.size(26.dp)) {
                            Icon(Icons.Rounded.ArrowDownward, contentDescription = "Turun", tint = MintTextMuted, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                IconButton(onClick = { viewModel.removeLocalPlaylistTrack(playlistId, idx) }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Rounded.Delete, contentDescription = "Hapus dari playlist", tint = MintTextMuted, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}
