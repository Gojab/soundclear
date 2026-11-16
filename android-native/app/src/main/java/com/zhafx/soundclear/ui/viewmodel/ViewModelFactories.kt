package com.zhafx.soundclear.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.zhafx.soundclear.AppContainer

class SoundClearVmFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(HomeViewModel::class.java) -> HomeViewModel(container) as T
            modelClass.isAssignableFrom(SearchViewModel::class.java) -> SearchViewModel(container) as T
            modelClass.isAssignableFrom(DetailViewModel::class.java) -> DetailViewModel(container) as T
            modelClass.isAssignableFrom(CreateMixViewModel::class.java) -> CreateMixViewModel(container) as T
            modelClass.isAssignableFrom(LibraryViewModel::class.java) -> LibraryViewModel(container) as T
            modelClass.isAssignableFrom(RecapViewModel::class.java) -> RecapViewModel(container) as T
            modelClass.isAssignableFrom(SettingsViewModel::class.java) -> SettingsViewModel(container) as T
            modelClass.isAssignableFrom(PlayerViewModel::class.java) -> PlayerViewModel(container) as T
            else -> throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
        }
    }
}
