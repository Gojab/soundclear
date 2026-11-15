package com.zhafx.soundclear.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Lyrics
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.zhafx.soundclear.model.LyricsData
import com.zhafx.soundclear.model.PlayerUiState
import com.zhafx.soundclear.model.RepeatModeState
import com.zhafx.soundclear.model.TrackItem
import com.zhafx.soundclear.ui.theme.SoundClearColors

@Composable
fun MiniPlayerBar(
    state: PlayerUiState,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    modifier: Modifier = Modifier
) {
    val track = state.currentTrack ?: return
    val progress = if (state.durationMs > 0L) {
        (state.currentPositionMs.toFloat() / state.durationMs.toFloat()).coerceIn(0f, 1f)
    } else 0f

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(SoundClearColors.EmeraldPanel.copy(alpha = 0.94f))
            .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(16.dp))
            .clickable(onClick = onOpenNowPlaying)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ArtworkBox(
                url = track.thumbnailUrl,
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(10.dp))
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = track.title,
                    color = SoundClearColors.TextLight,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = track.artist,
                    color = SoundClearColors.TextMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (state.isBuffering) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .padding(horizontal = 8.dp)
                        .size(22.dp),
                    color = SoundClearColors.MintAccent,
                    strokeWidth = 2.dp
                )
            } else {
                IconButton(onClick = onTogglePlay) {
                    Icon(
                        imageVector = if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = "Putar atau Jeda",
                        tint = SoundClearColors.TextLight
                    )
                }
            }
            IconButton(onClick = onNext) {
                Icon(
                    imageVector = Icons.Rounded.SkipNext,
                    contentDescription = "Berikutnya",
                    tint = SoundClearColors.TextSoft
                )
            }
        }
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp),
            color = SoundClearColors.MintAccent,
            trackColor = Color.White.copy(alpha = 0.08f)
        )
    }
}

