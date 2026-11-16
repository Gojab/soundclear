package com.zhafx.soundclear.ui.components

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DownloadForOffline
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.zhafx.soundclear.data.local.PlaylistEntity
import com.zhafx.soundclear.data.remote.CustomBackgroundSettings
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.SongCredit
import com.zhafx.soundclear.domain.AudioMath
import com.zhafx.soundclear.player.PlaybackUiState
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldDeep
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.GlassBorder
import com.zhafx.soundclear.ui.theme.GlassSurface
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextPrimary
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.theme.ObsidianCardElevated
import com.zhafx.soundclear.ui.theme.ObsidianSurface
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

fun parseHexColorSafe(hex: String?, fallback: Color = EmeraldPrimary): Color {
    if (hex.isNullOrBlank()) return fallback
    return runCatching {
        Color(android.graphics.Color.parseColor(hex))
    }.getOrDefault(fallback)
}

@Composable
fun CustomBackgroundLayer(
    settings: CustomBackgroundSettings,
    ambientHex: String?,
    currentCoverUrl: String?
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBlack)
    ) {
        when (settings.mode) {
            "ambient" -> {
                val accent = parseHexColorSafe(ambientHex, EmeraldDeep)
                if (!currentCoverUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = currentCoverUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .blur(settings.blurPx.dp)
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    accent.copy(alpha = 0.42f),
                                    ObsidianBlack.copy(alpha = settings.dimOpacity.coerceIn(0.4f, 0.94f)),
                                    ObsidianBlack
                                )
                            )
                        )
                )
            }
            "preset" -> {
                val colors = when (settings.presetId) {
                    "midnight-ocean" -> listOf(Color(0xFF0A2A4A), Color(0xFF040910))
                    "crimson-stage" -> listOf(Color(0xFF471222), Color(0xFF090406))
                    "violet-dusk" -> listOf(Color(0xFF2B144A), Color(0xFF07040C))
                    "golden-lounge" -> listOf(Color(0xFF3F2B0D), Color(0xFF090704))
                    "arctic-mint" -> listOf(Color(0xFF0C3B34), Color(0xFF040A09))
                    else -> listOf(Color(0xFF0A3321), Color(0xFF040806)) // emerald-velvet
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.verticalGradient(colors))
                )
            }
            "color" -> {
                val base = parseHexColorSafe(settings.solidColor, Color(0xFF0B1612))
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.verticalGradient(listOf(base, ObsidianBlack)))
                )
            }
            "gradient" -> {
                val from = parseHexColorSafe(settings.gradientFrom, Color(0xFF0C3B28))
                val to = parseHexColorSafe(settings.gradientTo, Color(0xFF060908))
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.linearGradient(listOf(from, to)))
                )
            }
            "image" -> {
                if (!settings.customImageUri.isNullOrBlank()) {
                    AsyncImage(
                        model = settings.customImageUri,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .blur(settings.blurPx.dp)
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(ObsidianBlack.copy(alpha = settings.dimOpacity.coerceIn(0.25f, 0.92f)))
                    )
                }
            }
            else -> {
                val topGlow = parseHexColorSafe(ambientHex, Color(0xFF0B3D24))
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    topGlow.copy(alpha = 0.28f),
                                    Color(0xFF040806),
                                    ObsidianBlack
                                )
                            )
                        )
                )
            }
        }
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 18.dp,
    onClick: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(14.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(cornerRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(GlassSurface)
            .border(1.dp, GlassBorder, shape)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(contentPadding),
        content = content
    )
}

