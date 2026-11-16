package com.zhafx.soundclear.data.repository

import android.content.Context
import com.zhafx.soundclear.BuildConfig
import com.zhafx.soundclear.data.local.KvStateEntity
import com.zhafx.soundclear.data.local.SoundClearDatabase
import com.zhafx.soundclear.data.remote.ApiService
import com.zhafx.soundclear.data.remote.CustomBackgroundSettings
import com.zhafx.soundclear.data.remote.EqPreset
import com.zhafx.soundclear.data.remote.LocalAudioProfile
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import com.zhafx.soundclear.data.remote.SoundClearNetwork
import com.zhafx.soundclear.data.remote.UserSettings
import com.zhafx.soundclear.domain.AudioMath
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.util.UUID

class SettingsRepository(
    private val context: Context,
    private val db: SoundClearDatabase
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = SoundClearNetwork.json

    private val _userSettings = MutableStateFlow(UserSettings())
    val userSettings: StateFlow<UserSettings> = _userSettings.asStateFlow()

    private val _audioProfile = MutableStateFlow(LocalAudioProfile())
    val audioProfile: StateFlow<LocalAudioProfile> = _audioProfile.asStateFlow()

    private val _apiBaseUrl = MutableStateFlow(SoundClearNetwork.normalizeBaseUrl(BuildConfig.API_BASE_URL))
    val apiBaseUrl: StateFlow<String> = _apiBaseUrl.asStateFlow()

    @Volatile
    private var cachedApiService: ApiService = SoundClearNetwork.createApiService(_apiBaseUrl.value)

    init {
        scope.launch {
            db.kvStateDao().get(KEY_API_BASE_URL)?.valueJson?.let { raw ->
                val clean = SoundClearNetwork.normalizeBaseUrl(raw.trim('"'))
                _apiBaseUrl.value = clean
                cachedApiService = SoundClearNetwork.createApiService(clean)
            }
            db.kvStateDao().get(KEY_USER_SETTINGS)?.valueJson?.let { raw ->
                runCatching { json.decodeFromString<UserSettings>(raw) }.getOrNull()?.let {
                    _userSettings.value = it
                }
            }
            db.kvStateDao().get(KEY_AUDIO_PROFILE)?.valueJson?.let { raw ->
                runCatching { json.decodeFromString<LocalAudioProfile>(raw) }.getOrNull()?.let {
                    _audioProfile.value = it
                }
            }
        }
    }

    fun getApiService(): ApiService = cachedApiService

    fun updateUserSettings(transform: (UserSettings) -> UserSettings) {
        val updated = transform(_userSettings.value)
        _userSettings.value = updated
        scope.launch {
            db.kvStateDao().put(KvStateEntity(KEY_USER_SETTINGS, json.encodeToString(updated)))
        }
    }

    fun updateAudioProfile(transform: (LocalAudioProfile) -> LocalAudioProfile) {
        val updated = transform(_audioProfile.value)
        _audioProfile.value = updated
        scope.launch {
            db.kvStateDao().put(KvStateEntity(KEY_AUDIO_PROFILE, json.encodeToString(updated)))
        }
    }

    fun applyEqPreset(preset: EqPreset) {
        updateAudioProfile {
            it.copy(
                eqEnabled = true,
                presetId = preset.id,
                preampDb = preset.preampDb,
                bands = preset.bands.take(10).let { b ->
                    if (b.size == 10) b else List(10) { idx -> b.getOrElse(idx) { 0f } }
                }
            )
        }
    }

    fun saveCustomEqPreset(name: String) {
        val trimmed = name.trim()
        if (trimmed.isBlank()) return
        val current = _audioProfile.value
        val newPreset = EqPreset(
            id = "custom-${UUID.randomUUID().toString().take(8)}",
            name = trimmed,
            preampDb = current.preampDb,
            bands = current.bands,
            isCustom = true
        )
        updateAudioProfile {
            it.copy(
                presetId = newPreset.id,
                customPresets = listOf(newPreset) + it.customPresets
            )
        }
    }

    fun deleteCustomEqPreset(presetId: String) {
        updateAudioProfile {
            val remaining = it.customPresets.filterNot { p -> p.id == presetId }
            val fallbackId = if (it.presetId == presetId) "flat" else it.presetId
            it.copy(customPresets = remaining, presetId = fallbackId)
        }
    }

    fun resetEqToFlat() {
        applyEqPreset(AudioMath.BUILTIN_EQ_PRESETS.first())
    }

    fun updateDjMixDefaults(config: PlaylistMixSettings) {
        updateAudioProfile { it.copy(djMix = config) }
    }

    fun updateCustomBackground(transform: (CustomBackgroundSettings) -> CustomBackgroundSettings) {
        updateUserSettings { it.copy(customBackground = transform(it.customBackground)) }
    }

    fun toggleExcludeFromTaste(trackId: String): Boolean {
        val current = _userSettings.value.excludedTasteIds.toMutableSet()
        val nowExcluded = if (trackId in current) {
            current.remove(trackId)
            false
        } else {
            current.add(trackId)
            true
        }
        updateUserSettings { it.copy(excludedTasteIds = current.toList()) }
        return nowExcluded
    }

    fun setApiBaseUrl(url: String) {
        val clean = if (url.isBlank()) {
            SoundClearNetwork.normalizeBaseUrl(BuildConfig.API_BASE_URL)
        } else {
            SoundClearNetwork.normalizeBaseUrl(url)
        }
        _apiBaseUrl.value = clean
        cachedApiService = SoundClearNetwork.createApiService(clean)
        scope.launch {
            db.kvStateDao().put(KvStateEntity(KEY_API_BASE_URL, "\"$clean\""))
        }
    }

    suspend fun resetAudioSettingsOnServer(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            cachedApiService.resetAccountAudioSettings("local")
            Unit
        }
    }

    fun allEqPresets(): List<EqPreset> = AudioMath.BUILTIN_EQ_PRESETS + _audioProfile.value.customPresets

    companion object {
        const val KEY_USER_SETTINGS = "user_settings"
        const val KEY_AUDIO_PROFILE = "local_audio_profile"
        const val KEY_API_BASE_URL = "api_base_url"
    }
}
