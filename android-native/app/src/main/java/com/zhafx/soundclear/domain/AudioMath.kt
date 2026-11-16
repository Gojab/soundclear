package com.zhafx.soundclear.domain

import com.zhafx.soundclear.data.remote.EqPreset
import com.zhafx.soundclear.data.remote.LyricLine
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.PlaylistMixSettings
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

object AudioMath {

    val EQ_FREQUENCIES_HZ = listOf(31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)

    val EQ_FREQUENCY_LABELS = listOf("31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k")

    val PLAYBACK_RATE_OPTIONS = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)

    data class QualityTierInfo(
        val id: String,
        val label: String,
        val description: String
    )

    val QUALITY_TIERS = listOf(
        QualityTierInfo("auto", "Otomatis", "Menyesuaikan kecepatan jaringan & hemat kuota secara dinamis."),
        QualityTierInfo("low", "Rendah (64 kbps)", "Paling hemat kuota untuk koneksi lambat."),
        QualityTierInfo("normal", "Normal (128 kbps)", "Keseimbangan kuota dan kejernihan harian."),
        QualityTierInfo("high", "Tinggi (192-256 kbps)", "Standar jernih dengan detail vokal & instrumen penuh."),
        QualityTierInfo("very_high", "Sangat Tinggi (320 kbps)", "Detail maksimum untuk headphone dan speaker berkualitas."),
        QualityTierInfo("lossless", "Lossless (16-bit)", "Tanpa kompresi rugi bila tersedia di server."),
        QualityTierInfo("hi_res", "Hi-Res (24-bit)", "Resolusi studio tertinggi bila didukung.")
    )

    val BUILTIN_EQ_PRESETS: List<EqPreset> = listOf(
        EqPreset("flat", "Datar (Flat)", 0f, listOf(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f)),
        EqPreset("bass_booster", "Penguat Bass", -2f, listOf(7.5f, 6.5f, 5f, 2.5f, 0.5f, 0f, 0f, 0.5f, 1f, 1.5f)),
        EqPreset("bass_reducer", "Kurangi Bass", 1f, listOf(-7f, -6f, -4.5f, -2.5f, -0.5f, 0f, 0f, 0.5f, 0.5f, 1f)),
        EqPreset("treble_booster", "Penguat Treble", -1.5f, listOf(0f, 0f, 0f, 0f, 0.5f, 2f, 4f, 5.5f, 7f, 7.5f)),
        EqPreset("treble_reducer", "Kurangi Treble", 0f, listOf(0f, 0f, 0f, 0f, 0f, -1.5f, -3.5f, -5.5f, -7f, -7.5f)),
        EqPreset("vocal_booster", "Vokal Jernih", -1f, listOf(-2f, -1.5f, -0.5f, 1.5f, 4f, 5f, 4.5f, 2.5f, 1f, 0f)),
        EqPreset("pop", "Pop", -1f, listOf(-1f, 2f, 4f, 4.5f, 2.5f, -0.5f, -1.5f, 1f, 2.5f, 3f)),
        EqPreset("rock", "Rock", -2f, listOf(5f, 4f, 2.5f, 0.5f, -1.5f, -1f, 2f, 4f, 5f, 5.5f)),
        EqPreset("jazz", "Jazz", -1f, listOf(3f, 2.5f, 1.5f, 2f, -1f, -1f, 1f, 2.5f, 3.5f, 4f)),
        EqPreset("classical", "Klasik", -1f, listOf(3.5f, 3f, 2f, 0.5f, -1f, -1f, 0.5f, 2.5f, 3.5f, 4.5f)),
        EqPreset("electronic", "Elektronik / EDM", -2.5f, listOf(6f, 5f, 2f, -1f, -2.5f, 0.5f, 3f, 4.5f, 5.5f, 6f)),
        EqPreset("hiphop", "Hip-Hop & R&B", -2f, listOf(6.5f, 5.5f, 3f, 0.5f, -1.5f, -1f, 1.5f, 2.5f, 3f, 3.5f)),
        EqPreset("acoustic", "Akustik", -1f, listOf(2f, 2.5f, 2f, 1f, 2f, 2f, 3f, 3.5f, 2.5f, 1.5f)),
        EqPreset("indie", "Indie & Alternatif", -1f, listOf(2.5f, 2f, 0.5f, -1f, 0f, 1.5f, 3f, 3.5f, 2.5f, 2f)),
        EqPreset("dangdut_koplo", "Koplo & Kendang", -2f, listOf(6f, 5.5f, 4f, 1.5f, 0f, 2.5f, 4f, 4.5f, 3f, 2f)),
        EqPreset("lounge", "Santai / Lounge", -0.5f, listOf(2.5f, 2f, 1f, -0.5f, -1f, 0.5f, 2f, 1.5f, 0.5f, 0f)),
        EqPreset("deep", "Deep & Hangat", -1.5f, listOf(5f, 4.5f, 3f, 1.5f, 0.5f, -1f, -2f, -2.5f, -3f, -3f)),
        EqPreset("loudness", "Loudness (V-Curve)", -2.5f, listOf(6f, 4.5f, 2f, -1f, -2.5f, -2f, -0.5f, 2.5f, 5f, 6.5f)),
        EqPreset("spoken_word", "Podcast / Ucapan", 0f, listOf(-5f, -4f, -2f, 1.5f, 4f, 5f, 4f, 2f, -1f, -3f))
    )

    data class NormalizationOption(
        val id: String,
        val label: String,
        val targetLufs: Float,
        val description: String
    )

    val NORMALIZATION_OPTIONS = listOf(
        NormalizationOption("off", "Mati", -14f, "Putar pada tingkat volume asli tanpa penyesuaian."),
        NormalizationOption("quiet", "Pelan (-19 LUFS)", -19f, "Lebih lembut dan nyaman untuk ruang sunyi / malam hari."),
        NormalizationOption("normal", "Normal (-14 LUFS)", -14f, "Standar seimbang antar semua lagu & podcast."),
        NormalizationOption("loud", "Kencang (-11 LUFS)", -11f, "Lebih bertenaga dengan pembatas puncak (limiter).")
    )

    val DJ_TRANSITION_STYLES = listOf(
        "bass-swap" to "Bass Swap (Klub)",
        "smooth" to "Smooth Blend",
        "filter-sweep" to "Filter Sweep",
        "cut" to "Hard Cut"
    )

    val DJ_VOLUME_CURVES = listOf(
        "equal-power" to "Equal Power",
        "s-curve" to "S-Curve",
        "linear" to "Linear"
    )

    fun calculateBiquadResponseDb(
        freqHz: Double,
        preampDb: Float,
        bandsDb: List<Float>,
        bassBoostEnabled: Boolean,
        bassBoostLevel: Int
    ): Float {
        var totalDb = preampDb.toDouble()
        val fs = 48_000.0
        val w0Factor = 2.0 * PI / fs

        EQ_FREQUENCIES_HZ.forEachIndexed { idx, fc ->
            val gain = bandsDb.getOrElse(idx) { 0f }.toDouble()
            if (kotlin.math.abs(gain) >= 0.05) {
                val w0 = fc * w0Factor
                val w = freqHz * w0Factor
                val a = 10.0.pow(gain / 40.0)
                val q = 1.4
                val alpha = sin(w0) / (2.0 * q)
                val cosW0 = cos(w0)
                val b0 = 1.0 + alpha * a
                val b1 = -2.0 * cosW0
                val b2 = 1.0 - alpha * a
                val a0 = 1.0 + alpha / a
                val a1 = -2.0 * cosW0
                val a2 = 1.0 - alpha / a

                val cosW = cos(w)
                val cos2W = cos(2.0 * w)
                val sinW = sin(w)
                val sin2W = sin(2.0 * w)

                val numRe = b0 + b1 * cosW + b2 * cos2W
                val numIm = -(b1 * sinW + b2 * sin2W)
                val denRe = a0 + a1 * cosW + a2 * cos2W
                val denIm = -(a1 * sinW + a2 * sin2W)

                val mag = sqrt((numRe * numRe + numIm * numIm) / max(1e-9, denRe * denRe + denIm * denIm))
                totalDb += 20.0 * log10(max(1e-6, mag))
            }
        }

        if (bassBoostEnabled && bassBoostLevel > 0) {
            val shelfGain = (bassBoostLevel / 100.0) * 6.5
            val slope = 1.0 / (1.0 + (freqHz / 110.0).pow(2.0))
            totalDb += shelfGain * slope
        }

        return totalDb.coerceIn(-18.0, 18.0).toFloat()
    }

    fun estimateBpm(track: MediaItem): Int {
        val text = "${track.title} ${track.genre.orEmpty()} ${track.primaryArtistName}".lowercase()
        return when {
            text.contains("koplo") || text.contains("dangdut") || text.contains("remix") -> 136
            text.contains("edm") || text.contains("club") || text.contains("house") -> 128
            text.contains("hip hop") || text.contains("rap") || text.contains("trap") -> 96
            text.contains("rock") || text.contains("punk") -> 124
            text.contains("acoustic") || text.contains("ballad") || text.contains("lofi") || text.contains("santai") -> 82
            text.contains("jazz") -> 108
            else -> {
                val hash = kotlin.math.abs((track.playableVideoId + track.title).hashCode())
                92 + (hash % 42)
            }
        }
    }

    fun buildTrackShareText(track: MediaItem): String {
        val id = track.playableVideoId
        val artist = track.primaryArtistName
        return "Dengarkan \"${track.title}\" oleh $artist di SoundClear\nhttps://soundclear-lyart.vercel.app/?track=$id"
    }

    fun buildWaveformCodeBars(trackId: String, count: Int = 28): List<Float> {
        val seed = trackId.ifBlank { "soundclear" }
        return List(count) { idx ->
            val ch = seed[idx % seed.length].code
            val factor = ((ch * (idx + 7) * 31) % 75) / 100f
            0.22f + factor
        }
    }

    fun findActiveLyricIndex(lines: List<LyricLine>, positionMs: Long): Int {
        if (lines.isEmpty()) return -1
        for (i in lines.indices.reversed()) {
            if (positionMs >= lines[i].startTimeMs) {
                return i
            }
        }
        return -1
    }

    fun formatDurationMs(ms: Long): String {
        val totalSec = max(0L, ms / 1000L)
        val hours = totalSec / 3600L
        val mins = (totalSec % 3600L) / 60L
        val secs = totalSec % 60L
        return if (hours > 0) {
            "%d:%02d:%02d".format(hours, mins, secs)
        } else {
            "%d:%02d".format(mins, secs)
        }
    }

    fun getGreetingByHour(hour: Int): String = when (hour) {
        in 4..10 -> "Selamat pagi"
        in 11..14 -> "Selamat siang"
        in 15..17 -> "Selamat sore"
        else -> "Selamat malam"
    }

    private val NON_INDONESIAN_SCRIPT_REGEX = Regex("[\\u0E00-\\u0E7F\\u1000-\\u109F\\u1780-\\u17FF\\u0900-\\u097F\\u0600-\\u06FF]")

    fun filterPreferredFeedItems(items: List<MediaItem>, hideExplicit: Boolean, hiddenIds: Set<String>): List<MediaItem> {
        var koploCount = 0
        return items.filter { item ->
            val key = item.playableVideoId
            if (key in hiddenIds) return@filter false
            if (hideExplicit && item.isExplicit) return@filter false
            val text = "${item.title} ${item.primaryArtistName}"
            if (NON_INDONESIAN_SCRIPT_REGEX.containsMatchIn(text)) return@filter false
            if (text.contains("koplo", ignoreCase = true) || text.contains("campursari", ignoreCase = true)) {
                koploCount += 1
                if (koploCount > 2) return@filter false
            }
            true
        }
    }
}
