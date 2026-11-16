package com.zhafx.soundclear

import android.app.Application
import com.zhafx.soundclear.data.local.SoundClearDatabase
import com.zhafx.soundclear.data.remote.DirectStreamResolver
import com.zhafx.soundclear.data.repository.LibraryRepository
import com.zhafx.soundclear.data.repository.MusicRepository
import com.zhafx.soundclear.data.repository.SettingsRepository
import com.zhafx.soundclear.player.PlaybackController

class AppContainer(application: Application) {
    val database: SoundClearDatabase = SoundClearDatabase.getInstance(application)
    val streamResolver: DirectStreamResolver = DirectStreamResolver()
    val settingsRepository: SettingsRepository = SettingsRepository(application, database)
    val libraryRepository: LibraryRepository = LibraryRepository(
        context = application,
        db = database,
        settingsRepository = settingsRepository,
        streamResolver = streamResolver
    )
    val musicRepository: MusicRepository = MusicRepository(settingsRepository)
    val playbackController: PlaybackController = PlaybackController(application)
}

class SoundClearApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