@Composable
fun FullNowPlayingScreen(
    state: PlayerUiState,
    lyrics: LyricsData?,
    lyricsLoading: Boolean,
    isLiked: Boolean,
    onClose: () -> Unit,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onSeek: (Long) -> Unit,
    onToggleLike: () -> Unit,
    onToggleShuffle: () -> Unit,
    onCycleRepeat: () -> Unit,
    onSelectQueueTrack: (TrackItem) -> Unit
) {
    val track = state.currentTrack ?: return
    var subView by remember { mutableStateOf("artwork") } // "artwork" | "lyrics" | "queue"

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = SoundClearColors.BlackBase
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            SoundClearColors.EmeraldPanel,
                            SoundClearColors.EmeraldSurface,
                            SoundClearColors.BlackBase
                        )
                    )
                )
                .statusBarsPadding()
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top Bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    IconButton(onClick = onClose) {
                        Icon(
                            imageVector = Icons.Rounded.KeyboardArrowDown,
                            contentDescription = "Tutup",
                            tint = SoundClearColors.TextLight,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "SEDANG DIPUTAR",
                            color = SoundClearColors.MintAccent,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.2.sp
                        )
                        state.streamInfoLabel?.let { label ->
                            Text(
                                text = label,
                                color = SoundClearColors.TextMuted,
                                fontSize = 11.sp
                            )
                        }
                    }
                    Row {
                        IconButton(onClick = { subView = if (subView == "lyrics") "artwork" else "lyrics" }) {
                            Icon(
                                imageVector = Icons.Rounded.Lyrics,
                                contentDescription = "Lirik",
                                tint = if (subView == "lyrics") SoundClearColors.MintAccent else SoundClearColors.TextSoft
                            )
                        }
                        IconButton(onClick = { subView = if (subView == "queue") "artwork" else "queue" }) {
                            Icon(
                                imageVector = Icons.Rounded.QueueMusic,
                                contentDescription = "Antrean",
                                tint = if (subView == "queue") SoundClearColors.MintAccent else SoundClearColors.TextSoft
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Main Content Area (Artwork / Synced Lyrics / Queue)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    when (subView) {
                        "lyrics" -> SyncedLyricsPanel(
                            lyrics = lyrics,
                            loading = lyricsLoading,
                            currentPositionMs = state.currentPositionMs
                        )
                        "queue" -> QueuePanel(
                            queue = state.queue,
                            currentId = track.id,
                            onSelect = {
                                onSelectQueueTrack(it)
                                subView = "artwork"
                            }
                        )
                        else -> {
                            ArtworkBox(
                                url = track.thumbnailUrl,
                                modifier = Modifier
                                    .size(290.dp)
                                    .clip(RoundedCornerShape(24.dp))
                                    .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(24.dp))
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Title & Like
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = track.title,
                            color = SoundClearColors.TextLight,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = track.artist,
                            color = SoundClearColors.TextSoft.copy(alpha = 0.8f),
                            fontSize = 14.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    IconButton(onClick = onToggleLike) {
                        Icon(
                            imageVector = if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                            contentDescription = "Sukai",
                            tint = if (isLiked) SoundClearColors.MintAccent else SoundClearColors.TextSoft
                        )
                    }
                }

                state.errorMessage?.let { err ->
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = err,
                        color = SoundClearColors.Danger,
                        fontSize = 12.sp
                    )
                }

                Spacer(Modifier.height(8.dp))

                // Seek Slider
                val duration = state.durationMs.coerceAtLeast(1L)
                var sliderPos by remember(state.currentPositionMs) {
                    mutableStateOf(state.currentPositionMs.toFloat())
                }
                Slider(
                    value = sliderPos.coerceIn(0f, duration.toFloat()),
                    onValueChange = { sliderPos = it },
                    onValueChangeFinished = { onSeek(sliderPos.toLong()) },
                    valueRange = 0f..duration.toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = SoundClearColors.MintAccent,
                        activeTrackColor = SoundClearColors.EmeraldAccent,
                        inactiveTrackColor = Color.White.copy(alpha = 0.16f)
                    )
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(formatMs(state.currentPositionMs), color = SoundClearColors.TextMuted, fontSize = 12.sp)
                    Text(formatMs(state.durationMs), color = SoundClearColors.TextMuted, fontSize = 12.sp)
                }

                Spacer(Modifier.height(12.dp))

                // Controls Row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onToggleShuffle) {
                        Icon(
                            imageVector = Icons.Rounded.Shuffle,
                            contentDescription = "Acak",
                            tint = if (state.shuffleEnabled) SoundClearColors.MintAccent else SoundClearColors.TextMuted
                        )
                    }

                    IconButton(onClick = onPrevious, modifier = Modifier.size(48.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.SkipPrevious,
                            contentDescription = "Sebelumnya",
                            tint = SoundClearColors.TextLight,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.linearGradient(
                                    listOf(SoundClearColors.MintAccent, SoundClearColors.DeepEmerald)
                                )
                            )
                            .clickable(onClick = onTogglePlay),
                        contentAlignment = Alignment.Center
                    ) {
                        if (state.isBuffering) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(28.dp),
                                color = SoundClearColors.EmeraldPanel,
                                strokeWidth = 3.dp
                            )
                        } else {
                            Icon(
                                imageVector = if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                contentDescription = "Putar atau Jeda",
                                tint = SoundClearColors.EmeraldPanel,
                                modifier = Modifier.size(36.dp)
                            )
                        }
                    }

                    IconButton(onClick = onNext, modifier = Modifier.size(48.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.SkipNext,
                            contentDescription = "Berikutnya",
                            tint = SoundClearColors.TextLight,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    IconButton(onClick = onCycleRepeat) {
                        Icon(
                            imageVector = if (state.repeatMode == RepeatModeState.ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                            contentDescription = "Ulangi",
                            tint = if (state.repeatMode != RepeatModeState.OFF) SoundClearColors.MintAccent else SoundClearColors.TextMuted
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncedLyricsPanel(
    lyrics: LyricsData?,
    loading: Boolean,
    currentPositionMs: Long
) {
    if (loading) {
        CircularProgressIndicator(color = SoundClearColors.MintAccent)
        return
    }
    if (lyrics == null) {
        Text(
            text = "Lirik tidak tersedia untuk lagu ini.",
            color = SoundClearColors.TextMuted,
            textAlign = TextAlign.Center
        )
        return
    }
    if (lyrics.synced && lyrics.lines.isNotEmpty()) {
        val activeIndex = lyrics.lines.indexOfLast { it.timeMs <= currentPositionMs }.coerceAtLeast(0)
        val listState = rememberLazyListState()
        LaunchedEffect(activeIndex) {
            listState.animateScrollToItem((activeIndex - 2).coerceAtLeast(0))
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            itemsIndexed(lyrics.lines) { idx, line ->
                val isActive = idx == activeIndex
                Text(
                    text = line.text,
                    color = if (isActive) SoundClearColors.MintAccent else SoundClearColors.TextSoft.copy(alpha = 0.48f),
                    fontSize = if (isActive) 20.sp else 16.sp,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
                    lineHeight = 26.sp,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    } else {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
                Text(
                    text = lyrics.plainText ?: "Lirik tidak tersedia.",
                    color = SoundClearColors.TextSoft,
                    fontSize = 15.sp,
                    lineHeight = 24.sp
                )
            }
        }
    }
}

@Composable
private fun QueuePanel(
    queue: List<TrackItem>,
    currentId: String,
    onSelect: (TrackItem) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(queue, key = { it.id }) { item ->
            val active = item.id == currentId
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (active) SoundClearColors.EmeraldAccent.copy(alpha = 0.16f)
                        else SoundClearColors.GlassCard
                    )
                    .clickable { onSelect(item) }
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ArtworkBox(
                    url = item.thumbnailUrl,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(8.dp))
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.title,
                        color = if (active) SoundClearColors.MintAccent else SoundClearColors.TextLight,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = item.artist,
                        color = SoundClearColors.TextMuted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
fun ArtworkBox(url: String?, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.background(SoundClearColors.EmeraldPanel),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = SoundClearColors.MintAccent.copy(alpha = 0.5f),
            modifier = Modifier.size(24.dp)
        )
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
fun TrackRowItem(
    track: TrackItem,
    isCurrent: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (isCurrent) SoundClearColors.EmeraldAccent.copy(alpha = 0.14f)
                else SoundClearColors.GlassCard
            )
            .border(
                width = 1.dp,
                color = if (isCurrent) SoundClearColors.MintAccent.copy(alpha = 0.4f) else SoundClearColors.GlassBorder,
                shape = RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ArtworkBox(
            url = track.thumbnailUrl,
            modifier = Modifier
                .size(50.dp)
                .clip(RoundedCornerShape(10.dp))
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = track.title,
                color = if (isCurrent) SoundClearColors.MintAccent else SoundClearColors.TextLight,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = listOfNotNull(track.artist, track.durationText).joinToString(" · "),
                color = SoundClearColors.TextMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun formatMs(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val min = totalSec / 60L
    val sec = totalSec % 60L
    return "%d:%02d".format(min, sec)
}
