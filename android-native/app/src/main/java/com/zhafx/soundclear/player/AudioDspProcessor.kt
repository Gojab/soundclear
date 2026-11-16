package com.zhafx.soundclear.player

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.audiofx.AudioEffect
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import com.zhafx.soundclear.data.remote.LocalAudioProfile
import com.zhafx.soundclear.domain.AudioMath
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/**
 * Mesin DSP perangkat keras Android: mengikat Equalizer, BassBoost, dan LoudnessEnhancer
 * langsung ke audioSessionId milik Media3 ExoPlayer secara aman (hanya saat efek aktif),
 * serta menyediakan generator nada uji.
 */
class AudioDspProcessor {

    private var currentSessionId: Int = 0
    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var loudnessEnhancer: LoudnessEnhancer? = null

    private var testToneJob: Job? = null
    private var testToneTrack: AudioTrack? = null

    fun attachToSession(sessionId: Int, profile: LocalAudioProfile) {
        if (sessionId <= 0) return
        if (currentSessionId != sessionId) {
            releaseEffects()
            currentSessionId = sessionId
        }
        applyProfile(profile)
    }

    fun applyProfile(profile: LocalAudioProfile) {
        val sessionId = currentSessionId
        if (sessionId <= 0) return
        val bypass = profile.directMode

        // Equalizer hanya dibuat saat aktif & punya kurva non-datar agar HAL audio tidak terganggu
        val eqNeeded = !bypass && profile.eqEnabled &&
            (profile.bands.any { abs(it) > 0.05f } || abs(profile.preampDb) > 0.05f)
        if (eqNeeded) {
            runCatching {
                val eq = equalizer ?: Equalizer(0, sessionId).also { equalizer = it }
                val range = eq.bandLevelRange
                val minMb = range.getOrElse(0) { (-1500).toShort() }.toInt()
                val maxMb = range.getOrElse(1) { (1500).toShort() }.toInt()
                val numBands = eq.numberOfBands.toInt()
                for (bandIdx in 0 until numBands) {
                    val centerHz = eq.getCenterFreq(bandIdx.toShort()) / 1000.0
                    val targetDb = interpolate10BandDb(centerHz, profile.bands) + profile.preampDb * 0.4f
                    val targetMb = (targetDb * 100f).roundToInt().coerceIn(minMb, maxMb)
                    eq.setBandLevel(bandIdx.toShort(), targetMb.toShort())
                }
                if (eq.setEnabled(true) != AudioEffect.SUCCESS) {
                    runCatching { eq.release() }
                    equalizer = null
                }
            }.onFailure {
                runCatching { equalizer?.release() }
                equalizer = null
            }
        } else {
            runCatching {
                equalizer?.enabled = false
                equalizer?.release()
            }
            equalizer = null
        }

        // BassBoost hanya diaktifkan saat level > 0
        val bassNeeded = !bypass && profile.bassBoostEnabled && profile.bassBoostLevel > 0
        if (bassNeeded) {
            runCatching {
                val bb = bassBoost ?: BassBoost(0, sessionId).also { bassBoost = it }
                if (bb.strengthSupported) {
                    val strength = ((profile.bassBoostLevel / 100f) * 1000f).roundToInt().coerceIn(0, 1000)
                    bb.setStrength(strength.toShort())
                }
                if (bb.setEnabled(true) != AudioEffect.SUCCESS) {
                    runCatching { bb.release() }
                    bassBoost = null
                }
            }.onFailure {
                runCatching { bassBoost?.release() }
                bassBoost = null
            }
        } else {
            runCatching {
                bassBoost?.enabled = false
                bassBoost?.release()
            }
            bassBoost = null
        }

        // LoudnessEnhancer hanya memakai gain positif >= 50 mB (gain negatif bisa membisukan AudioFlinger)
        val gainDb = when (profile.normalizationTarget) {
            "normal" -> 1.5f
            "loud" -> 4.0f
            else -> 0f
        } + if (profile.preampDb > 0.2f && !profile.eqEnabled) profile.preampDb else 0f
        val gainMb = (gainDb * 100f).roundToInt().coerceIn(0, 900)
        val loudnessNeeded = !bypass && gainMb >= 50

        if (loudnessNeeded) {
            runCatching {
                val le = loudnessEnhancer ?: LoudnessEnhancer(sessionId).also { loudnessEnhancer = it }
                le.setTargetGain(gainMb)
                if (le.setEnabled(true) != AudioEffect.SUCCESS) {
                    runCatching { le.release() }
                    loudnessEnhancer = null
                }
            }.onFailure {
                runCatching { loudnessEnhancer?.release() }
                loudnessEnhancer = null
            }
        } else {
            runCatching {
                loudnessEnhancer?.enabled = false
                loudnessEnhancer?.release()
            }
            loudnessEnhancer = null
        }
    }

