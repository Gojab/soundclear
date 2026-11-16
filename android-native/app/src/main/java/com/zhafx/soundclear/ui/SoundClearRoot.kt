package com.zhafx.soundclear.ui

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.zhafx.soundclear.AppContainer
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.ui.components.CustomBackgroundLayer
import com.zhafx.soundclear.ui.components.MiniPlayerBar
import com.zhafx.soundclear.ui.components.PlaylistPickerDialog
import com.zhafx.soundclear.ui.components.SongCreditsDialog
import com.zhafx.soundclear.ui.components.SoundClearBottomBar
import com.zhafx.soundclear.ui.components.TrackActionBottomSheet
import com.zhafx.soundclear.ui.screens.AlbumDetailScreen
import com.zhafx.soundclear.ui.screens.ArtistDetailScreen
import com.zhafx.soundclear.ui.screens.CreateMixScreen
import com.zhafx.soundclear.ui.screens.EpisodeDetailScreen
import com.zhafx.soundclear.ui.screens.HomeScreen
import com.zhafx.soundclear.ui.screens.LibraryScreen
import com.zhafx.soundclear.ui.screens.LikedTracksScreen
import com.zhafx.soundclear.ui.screens.LocalPlaylistScreen
import com.zhafx.soundclear.ui.screens.MixDetailScreen
import com.zhafx.soundclear.ui.screens.MoodDetailScreen
import com.zhafx.soundclear.ui.screens.MoodsScreen
import com.zhafx.soundclear.ui.screens.NowPlayingScreen
import com.zhafx.soundclear.ui.screens.PlaylistDetailScreen
import com.zhafx.soundclear.ui.screens.PodcastDetailScreen
import com.zhafx.soundclear.ui.screens.RecapScreen
import com.zhafx.soundclear.ui.screens.SearchScreen
import com.zhafx.soundclear.ui.screens.SettingsScreen
import com.zhafx.soundclear.ui.screens.ShortcutsScreen
import com.zhafx.soundclear.ui.viewmodel.CreateMixViewModel
import com.zhafx.soundclear.ui.viewmodel.DetailViewModel
import com.zhafx.soundclear.ui.viewmodel.HomeViewModel
import com.zhafx.soundclear.ui.viewmodel.LibraryViewModel
import com.zhafx.soundclear.ui.viewmodel.PlayerViewModel
import com.zhafx.soundclear.ui.viewmodel.RecapViewModel
import com.zhafx.soundclear.ui.viewmodel.SearchViewModel
import com.zhafx.soundclear.ui.viewmodel.SettingsViewModel
import com.zhafx.soundclear.ui.viewmodel.SoundClearVmFactory

