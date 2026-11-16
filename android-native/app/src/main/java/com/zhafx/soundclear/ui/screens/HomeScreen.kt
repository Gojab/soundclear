package com.zhafx.soundclear.ui.screens

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Headphones
import androidx.compose.material.icons.rounded.Mood
import androidx.compose.material.icons.rounded.Podcasts
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.data.remote.DailyMixSummary
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.components.SoundClearMediaCard
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.components.parseHexColorSafe
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldDeep
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.GlassBorder
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextPrimary
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.HomeViewModel

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenItem: (MediaItem) -> Unit,
    onOpenMix: (DailyMixSummary) -> Unit,
    onOpenCreateMix: () -> Unit,
    onOpenMoods: () -> Unit,
    onOpenMoodDetail: (String, String) -> Unit,
    onOpenRecap: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenEqualizer: () -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 140.dp)
    ) {
        // Header + Aksi cepat (Rekap, EQ, Pengaturan)
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(listOf(EmeraldBright, EmeraldDeep))),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.GraphicEq, contentDescription = null, tint = ObsidianBlack, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(state.greeting, style = MaterialTheme.typography.headlineMedium)
                        Text("SoundClear Audio Engine", color = EmeraldBright, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                IconButton(onClick = onOpenRecap) {
                    Icon(Icons.Rounded.BarChart, contentDescription = "Rekap", tint = MintTextSecondary)
                }
                IconButton(onClick = onOpenEqualizer) {
                    Icon(Icons.Rounded.GraphicEq, contentDescription = "Equalizer", tint = EmeraldBright)
                }
                IconButton(onClick = onOpenSettings) {
                    Icon(Icons.Rounded.Settings, contentDescription = "Pengaturan", tint = MintTextSecondary)
                }
            }
        }

        // Category Filter Pills (Semua, Musik, Podcast, Audio Lokal)
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val cats = listOf(
                    "all" to "Semua",
                    "music" to "Musik",
                    "podcast" to "Podcast",
                    "local" to "Audio Lokal"
                )
                items(cats) { (id, label) ->
                    val selected = state.selectedCategory == id
                    FilterChip(
                        selected = selected,
                        onClick = { viewModel.selectCategory(id) },
                        label = { Text(label, fontWeight = FontWeight.SemiBold) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = EmeraldPrimary,
                            selectedLabelColor = ObsidianBlack,
                            containerColor = ObsidianCard,
                            labelColor = MintTextSecondary
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selected,
                            borderColor = GlassBorder
                        )
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        if (state.isLoading && state.sections.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }

        if (state.error != null && state.sections.isEmpty()) {
            item {
                GlassCard(modifier = Modifier.padding(16.dp)) {
                    Text("Gagal memuat katalog beranda", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(state.error.orEmpty(), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = { viewModel.refresh() },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                    ) {
                        Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Coba Lagi")
                    }
                }
            }
        }

        // Mode Khusus: Audio Lokal
        if (state.selectedCategory == "local") {
            item {
                SectionHeader(title = "Audio Lokal di Perangkat (${state.localTracks.size})")
                if (state.localTracks.isEmpty()) {
                    GlassCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                        Text("Belum ada file audio lokal yang diimpor.", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text("Buka tab Pustaka untuk mengimpor file MP3, FLAC, M4A, atau WAV dari penyimpanan HP.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            items(state.localTracks, key = { it.id }) { track ->
                TrackRowItem(
                    track = track,
                    isPlayingNow = track.playableVideoId == currentPlayingId,
                    isLiked = track.playableVideoId in likedTrackIds,
                    dataSaver = dataSaver,
                    onClick = { onPlayTrack(track, state.localTracks, "Audio Lokal") },
                    onToggleLike = { onToggleLike(track) },
                    onMoreClick = { onOpenTrackMenu(track) },
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
            }
            return@LazyColumn
        }

        // Mode Khusus: Podcast
        if (state.selectedCategory == "podcast") {
            val podcastItems = state.sections.flatMap { it.items }
                .filter { it.type in setOf("podcast", "episode") }
                .distinctBy { it.id }
            item {
                SectionHeader(title = "Podcast & Episode Pilihan")
                if (podcastItems.isEmpty()) {
                    GlassCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Podcasts, contentDescription = null, tint = EmeraldBright)
                            Spacer(Modifier.width(10.dp))
                            Text("Gunakan tab Jelajah untuk mencari podcast favorit Indonesia & global.", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            items(podcastItems, key = { it.id }) { item ->
                TrackRowItem(
                    track = item,
                    isPlayingNow = item.playableVideoId == currentPlayingId,
                    dataSaver = dataSaver,
                    onClick = { onOpenItem(item) },
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
            }
            return@LazyColumn
        }

        // Quick Access 2-column grid (Semua & Musik)
        val quickTiles = (state.recentTracks.take(4) + state.charts?.songs.orEmpty()).distinctBy { it.playableVideoId }.take(6)
        if (quickTiles.isNotEmpty()) {
            item {
                Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    quickTiles.chunked(2).forEach { pair ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            pair.forEach { item ->
                                QuickAccessTile(
                                    item = item,
                                    dataSaver = dataSaver,
                                    onClick = { onPlayTrack(item, quickTiles, "Akses Cepat") },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
        }

        // Section Dinamis sesuai HomeSectionOrder dari Pengaturan
        val order = state.homeSectionOrder.ifEmpty {
            listOf("continue", "daily_mix", "frequent", "charts", "home_feed", "moods")
        }

        order.forEach { secId ->
            when (secId) {
                "continue" -> if (state.recentTracks.isNotEmpty()) {
                    item {
                        SectionHeader(title = "Lanjutkan Mendengarkan")
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(state.recentTracks, key = { "cont-${it.playableVideoId}" }) { item ->
                                SoundClearMediaCard(
                                    item = item,
                                    dataSaver = dataSaver,
                                    onClick = { onPlayTrack(item, state.recentTracks, "Baru Diputar") }
                                )
                            }
                        }
                    }
                }
                "daily_mix" -> {
                    item {
                        SectionHeader(
                            title = "Mix Harian Untukmu",
                            actionLabel = "Buat Mix",
                            onAction = onOpenCreateMix
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            item {
                                GlassCard(
                                    onClick = onOpenCreateMix,
                                    modifier = Modifier.width(148.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(106.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(Brush.linearGradient(listOf(EmeraldBright, EmeraldDeep))),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = ObsidianBlack, modifier = Modifier.size(38.dp))
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    Text("Buat Mix Kustom", style = MaterialTheme.typography.titleMedium, fontSize = 14.sp)
                                    Text("Racik lagu & genre", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            items(state.dailyMixes, key = { it.id }) { mix ->
                                DailyMixCard(mix = mix, onClick = { onOpenMix(mix) })
                            }
                        }
                    }
                }
                "frequent" -> if (state.frequentTracks.isNotEmpty()) {
                    item {
                        SectionHeader(title = "Sering Diputar")
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(state.frequentTracks, key = { "freq-${it.playableVideoId}" }) { item ->
                                SoundClearMediaCard(
                                    item = item,
                                    dataSaver = dataSaver,
                                    onClick = { onPlayTrack(item, state.frequentTracks, "Sering Diputar") }
                                )
                            }
                        }
                    }
                }
                "charts" -> {
                    val chartSongs = state.charts?.songs.orEmpty()
                    if (chartSongs.isNotEmpty()) {
                        item {
                            SectionHeader(title = "Tangga Lagu Indonesia")
                            Column(modifier = Modifier.padding(horizontal = 6.dp)) {
                                chartSongs.take(8).forEachIndexed { idx, track ->
                                    TrackRowItem(
                                        track = track,
                                        index = idx,
                                        isPlayingNow = track.playableVideoId == currentPlayingId,
                                        isLiked = track.playableVideoId in likedTrackIds,
                                        dataSaver = dataSaver,
                                        onClick = { onPlayTrack(track, chartSongs, "Tangga Lagu Indonesia") },
                                        onToggleLike = { onToggleLike(track) },
                                        onMoreClick = { onOpenTrackMenu(track) }
                                    )
                                }
                            }
                        }
                    }
                }
                "home_feed" -> {
                    state.sections.forEach { section ->
                        item {
                            SectionHeader(title = section.title.ifBlank { "Rekomendasi Untukmu" })
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                items(section.items, key = { "${section.title}-${it.id}-${it.title}" }) { item ->
                                    SoundClearMediaCard(
                                        item = item,
                                        dataSaver = dataSaver,
                                        onClick = {
                                            if (item.type in setOf("song", "video", "episode")) {
                                                onPlayTrack(item, section.items.filter { s -> s.type in setOf("song", "video") }, section.title)
                                            } else {
                                                onOpenItem(item)
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                "moods" -> if (state.moodHighlights.isNotEmpty()) {
                    item {
                        SectionHeader(
                            title = "Mood & Genre",
                            actionLabel = "Lihat semua",
                            onAction = onOpenMoods
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(state.moodHighlights, key = { it.params }) { mood ->
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(ObsidianCard)
                                        .border(1.dp, EmeraldPrimary.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
                                        .clickable { onOpenMoodDetail(mood.params, mood.title) }
                                        .padding(horizontal = 16.dp, vertical = 14.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Rounded.Mood, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text(mood.title, color = MintTextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 12.dp, top = 18.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction) {
                Text(actionLabel, color = EmeraldBright, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun QuickAccessTile(
    item: MediaItem,
    dataSaver: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .height(54.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xD9121D17))
            .border(1.dp, GlassBorder, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ArtworkImage(
            url = item.displayThumbnail(dataSaver),
            contentDescription = item.title,
            modifier = Modifier.size(54.dp),
            cornerRadius = 0.dp
        )
        Text(
            text = item.title,
            color = MintTextPrimary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 8.dp)
        )
    }
}

@Composable
private fun DailyMixCard(mix: DailyMixSummary, onClick: () -> Unit) {
    val accent = parseHexColorSafe(mix.accentHex, EmeraldPrimary)
    Column(
        modifier = Modifier
            .width(148.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(ObsidianCard)
            .border(1.dp, GlassBorder, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(10.dp)
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(126.dp)) {
            ArtworkImage(
                url = mix.coverUrl,
                contentDescription = mix.title,
                modifier = Modifier.fillMaxSize(),
                cornerRadius = 10.dp
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(6.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(accent)
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text("MIX 0${mix.mixNumber}", color = ObsidianBlack, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(mix.title, style = MaterialTheme.typography.titleMedium, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(mix.subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}
