package com.zhafx.soundclear.domain

import com.zhafx.soundclear.data.remote.DailyMixSummary
import com.zhafx.soundclear.data.remote.MediaItem
import com.zhafx.soundclear.data.remote.MoodCategoryItem

object MixCurator {

    data class CuratedGenre(
        val id: String,
        val label: String,
        val searchQuery: String,
        val moodHints: List<String>,
        val accentHex: String
    )

    val CURATED_MIX_GENRES = listOf(
        CuratedGenre("pop-indo", "Pop Indonesia", "pop indonesia hits terbaik", listOf("pop", "indonesia", "santuy"), "#1ED760"),
        CuratedGenre("lofi-chill", "Lo-Fi & Santai", "lofi chill beats study relax", listOf("chill", "santai", "fokus", "tidur"), "#509BF5"),
        CuratedGenre("indie", "Indie & Alternatif", "indie indonesia alternatif hits", listOf("indie", "alternatif"), "#AF2896"),
        CuratedGenre("dangdut-koplo", "Dangdut & Koplo", "dangdut koplo jawa populer", listOf("dangdut", "koplo", "pesta"), "#E8115B"),
        CuratedGenre("kpop", "K-Pop", "kpop top hits 2025", listOf("k-pop", "kpop", "pop"), "#FF6B9D"),
        CuratedGenre("rnb-soul", "R&B & Soul", "rnb soul smooth hits", listOf("r&b", "soul", "romantis"), "#BA5D07"),
        CuratedGenre("rock", "Rock", "rock anthem klasik modern", listOf("rock", "energi", "olahraga"), "#E13300"),
        CuratedGenre("edm", "EDM & Club", "electronic dance club hits", listOf("dance", "elektronik", "pesta", "energi"), "#00B8D9"),
        CuratedGenre("jazz", "Jazz", "smooth jazz coffee shop", listOf("jazz", "fokus"), "#D4A017"),
        CuratedGenre("hiphop", "Hip-Hop & Rap", "hip hop rap hits populer", listOf("hip-hop", "rap"), "#E61E32"),
        CuratedGenre("acoustic", "Akustik", "akustik cover santai indonesia", listOf("akustik", "romantis"), "#477D95"),
        CuratedGenre("jpop", "J-Pop & Anime", "jpop anime opening hits", listOf("j-pop", "anime"), "#F59B23")
    )

    data class BrowseCategoryTile(
        val id: String,
        val title: String,
        val subtitle: String,
        val query: String,
        val filter: String,
        val colorHex: Long
    )

    val QUICK_BROWSE_CARDS = listOf(
        BrowseCategoryTile("charts-id", "Top 50 Indonesia", "Lagu teratas hari ini", "Top Hits Indonesia", "songs", 0xFF148A58),
        BrowseCategoryTile("pop-santai", "Pop Santai", "Melodi ringan seharian", "pop santai indonesia", "songs", 0xFF1E3264),
        BrowseCategoryTile("fokus-kerja", "Fokus & Belajar", "Musik instrumental & lo-fi", "lofi focus study instrumental", "songs", 0xFF503750),
        BrowseCategoryTile("podcast-id", "Podcast Populer", "Obrolan & cerita menarik", "podcast indonesia populer", "podcasts", 0xFF8D67AB),
        BrowseCategoryTile("galau-indo", "Lagu Galau", "Balada penuh perasaan", "lagu galau indonesia terbaik", "songs", 0xFFBA5D07),
        BrowseCategoryTile("energi-olahraga", "Energi & Workout", "Ritme cepat penambah semangat", "workout gym energetic hits", "songs", 0xFFE13300)
    )

    val ALL_BROWSE_CATEGORIES = listOf(
        BrowseCategoryTile("music", "Musik", "Rilisan & lagu hits", "hits musik terbaru", "songs", 0xFFDC148C),
        BrowseCategoryTile("podcasts", "Podcast", "Acara & episode terbaru", "podcast indonesia", "podcasts", 0xFF006450),
        BrowseCategoryTile("pop", "Pop", "Bintang pop lokal & global", "pop top hits", "songs", 0xFF148A08),
        BrowseCategoryTile("indonesian", "Musik Indonesia", "Karya musisi tanah air", "lagu indonesia terpopuler", "songs", 0xFFB02897),
        BrowseCategoryTile("hiphop", "Hip-Hop", "Beat & rap modern", "hip hop hits", "songs", 0xFFBC5900),
        BrowseCategoryTile("kpop", "K-Pop", "Idol & rilisan Korea", "kpop hits", "songs", 0xFF1E3264),
        BrowseCategoryTile("rock", "Rock", "Gitar & energi klasik", "rock hits", "songs", 0xFFE91429),
        BrowseCategoryTile("rnb", "R&B", "Groove & vokal lembut", "rnb soul hits", "songs", 0xFF8C1932),
        BrowseCategoryTile("indie", "Indie", "Suara independen pilihan", "indie folk alternative", "songs", 0xFFE8115B),
        BrowseCategoryTile("chill", "Santai", "Istirahat & suasana tenang", "chill relax acoustic", "songs", 0xFF477D95),
        BrowseCategoryTile("edm", "Dance / Elektronik", "Club & synth elektronik", "edm dance club", "songs", 0xFF537AA1),
        BrowseCategoryTile("jazz", "Jazz", "Saksofon, piano & blues", "smooth jazz", "songs", 0xFF777777),
        BrowseCategoryTile("dangdut", "Dangdut & Koplo", "Irama Nusantara meriah", "dangdut koplo terbaru", "songs", 0xFF7D4B32),
        BrowseCategoryTile("jpop", "J-Pop & Anime", "OST anime & pop Jepang", "jpop anime hits", "songs", 0xFFAF2896),
        BrowseCategoryTile("acoustic", "Akustik", "Sesi unplugged & gitar", "acoustic sessions", "songs", 0xFF27856B),
        BrowseCategoryTile("romance", "Romantis", "Lagu cinta pilihan", "romantic love songs", "songs", 0xFF9E1C4B)
    )