@Composable
fun SoundClearRoot(container: AppContainer) {
    val factory = remember(container) { SoundClearVmFactory(container) }
    val navController = rememberNavController()
    val snackbarHostState = remember { SnackbarHostState() }

    val homeVm: HomeViewModel = viewModel(factory = factory)
    val searchVm: SearchViewModel = viewModel(factory = factory)
    val detailVm: DetailViewModel = viewModel(factory = factory)
    val createMixVm: CreateMixViewModel = viewModel(factory = factory)
    val libraryVm: LibraryViewModel = viewModel(factory = factory)
    val recapVm: RecapViewModel = viewModel(factory = factory)
    val settingsVm: SettingsViewModel = viewModel(factory = factory)
    val playerVm: PlayerViewModel = viewModel(factory = factory)

    val homeState by homeVm.uiState.collectAsState()
    val pbState by playerVm.playbackState.collectAsState()
    val playerExtras by playerVm.extras.collectAsState()
    val likedIds by playerVm.likedTrackIds.collectAsState(emptySet())
    val playlists by playerVm.playlists.collectAsState(emptyList())
    val offlineDownloads by playerVm.offlineDownloads.collectAsState(emptyList())
    val userSettings by playerVm.userSettings.collectAsState()

    var showNowPlayingModal by remember { mutableStateOf(false) }

    LaunchedEffect(playerExtras.toastMessage) {
        val msg = playerExtras.toastMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        playerVm.clearToast()
    }

    LaunchedEffect(pbState.errorMessage) {
        val err = pbState.errorMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(err)
    }

    fun navigateToItem(item: MediaItem) {
        val q = Uri.encode(item.title)
        when (item.type) {
            "artist" -> navController.navigate("artist/${Uri.encode(item.id)}?q=$q")
            "album" -> navController.navigate("album/${Uri.encode(item.id)}?q=$q")
            "playlist" -> {
                val pid = item.playlistId ?: item.id
                navController.navigate("playlist/${Uri.encode(pid)}?q=$q")
            }
            "podcast" -> navController.navigate("podcast/${Uri.encode(item.id)}?q=$q")
            "episode" -> navController.navigate("episode/${Uri.encode(item.playableVideoId)}?q=$q")
            else -> container.playbackController.playTrack(item)
        }
    }

    fun playFromList(track: MediaItem, list: List<MediaItem>?, source: String?) {
        val queue = if (!list.isNullOrEmpty()) list else listOf(track)
        val idx = queue.indexOfFirst { it.playableVideoId == track.playableVideoId }.coerceAtLeast(0)
        container.playbackController.playQueue(queue, idx, source)
    }

    val backEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backEntry?.destination?.route ?: "home"
    val bottomTab = when {
        currentRoute.startsWith("search") || currentRoute.startsWith("moods") -> "search"
        currentRoute.startsWith("library") || currentRoute.startsWith("liked") || currentRoute.startsWith("local-playlist") -> "library"
        else -> "home"
    }

    Box(modifier = Modifier.fillMaxSize()) {
        CustomBackgroundLayer(
            settings = userSettings.customBackground,
            ambientHex = playerExtras.ambientColorHex,
            currentCoverUrl = pbState.currentTrack?.displayThumbnail(userSettings.dataSaver)
        )

        Scaffold(
            containerColor = Color.Transparent,
            snackbarHost = { SnackbarHost(snackbarHostState) },
            bottomBar = {
                Column {
                    if (pbState.currentTrack != null && !showNowPlayingModal) {
                        MiniPlayerBar(
                            state = pbState,
                            isLiked = playerExtras.isCurrentLiked,
                            dataSaver = userSettings.dataSaver,
                            onExpand = { showNowPlayingModal = true },
                            onTogglePlay = { container.playbackController.togglePlayPause() },
                            onNext = { container.playbackController.next() },
                            onToggleLike = { pbState.currentTrack?.let { playerVm.toggleLike(it) } }
                        )
                    }
                    SoundClearBottomBar(
                        currentTab = bottomTab,
                        onSelectTab = { tab ->
                            navController.navigate(tab) {
                                popUpTo("home") { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = "home",
                modifier = Modifier.padding(innerPadding)
            ) {
                composable("home") {
                    HomeScreen(
                        viewModel = homeVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onPlayTrack = ::playFromList,
                        onOpenItem = ::navigateToItem,
                        onOpenMix = { mix -> navController.navigate("mix/${Uri.encode(mix.id)}") },
                        onOpenCreateMix = { navController.navigate("create-mix") },
                        onOpenMoods = { navController.navigate("moods") },
                        onOpenMoodDetail = { params, title ->
                            navController.navigate("mood-detail/${Uri.encode(params)}?title=${Uri.encode(title)}")
                        },
                        onOpenRecap = { navController.navigate("recap") },
                        onOpenSettings = { navController.navigate("settings?tab=appearance") },
                        onOpenEqualizer = { navController.navigate("settings?tab=audio") },
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable("search") {
                    SearchScreen(
                        viewModel = searchVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onPlayTrack = ::playFromList,
                        onOpenItem = ::navigateToItem,
                        onOpenMoods = { navController.navigate("moods") },
                        onStartRadio = { playerVm.startRadioFromTrack(it) },
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable("moods") {
                    MoodsScreen(
                        viewModel = detailVm,
                        onBack = { navController.popBackStack() },
                        onOpenMoodDetail = { params, title ->
                            navController.navigate("mood-detail/${Uri.encode(params)}?title=${Uri.encode(title)}")
                        }
                    )
                }

                composable(
                    route = "mood-detail/{params}?title={title}",
                    arguments = listOf(
                        navArgument("params") { type = NavType.StringType },
                        navArgument("title") { type = NavType.StringType; defaultValue = "Mood" }
                    )
                ) { entry ->
                    val params = Uri.decode(entry.arguments?.getString("params").orEmpty())
                    val title = Uri.decode(entry.arguments?.getString("title").orEmpty())
                    MoodDetailScreen(
                        params = params,
                        title = title,
                        viewModel = detailVm,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onOpenItem = ::navigateToItem
                    )
                }

                composable(
                    route = "artist/{id}?q={q}",
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("q") { type = NavType.StringType; nullable = true; defaultValue = null }
                    )
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    val q = entry.arguments?.getString("q")?.let { Uri.decode(it) }
                    ArtistDetailScreen(
                        artistId = id,
                        fallbackQuery = q,
                        viewModel = detailVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = ::playFromList,
                        onOpenItem = ::navigateToItem,
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable(
                    route = "album/{id}?q={q}",
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("q") { type = NavType.StringType; nullable = true; defaultValue = null }
                    )
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    val q = entry.arguments?.getString("q")?.let { Uri.decode(it) }
                    AlbumDetailScreen(
                        albumId = id,
                        fallbackQuery = q,
                        viewModel = detailVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = ::playFromList,
                        onOpenItem = ::navigateToItem,
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable(
                    route = "playlist/{id}?q={q}",
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("q") { type = NavType.StringType; nullable = true; defaultValue = null }
                    )
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    val q = entry.arguments?.getString("q")?.let { Uri.decode(it) }
                    PlaylistDetailScreen(
                        playlistId = id,
                        fallbackQuery = q,
                        viewModel = detailVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = { track, list, src, mix ->
                            val queue = list ?: listOf(track)
                            val idx = queue.indexOfFirst { it.playableVideoId == track.playableVideoId }.coerceAtLeast(0)
                            container.playbackController.playQueue(queue, idx, src, mix)
                        },
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable(
                    route = "podcast/{id}?q={q}",
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("q") { type = NavType.StringType; nullable = true; defaultValue = null }
                    )
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    val q = entry.arguments?.getString("q")?.let { Uri.decode(it) }
                    PodcastDetailScreen(
                        podcastId = id,
                        fallbackQuery = q,
                        viewModel = detailVm,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayEpisode = ::playFromList,
                        onOpenEpisode = { epId, title ->
                            navController.navigate("episode/${Uri.encode(epId)}?q=${Uri.encode(title.orEmpty())}")
                        }
                    )
                }

                composable(
                    route = "episode/{id}?q={q}",
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("q") { type = NavType.StringType; nullable = true; defaultValue = null }
                    )
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    val q = entry.arguments?.getString("q")?.let { Uri.decode(it) }
                    EpisodeDetailScreen(
                        episodeId = id,
                        fallbackQuery = q,
                        viewModel = detailVm,
                        onBack = { navController.popBackStack() },
                        onPlayEpisode = { ep -> container.playbackController.playTrack(ep, "Podcast") }
                    )
                }

                composable("library") {
                    LibraryScreen(
                        viewModel = libraryVm,
                        dataSaver = userSettings.dataSaver,
                        onOpenLiked = { navController.navigate("liked") },
                        onOpenLocalPlaylist = { pid -> navController.navigate("local-playlist/${Uri.encode(pid)}") },
                        onOpenItem = ::navigateToItem,
                        onPlayTrack = ::playFromList,
                        onOpenCreateMix = { navController.navigate("create-mix") }
                    )
                }

                composable("liked") {
                    LikedTracksScreen(
                        libraryViewModel = libraryVm,
                        detailViewModel = detailVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = ::playFromList,
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable(
                    route = "local-playlist/{id}",
                    arguments = listOf(navArgument("id") { type = NavType.StringType })
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    LocalPlaylistScreen(
                        playlistId = id,
                        viewModel = detailVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = { track, list, src, mix ->
                            val queue = list ?: listOf(track)
                            val idx = queue.indexOfFirst { it.playableVideoId == track.playableVideoId }.coerceAtLeast(0)
                            container.playbackController.playQueue(queue, idx, src, mix)
                        },
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable(
                    route = "mix/{id}",
                    arguments = listOf(navArgument("id") { type = NavType.StringType })
                ) { entry ->
                    val id = Uri.decode(entry.arguments?.getString("id").orEmpty())
                    val mix = homeState.dailyMixes.firstOrNull { it.id == id }
                    if (mix != null) {
                        MixDetailScreen(
                            mix = mix,
                            currentPlayingId = pbState.currentTrack?.playableVideoId,
                            likedTrackIds = likedIds,
                            dataSaver = userSettings.dataSaver,
                            onBack = { navController.popBackStack() },
                            onPlayTrack = ::playFromList,
                            onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                            onToggleLike = { playerVm.toggleLike(it) }
                        )
                    }
                }

                composable("create-mix") {
                    CreateMixScreen(
                        viewModel = createMixVm,
                        currentPlayingId = pbState.currentTrack?.playableVideoId,
                        likedTrackIds = likedIds,
                        dataSaver = userSettings.dataSaver,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = ::playFromList,
                        onSavedPlaylist = { pid -> navController.navigate("local-playlist/${Uri.encode(pid)}") },
                        onOpenTrackMenu = { playerVm.openTrackMenu(it) },
                        onToggleLike = { playerVm.toggleLike(it) }
                    )
                }

                composable("recap") {
                    RecapScreen(
                        viewModel = recapVm,
                        onBack = { navController.popBackStack() },
                        onPlayTrack = ::playFromList
                    )
                }

                composable(
                    route = "settings?tab={tab}",
                    arguments = listOf(navArgument("tab") { type = NavType.StringType; defaultValue = "audio" })
                ) { entry ->
                    val tab = entry.arguments?.getString("tab") ?: "audio"
                    SettingsScreen(
                        initialTab = tab,
                        viewModel = settingsVm,
                        playbackController = container.playbackController,
                        onBack = { navController.popBackStack() },
                        onOpenShortcuts = { navController.navigate("shortcuts") }
                    )
                }

                composable("shortcuts") {
                    ShortcutsScreen(onBack = { navController.popBackStack() })
                }
            }
        }

        // Now Playing Layar Penuh
        AnimatedVisibility(
            visible = showNowPlayingModal,
            enter = slideInVertically(initialOffsetY = { it }),
            exit = slideOutVertically(targetOffsetY = { it })
        ) {
            NowPlayingScreen(
                playerViewModel = playerVm,
                playbackController = container.playbackController,
                onCollapse = { showNowPlayingModal = false },
                onOpenEqualizer = {
                    showNowPlayingModal = false
                    navController.navigate("settings?tab=audio")
                },
                onOpenArtist = { artistId ->
                    showNowPlayingModal = false
                    navController.navigate("artist/${Uri.encode(artistId)}")
                }
            )
        }

        // Bottom Sheet Aksi Trek Global
        playerExtras.activeTrackMenuTarget?.let { target ->
            val vid = target.playableVideoId
            TrackActionBottomSheet(
                track = target,
                isLiked = vid in likedIds,
                isOffline = offlineDownloads.any { it.id == vid },
                sleepTimerMode = pbState.sleepTimerMode,
                sleepTimerRemainingSec = pbState.sleepTimerRemainingSec,
                onDismiss = { playerVm.closeTrackMenu() },
                onPlayNext = { container.playbackController.addNext(target); playerVm.showToast("Ditambahkan setelah lagu ini") },
                onAddToQueue = { container.playbackController.addToQueue(target); playerVm.showToast("Ditambahkan ke antrean") },
                onAddToPlaylist = { playerVm.openPlaylistPicker(target) },
                onToggleLike = { playerVm.toggleLike(target) },
                onDownloadOffline = { playerVm.downloadOffline(target) },
                onGoToArtist = {
                    target.artists.firstOrNull()?.id?.let { aid ->
                        showNowPlayingModal = false
                        navController.navigate("artist/${Uri.encode(aid)}")
                    }
                },
                onGoToAlbum = {
                    target.album?.id?.let { albid ->
                        showNowPlayingModal = false
                        navController.navigate("album/${Uri.encode(albid)}")
                    }
                },
                onStartRadio = { playerVm.startRadioFromTrack(target) },
                onCreateMixFromTrack = {
                    createMixVm.addSeedTrack(target)
                    createMixVm.setMode("track")
                    showNowPlayingModal = false
                    navController.navigate("create-mix")
                },
                onViewCredits = { playerVm.openCreditsModal(target) },
                onHideTrack = { playerVm.hideTrack(target) },
                onSetSleepTimerMinutes = { container.playbackController.setSleepTimerMinutes(it) },
                onSetSleepTimerEndOfTrack = { container.playbackController.setSleepTimerEndOfTrack() },
                onCancelSleepTimer = { container.playbackController.cancelSleepTimer() }
            )
        }

        // Dialog Pilih Playlist
        playerExtras.playlistPickerTarget?.let { target ->
            PlaylistPickerDialog(
                track = target,
                playlists = playlists,
                onDismiss = { playerVm.closePlaylistPicker() },
                onPickPlaylist = { pid -> playerVm.addTrackToPlaylist(pid, target) },
                onCreateAndAdd = { name -> playerVm.createPlaylistAndAdd(name, target) }
            )
        }

        // Dialog Kredit Lagu
        playerExtras.creditsModalTarget?.let { target ->
            SongCreditsDialog(
                track = target,
                credits = playerExtras.credits,
                isLoading = playerExtras.creditsLoading,
                onDismiss = { playerVm.closeCreditsModal() }
            )
        }
    }
}
