package com.zhafx.soundclear.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.zhafx.soundclear.model.TrackItem
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.theme.SoundClearColors

@Composable
fun LibraryScreen(
    likedTracks: List<TrackItem>,
    localTracks: List<TrackItem>,
    historyTracks: List<TrackItem>,
    currentTrackId: String?,
    onScanLocal: () -> Unit,
    onPlayTrack: (TrackItem, List<TrackItem>) -> Unit
) {
    val context = LocalContext.current
    var activeSegment by remember { mutableStateOf("liked") } // "liked" | "local" | "history"

    val audioPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Manifest.permission.READ_MEDIA_AUDIO
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }

    var hasAudioPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, audioPermission) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasAudioPermission = granted
        if (granted) onScanLocal()
    }

    LaunchedEffect(activeSegment, hasAudioPermission) {
        if (activeSegment == "local" && hasAudioPermission) {
            onScanLocal()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 14.dp)
    ) {
        Text(
            text = "Pustaka Musik",
            color = SoundClearColors.TextLight,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                "liked" to "Disukai (${likedTracks.size})",
                "local" to "Audio Lokal (${localTracks.size})",
                "history" to "Riwayat (${historyTracks.size})"
            ).forEach { (key, label) ->
                val selected = activeSegment == key
                Text(
                    text = label,
                    color = if (selected) SoundClearColors.EmeraldPanel else SoundClearColors.TextSoft,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(if (selected) SoundClearColors.MintAccent else SoundClearColors.GlassCard)
                        .border(
                            1.dp,
                            if (selected) SoundClearColors.MintAccent else SoundClearColors.GlassBorder,
                            RoundedCornerShape(20.dp)
                        )
                        .clickable { activeSegment = key }
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        if (activeSegment == "local" && !hasAudioPermission) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(SoundClearColors.GlassCard)
                    .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                Text(
                    text = "Putar Berkas MP3, FLAC, WAV, OGG di Perangkat",
                    color = SoundClearColors.TextLight,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Izinkan akses audio perangkat agar SoundClear dapat memindai dan memutar lagu offline yang tersimpan di HP Anda.",
                    color = SoundClearColors.TextSoft,
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { permissionLauncher.launch(audioPermission) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = SoundClearColors.EmeraldAccent,
                        contentColor = SoundClearColors.EmeraldPanel
                    )
                ) {
                    Text("Izinkan & Pindai Audio Lokal", fontWeight = FontWeight.Bold)
                }
            }
            return@Column
        }

        val list = when (activeSegment) {
            "local" -> localTracks
            "history" -> historyTracks
            else -> likedTracks
        }

        if (list.isEmpty()) {
            Text(
                text = when (activeSegment) {
                    "local" -> "Tidak ada file audio lokal ditemukan di perangkat."
                    "history" -> "Belum ada riwayat pemutaran."
                    else -> "Belum ada lagu yang disukai. Ketuk ikon hati saat memutar lagu."
                },
                color = SoundClearColors.TextMuted,
                fontSize = 13.sp
            )
        } else {
            LazyColumn(
                contentPadding = PaddingValues(bottom = 90.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(list, key = { it.id }) { track ->
                    TrackRowItem(
                        track = track,
                        isCurrent = track.id == currentTrackId,
                        onClick = { onPlayTrack(track, list) }
                    )
                }
            }
        }
    }
}
