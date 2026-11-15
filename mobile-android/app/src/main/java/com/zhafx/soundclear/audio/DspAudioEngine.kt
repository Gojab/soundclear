package com.zhafx.soundclear.audio

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import com.zhafx.soundclear.model.EqBandState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object DspAudioEngine {
    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var currentSessionId: Int = 0

    private val _enabled = MutableStateFlow(true)
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    private val _bands = MutableStateFlow<List<EqBandState>>(emptyList())
    val bands: StateFlow<List<EqBandState>> = _bands.asStateFlow()

    private val _bandRangeMb = MutableStateFlow(-1500 to 1500)
    val bandRangeMb: StateFlow<Pair<Int, Int>> = _bandRangeMb.asStateFlow()

    private val _bassStrength = MutableStateFlow(0)
    val bassStrength: StateFlow<Int> = _bassStrength.asStateFlow()

    private val _activePreset = MutableStateFlow("Flat")
    val activePreset: StateFlow<String> = _activePreset.asStateFlow()

    val presets: Map<String, List<Float>> = linkedMapOf(
        "Flat" to listOf(0f, 0f, 0f, 0f, 0f),
        "Bass Boost" to listOf(0.8f, 0.5f, 0.1f, 0.0f, 0.1f),
        "Vocal Clear" to listOf(-0.2f, 0.1f, 0.55f, 0.65f, 0.3f),
        "Club" to listOf(0.6f, 0.35f, -0.1f, 0.35f, 0.5f),
        "Rock" to listOf(0.55f, 0.25f, -0.2f, 0.35f, 0.6f)
    )

    fun attachToSession(audioSessionId: Int) {
        if (audioSessionId <= 0 || audioSessionId == currentSessionId) return
        releaseEffects()
        currentSessionId = audioSessionId
        try {
            val eq = Equalizer(0, audioSessionId).apply {
                enabled = _enabled.value
            }
            val range = eq.bandLevelRange
            val minMb = range[0].toInt()
            val maxMb = range[1].toInt()
            _bandRangeMb.value = minMb to maxMb

            val count = eq.numberOfBands.toInt()
            val existing = _bands.value
            val updated = List(count) { idx ->
                val band = idx.toShort()
                val freqHz = eq.getCenterFreq(band) / 1000
                val prevLevel = existing.getOrNull(idx)?.levelMb
                val level = prevLevel?.coerceIn(minMb, maxMb) ?: eq.getBandLevel(band).toInt()
                if (prevLevel != null) {
                    eq.setBandLevel(band, level.toShort())
                }
                EqBandState(
                    index = idx,
                    centerFreqHz = freqHz,
                    label = formatFreq(freqHz),
                    levelMb = level
                )
            }
            equalizer = eq
            _bands.value = updated

            val bb = BassBoost(0, audioSessionId).apply {
                enabled = _enabled.value
                if (strengthSupported) {
                    setStrength(_bassStrength.value.coerceIn(0, 1000).toShort())
                }
            }
            bassBoost = bb
        } catch (_: Exception) {
            releaseEffects()
        }
    }

    fun setDspEnabled(isEnabled: Boolean) {
        _enabled.value = isEnabled
        try {
            equalizer?.enabled = isEnabled
            bassBoost?.enabled = isEnabled
        } catch (_: Exception) {
        }
    }

    fun setBandLevel(index: Int, levelMb: Int) {
        val (minMb, maxMb) = _bandRangeMb.value
        val clamped = levelMb.coerceIn(minMb, maxMb)
        try {
            equalizer?.setBandLevel(index.toShort(), clamped.toShort())
        } catch (_: Exception) {
        }
        _bands.value = _bands.value.map {
            if (it.index == index) it.copy(levelMb = clamped) else it
        }
        _activePreset.value = "Kustom"
    }

    fun applyPreset(name: String) {
        val curve = presets[name] ?: return
        val (minMb, maxMb) = _bandRangeMb.value
        val current = _bands.value
        if (current.isEmpty()) {
            _activePreset.value = name
            return
        }
        val updated = current.mapIndexed { idx, band ->
            val ratio = curve.getOrElse(idx.coerceAtMost(curve.lastIndex)) { 0f }
            val targetMb = if (ratio >= 0f) {
                (ratio * maxMb).toInt()
            } else {
                (-ratio * minMb).toInt()
            }.coerceIn(minMb, maxMb)
            try {
                equalizer?.setBandLevel(idx.toShort(), targetMb.toShort())
            } catch (_: Exception) {
            }
            band.copy(levelMb = targetMb)
        }
        _bands.value = updated
        _activePreset.value = name
    }

    fun setBassStrength(strength: Int) {
        val clamped = strength.coerceIn(0, 1000)
        _bassStrength.value = clamped
        try {
            bassBoost?.let {
                if (it.strengthSupported) {
                    it.setStrength(clamped.toShort())
                }
            }
        } catch (_: Exception) {
        }
    }

    fun releaseEffects() {
        try {
            equalizer?.release()
        } catch (_: Exception) {
        }
        try {
            bassBoost?.release()
        } catch (_: Exception) {
        }
        equalizer = null
        bassBoost = null
        currentSessionId = 0
    }

    private fun formatFreq(hz: Int): String {
        return if (hz >= 1000) "${hz / 1000} kHz" else "$hz Hz"
    }
}
