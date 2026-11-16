package com.zhafx.soundclear.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.data.remote.DailyMixSummary
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.domain.MixCurator
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.components.parseHexColorSafe
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.CreateMixViewModel

@Composable
fun MixDetailScreen(
    mix: DailyMixSummary,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val accent = parseHexColorSafe(mix.accentHex, EmeraldPrimary)

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(modifier = Modifier.size(180.dp)) {
                    ArtworkImage(url = mix.coverUrl, contentDescription = mix.title, modifier = Modifier.fillMaxSize(), cornerRadius = 16.dp)
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .width(8.dp)
                            .height(120.dp)
                            .clip(RoundedCornerShape(topEnd = 6.dp, bottomEnd = 6.dp))
                            .background(accent)
                    )
                }
                Spacer(Modifier.height(14.dp))
                Text(mix.title, style = MaterialTheme.typography.headlineMedium)
                Text(mix.subtitle, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(6.dp))
                Text(mix.description, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { if (mix.tracks.isNotEmpty()) onPlayTrack(mix.tracks.first(), mix.tracks, mix.title) },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                    ) {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("Putar Mix", fontWeight = FontWeight.Bold)
                    }
                    OutlinedButton(onClick = {
                        if (mix.tracks.isNotEmpty()) {
                            val shuf = mix.tracks.shuffled()
                            onPlayTrack(shuf.first(), shuf, mix.title)
                        }
                    }) {
                        Icon(Icons.Rounded.Shuffle, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Acak", color = EmeraldBright)
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        itemsIndexed(mix.tracks, key = { idx, t -> "mix-$idx-${t.playableVideoId}" }) { idx, track ->
            TrackRowItem(
                track = track,
                index = idx,
                isPlayingNow = track.playableVideoId == currentPlayingId,
                isLiked = track.playableVideoId in likedTrackIds,
                dataSaver = dataSaver,
                onClick = { onPlayTrack(track, mix.tracks, mix.title) },
                onToggleLike = { onToggleLike(track) },
                onMoreClick = { onOpenTrackMenu(track) },
                modifier = Modifier.padding(horizontal = 6.dp)
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CreateMixScreen(
    viewModel: CreateMixViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onSavedPlaylist: (String) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                Text("Buat Mix Pilihan", style = MaterialTheme.typography.headlineMedium)
            }
        }

        item {
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                Text("Pilih Mode Kurasi", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("track" to "Dari Lagu", "genre" to "Genre", "blend" to "Campuran").forEach { (id, label) ->
                        FilterChip(
                            selected = state.mode == id,
                            onClick = { viewModel.setMode(id) },
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

                if (state.mode == "track" || state.mode == "blend") {
                    Spacer(Modifier.height(12.dp))
                    Text("Lagu Acuan (${state.seedTracks.size}/3)", style = MaterialTheme.typography.titleMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.seedTracks.forEach { seed ->
                            InputChip(
                                selected = true,
                                onClick = { viewModel.removeSeedTrack(seed.playableVideoId) },
                                label = { Text(seed.title, maxLines = 1) },
                                trailingIcon = { Icon(Icons.Rounded.Close, contentDescription = "Hapus", modifier = Modifier.size(16.dp)) }
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(
                        value = state.searchQuery,
                        onValueChange = { viewModel.searchSeedTracks(it) },
                        placeholder = { Text("Cari lagu acuan...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    state.searchResults.take(5).forEach { res ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.addSeedTrack(res) }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ArtworkImage(url = res.displayThumbnail(dataSaver), contentDescription = res.title, modifier = Modifier.size(40.dp))
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(res.title, style = MaterialTheme.typography.titleMedium, fontSize = 14.sp, maxLines = 1)
                                Text(res.primaryArtistName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            }
                            Icon(Icons.Rounded.Add, contentDescription = "Tambah", tint = EmeraldBright)
                        }
                    }
                }

                if (state.mode == "genre" || state.mode == "blend") {
                    Spacer(Modifier.height(12.dp))
                    Text("Pilih Genre (${state.selectedGenres.size}/2)", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MixCurator.CURATED_MIX_GENRES.forEach { genre ->
                            val selected = genre.label in state.selectedGenres
                            FilterChip(
                                selected = selected,
                                onClick = { viewModel.toggleGenre(genre.label) },
                                label = { Text(genre.label) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = EmeraldPrimary,
                                    selectedLabelColor = ObsidianBlack,
                                    containerColor = ObsidianCard,
                                    labelColor = MintTextSecondary
                                )
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.customTitle,
                    onValueChange = { viewModel.setCustomTitle(it) },
                    label = { Text("Judul Mix (Opsional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
                Text("Jumlah Lagu Target", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(15, 25, 40).forEach { count ->
                        FilterChip(
                            selected = state.targetCount == count,
                            onClick = { viewModel.setTargetCount(count) },
                            label = { Text("$count lagu") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = EmeraldPrimary,
                                selectedLabelColor = ObsidianBlack
                            )
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))
                Button(
                    onClick = { viewModel.generateMix(incrementShuffle = false) },
                    enabled = !state.isGenerating,
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    if (state.isGenerating) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = ObsidianBlack, strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Racik Mix Sekarang", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        if (state.generatedTracks.isNotEmpty()) {
            item {
                GlassCard(modifier = Modifier.padding(16.dp)) {
                    Text(state.generatedTitle, style = MaterialTheme.typography.titleLarge)
                    Text(state.generatedSubtitle, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onPlayTrack(state.generatedTracks.first(), state.generatedTracks, state.generatedTitle) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Putar", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = { viewModel.saveAsPlaylist(onSavedPlaylist) }) {
                            Icon(Icons.Rounded.BookmarkAdd, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Simpan", color = EmeraldBright)
                        }
                        IconButton(onClick = { viewModel.generateMix(incrementShuffle = true) }) {
                            Icon(Icons.Rounded.Refresh, contentDescription = "Racik ulang", tint = MintTextSecondary)
                        }
                        IconButton(onClick = { viewModel.shuffleGeneratedOrder() }) {
                            Icon(Icons.Rounded.Shuffle, contentDescription = "Acak urutan", tint = MintTextSecondary)
                        }
                    }
                    state.savedToast?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(it, color = EmeraldBright, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            itemsIndexed(state.generatedTracks, key = { idx, t -> "cmix-$idx-${t.playableVideoId}" }) { idx, track ->
                TrackRowItem(
                    track = track,
                    index = idx,
                    isPlayingNow = track.playableVideoId == currentPlayingId,
                    isLiked = track.playableVideoId in likedTrackIds,
                    dataSaver = dataSaver,
                    onClick = { onPlayTrack(track, state.generatedTracks, state.generatedTitle) },
                    onToggleLike = { onToggleLike(track) },
                    onMoreClick = { onOpenTrackMenu(track) },
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
            }
        }
    }
}