    private val MIX_PALETTES = listOf(
        "#1ED760",
        "#509BF5",
        "#F59B23",
        "#E13300",
        "#AF2896",
        "#00B8D9"
    )

    fun buildDailyMixes(
        likedTracks: List<MediaItem>,
        historyTracks: List<MediaItem>,
        homeFeedTracks: List<MediaItem>,
        chartSongs: List<MediaItem>
    ): List<DailyMixSummary> {
        val seedArtists = (likedTracks + historyTracks + chartSongs)
            .flatMap { it.artists }
            .map { it.name.trim() }
            .filter { it.isNotBlank() && it != "Artis tidak diketahui" }
            .distinct()

        val allPool = (likedTracks + historyTracks + homeFeedTracks + chartSongs)
            .filter { it.type in setOf("song", "video", "local") && it.playableVideoId.isNotBlank() }
            .distinctBy { it.playableVideoId }

        if (allPool.isEmpty()) return emptyList()

        return (0 until 6).mapNotNull { idx ->
            val mixNum = idx + 1
            val featuredArtists = seedArtists.drop(idx * 2).take(3)
            val artistFiltered = if (featuredArtists.isNotEmpty()) {
                allPool.filter { item ->
                    featuredArtists.any { a -> item.primaryArtistName.contains(a, ignoreCase = true) }
                }
            } else {
                emptyList()
            }
            val rotated = allPool.drop((idx * 5) % allPool.size) + allPool.take((idx * 5) % allPool.size)
            val tracks = (artistFiltered + rotated)
                .distinctBy { it.playableVideoId }
                .take(25)

            if (tracks.isEmpty()) return@mapNotNull null
            val subtitle = if (featuredArtists.isNotEmpty()) {
                featuredArtists.joinToString(", ") + " dan lainnya"
            } else {
                tracks.map { it.primaryArtistName }.distinct().take(3).joinToString(", ")
            }
            val thumbs = tracks.mapNotNull { it.displayThumbnail() }.distinct().take(4)

            DailyMixSummary(
                id = "mix-$mixNum",
                mixNumber = mixNum,
                title = "Mix Harian $mixNum",
                subtitle = subtitle,
                description = "Racikan otomatis berdasarkan musik favorit, riwayat putar, dan tren terkini.",
                accentHex = MIX_PALETTES[idx % MIX_PALETTES.size],
                coverUrl = thumbs.firstOrNull(),
                secondaryArt = thumbs,
                tracks = tracks
            )
        }
    }

    fun curateCustomMixTracks(
        seedTracks: List<MediaItem>,
        buckets: List<List<MediaItem>>,
        targetCount: Int,
        hiddenIds: Set<String>,
        excludedTasteIds: Set<String>,
        hideExplicit: Boolean,
        shuffleOffset: Int
    ): List<MediaItem> {
        val seen = mutableSetOf<String>()
        val result = mutableListOf<MediaItem>()

        fun tryAdd(item: MediaItem): Boolean {
            val id = item.playableVideoId
            if (id.isBlank() || id in seen || id in hiddenIds || id in excludedTasteIds) return false
            if (hideExplicit && item.isExplicit) return false
            seen += id
            result += item
            return true
        }

        seedTracks.forEach { tryAdd(it) }

        val nonEmpty = buckets.filter { it.isNotEmpty() }
        if (nonEmpty.isNotEmpty()) {
            var depth = 0
            val maxDepth = nonEmpty.maxOf { it.size }
            while (result.size < targetCount && depth < maxDepth) {
                for (bIdx in nonEmpty.indices) {
                    val bucket = nonEmpty[(bIdx + shuffleOffset) % nonEmpty.size]
                    val item = bucket.getOrNull((depth + shuffleOffset) % bucket.size) ?: continue
                    tryAdd(item)
                    if (result.size >= targetCount) break
                }
                depth += 1
            }
        }
        return result.take(targetCount)
    }

    fun findMatchingMood(genreLabel: String, moods: List<MoodCategoryItem>): MoodCategoryItem? {
        val lower = genreLabel.trim().lowercase()
        val curated = CURATED_MIX_GENRES.find { it.label.lowercase() == lower || it.id.lowercase() == lower }
        val hints = if (curated != null) listOf(lower) + curated.moodHints else listOf(lower)
        for (h in hints) {
            moods.firstOrNull { it.title.lowercase() == h }?.let { return it }
        }
        for (h in hints) {
            moods.firstOrNull { it.title.lowercase().contains(h) }?.let { return it }
        }
        return null
    }
}
