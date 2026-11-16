package com.zhafx.soundclear.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val SoundClearColorScheme = darkColorScheme(
    primary = EmeraldPrimary,
    onPrimary = ObsidianBlack,
    primaryContainer = EmeraldSoftBg,
    onPrimaryContainer = MintTextPrimary,
    secondary = EmeraldBright,
    onSecondary = ObsidianBlack,
    secondaryContainer = ObsidianCardElevated,
    onSecondaryContainer = MintTextSecondary,
    tertiary = EmeraldDeep,
    background = ObsidianBlack,
    onBackground = MintTextPrimary,
    surface = ObsidianSurface,
    onSurface = MintTextPrimary,
    surfaceVariant = ObsidianCard,
    onSurfaceVariant = MintTextMuted,
    outline = GlassBorder,
    error = DangerRed,
    onError = MintTextPrimary
)

@Composable
fun SoundClearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = SoundClearColorScheme,
        typography = SoundClearTypography,
        content = content
    )
}
