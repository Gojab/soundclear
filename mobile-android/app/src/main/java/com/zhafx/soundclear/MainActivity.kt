package com.zhafx.soundclear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zhafx.soundclear.model.AppTab
import com.zhafx.soundclear.ui.PlayerViewModel
import com.zhafx.soundclear.ui.components.FullNowPlayingScreen
import com.zhafx.soundclear.ui.components.MiniPlayerBar
import com.zhafx.soundclear.ui.screens.DspSettingsScreen
import com.zhafx.soundclear.ui.screens.HomeScreen
import com.zhafx.soundclear.ui.screens.LibraryScreen
import com.zhafx.soundclear.ui.screens.SearchScreen
import com.zhafx.soundclear.ui.theme.SoundClearColors
import com.zhafx.soundclear.ui.theme.SoundClearTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SoundClearTheme {
                val vm: PlayerViewModel = viewModel()
                val playerState by vm.playerState.collectAsState()
                val homeSections by vm.homeSections.collectAsState()
                val homeLoading by vm.homeLoading.collectAsState()
                val homeError by vm.homeError.collectAsState()
                val searchQuery by vm.searchQuery.collectAsState()
                val searchFilter by vm.searchFilter.collectAsState()
                val searchResults by vm.searchResults.collectAsState()
                val searchLoading by vm.searchLoading.collectAsState()
                val recentSearches by vm.recentSearches.collectAsState()
                val likedTracks by vm.likedTracks.collectAsState()
                val localTracks by vm.localTracks.collectAsState()
                val historyTracks by vm.historyTracks.collectAsState()
                val lyrics by vm.lyrics.collectAsState()
                val lyricsLoading by vm.lyricsLoading.collectAsState()

                var currentTab by remember { mutableStateOf(AppTab.HOME) }
                var nowPlayingOpen by remember { mutableStateOf(false) }

                val context = LocalContext.current
                val notifLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestPermission()
                ) { _ -> }

                LaunchedEffect(Unit) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        val granted = ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.POST_NOTIFICATIONS
                        ) == PackageManager.PERMISSION_GRANTED
                        if (!granted) {
                            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(SoundClearColors.BlackBase)
                ) {
                    Scaffold(
                        containerColor = SoundClearColors.BlackBase,
                        bottomBar = {
                            Column {
                                MiniPlayerBar(
                                    state = playerState,
                                    onTogglePlay = vm::togglePlayPause,
                                    onNext = vm::skipNext,
                                    onOpenNowPlaying = { nowPlayingOpen = true }
                                )
                                NavigationBar(
                                    containerColor = SoundClearColors.EmeraldSurface
                                ) {
                                    AppTab.entries.forEach { tab ->
                                        val icon = when (tab) {
                                            AppTab.HOME -> Icons.Rounded.Home
                                            AppTab.SEARCH -> Icons.Rounded.Search
                                            AppTab.LIBRARY -> Icons.Rounded.LibraryMusic
                                            AppTab.DSP -> Icons.Rounded.GraphicEq
                                        }
                                        NavigationBarItem(
                                            selected = currentTab == tab,
                                            onClick = { currentTab = tab },
                                            icon = { Icon(icon, contentDescription = tab.label) },
                                            label = { Text(tab.label, fontSize = 11.sp) },
                                            colors = NavigationBarItemDefaults.colors(
                                                selectedIconColor = SoundClearColors.MintAccent,
                                                selectedTextColor = SoundClearColors.MintAccent,
                                                unselectedIconColor = SoundClearColors.TextMuted,
                                                unselectedTextColor = SoundClearColors.TextMuted,
                                                indicatorColor = SoundClearColors.EmeraldPanel
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    ) { innerPadding ->
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(innerPadding)
                        ) {
                            when (currentTab) {
                                AppTab.HOME -> HomeScreen(
                                    sections = homeSections,
                                    loading = homeLoading,
                                    error = homeError,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onRefresh = vm::refreshHome,
                                    onPlayTrack = { track, queue -> vm.playTrack(track, queue) }
                                )

                                AppTab.SEARCH -> SearchScreen(
                                    query = searchQuery,
                                    filter = searchFilter,
                                    results = searchResults,
                                    recentSearches = recentSearches,
                                    loading = searchLoading,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onQueryChange = vm::updateSearchQuery,
                                    onSubmit = vm::submitSearch,
                                    onFilterChange = vm::setSearchFilter,
                                    onPlayTrack = { track, queue -> vm.playTrack(track, queue) }
                                )

                                AppTab.LIBRARY -> LibraryScreen(
                                    likedTracks = likedTracks,
                                    localTracks = localTracks,
                                    historyTracks = historyTracks,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onScanLocal = vm::scanLocalAudio,
                                    onPlayTrack = { track, queue -> vm.playTrack(track, queue) }
                                )

                                AppTab.DSP -> DspSettingsScreen(
                                    onDspEnabledChange = vm::setDspEnabled,
                                    onApplyPreset = vm::applyDspPreset,
                                    onBandLevelChange = vm::setEqBandLevel,
                                    onBassStrengthChange = vm::setBassStrength
                                )
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = nowPlayingOpen && playerState.currentTrack != null,
                        enter = slideInVertically { it },
                        exit = slideOutVertically { it }
                    ) {
                        val current = playerState.currentTrack
                        FullNowPlayingScreen(
                            state = playerState,
                            lyrics = lyrics,
                            lyricsLoading = lyricsLoading,
                            isLiked = current != null && vm.isLiked(current.id),
                            onClose = { nowPlayingOpen = false },
                            onTogglePlay = vm::togglePlayPause,
                            onNext = vm::skipNext,
                            onPrevious = vm::skipPrevious,
                            onSeek = vm::seekTo,
                            onToggleLike = { current?.let(vm::toggleLike) },
                            onToggleShuffle = vm::toggleShuffle,
                            onCycleRepeat = vm::cycleRepeatMode,
                            onSelectQueueTrack = { track -> vm.playTrack(track, playerState.queue) }
                        )
                    }
                }
            }
        }
    }
}
