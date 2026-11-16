package com.zhafx.soundclear.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.domain.AudioMath
import com.zhafx.soundclear.player.PlaybackController
import com.zhafx.soundclear.ui.components.EqResponseCurveCanvas
import com.zhafx.soundclear.ui.components.GlassCard
import com.zhafx.soundclear.ui.theme.DangerRed
import com.zhafx.soundclear.ui.theme.EmeraldBright
import com.zhafx.soundclear.ui.theme.EmeraldPrimary
import com.zhafx.soundclear.ui.theme.GlassBorder
import com.zhafx.soundclear.ui.theme.MintTextMuted
import com.zhafx.soundclear.ui.theme.MintTextSecondary
import com.zhafx.soundclear.ui.theme.ObsidianBlack
import com.zhafx.soundclear.ui.theme.ObsidianCard
import com.zhafx.soundclear.ui.viewmodel.SettingsViewModel
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    initialTab: String = "audio", // appearance | playback | audio | account
    viewModel: SettingsViewModel,
    playbackController: PlaybackController,
    onBack: () -> Unit,
    onOpenShortcuts: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val playbackState by playbackController.uiState.collectAsState()
    val hiddenIds by viewModel.hiddenTrackIds.collectAsState(emptyList())
    val context = LocalContext.current

    var activeTab by remember(initialTab) { mutableStateOf(initialTab) }
    var searchFilter by remember { mutableStateOf("") }
    var serverUrlInput by remember(state.apiBaseUrl) { mutableStateOf(state.apiBaseUrl) }
    var showSavePresetDialog by remember { mutableStateOf(false) }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            viewModel.updateCustomBackground {
                it.copy(mode = "image", customImageUri = uri.toString(), customImageName = uri.lastPathSegment ?: "Foto Latar")
            }
        }
    }

    val backupExportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        if (uri != null) {
            viewModel.exportBackup { jsonStr ->
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(jsonStr.toByteArray())
                }
            }
        }
    }

    val backupImportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            val raw = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            if (!raw.isNullOrBlank()) {
                viewModel.importBackup(raw)
            }
        }
    }

    val tabs = listOf(
        "audio" to "Audio & EQ",
        "appearance" to "Tampilan",
        "playback" to "Pemutaran",
        "account" to "Server & Data"
    )

    val profile = state.audioProfile
    val user = state.userSettings

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 140.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Kembali")
                }
                Text("Pengaturan SoundClear", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onOpenShortcuts) {
                    Text("Kontrol", color = EmeraldBright)
                }
            }

            OutlinedTextField(
                value = searchFilter,
                onValueChange = { searchFilter = it },
                placeholder = { Text("Cari pengaturan (EQ, bass, latar, kualitas)...") },
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = EmeraldBright) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            )
            Spacer(Modifier.height(10.dp))

            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(tabs) { (id, label) ->
                    FilterChip(
                        selected = activeTab == id,
                        onClick = { activeTab = id },
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

            state.statusMessage?.let { msg ->
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(msg, color = EmeraldBright, modifier = Modifier.weight(1f), fontSize = 13.sp)
                        TextButton(onClick = { viewModel.clearStatusMessage() }) { Text("OK") }
                    }
                }
            }
        }

        // ==================== TAB AUDIO & EQUALIZER (7 SUB-BAGIAN) ====================
        if (activeTab == "audio" || searchFilter.isNotBlank()) {
            // 1. Kualitas Streaming & Status Stream Aktif
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("1. Kualitas Streaming & Data", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    playbackState.activeStreamMeta?.let { meta ->
                        Text(
                            text = "Stream Aktif: ${meta.codec} ${meta.bitrateKbps ?: "-"} kbps • Sumber: ${meta.sourceMode}",
                            color = EmeraldBright,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(6.dp))
                    }
                    Text("Kualitas Wi-Fi", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AudioMath.QUALITY_TIERS.forEach { tier ->
                            FilterChip(
                                selected = profile.wifiQuality == tier.id,
                                onClick = { viewModel.updateAudioProfile { it.copy(wifiQuality = tier.id) } },
                                label = { Text(tier.label.substringBefore(" (")) }
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("Kualitas Seluler", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AudioMath.QUALITY_TIERS.forEach { tier ->
                            FilterChip(
                                selected = profile.cellularQuality == tier.id,
                                onClick = { viewModel.updateAudioProfile { it.copy(cellularQuality = tier.id) } },
                                label = { Text(tier.label.substringBefore(" (")) }
                            )
                        }
                    }
                    SettingSwitchRow(
                        title = "Sesuaikan kualitas otomatis",
                        subtitle = "Turunkan bitrate saat sinyal melemah agar tidak tersendat",
                        checked = profile.autoAdjustQuality,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(autoAdjustQuality = v) } }
                    )
                    SettingSwitchRow(
                        title = "Penghemat Kuota (Data Saver)",
                        subtitle = "Gunakan sampul ukuran ringkas dan hemat bandwidth",
                        checked = user.dataSaver,
                        onCheckedChange = { v -> viewModel.updateUserSettings { it.copy(dataSaver = v) } }
                    )
                }
            }

            // 2. Kualitas Unduhan Offline
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("2. Pengaturan Unduhan Offline", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AudioMath.QUALITY_TIERS.filter { it.id != "auto" }.forEach { tier ->
                            FilterChip(
                                selected = profile.downloadQuality == tier.id,
                                onClick = { viewModel.updateAudioProfile { it.copy(downloadQuality = tier.id) } },
                                label = { Text(tier.label.substringBefore(" (")) }
                            )
                        }
                    }
                }
            }

            // 3. Equalizer 10-Band + Preset + Kurva + Bass Boost
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.GraphicEq, contentDescription = null, tint = EmeraldBright)
                        Spacer(Modifier.width(8.dp))
                        Text("3. Equalizer 10-Band & DSP", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Switch(
                            checked = profile.eqEnabled,
                            onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(eqEnabled = v) } },
                            colors = SwitchDefaults.colors(checkedThumbColor = ObsidianBlack, checkedTrackColor = EmeraldBright)
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    EqResponseCurveCanvas(
                        preampDb = profile.preampDb,
                        bandsDb = profile.bands,
                        bassBoostEnabled = profile.bassBoostEnabled,
                        bassBoostLevel = profile.bassBoostLevel,
                        enabled = profile.eqEnabled && !profile.directMode
                    )
                    Spacer(Modifier.height(10.dp))

                    // Preset chips
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Preset Equalizer", style = MaterialTheme.typography.labelMedium)
                        Row {
                            TextButton(onClick = { showSavePresetDialog = true }) {
                                Icon(Icons.Rounded.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Simpan")
                            }
                            TextButton(onClick = { viewModel.resetEqToFlat() }) {
                                Icon(Icons.Rounded.Restore, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Reset")
                            }
                        }
                    }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(viewModel.allEqPresets(), key = { it.id }) { preset ->
                            FilterChip(
                                selected = profile.presetId == preset.id,
                                onClick = { viewModel.applyEqPreset(preset) },
                                label = { Text(preset.name) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = EmeraldPrimary,
                                    selectedLabelColor = ObsidianBlack
                                )
                            )
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Text("Preamp: ${"%.1f".format(profile.preampDb)} dB", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = profile.preampDb,
                        onValueChange = { v -> viewModel.updateAudioProfile { it.copy(preampDb = v) } },
                        valueRange = -12f..12f,
                        colors = SliderDefaults.colors(thumbColor = EmeraldBright, activeTrackColor = EmeraldPrimary)
                    )

                    AudioMath.EQ_FREQUENCY_LABELS.forEachIndexed { idx, freqLabel ->
                        val gain = profile.bands.getOrElse(idx) { 0f }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("$freqLabel Hz", fontSize = 11.sp, color = MintTextSecondary, modifier = Modifier.width(56.dp))
                            Slider(
                                value = gain,
                                onValueChange = { newVal ->
                                    val updated = profile.bands.toMutableList()
                                    while (updated.size < 10) updated.add(0f)
                                    updated[idx] = newVal
                                    viewModel.updateAudioProfile { it.copy(bands = updated, presetId = "custom_manual") }
                                },
                                valueRange = -12f..12f,
                                colors = SliderDefaults.colors(thumbColor = EmeraldBright, activeTrackColor = EmeraldPrimary),
                                modifier = Modifier.weight(1f)
                            )
                            Text("${if (gain >= 0) "+" else ""}${"%.1f".format(gain)}", fontSize = 11.sp, modifier = Modifier.width(42.dp))
                        }
                    }

                    HorizontalDivider(color = GlassBorder, modifier = Modifier.padding(vertical = 8.dp))
                    SettingSwitchRow(
                        title = "Penguat Bass (Bass Boost)",
                        subtitle = "Intensitas ${profile.bassBoostLevel}%",
                        checked = profile.bassBoostEnabled,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(bassBoostEnabled = v) } }
                    )
                    if (profile.bassBoostEnabled) {
                        Slider(
                            value = profile.bassBoostLevel.toFloat(),
                            onValueChange = { v -> viewModel.updateAudioProfile { it.copy(bassBoostLevel = v.roundToInt()) } },
                            valueRange = 0f..100f,
                            colors = SliderDefaults.colors(thumbColor = EmeraldBright, activeTrackColor = EmeraldPrimary)
                        )
                    }
                    SettingSwitchRow(
                        title = "Pelebar Stereo (Stereo Widener)",
                        subtitle = "Ruang suara ${profile.stereoWidenerLevel}%",
                        checked = profile.stereoWidenerEnabled,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(stereoWidenerEnabled = v) } }
                    )
                }
            }

            // 4. Volume & Normalisasi LUFS
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.VolumeUp, contentDescription = null, tint = EmeraldBright)
                        Spacer(Modifier.width(8.dp))
                        Text("4. Volume & Normalisasi (LUFS)", style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Volume Pemutar: ${(playbackState.volume * 100).roundToInt()}%", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = playbackState.volume,
                        onValueChange = { playbackController.setVolume(it) },
                        colors = SliderDefaults.colors(thumbColor = EmeraldBright, activeTrackColor = EmeraldPrimary)
                    )
                    Text("Target Normalisasi Loudness", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AudioMath.NORMALIZATION_OPTIONS.forEach { opt ->
                            FilterChip(
                                selected = profile.normalizationTarget == opt.id,
                                onClick = { viewModel.updateAudioProfile { it.copy(normalizationTarget = opt.id) } },
                                label = { Text(opt.label) }
                            )
                        }
                    }
                    Text("Batas Volume Maksimum: ${user.youtubeSound.maxVolumeLimit}%", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = user.youtubeSound.maxVolumeLimit.toFloat(),
                        onValueChange = { v ->
                            viewModel.updateUserSettings {
                                it.copy(youtubeSound = it.youtubeSound.copy(maxVolumeLimit = v.roundToInt()))
                            }
                        },
                        valueRange = 30f..100f,
                        colors = SliderDefaults.colors(thumbColor = EmeraldBright, activeTrackColor = EmeraldPrimary)
                    )
                    SettingSwitchRow(
                        title = "Limiter Puncak Audio",
                        subtitle = "Cegah distorsi saat bass boost dan preamp tinggi",
                        checked = profile.limiterEnabled,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(limiterEnabled = v) } }
                    )
                }
            }

            // 5. Crossfade & Pemutaran
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("5. Crossfade, Tempo & Gapless", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text("Durasi Crossfade: ${profile.crossfadeSeconds} detik", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = profile.crossfadeSeconds.toFloat(),
                        onValueChange = { v -> viewModel.updateAudioProfile { it.copy(crossfadeSeconds = v.roundToInt(), crossfadeEnabled = v > 0f) } },
                        valueRange = 0f..12f,
                        colors = SliderDefaults.colors(thumbColor = EmeraldBright, activeTrackColor = EmeraldPrimary)
                    )
                    SettingSwitchRow(
                        title = "Pemutaran Tanpa Jeda (Gapless)",
                        subtitle = "Sambungkan trek album live tanpa henti",
                        checked = profile.gaplessPlayback,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(gaplessPlayback = v) } }
                    )
                    SettingSwitchRow(
                        title = "Lewati Bagian Hening (Skip Silence)",
                        subtitle = "Otomatis percepat bagian senyap pada podcast & intro",
                        checked = profile.skipSilence,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(skipSilence = v) } }
                    )
                }
            }

            // 6. Saluran & Mode Direct
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("6. Saluran & Mode Direct", style = MaterialTheme.typography.titleMedium)
                    SettingSwitchRow(
                        title = "Mode Direct (Bypass DSP)",
                        subtitle = "Kirim sinyal murni tanpa EQ, BassBoost, maupun LoudnessEnhancer",
                        checked = profile.directMode,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(directMode = v) } }
                    )
                    SettingSwitchRow(
                        title = "Audio Mono",
                        subtitle = "Gabungkan kanal kiri & kanan untuk penggunaan satu earphone",
                        checked = profile.monoAudio,
                        onCheckedChange = { v -> viewModel.updateAudioProfile { it.copy(monoAudio = v) } }
                    )
                }
            }

            // 7. Diagnostik & Generator Nada Uji
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("7. Diagnostik Audio & Nada Uji", style = MaterialTheme.typography.titleMedium)
                    Text("Uji respons headphone atau efek EQ secara langsung lewat AudioTrack 44.1kHz.", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val sweepActive = playbackState.activeTestTone == "sweep"
                        val pinkActive = playbackState.activeTestTone == "pink_noise"
                        Button(
                            onClick = { playbackController.toggleTestTone("sweep") },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (sweepActive) DangerRed else EmeraldPrimary,
                                contentColor = ObsidianBlack
                            )
                        ) {
                            Text(if (sweepActive) "Hentikan Sweep" else "Uji Sweep 20Hz-20kHz", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                        OutlinedButton(onClick = { playbackController.toggleTestTone("pink_noise") }) {
                            Text(if (pinkActive) "Hentikan Pink Noise" else "Pink Noise", color = EmeraldBright, fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // ==================== TAB TAMPILAN & BERANDA ====================
        if (activeTab == "appearance" || searchFilter.isNotBlank()) {
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("Latar Belakang Aplikasi", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(
                            "default" to "Bawaan Obsidian",
                            "ambient" to "Warna Sampul",
                            "preset" to "Preset Gradasi",
                            "color" to "Warna Solid",
                            "image" to "Foto Galeri"
                        ).forEach { (mode, label) ->
                            FilterChip(
                                selected = user.customBackground.mode == mode,
                                onClick = {
                                    if (mode == "image" && user.customBackground.customImageUri == null) {
                                        imagePicker.launch(arrayOf("image/*"))
                                    } else {
                                        viewModel.updateCustomBackground { it.copy(mode = mode) }
                                    }
                                },
                                label = { Text(label) }
                            )
                        }
                    }
                    if (user.customBackground.mode == "preset") {
                        Spacer(Modifier.height(8.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(
                                "emerald-velvet" to "Emerald Velvet",
                                "midnight-ocean" to "Midnight Ocean",
                                "crimson-stage" to "Crimson Stage",
                                "violet-dusk" to "Violet Dusk",
                                "golden-lounge" to "Golden Lounge",
                                "arctic-mint" to "Arctic Mint"
                            ).forEach { (pid, label) ->
                                FilterChip(
                                    selected = user.customBackground.presetId == pid,
                                    onClick = { viewModel.updateCustomBackground { it.copy(presetId = pid) } },
                                    label = { Text(label) }
                                )
                            }
                        }
                    }
                    if (user.customBackground.mode == "image") {
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = { imagePicker.launch(arrayOf("image/*")) }) {
                            Icon(Icons.Rounded.Image, contentDescription = null, tint = EmeraldBright)
                            Spacer(Modifier.width(6.dp))
                            Text("Pilih Foto Baru", color = EmeraldBright)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Blur Latar: ${user.customBackground.blurPx} px", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = user.customBackground.blurPx.toFloat(),
                        onValueChange = { v -> viewModel.updateCustomBackground { it.copy(blurPx = v.roundToInt()) } },
                        valueRange = 0f..40f
                    )
                    Text("Kegelapan Overlay: ${(user.customBackground.dimOpacity * 100).roundToInt()}%", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = user.customBackground.dimOpacity,
                        onValueChange = { v -> viewModel.updateCustomBackground { it.copy(dimOpacity = v) } },
                        valueRange = 0.25f..0.92f
                    )
                }

                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("Konten & Tata Letak Beranda", style = MaterialTheme.typography.titleMedium)
                    SettingSwitchRow(
                        title = "Sembunyikan konten eksplisit (E)",
                        subtitle = "Lewati lagu bertanda eksplisit dari hasil & Mix",
                        checked = user.hideExplicit,
                        onCheckedChange = { v -> viewModel.updateUserSettings { it.copy(hideExplicit = v) } }
                    )
                    SettingSwitchRow(
                        title = "Pratinjau Lirik di Layar Pemutar",
                        subtitle = "Tampilkan kartu lirik sinkron di bawah kontrol Now Playing",
                        checked = user.lyricsPreviewEnabled,
                        onCheckedChange = { v -> viewModel.updateUserSettings { it.copy(lyricsPreviewEnabled = v) } }
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("Urutan Bagian Beranda", style = MaterialTheme.typography.labelMedium)
                    user.homeSectionOrder.forEachIndexed { idx, secId ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(secId, modifier = Modifier.weight(1f), fontSize = 13.sp)
                            IconButton(onClick = { viewModel.moveHomeSection(idx, -1) }, enabled = idx > 0) {
                                Icon(Icons.Rounded.ArrowUpward, contentDescription = "Naik", modifier = Modifier.size(18.dp))
                            }
                            IconButton(onClick = { viewModel.moveHomeSection(idx, 1) }, enabled = idx < user.homeSectionOrder.lastIndex) {
                                Icon(Icons.Rounded.ArrowDownward, contentDescription = "Turun", modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }

        // ==================== TAB PEMUTARAN ====================
        if (activeTab == "playback" || searchFilter.isNotBlank()) {
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("Perilaku Pemutaran Latar Belakang", style = MaterialTheme.typography.titleMedium)
                    SettingSwitchRow(
                        title = "Putar Otomatis (Autoplay Radio)",
                        subtitle = "Teruskan dengan lagu serupa ketika antrean selesai",
                        checked = user.autoplay,
                        onCheckedChange = { v -> viewModel.updateUserSettings { it.copy(autoplay = v) } }
                    )
                    SettingSwitchRow(
                        title = "Fade Out pada Timer Tidur",
                        subtitle = "Turunkan volume bertahap sebelum musik berhenti",
                        checked = user.youtubeSound.fadeOutOnSleepTimer,
                        onCheckedChange = { v ->
                            viewModel.updateUserSettings { it.copy(youtubeSound = it.youtubeSound.copy(fadeOutOnSleepTimer = v)) }
                        }
                    )
                    SettingSwitchRow(
                        title = "Lanjutkan Posisi Terakhir Podcast",
                        subtitle = "Simpan otomatis detik terakhir episode podcast",
                        checked = user.youtubeSound.resumeLastPosition,
                        onCheckedChange = { v ->
                            viewModel.updateUserSettings { it.copy(youtubeSound = it.youtubeSound.copy(resumeLastPosition = v)) }
                        }
                    )
                }
            }
        }

        // ==================== TAB SERVER & CADANGAN DATA ====================
        if (activeTab == "account" || searchFilter.isNotBlank()) {
            item {
                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("Koneksi Backend SoundClear", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(
                                    when (state.backendHealthy) {
                                        true -> EmeraldBright
                                        false -> DangerRed
                                        null -> MintTextMuted
                                    }
                                )
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = when (state.backendHealthy) {
                                true -> "Terhubung ke server backend"
                                false -> "Server tidak merespons"
                                null -> "Memeriksa koneksi..."
                            },
                            fontSize = 13.sp,
                            color = MintTextSecondary
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = serverUrlInput,
                        onValueChange = { serverUrlInput = it },
                        label = { Text("URL Backend API") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { viewModel.setApiBaseUrl(serverUrlInput) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Text("Simpan URL", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = { viewModel.checkBackendHealth() }) {
                            Text("Uji Koneksi", color = EmeraldBright)
                        }
                    }
                }

                GlassCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text("Cadangan & Pembersihan Data Lokal (Room)", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { backupExportLauncher.launch("soundclear-backup.json") },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                        ) {
                            Text("Ekspor JSON", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = { backupImportLauncher.launch(arrayOf("application/json")) }) {
                            Text("Impor JSON", color = EmeraldBright)
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(onClick = { viewModel.clearPlayHistory() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Hapus Riwayat Pemutaran", color = MintTextSecondary)
                    }
                    OutlinedButton(onClick = { viewModel.clearRecentSearches() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Hapus Riwayat Pencarian", color = MintTextSecondary)
                    }
                    OutlinedButton(onClick = { viewModel.clearAllOfflineDownloads() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Hapus Semua Unduhan Offline", color = DangerRed)
                    }
                    if (hiddenIds.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("Lagu Disembunyikan (${hiddenIds.size})", style = MaterialTheme.typography.labelMedium)
                        hiddenIds.forEach { id ->
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(id, modifier = Modifier.weight(1f), fontSize = 12.sp)
                                TextButton(onClick = { viewModel.unhideTrack(id) }) {
                                    Text("Tampilkan lagi", color = EmeraldBright, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showSavePresetDialog) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showSavePresetDialog = false },
            containerColor = ObsidianCard,
            title = { Text("Simpan Preset EQ Kustom") },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    placeholder = { Text("Nama preset EQ...") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.saveCustomEqPreset(name)
                        showSavePresetDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary, contentColor = ObsidianBlack)
                ) { Text("Simpan") }
            },
            dismissButton = {
                TextButton(onClick = { showSavePresetDialog = false }) { Text("Batal") }
            }
        )
    }
}

@Composable
private fun SettingSwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(8.dp))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(checkedThumbColor = ObsidianBlack, checkedTrackColor = EmeraldBright)
        )
    }
}
