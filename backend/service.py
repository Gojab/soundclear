from __future__ import annotations

import io
import os
import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from PIL import Image
from ytmusicapi import YTMusic
from ytmusicapi.exceptions import YTMusicError

from cache import TTLCache
from schemas import (
    AccountLibraryResponse,
    AccountStatusResponse,
    AlbumDetailResponse,
    AlbumRef,
    ArtistDetailResponse,
    ArtistRef,
    ArtworkColorResponse,
    ChartsResponse,
    EpisodeDetailResponse,
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
    PodcastDetailResponse,
    PodcastEpisode,
    SearchResponse,
    SongCredit,
    SongCreditsResponse,
    SongRelatedResponse,
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


def _extract_description_text(desc: Any) -> Optional[str]:
    if desc is None:
        return None
    if isinstance(desc, str):
        stripped = desc.strip()
        return stripped or None
    if hasattr(desc, "text"):
        val = getattr(desc, "text", None)
        if isinstance(val, str):
            return val.strip() or None
    if isinstance(desc, list):
        parts: list[str] = []
        for entry in desc:
            if isinstance(entry, dict) and entry.get("text"):
                parts.append(str(entry["text"]))
            elif isinstance(entry, str):
                parts.append(entry)
        joined = "".join(parts).strip()
        return joined or None
    return str(desc).strip() or None


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
    if not parts or not all(p.isdigit() for p in parts):
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
    if result_type in {"song", "video", "album", "artist", "playlist", "podcast", "episode"}:
        return result_type  # type: ignore[return-value]

    video_type = str(raw.get("videoType") or "").upper()
    if "PODCAST_EPISODE" in video_type:
        return "episode"
    if raw.get("videoId"):
        if "OMV" in video_type or "UGC" in video_type:
            return "video"
        return "song"

    browse_id = str(raw.get("browseId") or "")
    if browse_id.startswith("MPSP"):
        return "podcast"
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

    if item_type in {"song", "video", "episode"}:
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

    podcast_raw = raw.get("podcast") if isinstance(raw.get("podcast"), dict) else None
    if not artists and podcast_raw and podcast_raw.get("name"):
        artists = [ArtistRef(id=podcast_raw.get("id"), name=str(podcast_raw["name"]))]

    album = normalize_album(raw.get("album"), fallback_album=fallback_album)

    duration = raw.get("duration") or raw.get("length")
    if not isinstance(duration, str):
        duration = None
    duration_seconds = parse_duration_seconds(duration, raw.get("duration_seconds"))

    podcast_id = (
        str(podcast_raw["id"])
        if podcast_raw and podcast_raw.get("id")
        else (str(browse_id) if item_type == "podcast" and browse_id else None)
    )

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
        description=_extract_description_text(raw.get("description")),
        published=str(raw["date"]) if raw.get("date") else None,
        podcastId=podcast_id,
        creditsBrowseId=str(raw["creditsBrowseId"]) if raw.get("creditsBrowseId") else None,
        genre=str(raw["category"]) if raw.get("category") else None,
    )


def _format_ytmusic_error(exc: Exception, action: str) -> str:
    detail = str(exc).strip()
    if detail:
        return f"Gagal memuat {action} dari YouTube Music: {detail}"
    return f"Gagal memuat {action} dari YouTube Music."


def _parse_song_credits_dict(raw: dict[str, Any]) -> list[SongCredit]:
    role_map = {
        "performed_by": "Dibawakan oleh",
        "written_by": "Ditulis oleh",
        "produced_by": "Diproduseri oleh",
        "music_metadata_provided_by": "Penyedia metadata",
    }
    credits: list[SongCredit] = []
    for key in ("performed_by", "written_by", "produced_by", "music_metadata_provided_by"):
        sec = raw.get(key)
        if isinstance(sec, dict) and sec.get("data"):
            names = [str(n) for n in sec["data"] if n]
            if names:
                credits.append(SongCredit(role=role_map[key], names=names))
    for sec in raw.get("other_sections") or []:
        if isinstance(sec, dict) and sec.get("data"):
            names = [str(n) for n in sec["data"] if n]
            if names:
                credits.append(
                    SongCredit(role=str(sec.get("localized_title") or "Kredit lainnya"), names=names)
                )
    return credits


