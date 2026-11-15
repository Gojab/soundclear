package com.zhafx.soundclear.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object SoundClearColors {
    val BlackBase = Color(0xFF000000)
    val EmeraldSurface = Color(0xFF0B1410)
    val EmeraldPanel = Color(0xFF0F1F17)
    val GlassCard = Color(0x14FFFFFF)
    val GlassBorder = Color(0x22E8FFF3)
    val MintAccent = Color(0xFF19EE8A)
    val EmeraldAccent = Color(0xFF0AD36C)
    val DeepEmerald = Color(0xFF01BA53)
    val TextLight = Color(0xFFE8FFF3)
    val TextSoft = Color(0xFFB3F7D1)
    val TextMuted = Color(0x99B3F7D1)
    val Danger = Color(0xFFFF6B6B)
}

private val DarkScheme = darkColorScheme(
    primary = SoundClearColors.EmeraldAccent,
    onPrimary = SoundClearColors.EmeraldPanel,
    secondary = SoundClearColors.MintAccent,
    onSecondary = SoundClearColors.EmeraldPanel,
    background = SoundClearColors.BlackBase,
    onBackground = SoundClearColors.TextLight,
    surface = SoundClearColors.EmeraldSurface,
    onSurface = SoundClearColors.TextLight,
    surfaceVariant = SoundClearColors.EmeraldPanel,
    onSurfaceVariant = SoundClearColors.TextSoft
)

@Composable
fun SoundClearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkScheme,
        content = content
    )
}
