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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.GlassBorder
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.DetailViewModel

@Composable
fun MoodsScreen(
    viewModel: DetailViewModel,
    onBack: () -> Unit,
    onOpenMoodDetail: (String, String) -> Unit
) {
    val groups by viewModel.moodGroups.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadMoods()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 140.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                Text("Mood & Genre", style = MaterialTheme.typography.headlineMedium)
            }
        }
        if (isLoading && groups.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        groups.forEach { group ->
            item {
                Text(
                    text = group.title,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                )
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    group.items.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            pair.forEach { cat ->
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(64.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Brush.linearGradient(listOf(EmeraldPrimary.copy(alpha = 0.22f), ObsidianCard)))
                                        .border(1.dp, GlassBorder, RoundedCornerShape(12.dp))
                                        .clickable { onOpenMoodDetail(cat.params, cat.title) }
                                        .padding(12.dp),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    Text(cat.title, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
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
fun MoodDetailScreen(
    params: String,
    title: String,
    viewModel: DetailViewModel,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onOpenItem: (MediaItem) -> Unit
) {
    val playlists by viewModel.moodPlaylists.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(params) {
        viewModel.loadMoodPlaylists(params, title)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 140.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                Text(title, style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (isLoading) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        items(playlists, key = { "${it.id}-${it.title}" }) { item ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenItem(item) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ArtworkImage(url = item.displayThumbnail(dataSaver), contentDescription = item.title, modifier = Modifier.size(56.dp), cornerRadius = 10.dp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(item.primaryArtistName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
        }
    }
}