@Composable
fun ArtworkImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 10.dp,
    isCircle: Boolean = false
) {
    val shape = if (isCircle) CircleShape else RoundedCornerShape(cornerRadius)
    Box(
        modifier = modifier
            .clip(shape)
            .background(ObsidianCardElevated),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = MintTextMuted.copy(alpha = 0.45f),
            modifier = Modifier.size(28.dp)
        )
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
fun SoundClearMediaCard(
    item: MediaItem,
    dataSaver: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isArtist = item.type == "artist"
    Column(
        modifier = modifier
            .width(148.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(4.dp)
    ) {
        ArtworkImage(
            url = item.displayThumbnail(dataSaver),
            contentDescription = item.title,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f),
            cornerRadius = 12.dp,
            isCircle = isArtist
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = item.title,
            style = MaterialTheme.typography.titleMedium,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = when (item.type) {
                "artist" -> "Artis"
                "album" -> "Album • ${item.year ?: item.primaryArtistName}"
                "playlist" -> "Playlist"
                "podcast" -> "Podcast • ${item.primaryArtistName}"
                else -> item.primaryArtistName
            },
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun TrackRowItem(
    track: MediaItem,
    index: Int? = null,
    isPlayingNow: Boolean = false,
    isLiked: Boolean = false,
    isOffline: Boolean = false,
    dataSaver: Boolean = false,
    onClick: () -> Unit,
    onToggleLike: (() -> Unit)? = null,
    onMoreClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (isPlayingNow) EmeraldPrimary.copy(alpha = 0.14f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (index != null) {
            Text(
                text = if (isPlayingNow) "▶" else "${index + 1}",
                color = if (isPlayingNow) EmeraldBright else MintTextMuted,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.width(26.dp)
            )
        }
        ArtworkImage(
            url = track.displayThumbnail(dataSaver),
            contentDescription = track.title,
            modifier = Modifier.size(48.dp),
            cornerRadius = 8.dp
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontSize = 14.sp,
                    color = if (isPlayingNow) EmeraldBright else MintTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                if (isOffline) {
                    Spacer(Modifier.width(6.dp))
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = "Offline",
                        tint = EmeraldPrimary,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
            Text(
                text = buildString {
                    if (track.isExplicit) append("E • ")
                    append(track.primaryArtistName)
                    track.duration?.takeIf { it.isNotBlank() }?.let { append(" • $it") }
                },
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (onToggleLike != null) {
            IconButton(onClick = onToggleLike, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    contentDescription = "Sukai",
                    tint = if (isLiked) EmeraldPrimary else MintTextMuted,
                    modifier = Modifier.size(19.dp)
                )
            }
        }
        if (onMoreClick != null) {
            IconButton(onClick = onMoreClick, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = Icons.Rounded.MoreVert,
                    contentDescription = "Opsi lain",
                    tint = MintTextMuted,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
fun MiniPlayerBar(
    state: PlaybackUiState,
    isLiked: Boolean,
    dataSaver: Boolean,
    onExpand: () -> Unit,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onToggleLike: () -> Unit,
    modifier: Modifier = Modifier
) {
    val track = state.currentTrack ?: return
    val progress = if (state.durationMs > 0L) {
        (state.positionMs.toFloat() / state.durationMs.toFloat()).coerceIn(0f, 1f)
    } else 0f

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xEE101C16))
            .border(1.dp, EmeraldPrimary.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
            .clickable(onClick = onExpand)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ArtworkImage(
                url = track.displayThumbnail(dataSaver),
                contentDescription = track.title,
                modifier = Modifier.size(44.dp),
                cornerRadius = 8.dp
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val errText = state.errorMessage?.takeIf { it.isNotBlank() }
                    when {
                        errText != null -> {
                            Text(
                                text = errText,
                                color = Color(0xFFF87171),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        state.isBuffering -> {
                            Text(
                                text = "Memuat stream...",
                                color = EmeraldBright,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        else -> {
                            Text(
                                text = track.primaryArtistName,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }
            IconButton(onClick = onToggleLike, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    contentDescription = "Suka",
                    tint = if (isLiked) EmeraldPrimary else MintTextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }
            IconButton(onClick = onTogglePlay, modifier = Modifier.size(40.dp)) {
                Icon(
                    imageVector = if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                    contentDescription = if (state.isPlaying) "Jeda" else "Putar",
                    tint = MintTextPrimary,
                    modifier = Modifier.size(26.dp)
                )
            }
            IconButton(onClick = onNext, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = Icons.Rounded.SkipNext,
                    contentDescription = "Berikutnya",
                    tint = MintTextSecondary,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.5.dp)
                .background(Color.White.copy(alpha = 0.09f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress)
                    .height(2.5.dp)
                    .background(Brush.horizontalGradient(listOf(EmeraldDeep, EmeraldBright)))
            )
        }
    }
}

@Composable
fun SoundClearBottomBar(
    currentTab: String,
    onSelectTab: (String) -> Unit
) {
    NavigationBar(
        containerColor = Color(0xF2060A08),
        tonalElevation = 0.dp
    ) {
        val items = listOf(
            Triple("home", "Beranda", Icons.Rounded.Home),
            Triple("search", "Jelajah", Icons.Rounded.Search),
            Triple("library", "Pustaka", Icons.Rounded.LibraryMusic)
        )
        items.forEach { (route, label, icon) ->
            val selected = currentTab == route
            NavigationBarItem(
                selected = selected,
                onClick = { onSelectTab(route) },
                icon = { Icon(icon, contentDescription = label) },
                label = { Text(label, fontSize = 11.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = EmeraldBright,
                    selectedTextColor = EmeraldBright,
                    indicatorColor = EmeraldPrimary.copy(alpha = 0.16f),
                    unselectedIconColor = MintTextMuted,
                    unselectedTextColor = MintTextMuted
                )
            )
        }
    }
}

@Composable
fun EqResponseCurveCanvas(
    preampDb: Float,
    bandsDb: List<Float>,
    bassBoostEnabled: Boolean,
    bassBoostLevel: Int,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(130.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF070D0A))
            .border(1.dp, GlassBorder, RoundedCornerShape(14.dp))
    ) {
        val w = size.width
        val h = size.height
        val midY = h / 2f

        // Grid garis horizontal 0dB & ±6dB
        listOf(0.25f, 0.5f, 0.75f).forEach { frac ->
            drawLine(
                color = Color.White.copy(alpha = if (frac == 0.5f) 0.16f else 0.06f),
                start = Offset(0f, h * frac),
                end = Offset(w, h * frac),
                strokeWidth = 1.dp.toPx()
            )
        }

        val steps = 80
        val path = Path()
        val fillPath = Path()
        for (i in 0..steps) {
            val t = i.toFloat() / steps
            val freq = 20.0 * Math.pow(1000.0, t.toDouble())
            val db = if (enabled) {
                AudioMath.calculateBiquadResponseDb(freq, preampDb, bandsDb, bassBoostEnabled, bassBoostLevel)
            } else 0f
            val y = (midY - (db / 16f) * (h * 0.42f)).coerceIn(8f, h - 8f)
            val x = t * w
            if (i == 0) {
                path.moveTo(x, y)
                fillPath.moveTo(x, h)
                fillPath.lineTo(x, y)
            } else {
                path.lineTo(x, y)
                fillPath.lineTo(x, y)
            }
            if (i == steps) {
                fillPath.lineTo(w, h)
                fillPath.close()
            }
        }

        drawPath(
            path = fillPath,
            brush = Brush.verticalGradient(
                listOf(
                    (if (enabled) EmeraldPrimary else MintTextMuted).copy(alpha = 0.25f),
                    Color.Transparent
                )
            )
        )
        drawPath(
            path = path,
            color = if (enabled) EmeraldBright else MintTextMuted,
            style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackActionBottomSheet(
    track: MediaItem,
    isLiked: Boolean,
    isOffline: Boolean,
    sleepTimerMode: String,
    sleepTimerRemainingSec: Int,
    onDismiss: () -> Unit,
    onPlayNext: () -> Unit,
    onAddToQueue: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onToggleLike: () -> Unit,
    onDownloadOffline: () -> Unit,
    onGoToArtist: () -> Unit,
    onGoToAlbum: () -> Unit,
    onStartRadio: () -> Unit,
    onCreateMixFromTrack: () -> Unit,
    onViewCredits: () -> Unit,
    onHideTrack: () -> Unit,
    onSetSleepTimerMinutes: (Int) -> Unit,
    onSetSleepTimerEndOfTrack: () -> Unit,
    onCancelSleepTimer: () -> Unit
) {
    val context = LocalContext.current
    var subView by remember { mutableStateOf("main") } // main | sleep | code

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = ObsidianCard
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 28.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                ArtworkImage(
                    url = track.displayThumbnail(),
                    contentDescription = track.title,
                    modifier = Modifier.size(52.dp),
                    cornerRadius = 10.dp
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(track.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(track.primaryArtistName, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (subView != "main") {
                    TextButton(onClick = { subView = "main" }) { Text("Kembali", color = EmeraldBright) }
                }
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = GlassBorder)
            Spacer(Modifier.height(8.dp))

            when (subView) {
                "sleep" -> {
                    Text("Timer Tidur", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    val statusText = when {
                        sleepTimerMode == "end_of_track" -> "Aktif: Berhenti di akhir lagu ini"
                        sleepTimerRemainingSec > 0 -> "Sisa waktu: ${sleepTimerRemainingSec / 60}m ${sleepTimerRemainingSec % 60}d"
                        else -> "Tidak aktif"
                    }
                    Text(statusText, color = EmeraldBright, fontSize = 13.sp)
                    Spacer(Modifier.height(10.dp))
                    listOf(5, 10, 15, 30, 45, 60).forEach { mins ->
                        SheetMenuRow(Icons.Rounded.Bedtime, "$mins menit") {
                            onSetSleepTimerMinutes(mins)
                            onDismiss()
                        }
                    }
                    SheetMenuRow(Icons.Rounded.MusicNote, "Akhir lagu saat ini") {
                        onSetSleepTimerEndOfTrack()
                        onDismiss()
                    }
                    if (sleepTimerMode != "off") {
                        SheetMenuRow(Icons.Rounded.VisibilityOff, "Matikan timer tidur", tint = Color(0xFFEF4444)) {
                            onCancelSleepTimer()
                            onDismiss()
                        }
                    }
                }
                "code" -> {
                    Text("Kode SoundClear", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(6.dp))
                    Text("Bagikan pola gelombang unik untuk lagu ini", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(16.dp))
                    val bars = remember(track.playableVideoId) { AudioMath.buildWaveformCodeBars(track.playableVideoId) }
                    GlassCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(64.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Rounded.GraphicEq, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(30.dp))
                            Spacer(Modifier.width(4.dp))
                            bars.forEach { level ->
                                Box(
                                    modifier = Modifier
                                        .width(5.dp)
                                        .height((level * 52).dp)
                                        .clip(CircleShape)
                                        .background(EmeraldBright)
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "${track.title} — ${track.primaryArtistName}",
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                else -> {
                    LazyColumn(modifier = Modifier.fillMaxWidth()) {
                        item { SheetMenuRow(Icons.Rounded.PlaylistPlay, "Putar berikutnya") { onPlayNext(); onDismiss() } }
                        item { SheetMenuRow(Icons.AutoMirrored.Rounded.QueueMusic, "Tambah ke antrean") { onAddToQueue(); onDismiss() } }
                        item { SheetMenuRow(Icons.AutoMirrored.Rounded.PlaylistAdd, "Tambahkan ke playlist") { onAddToPlaylist() } }
                        item {
                            SheetMenuRow(
                                if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                if (isLiked) "Hapus dari Lagu Disukai" else "Tambahkan ke Lagu Disukai",
                                tint = if (isLiked) EmeraldPrimary else MintTextPrimary
                            ) { onToggleLike(); onDismiss() }
                        }
                        if (track.type != "local") {
                            item {
                                SheetMenuRow(
                                    Icons.Rounded.DownloadForOffline,
                                    if (isOffline) "Tersimpan Offline" else "Unduh untuk diputar offline",
                                    tint = if (isOffline) EmeraldPrimary else MintTextPrimary
                                ) { onDownloadOffline(); onDismiss() }
                            }
                            item { SheetMenuRow(Icons.Rounded.Radio, "Mulai radio dari lagu ini") { onStartRadio(); onDismiss() } }
                            item { SheetMenuRow(Icons.Rounded.AutoAwesome, "Buat Mix dari lagu ini") { onCreateMixFromTrack(); onDismiss() } }
                            if (!track.artists.firstOrNull()?.id.isNullOrBlank()) {
                                item { SheetMenuRow(Icons.Rounded.Person, "Lihat artis") { onGoToArtist(); onDismiss() } }
                            }
                            if (!track.album?.id.isNullOrBlank()) {
                                item { SheetMenuRow(Icons.Rounded.Album, "Lihat album") { onGoToAlbum(); onDismiss() } }
                            }
                            item { SheetMenuRow(Icons.Rounded.Info, "Lihat kredit lagu") { onViewCredits() } }
                        }
                        item {
                            SheetMenuRow(Icons.Rounded.Bedtime, "Timer tidur") { subView = "sleep" }
                        }
                        item {
                            SheetMenuRow(Icons.Rounded.QrCode2, "Tampilkan Kode SoundClear") { subView = "code" }
                        }
                        item {
                            SheetMenuRow(Icons.Rounded.Share, "Bagikan lagu") {
                                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, AudioMath.buildTrackShareText(track))
                                }
                                context.startActivity(Intent.createChooser(sendIntent, "Bagikan lewat"))
                                onDismiss()
                            }
                        }
                        item {
                            SheetMenuRow(Icons.Rounded.VisibilityOff, "Sembunyikan lagu ini") { onHideTrack(); onDismiss() }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetMenuRow(
    icon: ImageVector,
    label: String,
    tint: Color = MintTextPrimary,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = tint, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun PlaylistPickerDialog(
    track: MediaItem,
    playlists: List<PlaylistEntity>,
    onDismiss: () -> Unit,
    onPickPlaylist: (String) -> Unit,
    onCreateAndAdd: (String) -> Unit
) {
    var newName by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = ObsidianCard,
        title = { Text("Tambahkan ke Playlist", color = MintTextPrimary) },
        text = {
            Column {
                Text("Lagu: ${track.title}", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    placeholder = { Text("Nama playlist baru...") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = EmeraldPrimary,
                        unfocusedBorderColor = GlassBorder,
                        focusedTextColor = MintTextPrimary,
                        unfocusedTextColor = MintTextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                AnimatedVisibility(newName.isNotBlank()) {
                    Button(
                        onClick = { onCreateAndAdd(newName) },
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                    ) {
                        Text("Buat & Tambahkan")
                    }
                }
                Spacer(Modifier.height(10.dp))
                LazyColumn(modifier = Modifier.height(180.dp)) {
                    items(playlists, key = { it.id }) { pl ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { onPickPlaylist(pl.id) }
                                .padding(vertical = 10.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ArtworkImage(url = pl.coverUrl, contentDescription = pl.name, modifier = Modifier.size(38.dp), cornerRadius = 6.dp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(pl.name, style = MaterialTheme.typography.titleMedium, fontSize = 14.sp)
                                Text("${pl.tracksList().size} lagu", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Tutup", color = MintTextSecondary) }
        }
    )
}

@Composable
fun SongCreditsDialog(
    track: MediaItem,
    credits: List<SongCredit>,
    isLoading: Boolean,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = ObsidianCard,
        title = { Text("Kredit Lagu", color = MintTextPrimary) },
        text = {
            Column {
                Text(track.title, style = MaterialTheme.typography.titleMedium)
                Text(track.primaryArtistName, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
                when {
                    isLoading -> Text("Memuat kredit...", color = MintTextMuted)
                    credits.isEmpty() -> Text("Informasi kredit detail belum tersedia untuk lagu ini.", color = MintTextMuted)
                    else -> LazyColumn(modifier = Modifier.height(220.dp)) {
                        items(credits) { credit ->
                            Column(modifier = Modifier.padding(vertical = 6.dp)) {
                                Text(credit.role, color = MintTextMuted, fontSize = 12.sp)
                                Text(credit.names.joinToString(", "), color = MintTextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Tutup", color = EmeraldBright) }
        }
    )
}