    private fun interpolate10BandDb(centerHz: Double, bands: List<Float>): Float {
        if (bands.isEmpty()) return 0f
        var closestIdx = 0
        var minDiff = Double.MAX_VALUE
        AudioMath.EQ_FREQUENCIES_HZ.forEachIndexed { idx, freq ->
            val diff = abs(centerHz - freq.toDouble())
            if (diff < minDiff) {
                minDiff = diff
                closestIdx = idx
            }
        }
        return bands.getOrElse(closestIdx) { 0f }
    }

    fun startTestTone(mode: String, scope: CoroutineScope, onStopped: () -> Unit) {
        stopTestTone()
        testToneJob = scope.launch(Dispatchers.IO) {
            val sampleRate = 44_100
            val bufSamples = 2048
            val minBytes = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            ).coerceAtLeast(bufSamples * 2)

            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(minBytes)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            testToneTrack = track
            runCatching { track.play() }

            val pcm = ShortArray(bufSamples)
            var sampleIndex = 0L
            val sweepTotalSamples = sampleRate * 6L
            var b0 = 0.0
            var b1 = 0.0
            var b2 = 0.0
            var phase = 0.0

            try {
                while (isActive) {
                    for (i in pcm.indices) {
                        val value = if (mode == "pink_noise") {
                            val white = Random.nextDouble(-1.0, 1.0)
                            b0 = 0.99765 * b0 + white * 0.0990460
                            b1 = 0.96300 * b1 + white * 0.2965164
                            b2 = 0.57000 * b2 + white * 1.0526913
                            (b0 + b1 + b2 + white * 0.1848) * 0.12
                        } else {
                            // Sweep logaritmik 20Hz - 20kHz berulang tiap 6 detik
                            val t = (sampleIndex % sweepTotalSamples).toDouble() / sweepTotalSamples
                            val freq = 20.0 * (1000.0).pow(t)
                            phase += (2.0 * PI * freq) / sampleRate
                            if (phase > 2.0 * PI) phase -= 2.0 * PI
                            sin(phase) * 0.35
                        }
                        pcm[i] = (value.coerceIn(-1.0, 1.0) * Short.MAX_VALUE).toInt().toShort()
                        sampleIndex += 1
                    }
                    track.write(pcm, 0, pcm.size)
                }
            } finally {
                runCatching { track.stop() }
                runCatching { track.release() }
                onStopped()
            }
        }
    }

    fun stopTestTone() {
        testToneJob?.cancel()
        testToneJob = null
        runCatching { testToneTrack?.stop() }
        runCatching { testToneTrack?.release() }
        testToneTrack = null
    }

    fun releaseEffects() {
        runCatching { equalizer?.release() }
        runCatching { bassBoost?.release() }
        runCatching { loudnessEnhancer?.release() }
        equalizer = null
        bassBoost = null
        loudnessEnhancer = null
        currentSessionId = 0
    }

    fun releaseAll() {
        stopTestTone()
        releaseEffects()
    }
}