class SoundClearService:
    """Wraps ytmusicapi with TTL caching, unified normalization, and optional user auth."""

    def __init__(
        self,
        cache_ttl_seconds: int = 420,
        location: str = "ID",
        auth_file: Optional[str] = None,
    ) -> None:
        self._location = location
        self._yt = YTMusic(location=location)
        self._yt_auth: Optional[YTMusic] = None
        self._auth_message = "Mode lokal aktif (tanpa file autentikasi YouTube Music)."
        resolved_auth = auth_file or os.environ.get("YTMUSIC_AUTH_FILE")
        if resolved_auth and Path(resolved_auth).is_file():
            try:
                self._yt_auth = YTMusic(resolved_auth, location=location)
                self._auth_message = "Terhubung ke akun YouTube Music pribadi."
            except Exception as exc:
                self._yt_auth = None
                self._auth_message = f"File autentikasi tidak valid, memakai mode lokal ({exc})."

        self._cache = TTLCache(default_ttl_seconds=cache_ttl_seconds, max_entries=768)

    @property
    def is_authenticated(self) -> bool:
        return self._yt_auth is not None

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

        allowed_filters = {
            "songs",
            "albums",
            "artists",
            "playlists",
            "videos",
            "podcasts",
            "episodes",
        }
        resolved_filter = filter_type if filter_type in allowed_filters else None
        cache_key = f"search:{q.lower()}:{resolved_filter or 'all'}:{limit}"

        def _fetch() -> SearchResponse:
            raw_results = self._yt.search(query=q, filter=resolved_filter, limit=limit)
            default_type_map: dict[str, ItemType] = {
                "songs": "song",
                "albums": "album",
                "artists": "artist",
                "playlists": "playlist",
                "videos": "video",
                "podcasts": "podcast",
                "episodes": "episode",
            }
            default_type = default_type_map.get(resolved_filter or "")

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
            song_entries = (
                raw_songs.get("items") or []
                if isinstance(raw_songs, dict)
                else (raw_songs if isinstance(raw_songs, list) else [])
            )
            for entry in song_entries:
                item = normalize_media_item(entry, default_type="song")
                if item:
                    songs.append(item)

            raw_videos = raw.get("videos")
            video_entries = (
                raw_videos.get("items") or []
                if isinstance(raw_videos, dict)
                else (raw_videos if isinstance(raw_videos, list) else [])
            )
            for entry in video_entries:
                item = normalize_media_item(entry)
                if item:
                    videos.append(item)

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
            artist_entries = (
                raw_artists.get("items") or []
                if isinstance(raw_artists, dict)
                else (raw_artists if isinstance(raw_artists, list) else [])
            )
            for entry in artist_entries:
                item = normalize_media_item(entry, default_type="artist")
                if item:
                    artists.append(item)

            raw_trending = raw.get("trending")
            trending_entries = (
                raw_trending.get("items") or []
                if isinstance(raw_trending, dict)
                else (raw_trending if isinstance(raw_trending, list) else [])
            )
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
        cache_key = f"artist:v2:{artist_id}"

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

            albums_raw = raw.get("albums")
            albums_list = _extract_section("albums", "album")
            compilations: list[MediaItem] = _extract_section("compilations", "album")

            # Fetch extended albums/compilations if browse params are exposed
            if isinstance(albums_raw, dict) and albums_raw.get("params") and albums_raw.get("browseId"):
                try:
                    more_albums = self._yt.get_artist_albums(
                        albums_raw["browseId"], albums_raw["params"], limit=30
                    )
                    seen_ids = {a.id for a in albums_list}
                    for entry in more_albums or []:
                        entry_type = str(entry.get("type") or "").lower()
                        norm = normalize_media_item(
                            entry, default_type="album", fallback_artist=fallback_artist
                        )
                        if not norm:
                            continue
                        if "compilation" in entry_type or "kompilasi" in entry_type:
                            compilations.append(norm)
                        elif norm.id not in seen_ids:
                            seen_ids.add(norm.id)
                            albums_list.append(norm)
                except Exception:
                    pass

            appears_on = _extract_section("appearsOn", "album")
            if not appears_on:
                appears_on = _extract_section("featured_on", "playlist")

            return ArtistDetailResponse(
                id=str(raw.get("channelId") or artist_id),
                name=name,
                description=_extract_description_text(raw.get("description")),
                subscribers=raw.get("subscribers"),
                views=raw.get("views"),
                thumbnail=thumb,
                shuffleId=raw.get("shuffleId"),
                radioId=raw.get("radioId"),
                songs=_extract_section("songs", "song"),
                albums=albums_list,
                singles=_extract_section("singles", "album"),
                compilations=compilations,
                appearsOn=appears_on,
                videos=_extract_section("videos", "video"),
                related=_extract_section("related", "artist"),
            )

        return self._call_yt(cache_key, "detail artis", _fetch, ttl_seconds=480)

    def get_artist_albums(self, artist_id: str, params: str) -> list[MediaItem]:
        cache_key = f"artist_albums:{artist_id}:{params}"

        def _fetch() -> list[MediaItem]:
            raw = self._yt.get_artist_albums(channelId=artist_id, params=params, limit=50) or []
            out: list[MediaItem] = []
            for entry in raw:
                item = normalize_media_item(entry, default_type="album")
                if item:
                    out.append(item)
            return out

        return self._call_yt(cache_key, "diskografi artis", _fetch, ttl_seconds=480)

    def get_album(self, album_id: str) -> AlbumDetailResponse:
        cache_key = f"album:v2:{album_id}"

        def _fetch() -> AlbumDetailResponse:
            raw = self._yt.get_album(browseId=album_id) or {}
            title = str(raw.get("title") or "Album")
            thumb = pick_largest_thumbnail(raw.get("thumbnails"))
            artists = normalize_artists(raw.get("artists"))
            fallback_artist = artists[0] if artists else None
            album_ref = AlbumRef(id=album_id, name=title)

            tracks: list[MediaItem] = []
            first_credits_id: Optional[str] = None
            for entry in raw.get("tracks") or []:
                if not first_credits_id and isinstance(entry, dict) and entry.get("creditsBrowseId"):
                    first_credits_id = str(entry["creditsBrowseId"])
                item = normalize_media_item(
                    entry,
                    default_type="song",
                    fallback_thumbnail=thumb,
                    fallback_artist=fallback_artist,
                    fallback_album=album_ref,
                )
                if item:
                    tracks.append(item)

            album_credits: list[SongCredit] = []
            if first_credits_id:
                try:
                    raw_credits = self._yt.get_song_credits(first_credits_id)
                    album_credits = _parse_song_credits_dict(raw_credits)
                except Exception:
                    album_credits = []

            more_from_artist: list[MediaItem] = []
            for rec in raw.get("related_recommendations") or []:
                item = normalize_media_item(rec, default_type="album")
                if item and item.id != album_id:
                    more_from_artist.append(item)

            if not more_from_artist and fallback_artist and fallback_artist.id:
                try:
                    artist_info = self.get_artist(fallback_artist.id)
                    more_from_artist = [
                        a for a in (artist_info.albums + artist_info.singles) if a.id != album_id
                    ][:8]
                except Exception:
                    pass

            return AlbumDetailResponse(
                id=album_id,
                title=title,
                artists=artists,
                year=str(raw["year"]) if raw.get("year") is not None else None,
                trackCount=raw.get("trackCount") or len(tracks),
                duration=raw.get("duration"),
                description=_extract_description_text(raw.get("description")),
                thumbnail=thumb,
                audioPlaylistId=raw.get("audioPlaylistId"),
                credits=album_credits,
                moreFromArtist=more_from_artist[:10],
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
                description=_extract_description_text(raw.get("description")),
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

    def get_song_credits(
        self,
        video_id: str,
        album_id: Optional[str] = None,
        credits_browse_id: Optional[str] = None,
    ) -> SongCreditsResponse:
        cache_key = f"credits:{video_id}:{album_id or ''}:{credits_browse_id or ''}"

        def _fetch() -> SongCreditsResponse:
            resolved_credits_id = (
                credits_browse_id
                if credits_browse_id and credits_browse_id.startswith("MPTC")
                else None
            )
            title = "Kredit Lagu"
            credits: list[SongCredit] = []

            resolved_album_id = album_id
            if not resolved_credits_id and not resolved_album_id:
                try:
                    watch = self._yt.get_watch_playlist(videoId=video_id, limit=3) or {}
                    for wt in watch.get("tracks") or []:
                        if wt.get("videoId") == video_id:
                            title = str(wt.get("title") or title)
                            alb = wt.get("album")
                            if isinstance(alb, dict) and alb.get("id"):
                                resolved_album_id = str(alb["id"])
                            break
                except Exception:
                    pass

            if not resolved_credits_id and resolved_album_id:
                try:
                    raw_alb = self._yt.get_album(browseId=resolved_album_id) or {}
                    for tr in raw_alb.get("tracks") or []:
                        if tr.get("videoId") == video_id:
                            title = str(tr.get("title") or title)
                            if tr.get("creditsBrowseId"):
                                resolved_credits_id = str(tr["creditsBrowseId"])
                            break
                except Exception:
                    pass

            if resolved_credits_id and resolved_credits_id.startswith("MPTC"):
                try:
                    raw_credits = self._yt.get_song_credits(resolved_credits_id)
                    credits = _parse_song_credits_dict(raw_credits)
                except Exception:
                    credits = []

            if not credits:
                try:
                    song_meta = self._yt.get_song(videoId=video_id) or {}
                    details = song_meta.get("videoDetails") or {}
                    if details.get("title"):
                        title = str(details["title"])
                    author = details.get("author")
                    if author:
                        credits.append(SongCredit(role="Dibawakan oleh", names=[str(author)]))
                    micro = (song_meta.get("microformat") or {}).get("microformatDataRenderer") or {}
                    if micro.get("category"):
                        credits.append(SongCredit(role="Kategori", names=[str(micro["category"])]))
                except Exception:
                    pass

            return SongCreditsResponse(videoId=video_id, title=title, credits=credits)

        return self._call_yt(cache_key, "kredit lagu", _fetch, ttl_seconds=600)

    def get_song_related(self, video_id: str) -> SongRelatedResponse:
        cache_key = f"song_related:{video_id}"

        def _fetch() -> SongRelatedResponse:
            watch = self._yt.get_watch_playlist(videoId=video_id, radio=True, limit=15) or {}
            related_id = watch.get("related")
            tracks: list[MediaItem] = []
            playlists: list[MediaItem] = []
            artists: list[MediaItem] = []

            if related_id:
                try:
                    sections = self._yt.get_song_related(related_id) or []
                    for sec in sections:
                        if not isinstance(sec, dict):
                            continue
                        contents = sec.get("contents")
                        if not isinstance(contents, list):
                            continue
                        sec_title = str(sec.get("title") or "").lower()
                        for entry in contents:
                            if not isinstance(entry, dict):
                                continue
                            if "artist" in sec_title:
                                item = normalize_media_item(entry, default_type="artist")
                                if item:
                                    artists.append(item)
                            elif "playlist" in sec_title:
                                item = normalize_media_item(entry, default_type="playlist")
                                if item:
                                    playlists.append(item)
                            else:
                                item = normalize_media_item(entry)
                                if item:
                                    if item.type == "playlist":
                                        playlists.append(item)
                                    elif item.type == "artist":
                                        artists.append(item)
                                    else:
                                        tracks.append(item)
                except Exception:
                    pass

            if not tracks:
                for entry in watch.get("tracks") or []:
                    item = normalize_media_item(entry, default_type="song")
                    if item and item.id != video_id:
                        tracks.append(item)

            return SongRelatedResponse(
                videoId=video_id,
                tracks=tracks[:20],
                playlists=playlists[:12],
                artists=artists[:12],
            )

        return self._call_yt(cache_key, "lagu terkait", _fetch, ttl_seconds=420)

    def get_podcast(self, podcast_id: str, limit: int = 100) -> PodcastDetailResponse:
        cache_key = f"podcast:{podcast_id}:{limit}"

        def _fetch() -> PodcastDetailResponse:
            raw = self._yt.get_podcast(playlistId=podcast_id, limit=limit) or {}
            title = str(raw.get("title") or "Podcast")
            thumb = pick_largest_thumbnail(raw.get("thumbnails"))
            author_raw = raw.get("author")
            author_name = author_raw.get("name") if isinstance(author_raw, dict) else (str(author_raw) if author_raw else None)
            author_id = author_raw.get("id") if isinstance(author_raw, dict) else None

            episodes: list[PodcastEpisode] = []
            for entry in raw.get("episodes") or []:
                if not isinstance(entry, dict):
                    continue
                vid = entry.get("videoId")
                if not vid:
                    continue
                ep_thumb = pick_largest_thumbnail(entry.get("thumbnails"), fallback=thumb)
                dur = entry.get("duration") if isinstance(entry.get("duration"), str) else None
                episodes.append(
                    PodcastEpisode(
                        id=str(vid),
                        videoId=str(vid),
                        title=str(entry.get("title") or "Episode"),
                        description=_extract_description_text(entry.get("description")),
                        duration=dur,
                        durationSeconds=parse_duration_seconds(dur, entry.get("duration_seconds")),
                        published=str(entry["date"]) if entry.get("date") else None,
                        thumbnail=ep_thumb,
                        podcastId=podcast_id,
                        podcastTitle=title,
                    )
                )

            return PodcastDetailResponse(
                id=podcast_id,
                title=title,
                author=author_name,
                authorId=author_id,
                description=_extract_description_text(raw.get("description")),
                thumbnail=thumb,
                episodes=episodes,
            )

        return self._call_yt(cache_key, "detail podcast", _fetch, ttl_seconds=480)

    def get_episode(self, video_id: str) -> EpisodeDetailResponse:
        cache_key = f"episode:{video_id}"

        def _fetch() -> EpisodeDetailResponse:
            raw = self._yt.get_episode(videoId=video_id) or {}
            author_raw = raw.get("author")
            author_name = author_raw.get("name") if isinstance(author_raw, dict) else (str(author_raw) if author_raw else None)
            author_id = author_raw.get("id") if isinstance(author_raw, dict) else None
            pl_id = raw.get("playlistId")
            podcast_id = (
                f"MPSP{pl_id}"
                if isinstance(pl_id, str) and pl_id and not pl_id.startswith("MPSP")
                else (str(pl_id) if pl_id else None)
            )
            dur = raw.get("duration") if isinstance(raw.get("duration"), str) else None
            return EpisodeDetailResponse(
                id=video_id,
                videoId=video_id,
                title=str(raw.get("title") or "Episode Podcast"),
                description=_extract_description_text(raw.get("description")),
                duration=dur,
                durationSeconds=parse_duration_seconds(dur, raw.get("duration_seconds")),
                published=str(raw["date"]) if raw.get("date") else None,
                thumbnail=pick_largest_thumbnail(raw.get("thumbnails")),
                podcastId=podcast_id,
                podcastTitle=author_name,
                author=author_name,
                authorId=author_id,
            )

        return self._call_yt(cache_key, "detail episode", _fetch, ttl_seconds=480)

    def get_channel_episodes(self, channel_id: str, params: str) -> list[MediaItem]:
        cache_key = f"channel_episodes:{channel_id}:{params}"

        def _fetch() -> list[MediaItem]:
            raw = self._yt.get_channel_episodes(channelId=channel_id, params=params) or []
            out: list[MediaItem] = []
            for entry in raw:
                item = normalize_media_item(entry, default_type="episode")
                if item:
                    out.append(item)
            return out

        return self._call_yt(cache_key, "episode kanal", _fetch, ttl_seconds=480)

    def get_account_status(self) -> AccountStatusResponse:
        return AccountStatusResponse(
            authenticated=self.is_authenticated,
            mode="ytmusic" if self.is_authenticated else "local",
            message=self._auth_message,
        )

    def get_account_library(self) -> AccountLibraryResponse:
        if self._yt_auth is None:
            return AccountLibraryResponse()

        cache_key = "account:library"

        def _fetch() -> AccountLibraryResponse:
            yt = self._yt_auth
            assert yt is not None
            liked_raw = yt.get_liked_songs(limit=100) or {}
            liked = [
                m
                for entry in (liked_raw.get("tracks") or [])
                if (m := normalize_media_item(entry, default_type="song")) is not None
            ]
            playlists = [
                m
                for entry in (yt.get_library_playlists(limit=50) or [])
                if (m := normalize_media_item(entry, default_type="playlist")) is not None
            ]
            albums = [
                m
                for entry in (yt.get_library_albums(limit=50) or [])
                if (m := normalize_media_item(entry, default_type="album")) is not None
            ]
            artists = [
                m
                for entry in (yt.get_library_artists(limit=50) or [])
                if (m := normalize_media_item(entry, default_type="artist")) is not None
            ]
            subs = [
                m
                for entry in (yt.get_library_subscriptions(limit=50) or [])
                if (m := normalize_media_item(entry, default_type="artist")) is not None
            ]
            history = [
                m
                for entry in (yt.get_history() or [])[:50]
                if (m := normalize_media_item(entry, default_type="song")) is not None
            ]
            return AccountLibraryResponse(
                likedSongs=liked,
                playlists=playlists,
                albums=albums,
                artists=artists,
                subscriptions=subs,
                history=history,
            )

        return self._call_yt(cache_key, "perpustakaan akun", _fetch, ttl_seconds=120)

    def account_rate_song(self, video_id: str, rating: str) -> dict[str, Any]:
        if self._yt_auth is None:
            return {"synced": False, "reason": "local_mode"}
        try:
            self._yt_auth.rate_song(videoId=video_id, rating=rating)  # type: ignore[arg-type]
            self._cache.clear()
            return {"synced": True}
        except Exception as exc:
            raise MusicServiceError(_format_ytmusic_error(exc, "menyukai lagu"), status_code=502) from exc

    def account_create_playlist(self, title: str, description: str, video_ids: list[str]) -> dict[str, Any]:
        if self._yt_auth is None:
            return {"synced": False, "reason": "local_mode"}
        try:
            res = self._yt_auth.create_playlist(
                title=title, description=description, video_ids=video_ids or None
            )
            self._cache.clear()
            return {"synced": True, "playlistId": res if isinstance(res, str) else None}
        except Exception as exc:
            raise MusicServiceError(_format_ytmusic_error(exc, "membuat playlist"), status_code=502) from exc

    def account_add_playlist_items(self, playlist_id: str, video_ids: list[str]) -> dict[str, Any]:
        if self._yt_auth is None:
            return {"synced": False, "reason": "local_mode"}
        try:
            self._yt_auth.add_playlist_items(playlistId=playlist_id, videoIds=video_ids)
            self._cache.clear()
            return {"synced": True}
        except Exception as exc:
            raise MusicServiceError(_format_ytmusic_error(exc, "menambah lagu playlist"), status_code=502) from exc

    def account_subscribe_artists(self, channel_ids: list[str], subscribe: bool = True) -> dict[str, Any]:
        if self._yt_auth is None:
            return {"synced": False, "reason": "local_mode"}
        try:
            if subscribe:
                self._yt_auth.subscribe_artists(channelIds=channel_ids)
            else:
                self._yt_auth.unsubscribe_artists(channelIds=channel_ids)
            self._cache.clear()
            return {"synced": True}
        except Exception as exc:
            raise MusicServiceError(_format_ytmusic_error(exc, "mengikuti artis"), status_code=502) from exc

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

            vibrant = [
                (r, g, b)
                for (r, g, b) in pixels
                if 28 <= (r + g + b) / 3 <= 220 and (max(r, g, b) - min(r, g, b)) >= 18
            ]
            sample = vibrant if len(vibrant) >= 16 else pixels
            avg_r = sum(p[0] for p in sample) // len(sample)
            avg_g = sum(p[1] for p in sample) // len(sample)
            avg_b = sum(p[2] for p in sample) // len(sample)

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
            return ArtworkColorResponse(r=22, g=48, b=40, hex="#163028")
