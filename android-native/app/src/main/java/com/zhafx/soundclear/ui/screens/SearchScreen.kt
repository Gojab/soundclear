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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Mood
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.domain.MixCurator
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.components.SoundClearMediaCard
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldDeep
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.GlassBorder
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextPrimary
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.SearchViewModel

@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    currentPlayingId: String?,
    likedTrackIds: Set<String>,
    dataSaver: Boolean,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit,
    onOpenItem: (MediaItem) -> Unit,
    onOpenMoods: () -> Unit,
    onStartRadio: (MediaItem) -> Unit,
    onOpenTrackMenu: (MediaItem) -> Unit,
    onToggleLike: (MediaItem) -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val keyboard = LocalSoftwareKeyboardController.current

    val filters = listOf(
        "all" to "Semua",
        "songs" to "Lagu",
        "albums" to "Album",
        "artists" to "Artis",
        "playlists" to "Playlist",
        "videos" to "Video",
        "podcasts" to "Podcast",
        "episodes" to "Episode"
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 140.dp)
    ) {
        item {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text("Jelajah & Cari", style = MaterialTheme.typography.displaySmall)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.query,
                    onValueChange = { viewModel.onQueryChanged(it) },
                    placeholder = { Text("Cari lagu, artis, album, lirik, podcast...") },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = EmeraldBright) },
                    trailingIcon = {
                        if (state.query.isNotEmpty()) {
                            IconButton(onClick = { viewModel.onQueryChanged("") }) {
                                Icon(Icons.Rounded.Close, contentDescription = "Hapus", tint = MintTextMuted)
                            }
                        }
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = {
                        keyboard?.hide()
                        viewModel.executeSearch()
                    }),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = EmeraldPrimary,
                        unfocusedBorderColor = GlassBorder,
                        focusedContainerColor = ObsidianCard,
                        unfocusedContainerColor = ObsidianCard,
                        focusedTextColor = MintTextPrimary,
                        unfocusedTextColor = MintTextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Saran ketik (autocomplete suggest)
        if (state.suggestions.isNotEmpty() && !state.hasSearched) {
            items(state.suggestions) { sugg ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            keyboard?.hide()
                            viewModel.executeSearch(sugg)
                        }
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Rounded.Search, contentDescription = null, tint = MintTextMuted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(sugg, color = MintTextPrimary, fontSize = 15.sp)
                }
            }
        }

        // Tab Filter Pencarian
        if (state.hasSearched || state.query.isNotBlank()) {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(filters) { (id, label) ->
                        val selected = state.filter == id
                        FilterChip(
                            selected = selected,
                            onClick = { viewModel.selectFilter(id) },
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
        }

        if (state.isSearching) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }

        if (state.hasSearched && !state.isSearching) {
            state.topResult?.let { top ->
                item {
                    Text(
                        text = "Hasil Teratas",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                    GlassCard(
                        onClick = {
                            if (top.type in setOf("song", "video", "episode")) {
                                onPlayTrack(top, listOf(top) + state.results, "Hasil Pencarian")
                            } else {
                                onOpenItem(top)
                            }
                        },
                        modifier = Modifier.padding(horizontal = 16.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ArtworkImage(
                                url = top.displayThumbnail(dataSaver),
                                contentDescription = top.title,
                                modifier = Modifier.size(74.dp),
                                cornerRadius = 12.dp,
                                isCircle = top.type == "artist"
                            )
                            Spacer(Modifier.width(14.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(top.title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    text = "${top.type.uppercase()} • ${top.primaryArtistName}",
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Spacer(Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = {
                                            if (top.type in setOf("song", "video", "episode")) {
                                                onPlayTrack(top, listOf(top) + state.results, "Hasil Pencarian")
                                            } else {
                                                onOpenItem(top)
                                            }
                                        },
                                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                                    ) {
                                        Icon(Icons.Rounded.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text(if (top.type in setOf("song", "video", "episode")) "Putar" else "Buka", fontWeight = FontWeight.Bold)
                                    }
                                    if (top.type in setOf("song", "video")) {
                                        OutlinedButton(
                                            onClick = { onStartRadio(top) },
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Rounded.Radio, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Radio", color = EmeraldBright)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }

            if (state.results.isNotEmpty()) {
                item {
                    Text(
                        text = "Hasil Pencarian",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
                items(state.results, key = { "${it.id}-${it.title}" }) { item ->
                    if (item.type in setOf("song", "video", "episode")) {
                        TrackRowItem(
                            track = item,
                            isPlayingNow = item.playableVideoId == currentPlayingId,
                            isLiked = item.playableVideoId in likedTrackIds,
                            dataSaver = dataSaver,
                            onClick = { onPlayTrack(item, state.results.filter { it.type in setOf("song", "video") }, "Pencarian: ${state.query}") },
                            onToggleLike = { onToggleLike(item) },
                            onMoreClick = { onOpenTrackMenu(item) },
                            modifier = Modifier.padding(horizontal = 6.dp)
                        )
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenItem(item) }
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ArtworkImage(
                                url = item.displayThumbnail(dataSaver),
                                contentDescription = item.title,
                                modifier = Modifier.size(48.dp),
                                cornerRadius = 8.dp,
                                isCircle = item.type == "artist"
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${item.type.uppercase()} • ${item.primaryArtistName}", style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            }
                        }
                    }
                }
            } else if (state.topResult == null && state.error == null) {
                item {
                    GlassCard(modifier = Modifier.padding(16.dp)) {
                        Text("Tidak ditemukan hasil untuk \"${state.query}\"", style = MaterialTheme.typography.titleMedium)
                        Text("Coba kata kunci lain atau ubah tab filter di atas.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            if (state.relatedFollowUps.isNotEmpty()) {
                item {
                    Text(
                        text = "Lagu Serupa & Rekomendasi Lanjutan",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(state.relatedFollowUps, key = { "rel-${it.playableVideoId}" }) { rel ->
                            SoundClearMediaCard(
                                item = rel,
                                dataSaver = dataSaver,
                                onClick = { onPlayTrack(rel, state.relatedFollowUps, "Lagu Serupa") }
                            )
                        }
                    }
                }
            }
        } else if (!state.hasSearched) {
            // Pencarian Terakhir
            if (state.recentSearches.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Pencarian Terakhir", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                        TextButton(onClick = { viewModel.clearRecentSearches() }) {
                            Text("Hapus semua", color = MintTextMuted, fontSize = 12.sp)
                        }
                    }
                }
                items(state.recentSearches) { recent ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { viewModel.executeSearch(recent) }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.History, contentDescription = null, tint = MintTextMuted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(recent, color = MintTextPrimary, modifier = Modifier.weight(1f))
                        IconButton(onClick = { viewModel.removeRecentSearch(recent) }, modifier = Modifier.size(30.dp)) {
                            Icon(Icons.Rounded.Close, contentDescription = "Hapus", tint = MintTextMuted, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }

            // Kartu Sorotan Mood & Genre
            item {
                GlassCard(
                    onClick = onOpenMoods,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Brush.linearGradient(listOf(EmeraldBright, EmeraldDeep))),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Rounded.Mood, contentDescription = null, tint = ObsidianBlack, modifier = Modifier.size(26.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Temukan Sesuai Suasana Hati", style = MaterialTheme.typography.titleMedium)
                            Text("Jelajahi seluruh kategori Mood & Genre SoundClear", style = MaterialTheme.typography.bodySmall)
                        }
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = EmeraldBright)
                    }
                }
            }

            // Mulai Menjelajah (Quick Browse 2-kolom)
            item {
                Text(
                    text = "Mulai Menjelajah",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    MixCurator.QUICK_BROWSE_CARDS.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            pair.forEach { tile ->
                                BrowseCategoryCard(
                                    title = tile.title,
                                    subtitle = tile.subtitle,
                                    bgColor = Color(tile.colorHex),
                                    onClick = { viewModel.executeSearch(tile.query, tile.filter) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }
            }

            // Jelajahi Semua Kategori
            item {
                Text(
                    text = "Jelajahi Semua Kategori",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                )
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    MixCurator.ALL_BROWSE_CATEGORIES.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            pair.forEach { tile ->
                                BrowseCategoryCard(
                                    title = tile.title,
                                    subtitle = tile.subtitle,
                                    bgColor = Color(tile.colorHex),
                                    onClick = { viewModel.executeSearch(tile.query, tile.filter) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun BrowseCategoryCard(
    title: String,
    subtitle: String,
    bgColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .height(92.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.linearGradient(
                    listOf(bgColor, bgColor.copy(alpha = 0.65f), Color(0xFF0A0E0C))
                )
            )
            .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(subtitle, color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
