from __future__ import annotations

import io
import re
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from PIL import Image
from ytmusicapi import YTMusic
from ytmusicapi.exceptions import YTMusicError

from cache import TTLCache
from schemas import (
    AlbumDetailResponse,
    AlbumRef,
    ArtistDetailResponse,
    ArtistRef,
    ArtworkColorResponse,
    ChartsResponse,
    HomeResponse,
    HomeSection,
    ItemType,
    LyricLine,
    LyricsResponse,
    MediaItem,
    MoodCategoryGroup,
    MoodCategoryItem,
    MoodPlaylistsResponse,
    MoodsResponse,
    PlaylistDetailResponse,
    SearchResponse,
    SuggestResponse,
    WatchPlaylistResponse,
)

ALLOWED_ARTWORK_HOSTS = {
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
    "i.ytimg.com",
    "i9.ytimg.com",
    "music.youtube.com",
    "yt3.ggpht.com",
}

_CJK_HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_JAPANESE_KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff]")
_KOREAN_HANGUL_RE = re.compile(r"[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]")
_INDIC_SCRIPT_RE = re.compile(r"[\u0900-\u0d7f]")

_MANDARIN_KEYWORD_RE = re.compile(
    r"\b(?:mandarin|mandopop|cantopop|c-?pop|chinese|zhongwen|hokkien|guoyu|taiwanese)\b",
    re.IGNORECASE,
)

_INDIAN_KEYWORD_RE = re.compile(
    r"\b(?:"
    r"india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|"
    r"punjabi|hindi|tamil|telugu|malayalam|kannada|bhojpuri|marathi|gujarati|bengali|"
    r"hindustani|carnatic|bhangra|ghazal|qawwali|bhajan|desi|i-?pop|"
    r"t-?series|zee\s*music|saregama|sony\s*music\s*india|yrf|tips\s*official|"
    r"udit\s*narayan|arijit\s*singh|shreya\s*ghoshal|alka\s*ynik|alka\s*yagnik|"
    r"kumar\s*sanu|lata\s*mangeshkar|kishore\s*kumar|sonu\s*nigam|a\.?\s*r\.?\s*rahman|"
    r"diljit\s*dosanjh|sidhu\s*moose\s*wala|ap\s*dhillon|anirudh\s*ravichander|"
    r"neha\s*kakkar|jubin\s*nautiyal|atif\s*aslam|sunidhi\s*chauhan|asha\s*bhosle|"
    r"mohammed\s*rafi|ilayaraja|sp\s*balasubrahmanyam"
    r")\b",
    re.IGNORECASE,
)


def is_indian_or_mandarin_text(text: str) -> bool:
    if not text:
        return False
    if _INDIC_SCRIPT_RE.search(text):
        return True
    if _INDIAN_KEYWORD_RE.search(text):
        return True
    if _MANDARIN_KEYWORD_RE.search(text):
        return True
    if _CJK_HAN_RE.search(text) and not (
        _JAPANESE_KANA_RE.search(text) or _KOREAN_HANGUL_RE.search(text)
    ):
        return True
    return False


def is_excluded_home_item(item: MediaItem) -> bool:
    parts = [
        item.title,
        *(a.name for a in item.artists),
        item.album.name if item.album else "",
    ]
    combined = " ".join(p for p in parts if p)
    return is_indian_or_mandarin_text(combined)


