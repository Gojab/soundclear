package com.zhafx.soundclear.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.BluetoothAudio
import androidx.compose.material.icons.rounded.Headphones
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.ui.components.ArtworkImage
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldDeep
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.RecapViewModel

@Composable
fun RecapScreen(
    viewModel: RecapViewModel,
    onBack: () -> Unit,
    onPlayTrack: (MediaItem, List<MediaItem>?, String?) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                Text("Rekap Mendengarkan", style = MaterialTheme.typography.headlineMedium)
            }
        }

        item {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf("4w" to "4 Minggu", "6m" to "6 Bulan", "all" to "Sepanjang Masa").forEach { (id, label) ->
                    FilterChip(
                        selected = state.range == id,
                        onClick = { viewModel.setRange(id) },
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
            Spacer(Modifier.height(12.dp))
        }

        // KPI Grid 2x2
        item {
            Column(modifier = Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    RecapKpiCard("Total Menit", "${state.totalMinutes}", modifier = Modifier.weight(1f))
                    RecapKpiCard("Pemutaran", "${state.totalPlays}", modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    RecapKpiCard("Artis Unik", "${state.uniqueArtists}", modifier = Modifier.weight(1f))
                    RecapKpiCard("Lagu Unik", "${state.uniqueSongs}", modifier = Modifier.weight(1f))
                }
            }
        }

        // Grafik Batang Bulanan
        if (state.monthlyBars.isNotEmpty()) {
            item {
                Spacer(Modifier.height(14.dp))
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.BarChart, contentDescription = null, tint = EmeraldBright)
                        Spacer(Modifier.width(8.dp))
                        Text("Menit Mendengarkan per Bulan", style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(Modifier.height(14.dp))
                    val maxMin = state.monthlyBars.maxOf { it.second }.coerceAtLeast(1)
                    Row(
                        modifier = Modifier.fillMaxWidth().height(110.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        state.monthlyBars.forEach { (month, minutes) ->
                            val frac = (minutes.toFloat() / maxMin.toFloat()).coerceIn(0.12f, 1f)
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("$minutes", fontSize = 10.sp, color = MintTextSecondary)
                                Spacer(Modifier.height(4.dp))
                                Box(
                                    modifier = Modifier
                                        .width(26.dp)
                                        .height((74 * frac).dp)
                                        .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                        .background(Brush.verticalGradient(listOf(EmeraldBright, EmeraldDeep)))
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(month, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }

        if (state.topTracks.isEmpty()) {
            item {
                GlassCard(modifier = Modifier.padding(16.dp)) {
                    Text("Belum ada data pemutaran tercatat", style = MaterialTheme.typography.titleMedium)
                    Text("Putar lagu minimal 15 detik untuk mulai mengisi statistik Rekap pribadimu.", style = MaterialTheme.typography.bodySmall)
                }
            }
        } else {
            item {
                Text("Lagu Teratas", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
            }
            val tracksList = state.topTracks.mapNotNull { it.mediaItem }
            itemsIndexed(state.topTracks) { idx, item ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { item.mediaItem?.let { onPlayTrack(it, tracksList, "Lagu Teratas Rekap") } }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("#${idx + 1}", color = EmeraldBright, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                    ArtworkImage(url = item.thumbnail, contentDescription = item.title, modifier = Modifier.size(46.dp), cornerRadius = 8.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        Text(item.subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    }
                    Text("${item.playCount}x", color = MintTextSecondary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
            }
        }

        if (state.topArtists.isNotEmpty()) {
            item {
                Text("Artis Teratas", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
            }
            itemsIndexed(state.topArtists) { idx, art ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("#${idx + 1}", color = EmeraldBright, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                    ArtworkImage(url = art.thumbnail, contentDescription = art.title, modifier = Modifier.size(44.dp), isCircle = true)
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(art.title, style = MaterialTheme.typography.titleMedium)
                        Text("${art.minutes} menit didengarkan", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun RecapKpiCard(title: String, value: String, modifier: Modifier = Modifier) {
    GlassCard(modifier = modifier) {
        Text(title, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(4.dp))
        Text(value, color = EmeraldBright, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
fun ShortcutsScreen(onBack: () -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                Text("Kontrol & Perangkat", style = MaterialTheme.typography.headlineMedium)
            }
        }
        val itemsList = listOf(
            Triple(Icons.Rounded.Lock, "Layar Terkunci & Notifikasi", "Gunakan tombol Putar/Jeda, Berikutnya, Sebelumnya, serta geser progres langsung dari layar kunci."),
            Triple(Icons.Rounded.BluetoothAudio, "Headset Bluetooth & Mobil", "Menekan tombol headset atau AVRCP mobil langsung mengontrol antrean PlaybackService."),
            Triple(Icons.Rounded.Headphones, "Jeda Otomatis Headset Dicabut", "Ketika kabel audio atau perangkat Bluetooth terputus, musik otomatis dijeda demi kenyamanan."),
            Triple(Icons.Rounded.MusicNote, "Audio Focus Pintar", "Pemutaran dijeda otomatis saat ada panggilan telepon masuk atau aplikasi media lain mengambil alih fokus.")
        )
        itemsIndexed(itemsList) { _, (icon, title, desc) ->
            GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(icon, contentDescription = null, tint = EmeraldBright, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(title, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(desc, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
