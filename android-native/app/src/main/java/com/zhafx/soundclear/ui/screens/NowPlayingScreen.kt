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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Lyrics
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.domain.AudioMath
import com.zhafx.soundclear.player.PlaybackController
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
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
import com.zhafx.soundclear.ui.viewmodel.PlayerViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    playerViewModel: PlayerViewModel,
    playbackController: PlaybackController,
    onCollapse: () -> Unit,
    onOpenEqualizer: () -> Unit,
    onOpenArtist: (String) -> Unit
) {
    val pb by playerViewModel.playbackState.collectAsState()
    val extras by playerViewModel.extras.collectAsState()
    val settings by playerViewModel.userSettings.collectAsState()

    val track = pb.currentTrack
    var showQueueSheet by remember { mutableStateOf(false) }
    var showKaraoke by remember { mutableStateOf(false) }

    val ambient = parseHexColorSafe(extras.ambientColorHex, EmeraldDeep)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        ambient.copy(alpha = 0.55f),
                        Color(0xFF0A120E),
                        ObsidianBlack
                    )
                )
            )
    ) {
        if (track == null) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Belum ada lagu diputar", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onCollapse) { Text("Kembali", color = EmeraldBright) }
            }
            return@Box
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 14.dp)
                .padding(bottom = 32.dp)
        ) {
            // Top bar Now Playing
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onCollapse) {
                    Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = "Tutup", tint = MintTextPrimary, modifier = Modifier.size(30.dp))
                }
                Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("MEMUTAR DARI", fontSize = 10.sp, letterSpacing = 1.2.sp, color = MintTextMuted)
                    Text(
                        text = pb.sourceLabel ?: "SoundClear Audio",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = MintTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = { playerViewModel.openTrackMenu(track) }) {
                    Icon(Icons.Rounded.MoreVert, contentDescription = "Menu Lagu", tint = MintTextPrimary)
                }
            }

            Spacer(Modifier.height(14.dp))

            // Cover Art Besar
            ArtworkImage(
                url = track.displayThumbnail(settings.dataSaver),
                contentDescription = track.title,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .padding(horizontal = 10.dp),
                cornerRadius = 22.dp
            )

            Spacer(Modifier.height(14.dp))

            // Badge codec & Error jika ada
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                pb.activeStreamMeta?.let { meta ->
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(EmeraldPrimary.copy(alpha = 0.16f))
                            .border(1.dp, EmeraldPrimary.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "${meta.codec} • ${meta.bitrateKbps ?: 160} kbps • ${meta.sourceMode.uppercase()}",
                            color = EmeraldBright,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
            pb.errorMessage?.let { err ->
                Spacer(Modifier.height(8.dp))
                Text(err, color = Color(0xFFEF4444), fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }

            Spacer(Modifier.height(16.dp))

            // Judul, Artis & Aksi Cepat (Exclude & Like)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(track.title, style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        text = track.primaryArtistName,
                        color = MintTextSecondary,
                        fontSize = 15.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable {
                            track.artists.firstOrNull()?.id?.let(onOpenArtist)
                        }
                    )
                }
                IconButton(onClick = { playerViewModel.toggleExcludeFromTaste(track) }) {
                    Icon(Icons.Rounded.Block, contentDescription = "Kurangi selera ini", tint = MintTextMuted)
                }
                IconButton(onClick = { playerViewModel.toggleLike(track) }) {
                    Icon(
                        imageVector = if (extras.isCurrentLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = "Suka",
                        tint = if (extras.isCurrentLiked) EmeraldPrimary else MintTextPrimary,
                        modifier = Modifier.size(26.dp)
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // Seek Slider & Durasi
            val durMs = pb.durationMs.coerceAtLeast(1L)
            var draggingPos by remember(track.playableVideoId) { mutableStateOf<Float?>(null) }
            val currentPosMs = draggingPos?.toLong() ?: pb.positionMs.coerceIn(0L, durMs)

            Slider(
                value = currentPosMs.toFloat(),
                onValueChange = { draggingPos = it },
                onValueChangeFinished = {
                    draggingPos?.let { playbackController.seekTo(it.toLong()) }
                    draggingPos = null
                },
                valueRange = 0f..durMs.toFloat(),
                colors = SliderDefaults.colors(
                    thumbColor = EmeraldBright,
                    activeTrackColor = EmeraldBright,
                    inactiveTrackColor = Color.White.copy(alpha = 0.2f)
                )
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(AudioMath.formatDurationMs(currentPosMs), fontSize = 12.sp, color = MintTextMuted)
                Text("-${AudioMath.formatDurationMs((durMs - currentPosMs).coerceAtLeast(0L))}", fontSize = 12.sp, color = MintTextMuted)
            }

            Spacer(Modifier.height(12.dp))

            // 5 Tombol Transport Utama
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { playbackController.toggleShuffle() }) {
                    Icon(
                        Icons.Rounded.Shuffle,
                        contentDescription = "Acak",
                        tint = if (pb.shuffle) EmeraldBright else MintTextMuted
                    )
                }
                IconButton(onClick = { playbackController.previous() }, modifier = Modifier.size(50.dp)) {
                    Icon(Icons.Rounded.SkipPrevious, contentDescription = "Sebelumnya", tint = MintTextPrimary, modifier = Modifier.size(36.dp))
                }
                Box(
                    modifier = Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(Brush.linearGradient(listOf(EmeraldBright, EmeraldDeep)))
                        .clickable { playbackController.togglePlayPause() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (pb.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = if (pb.isPlaying) "Jeda" else "Putar",
                        tint = ObsidianBlack,
                        modifier = Modifier.size(36.dp)
                    )
                }
                IconButton(onClick = { playbackController.next() }, modifier = Modifier.size(50.dp)) {
                    Icon(Icons.Rounded.SkipNext, contentDescription = "Berikutnya", tint = MintTextPrimary, modifier = Modifier.size(36.dp))
                }
                IconButton(onClick = { playbackController.cycleRepeat() }) {
                    Icon(
                        imageVector = if (pb.repeatMode == "one") Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                        contentDescription = "Ulang",
                        tint = if (pb.repeatMode != "off") EmeraldBright else MintTextMuted
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Bar Utilitas: Visualizer, EQ, Sleep Timer, Antrean, Karaoke
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.height(22.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    pb.spectrumBars.take(10).forEach { bar ->
                        Box(
                            modifier = Modifier
                                .width(3.dp)
                                .height((bar * 22).dp)
                                .clip(CircleShape)
                                .background(EmeraldBright.copy(alpha = 0.78f))
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(onClick = onOpenEqualizer) {
                        Icon(Icons.Rounded.GraphicEq, contentDescription = "Equalizer", tint = EmeraldBright)
                    }
                    IconButton(onClick = { showKaraoke = true }) {
                        Icon(Icons.Rounded.Lyrics, contentDescription = "Lirik Karaoke", tint = MintTextSecondary)
                    }
                    IconButton(onClick = { showQueueSheet = true }) {
                        Icon(Icons.AutoMirrored.Rounded.QueueMusic, contentDescription = "Antrean (${pb.queue.size})", tint = MintTextSecondary)
                    }
                }
            }

            if (pb.sleepTimerMode != "off") {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.Bedtime, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    val text = if (pb.sleepTimerMode == "end_of_track") {
                        "Timer tidur: Berhenti di akhir lagu"
                    } else {
                        "Timer tidur: ${pb.sleepTimerRemainingSec / 60}m ${pb.sleepTimerRemainingSec % 60}d"
                    }
                    Text(text, color = EmeraldBright, fontSize = 12.sp)
                }
            }

            // Kartu Pratinjau Lirik Tersinkronisasi
            if (settings.lyricsPreviewEnabled) {
                Spacer(Modifier.height(16.dp))
                val activeIdx = AudioMath.findActiveLyricIndex(extras.lyricsLines, pb.positionMs)
                GlassCard(onClick = { showKaraoke = true }, modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Lirik", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text("Buka Karaoke", color = EmeraldBright, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(8.dp))
                    when {
                        extras.lyricsLoading -> Text("Memuat lirik...", color = MintTextMuted)
                        extras.lyricsLines.isNotEmpty() -> {
                            val start = (activeIdx - 1).coerceAtLeast(0)
                            val slice = extras.lyricsLines.drop(start).take(4)
                            slice.forEachIndexed { offset, line ->
                                val isActive = (start + offset) == activeIdx
                                Text(
                                    text = line.text,
                                    color = if (isActive) Color.White else MintTextMuted,
                                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = if (isActive) 17.sp else 14.sp,
                                    modifier = Modifier.padding(vertical = 3.dp)
                                )
                            }
                        }
                        !extras.lyricsPlainText.isNullOrBlank() -> {
                            Text(extras.lyricsPlainText.orEmpty(), maxLines = 5, overflow = TextOverflow.Ellipsis, color = MintTextSecondary)
                        }
                        else -> Text("Lirik belum tersedia untuk trek ini.", color = MintTextMuted, fontSize = 13.sp)
                    }
                }
            }
        }
    }

    // Modal Sheet Antrean + DJ Mix Status
    if (showQueueSheet) {
        ModalBottomSheet(onDismissRequest = { showQueueSheet = false }, containerColor = ObsidianCard) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Antrean Pemutaran (${pb.queue.size})", style = MaterialTheme.typography.titleLarge)
                        val bpm = playbackController.currentBpmEstimate()
                        if (bpm != null) {
                            Text("Estimasi Tempo: $bpm BPM", color = EmeraldBright, fontSize = 12.sp)
                        }
                    }
                    TextButton(onClick = { playbackController.hydrateRadio() }) {
                        Icon(Icons.Rounded.Radio, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Tambah Radio")
                    }
                    TextButton(onClick = { playbackController.clearQueue() }) {
                        Text("Kosongkan", color = MintTextMuted)
                    }
                }
                Spacer(Modifier.height(8.dp))
                LazyColumn(modifier = Modifier.height(340.dp)) {
                    itemsIndexed(pb.queue, key = { idx, t -> "q-$idx-${t.playableVideoId}" }) { idx, item ->
                        val active = idx == pb.queueIndex
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (active) EmeraldPrimary.copy(alpha = 0.16f) else Color.Transparent)
                                .clickable { playbackController.selectQueueIndex(idx) }
                                .padding(horizontal = 8.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ArtworkImage(url = item.displayThumbnail(settings.dataSaver), contentDescription = item.title, modifier = Modifier.size(42.dp))
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.title, color = if (active) EmeraldBright else MintTextPrimary, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(item.primaryArtistName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            }
                            if (!active) {
                                if (idx > 0) {
                                    IconButton(onClick = { playbackController.moveQueueItem(idx, idx - 1) }, modifier = Modifier.size(28.dp)) {
                                        Icon(Icons.Rounded.ArrowUpward, contentDescription = "Naik", modifier = Modifier.size(16.dp))
                                    }
                                }
                                if (idx < pb.queue.lastIndex) {
                                    IconButton(onClick = { playbackController.moveQueueItem(idx, idx + 1) }, modifier = Modifier.size(28.dp)) {
                                        Icon(Icons.Rounded.ArrowDownward, contentDescription = "Turun", modifier = Modifier.size(16.dp))
                                    }
                                }
                                IconButton(onClick = { playbackController.removeFromQueue(idx) }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Rounded.Delete, contentDescription = "Hapus", tint = MintTextMuted, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Modal Karaoke Layar Penuh
    if (showKaraoke) {
        val listState = rememberLazyListState()
        val activeIdx = AudioMath.findActiveLyricIndex(extras.lyricsLines, pb.positionMs)

        LaunchedEffect(activeIdx) {
            if (activeIdx >= 0 && activeIdx < extras.lyricsLines.size) {
                listState.animateScrollToItem((activeIdx - 2).coerceAtLeast(0))
            }
        }

        ModalBottomSheet(onDismissRequest = { showKaraoke = false }, containerColor = Color(0xFF07110C)) {
            Column(modifier = Modifier.fillMaxWidth().height(560.dp).padding(horizontal = 20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(track.title, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                        Text(extras.lyricsSource ?: track.primaryArtistName, style = MaterialTheme.typography.bodySmall)
                    }
                    Button(
                        onClick = { playbackController.togglePlayPause() },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                    ) {
                        Icon(if (pb.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, contentDescription = null)
                    }
                }
                Spacer(Modifier.height(14.dp))
                when {
                    extras.lyricsLines.isNotEmpty() -> {
                        LazyColumn(state = listState, modifier = Modifier.weight(1f)) {
                            itemsIndexed(extras.lyricsLines) { idx, line ->
                                val isActive = idx == activeIdx
                                Text(
                                    text = line.text,
                                    color = if (isActive) EmeraldBright else MintTextMuted.copy(alpha = 0.65f),
                                    fontSize = if (isActive) 22.sp else 17.sp,
                                    fontWeight = if (isActive) FontWeight.ExtraBold else FontWeight.Medium,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .clickable {
                                            if (extras.lyricsHasTimestamps && line.startTimeMs > 0L) {
                                                playbackController.seekTo(line.startTimeMs)
                                            }
                                        }
                                        .padding(vertical = 10.dp, horizontal = 6.dp)
                                )
                            }
                        }
                    }
                    !extras.lyricsPlainText.isNullOrBlank() -> {
                        Text(
                            text = extras.lyricsPlainText.orEmpty(),
                            color = MintTextPrimary,
                            fontSize = 18.sp,
                            lineHeight = 28.sp,
                            modifier = Modifier.verticalScroll(rememberScrollState()).weight(1f)
                        )
                    }
                    else -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("Lirik tidak tersedia untuk trek ini.", color = MintTextMuted)
                        }
                    }
                }
            }
        }
    }
}
