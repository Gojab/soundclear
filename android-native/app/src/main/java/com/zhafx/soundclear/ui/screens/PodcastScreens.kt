package com.zhafx.soundclear.ui.screens

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.domain.AudioMath
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.DetailViewModel

@Composable
fun PodcastDetailScreen(
    podcastId: String,
    fallbackQuery: String?,
    viewModel: DetailViewModel,
    dataSaver: Boolean,
    onBack: () -> Unit,
    onPlayEpisode: (MediaItem, List<MediaItem>, String) -> Unit,
    onOpenEpisode: (String, String?) -> Unit
) {
    val podcast by viewModel.podcastDetail.collectAsState()
    val savedPodcasts by viewModel.savedPodcasts.collectAsState(emptyList())
    val progressList by viewModel.episodeProgress.collectAsState(emptyList())
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(podcastId) { viewModel.loadPodcast(podcastId, fallbackQuery) }

    val isSaved = savedPodcasts.any { it.id == podcastId }
    val progressMap = progressList.associateBy { it.episodeId }

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
        }
        if (isLoading && podcast == null) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        podcast?.let { pod ->
            val episodeMediaItems = pod.episodes.map { it.toMediaItem(pod.author) }
            item {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    ArtworkImage(url = pod.thumbnail, contentDescription = pod.title, modifier = Modifier.size(164.dp), cornerRadius = 16.dp)
                    Spacer(Modifier.height(12.dp))
                    Text(pod.title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    pod.author?.let { Text(it, color = MintTextSecondary, fontSize = 14.sp) }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = {
                                if (episodeMediaItems.isNotEmpty()) {
                                    onPlayEpisode(episodeMediaItems.first(), episodeMediaItems, pod.title)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Putar Terbaru", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = { viewModel.toggleSavePodcast(pod) }) {
                            Text(if (isSaved) "Tersimpan" else "Ikuti Podcast", color = if (isSaved) EmeraldBright else MintTextSecondary)
                        }
                    }
                    pod.description?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(12.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 4, overflow = TextOverflow.Ellipsis)
                    }
                }
                Text("Daftar Episode (${pod.episodes.size})", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
            }

            items(pod.episodes, key = { it.id.ifBlank { it.videoId } }) { ep ->
                val epId = ep.videoId.ifBlank { ep.id }
                val prog = progressMap[epId]
                GlassCard(
                    onClick = { onOpenEpisode(epId, ep.title) },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 5.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ArtworkImage(url = ep.thumbnail ?: pod.thumbnail, contentDescription = ep.title, modifier = Modifier.size(56.dp), cornerRadius = 10.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(ep.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(ep.published, ep.duration).joinToString(" • "), style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = {
                            val item = ep.toMediaItem(pod.author)
                            onPlayEpisode(item, episodeMediaItems, pod.title)
                        }) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = "Putar", tint = EmeraldBright)
                        }
                    }
                    if (prog != null && prog.durationSeconds > 0L) {
                        Spacer(Modifier.height(8.dp))
                        if (prog.completed) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Selesai didengarkan", color = EmeraldBright, fontSize = 11.sp)
                            }
                        } else {
                            val frac = (prog.positionSeconds.toFloat() / prog.durationSeconds.toFloat()).coerceIn(0f, 1f)
                            LinearProgressIndicator(
                                progress = { frac },
                                color = EmeraldBright,
                                modifier = Modifier.fillMaxWidth().height(3.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EpisodeDetailScreen(
    episodeId: String,
    fallbackQuery: String?,
    viewModel: DetailViewModel,
    onBack: () -> Unit,
    onPlayEpisode: (MediaItem) -> Unit
) {
    val episode by viewModel.episodeDetail.collectAsState()
    val progressList by viewModel.episodeProgress.collectAsState(emptyList())
    val settings by viewModel.userSettings.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(episodeId) { viewModel.loadEpisode(episodeId, fallbackQuery) }

    val prog = progressList.firstOrNull { it.episodeId == episodeId }
    val currentRate = settings.episodePlaybackRates[episodeId] ?: settings.youtubeSound.defaultPlaybackRate

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
            }
        }
        if (isLoading && episode == null) {
            item {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = EmeraldBright)
                }
            }
        }
        episode?.let { ep ->
            val mediaItem = ep.toMediaItem()
            item {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ArtworkImage(url = ep.thumbnail, contentDescription = ep.title, modifier = Modifier.size(88.dp), cornerRadius = 12.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(ep.title, style = MaterialTheme.typography.titleLarge)
                            Text(ep.podcastTitle ?: ep.author ?: "Podcast", color = EmeraldBright, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Text(listOfNotNull(ep.published, ep.duration).joinToString(" • "), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onPlayEpisode(mediaItem) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text(if (prog != null && !prog.completed && prog.positionSeconds > 5) "Lanjutkan" else "Putar Episode", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = {
                            viewModel.markEpisodeCompleted(episodeId, ep.podcastId, !(prog?.completed ?: false))
                        }) {
                            Text(if (prog?.completed == true) "Sudah Selesai" else "Tandai Selesai", color = EmeraldBright)
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    Text("Kecepatan Putar Episode", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(AudioMath.PLAYBACK_RATE_OPTIONS) { rate ->
                            val selected = kotlin.math.abs(currentRate - rate) < 0.01f
                            FilterChip(
                                selected = selected,
                                onClick = { viewModel.setEpisodePlaybackRate(episodeId, rate) },
                                label = { Text("${rate}x") },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = EmeraldPrimary,
                                    selectedLabelColor = ObsidianBlack,
                                    containerColor = ObsidianCard,
                                    labelColor = MintTextSecondary
                                )
                            )
                        }
                    }

                    ep.description?.takeIf { it.isNotBlank() }?.let { desc ->
                        Spacer(Modifier.height(14.dp))
                        GlassCard(modifier = Modifier.fillMaxWidth()) {
                            Text("Deskripsi Episode", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(6.dp))
                            Text(desc, style = MaterialTheme.typography.bodyMedium, color = MintTextMuted)
                        }
                    }
                }
            }
        }
    }
}
