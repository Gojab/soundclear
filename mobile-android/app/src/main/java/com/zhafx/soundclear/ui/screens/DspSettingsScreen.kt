package com.zhafx.soundclear.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.audio.DspAudioEngine
import com.zhafx.soundclear.ui.theme.SoundClearColors

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DspSettingsScreen(
    onDspEnabledChange: (Boolean) -> Unit,
    onApplyPreset: (String) -> Unit,
    onBandLevelChange: (Int, Int) -> Unit,
    onBassStrengthChange: (Int) -> Unit
) {
    val enabled by DspAudioEngine.enabled.collectAsState()
    val bands by DspAudioEngine.bands.collectAsState()
    val range by DspAudioEngine.bandRangeMb.collectAsState()
    val bass by DspAudioEngine.bassStrength.collectAsState()
    val activePreset by DspAudioEngine.activePreset.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "DSP Audio & Info",
                color = SoundClearColors.TextLight,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(SoundClearColors.GlassCard)
                    .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Mesin Equalizer Hardware Android",
                            color = SoundClearColors.TextLight,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Aktifkan pemrosesan DSP saat lagu diputar",
                            color = SoundClearColors.TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    Switch(
                        checked = enabled,
                        onCheckedChange = onDspEnabledChange,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = SoundClearColors.EmeraldPanel,
                            checkedTrackColor = SoundClearColors.MintAccent
                        )
                    )
                }

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    DspAudioEngine.presets.keys.forEach { presetName ->
                        val selected = activePreset == presetName
                        Text(
                            text = presetName,
                            color = if (selected) SoundClearColors.EmeraldPanel else SoundClearColors.TextSoft,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(if (selected) SoundClearColors.MintAccent else SoundClearColors.EmeraldPanel)
                                .border(
                                    1.dp,
                                    if (selected) SoundClearColors.MintAccent else SoundClearColors.GlassBorder,
                                    RoundedCornerShape(20.dp)
                                )
                                .clickable { onApplyPreset(presetName) }
                                .padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }
                }

                if (bands.isEmpty()) {
                    Text(
                        text = "Putar salah satu lagu untuk mengaktifkan kontrol frekuensi Equalizer perangkat.",
                        color = SoundClearColors.TextMuted,
                        fontSize = 12.sp
                    )
                } else {
                    val (minMb, maxMb) = range
                    bands.forEach { band ->
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(band.label, color = SoundClearColors.TextSoft, fontSize = 12.sp)
                                Text(
                                    text = "${band.levelMb / 100} dB",
                                    color = SoundClearColors.MintAccent,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            Slider(
                                value = band.levelMb.toFloat(),
                                onValueChange = { onBandLevelChange(band.index, it.toInt()) },
                                valueRange = minMb.toFloat()..maxMb.toFloat(),
                                enabled = enabled,
                                colors = SliderDefaults.colors(
                                    thumbColor = SoundClearColors.MintAccent,
                                    activeTrackColor = SoundClearColors.EmeraldAccent,
                                    inactiveTrackColor = Color.White.copy(alpha = 0.14f)
                                )
                            )
                        }
                    }
                }

                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Bass Boost", color = SoundClearColors.TextSoft, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("${(bass / 10)}%", color = SoundClearColors.MintAccent, fontSize = 12.sp)
                    }
                    Slider(
                        value = bass.toFloat(),
                        onValueChange = { onBassStrengthChange(it.toInt()) },
                        valueRange = 0f..1000f,
                        enabled = enabled,
                        colors = SliderDefaults.colors(
                            thumbColor = SoundClearColors.MintAccent,
                            activeTrackColor = SoundClearColors.EmeraldAccent,
                            inactiveTrackColor = Color.White.copy(alpha = 0.14f)
                        )
                    )
                }
            }
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(SoundClearColors.GlassCard)
                    .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "SoundClear Android Standalone",
                    color = SoundClearColors.TextLight,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Aplikasi mandiri berbasis Kotlin, Jetpack Compose, Media3 ExoPlayer, dan YouTube InnerTube + LRCLIB + pemutar audio lokal MediaStore tanpa server perantara.",
                    color = SoundClearColors.TextSoft,
                    fontSize = 12.sp,
                    lineHeight = 18.sp
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "© 2026 zhafx.corp",
                    color = SoundClearColors.MintAccent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        item { Spacer(Modifier.height(90.dp)) }
    }
}