class MusicServiceError(Exception):
    """Domain error wrapping ytmusicapi failures cleanly."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def pick_largest_thumbnail(
    thumbnails: Any, fallback: Optional[str] = None
) -> Optional[str]:
    if not thumbnails or not isinstance(thumbnails, list):
        return fallback
    best_url: Optional[str] = None
    best_area = -1
    for item in thumbnails:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not url or not isinstance(url, str):
            continue
        w = int(item.get("width") or 0)
        h = int(item.get("height") or 0)
        area = w * h
        if area >= best_area:
            best_area = area
            best_url = url
    return best_url or fallback


def parse_duration_seconds(
    duration: Optional[str], duration_seconds: Optional[int] = None
) -> Optional[int]:
    if isinstance(duration_seconds, int) and duration_seconds >= 0:
        return duration_seconds
    if not duration or not isinstance(duration, str):
        return None
    parts = duration.strip().split(":")
    if not all(p.isdigit() for p in parts):
        return None
    total = 0
    for p in parts:
        total = total * 60 + int(p)
    return total


def normalize_artists(
    raw_artists: Any, fallback_artist: Optional[ArtistRef] = None
) -> list[ArtistRef]:
    result: list[ArtistRef] = []
    if isinstance(raw_artists, list):
        for artist in raw_artists:
            if isinstance(artist, dict) and artist.get("name"):
                result.append(
                    ArtistRef(id=artist.get("id"), name=str(artist["name"]))
                )
            elif isinstance(artist, str) and artist.strip():
                result.append(ArtistRef(id=None, name=artist.strip()))
    elif isinstance(raw_artists, dict) and raw_artists.get("name"):
        result.append(
            ArtistRef(id=raw_artists.get("id"), name=str(raw_artists["name"]))
        )
    elif isinstance(raw_artists, str) and raw_artists.strip():
        result.append(ArtistRef(id=None, name=raw_artists.strip()))

    if not result and fallback_artist is not None:
        result.append(fallback_artist)
    return result


def normalize_album(
    raw_album: Any, fallback_album: Optional[AlbumRef] = None
) -> Optional[AlbumRef]:
    if isinstance(raw_album, dict) and raw_album.get("name"):
        return AlbumRef(id=raw_album.get("id"), name=str(raw_album["name"]))
    if isinstance(raw_album, str) and raw_album.strip():
        return AlbumRef(
            id=fallback_album.id if fallback_album else None,
            name=raw_album.strip(),
        )
    return fallback_album


def infer_item_type(raw: dict[str, Any], default_type: Optional[ItemType] = None) -> ItemType:
    if default_type is not None:
        return default_type
    result_type = str(raw.get("resultType") or "").lower()
    if result_type in {"song", "video", "album", "artist", "playlist"}:
        return result_type  # type: ignore[return-value]

    video_type = str(raw.get("videoType") or "").upper()
    if raw.get("videoId"):
        if "OMV" in video_type or "UGC" in video_type:
            return "video"
        return "song"

    browse_id = str(raw.get("browseId") or "")
    if raw.get("playlistId") and not browse_id.startswith("MPRE"):
        return "playlist"
    if browse_id.startswith("MPRE") or raw.get("audioPlaylistId"):
        return "album"
    if browse_id.startswith("UC"):
        return "artist"
    if browse_id.startswith("VL") or raw.get("playlistId"):
        return "playlist"
    return "song"


def normalize_media_item(
    raw: dict[str, Any],
    *,
    default_type: Optional[ItemType] = None,
    fallback_thumbnail: Optional[str] = None,
    fallback_artist: Optional[ArtistRef] = None,
    fallback_album: Optional[AlbumRef] = None,
) -> Optional[MediaItem]:
    if not isinstance(raw, dict):
        return None

    item_type = infer_item_type(raw, default_type=default_type)

    video_id = raw.get("videoId")
    browse_id = raw.get("browseId")
    playlist_id = raw.get("playlistId")

    if item_type in {"song", "video"}:
        item_id = video_id or browse_id or playlist_id
    elif item_type == "playlist":
        raw_pl = playlist_id or (
            browse_id[2:]
            if isinstance(browse_id, str) and browse_id.startswith("VL")
            else browse_id
        )
        item_id = raw_pl
    else:
        item_id = browse_id or playlist_id or video_id

    if not item_id:
        return None

    title = raw.get("title") or raw.get("name")
    if not title:
        return None

    thumbs = raw.get("thumbnails") if raw.get("thumbnails") is not None else raw.get("thumbnail")
    thumbnail = pick_largest_thumbnail(thumbs, fallback=fallback_thumbnail)

    artists = normalize_artists(raw.get("artists"), fallback_artist=fallback_artist)
    if not artists and raw.get("author"):
        artists = normalize_artists(raw.get("author"))
    if not artists and item_type == "playlist" and raw.get("description"):
        pass

    album = normalize_album(raw.get("album"), fallback_album=fallback_album)

    duration = raw.get("duration") or raw.get("length")
    if not isinstance(duration, str):
        duration = None
    duration_seconds = parse_duration_seconds(duration, raw.get("duration_seconds"))

    return MediaItem(
        id=str(item_id),
        title=str(title),
        artists=artists,
        album=album,
        duration=duration,
        durationSeconds=duration_seconds,
        thumbnail=thumbnail,
        type=item_type,
        year=str(raw["year"]) if raw.get("year") is not None else None,
        views=str(raw["views"]) if raw.get("views") is not None else None,
        isExplicit=bool(raw.get("isExplicit", False)),
        playlistId=str(playlist_id) if playlist_id else None,
        videoId=str(video_id) if video_id else None,
        browseId=str(browse_id) if browse_id else None,
    )


def _format_ytmusic_error(exc: Exception, action: str) -> str:
    detail = str(exc).strip()
    if detail:
        return f"Gagal memuat {action} dari YouTube Music: {detail}"
    return f"Gagal memuat {action} dari YouTube Music."


class SoundClearService:
    """Wraps unauthenticated ytmusicapi with TTL caching and unified normalization."""

    def __init__(self, cache_ttl_seconds: int = 420, location: str = "ID") -> None:
        self._yt = YTMusic(location=location)
        self._cache = TTLCache(default_ttl_seconds=cache_ttl_seconds, max_entries=512)

    def _call_yt(self, cache_key: str, action: str, fn: Any, ttl_seconds: Optional[int] = None) -> Any:
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            result = fn()
        except YTMusicError as exc:
            raise MusicServiceError(_format_ytmusic_error(exc, action), status_code=502) from exc
        except Exception as exc:
            raise MusicServiceError(_format_ytmusic_error(exc, action), status_code=502) from exc
        self._cache.set(cache_key, result, ttl_seconds=ttl_seconds)
        return result

    def search(self, query: str, filter_type: Optional[str] = None, limit: int = 25) -> SearchResponse:
        q = query.strip()
        if not q:
            return SearchResponse(query="", filter=filter_type, items=[])

        allowed_filters = {"songs", "albums", "artists", "playlists", "videos"}
        resolved_filter = filter_type if filter_type in allowed_filters else None
        cache_key = f"search:{q.lower()}:{resolved_filter or 'all'}:{limit}"

        def _fetch() -> SearchResponse:
            raw_results = self._yt.search(query=q, filter=resolved_filter, limit=limit)
            default_type: Optional[ItemType] = None
            if resolved_filter == "songs":
                default_type = "song"
            elif resolved_filter == "albums":
                default_type = "album"
            elif resolved_filter == "artists":
                default_type = "artist"
            elif resolved_filter == "playlists":
                default_type = "playlist"
            elif resolved_filter == "videos":
                default_type = "video"

            items: list[MediaItem] = []
            for entry in raw_results or []:
                item = normalize_media_item(entry, default_type=default_type)
                if item is not None:
                    items.append(item)
            return SearchResponse(query=q, filter=resolved_filter, items=items)

        return self._call_yt(cache_key, f"pencarian '{q}'", _fetch, ttl_seconds=360)

    def suggest(self, query: str) -> SuggestResponse:
        q = query.strip()
        if not q:
            return SuggestResponse(query="", suggestions=[])

        cache_key = f"suggest:{q.lower()}"

        def _fetch() -> SuggestResponse:
            raw = self._yt.get_search_suggestions(query=q)
            suggestions = [str(s) for s in (raw or []) if isinstance(s, str) and s.strip()]
            return SuggestResponse(query=q, suggestions=suggestions[:10])

        return self._call_yt(cache_key, "saran pencarian", _fetch, ttl_seconds=300)

    def get_home(self, limit: int = 8) -> HomeResponse:
        cache_key = f"home:v2:{limit}"

        def _fetch() -> HomeResponse:
            raw_home = self._yt.get_home(limit=limit)
            sections: list[HomeSection] = []
            for sec in raw_home or []:
                if not isinstance(sec, dict):
                    continue
                title = sec.get("title")
                contents = sec.get("contents") or []
                if not title or not contents:
                    continue
                if is_indian_or_mandarin_text(str(title)):
                    continue
                items: list[MediaItem] = []
                for entry in contents:
                    item = normalize_media_item(entry)
                    if item is not None and not is_excluded_home_item(item):
                        items.append(item)
                if items:
                    sections.append(HomeSection(title=str(title), items=items))
            return HomeResponse(sections=sections)

        return self._call_yt(cache_key, "beranda", _fetch, ttl_seconds=480)

    def get_charts(self, country: str = "ID") -> ChartsResponse:
        cc = (country or "ID").upper()
        cache_key = f"charts:{cc}"

        def _fetch() -> ChartsResponse:
            raw = self._yt.get_charts(country=cc) or {}

            songs: list[MediaItem] = []
            videos: list[MediaItem] = []
            artists: list[MediaItem] = []
            trending: list[MediaItem] = []

            raw_songs = raw.get("songs")
            if isinstance(raw_songs, dict):
                song_entries = raw_songs.get("items") or []
            elif isinstance(raw_songs, list):
                song_entries = raw_songs
            else:
                song_entries = []
            for entry in song_entries:
                item = normalize_media_item(entry, default_type="song")
                if item:
                    songs.append(item)

            raw_videos = raw.get("videos")
            if isinstance(raw_videos, dict):
                video_entries = raw_videos.get("items") or []
            elif isinstance(raw_videos, list):
                video_entries = raw_videos
            else:
                video_entries = []
            for entry in video_entries:
                item = normalize_media_item(entry)
                if item:
                    videos.append(item)

            # In unauthenticated mode, charts.videos often contains chart playlists like "Trending 20 Indonesia"
            if not songs and videos:
                first_chart_pl = next((v.playlistId or v.id for v in videos if (v.playlistId or v.id)), None)
                if first_chart_pl:
                    try:
                        pl_data = self._yt.get_playlist(first_chart_pl, limit=25)
                        pl_thumb = pick_largest_thumbnail(pl_data.get("thumbnails"))
                        for t in (pl_data.get("tracks") or [])[:20]:
                            norm_t = normalize_media_item(
                                t, default_type="song", fallback_thumbnail=pl_thumb
                            )
                            if norm_t:
                                songs.append(norm_t)
                    except Exception:
                        pass

            raw_artists = raw.get("artists")
            if isinstance(raw_artists, dict):
                artist_entries = raw_artists.get("items") or []
            elif isinstance(raw_artists, list):
                artist_entries = raw_artists
            else:
                artist_entries = []
            for entry in artist_entries:
                item = normalize_media_item(entry, default_type="artist")
                if item:
                    artists.append(item)

            raw_trending = raw.get("trending")
            if isinstance(raw_trending, dict):
                trending_entries = raw_trending.get("items") or []
            elif isinstance(raw_trending, list):
                trending_entries = raw_trending
            else:
                trending_entries = []
            for entry in trending_entries:
                item = normalize_media_item(entry)
                if item:
                    trending.append(item)

            return ChartsResponse(
                country=cc,
                songs=songs,
                videos=videos,
                artists=artists,
                trending=trending,
            )

        return self._call_yt(cache_key, f"tangga lagu {cc}", _fetch, ttl_seconds=600)

    def get_moods(self) -> MoodsResponse:
        cache_key = "moods:all"

        def _fetch() -> MoodsResponse:
            raw = self._yt.get_mood_categories() or {}
            groups: list[MoodCategoryGroup] = []
            for group_title, cats in raw.items():
                items: list[MoodCategoryItem] = []
                for cat in cats or []:
                    if isinstance(cat, dict) and cat.get("title") and cat.get("params"):
                        items.append(
                            MoodCategoryItem(
                                title=str(cat["title"]),
                                params=str(cat["params"]),
                            )
                        )
                if items:
                    groups.append(MoodCategoryGroup(title=str(group_title), items=items))
            return MoodsResponse(groups=groups)

        return self._call_yt(cache_key, "kategori mood & genre", _fetch, ttl_seconds=600)

    def get_mood_playlists(self, params: str) -> MoodPlaylistsResponse:
        cache_key = f"mood_playlists:{params}"

        def _fetch() -> MoodPlaylistsResponse:
            raw = self._yt.get_mood_playlists(params=params) or []
            playlists: list[MediaItem] = []
            for entry in raw:
                item = normalize_media_item(entry, default_type="playlist")
                if item:
                    playlists.append(item)
            return MoodPlaylistsResponse(params=params, playlists=playlists)

        return self._call_yt(cache_key, "daftar putar mood", _fetch, ttl_seconds=480)

    def get_artist(self, artist_id: str) -> ArtistDetailResponse:
        cache_key = f"artist:{artist_id}"

        def _fetch() -> ArtistDetailResponse:
            raw = self._yt.get_artist(channelId=artist_id) or {}
            name = str(raw.get("name") or "Artis")
            fallback_artist = ArtistRef(id=artist_id, name=name)
            thumb = pick_largest_thumbnail(raw.get("thumbnails"))

            def _extract_section(key: str, default_type: ItemType) -> list[MediaItem]:
                sec = raw.get(key)
                results = sec.get("results") if isinstance(sec, dict) else sec
                out: list[MediaItem] = []
                for entry in results or []:
                    item = normalize_media_item(
                        entry,
                        default_type=default_type,
                        fallback_artist=fallback_artist if default_type != "artist" else None,
                    )
                    if item:
                        out.append(item)
                return out

            return ArtistDetailResponse(
                id=str(raw.get("channelId") or artist_id),
                name=name,
                description=raw.get("description"),
                subscribers=raw.get("subscribers"),
                views=raw.get("views"),
                thumbnail=thumb,
                shuffleId=raw.get("shuffleId"),
                radioId=raw.get("radioId"),
                songs=_extract_section("songs", "song"),
                albums=_extract_section("albums", "album"),
                singles=_extract_section("singles", "album"),
                videos=_extract_section("videos", "video"),
                related=_extract_section("related", "artist"),
            )

        return self._call_yt(cache_key, "detail artis", _fetch, ttl_seconds=480)

    def get_album(self, album_id: str) -> AlbumDetailResponse:
        cache_key = f"album:{album_id}"

        def _fetch() -> AlbumDetailResponse:
            raw = self._yt.get_album(browseId=album_id) or {}
            title = str(raw.get("title") or "Album")
            thumb = pick_largest_thumbnail(raw.get("thumbnails"))
            artists = normalize_artists(raw.get("artists"))
            fallback_artist = artists[0] if artists else None
            album_ref = AlbumRef(id=album_id, name=title)

            tracks: list[MediaItem] = []
            for entry in raw.get("tracks") or []:
                item = normalize_media_item(
                    entry,
                    default_type="song",
                    fallback_thumbnail=thumb,
                    fallback_artist=fallback_artist,
                    fallback_album=album_ref,
                )
                if item:
                    tracks.append(item)

            return AlbumDetailResponse(
                id=album_id,
                title=title,
                artists=artists,
                year=str(raw["year"]) if raw.get("year") is not None else None,
                trackCount=raw.get("trackCount") or len(tracks),
                duration=raw.get("duration"),
                description=raw.get("description"),
                thumbnail=thumb,
                audioPlaylistId=raw.get("audioPlaylistId"),
                tracks=tracks,
            )

        return self._call_yt(cache_key, "detail album", _fetch, ttl_seconds=480)

    def get_playlist(self, playlist_id: str, limit: int = 100) -> PlaylistDetailResponse:
        clean_id = playlist_id[2:] if playlist_id.startswith("VL") else playlist_id
        cache_key = f"playlist:{clean_id}:{limit}"

        def _fetch() -> PlaylistDetailResponse:
            raw = self._yt.get_playlist(playlistId=clean_id, limit=limit) or {}
            title = str(raw.get("title") or "Playlist")
            thumb = pick_largest_thumbnail(raw.get("thumbnails"))
            author_raw = raw.get("author")
            if isinstance(author_raw, dict):
                author = author_raw.get("name")
            elif isinstance(author_raw, str):
                author = author_raw
            else:
                author = None

            tracks: list[MediaItem] = []
            for entry in raw.get("tracks") or []:
                item = normalize_media_item(
                    entry,
                    default_type="song",
                    fallback_thumbnail=thumb,
                )
                if item:
                    tracks.append(item)

            return PlaylistDetailResponse(
                id=str(raw.get("id") or clean_id),
                title=title,
                author=author,
                description=raw.get("description"),
                year=str(raw["year"]) if raw.get("year") is not None else None,
                trackCount=raw.get("trackCount") or len(tracks),
                duration=raw.get("duration"),
                thumbnail=thumb,
                tracks=tracks,
            )

        return self._call_yt(cache_key, "detail playlist", _fetch, ttl_seconds=420)

    def get_watch_playlist(
        self, video_id: str, playlist_id: Optional[str] = None, radio: bool = True, limit: int = 25
    ) -> WatchPlaylistResponse:
        cache_key = f"watch:{video_id}:{playlist_id or ''}:{int(radio)}:{limit}"

        def _fetch() -> WatchPlaylistResponse:
            raw = self._yt.get_watch_playlist(
                videoId=video_id,
                playlistId=playlist_id,
                radio=radio,
                limit=limit,
            ) or {}
            tracks: list[MediaItem] = []
            for entry in raw.get("tracks") or []:
                item = normalize_media_item(entry, default_type="song")
                if item:
                    tracks.append(item)
            return WatchPlaylistResponse(
                videoId=video_id,
                playlistId=raw.get("playlistId"),
                lyricsBrowseId=raw.get("lyrics"),
                relatedBrowseId=raw.get("related"),
                tracks=tracks,
            )

        return self._call_yt(cache_key, "antrean putar", _fetch, ttl_seconds=360)

    def get_lyrics(self, browse_id: str) -> LyricsResponse:
        cache_key = f"lyrics:{browse_id}"

        def _fetch() -> LyricsResponse:
            try:
                raw = self._yt.get_lyrics(browseId=browse_id, timestamps=True)
            except YTMusicError:
                raw = self._yt.get_lyrics(browseId=browse_id, timestamps=False)

            if not raw:
                return LyricsResponse(browseId=browse_id, hasTimestamps=False, lines=[], plainText=None)

            raw_dict = raw if isinstance(raw, dict) else getattr(raw, "__dict__", {})
            lyrics_val = raw_dict.get("lyrics")
            source = raw_dict.get("source")

            if isinstance(lyrics_val, list):
                lines: list[LyricLine] = []
                for ln in lyrics_val:
                    ln_dict = ln if isinstance(ln, dict) else getattr(ln, "__dict__", {})
                    text = str(ln_dict.get("text") or "").strip()
                    start_ms = int(ln_dict.get("start_time") or 0)
                    end_ms = int(ln_dict.get("end_time") or start_ms + 3000)
                    if text:
                        lines.append(
                            LyricLine(text=text, startTimeMs=start_ms, endTimeMs=end_ms)
                        )
                return LyricsResponse(
                    browseId=browse_id,
                    hasTimestamps=len(lines) > 0,
                    source=str(source) if source else None,
                    lines=lines,
                    plainText="\n".join(line.text for line in lines) if lines else None,
                )

            plain = str(lyrics_val) if lyrics_val else None
            return LyricsResponse(
                browseId=browse_id,
                hasTimestamps=False,
                source=str(source) if source else None,
                lines=[],
                plainText=plain,
            )

        return self._call_yt(cache_key, "lirik lagu", _fetch, ttl_seconds=600)

    async def extract_artwork_color(self, image_url: str) -> ArtworkColorResponse:
        parsed = urlparse(image_url)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in ALLOWED_ARTWORK_HOSTS:
            raise MusicServiceError("URL gambar tidak diizinkan.", status_code=400)

        cache_key = f"artcolor:{image_url}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(image_url)
                resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            img = img.resize((32, 32))
            pixels = list(img.getdata())

            # Filter out near-black and near-white pixels to find a rich ambient hue
            vibrant = [
                (r, g, b)
                for (r, g, b) in pixels
                if 28 <= (r + g + b) / 3 <= 220 and (max(r, g, b) - min(r, g, b)) >= 18
            ]
            sample = vibrant if len(vibrant) >= 16 else pixels
            avg_r = sum(p[0] for p in sample) // len(sample)
            avg_g = sum(p[1] for p in sample) // len(sample)
            avg_b = sum(p[2] for p in sample) // len(sample)

            # Clamp luminance so ambient background remains moody dark
            lum = 0.2126 * avg_r + 0.7152 * avg_g + 0.0722 * avg_b
            if lum > 155:
                scale = 155.0 / lum
                avg_r = int(avg_r * scale)
                avg_g = int(avg_g * scale)
                avg_b = int(avg_b * scale)
            elif lum < 36:
                boost = 36.0 / max(lum, 1.0)
                avg_r = min(255, int(avg_r * boost))
                avg_g = min(255, int(avg_g * boost))
                avg_b = min(255, int(avg_b * boost))

            result = ArtworkColorResponse(
                r=avg_r,
                g=avg_g,
                b=avg_b,
                hex=f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}",
            )
            self._cache.set(cache_key, result, ttl_seconds=600)
            return result
        except Exception:
            fallback = ArtworkColorResponse(r=22, g=48, b=40, hex="#163028")
            return fallback
