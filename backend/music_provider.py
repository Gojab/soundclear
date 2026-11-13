from __future__ import annotations

import io
import json
import os
import random
import re
import struct
import threading
import time
from typing import Any, Callable, Dict, Iterable, Iterator, List, Mapping, Optional, Tuple, TypeVar
from urllib.parse import urlparse

import requests
from PIL import Image
from spotapi import (
    Artist,
    Config,
    JSONSaver,
    Login,
    Podcast,
    PrivatePlaylist,
    PublicAlbum,
    PublicPlaylist,
    Song,
    User,
)
from spotapi.http.request import TLSClient
from spotapi.utils.logger import NoopLogger

T = TypeVar("T")

ALLOWED_ARTWORK_HOSTS = {
    "i.scdn.co",
    "image-cdn-ak.spotifycdn.com",
    "mosaic.scdn.co",
    "seed-mix-image.spotifycdn.com",
    "wrapped-images.spotifycdn.com",
    "charts-images.scdn.co",
    "t.scdn.co",
    "lexicon-assets.spotifycdn.com",
    "pickasso.spotifycdn.com",
    "lineup-images.scdn.co",
    "thisis-images.scdn.co",
    "dailymix-images.scdn.co",
    "newjams-images.scdn.co",
    "blend-playlist-covers.spotifycdn.com",
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
    "i.ytimg.com",
    "i9.ytimg.com",
    "music.youtube.com",
    "yt3.ggpht.com",
}

CJK_HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
JAPANESE_KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff]")
KOREAN_HANGUL_RE = re.compile(r"[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]")
INDIC_SCRIPT_RE = re.compile(r"[\u0900-\u0d7f]")
MANDARIN_KEYWORD_RE = re.compile(
    r"\b(?:mandarin|mandopop|cantopop|c-?pop|chinese|zhongwen|hokkien|guoyu|taiwanese)\b",
    re.IGNORECASE,
)
INDIAN_KEYWORD_RE = re.compile(
    r"\b(?:india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|punjabi|hindi|tamil|"
    r"telugu|malayalam|kannada|bhojpuri|marathi|gujarati|bengali|hindustani|carnatic|bhangra|"
    r"ghazal|qawwali|bhajan|desi|i-?pop|t-?series|zee\s*music|saregama|sony\s*music\s*india|"
    r"yrf|tips\s*official|udit\s*narayan|arijit\s*singh|shreya\s*ghoshal|alka\s*ynik|"
    r"alka\s*yagnik|kumar\s*sanu|lata\s*mangeshkar|kishore\s*kumar|sonu\s*nigam|"
    r"a\.?\s*r\.?\s*rahman|diljit\s*dosanjh|sidhu\s*moose\s*wala|ap\s*dhillon|"
    r"anirudh\s*ravichander|neha\s*kakkar|jubin\s*nautiyal|atif\s*aslam|sunidhi\s*chauhan|"
    r"asha\s*bhosle|mohammed\s*rafi|ilayaraja|sp\s*balasubrahmanyam)\b",
    re.IGNORECASE,
)
YEAR_RE = re.compile(r"(19|20)\d{2}")

MOOD_GROUPS: List[Dict[str, Any]] = [
    {
        "title": "Mood & Momen",
        "items": [
            {"title": "Fokus & Belajar", "params": "mood-fokus-belajar", "query": "focus study lo-fi instrumental"},
            {"title": "Santai & Kopi", "params": "mood-santai-kopi", "query": "chill acoustic coffee house"},
            {"title": "Senang & Enerjik", "params": "mood-senang-enerjik", "query": "happy upbeat pop hits"},
            {"title": "Galau & Melankolis", "params": "mood-galau-melankolis", "query": "lagu galau pop indonesia"},
            {"title": "Olahraga & Lari", "params": "mood-olahraga-lari", "query": "workout running energy hits"},
            {"title": "Tidur & Relaksasi", "params": "mood-tidur-relaksasi", "query": "sleep ambient calm piano"},
            {"title": "Perjalanan & Berkendara", "params": "mood-berkendara", "query": "road trip driving hits"},
            {"title": "Malam & Lo-Fi", "params": "mood-malam-lofi", "query": "late night lo-fi beats"},
        ],
    },
    {
        "title": "Genre Musik",
        "items": [
            {"title": "Pop Indonesia", "params": "genre-pop-indonesia", "query": "pop indonesia terbaik"},
            {"title": "Indie & Folk", "params": "genre-indie-folk", "query": "indie folk indonesia"},
            {"title": "R&B & Soul", "params": "genre-rnb-soul", "query": "rnb soul hits"},
            {"title": "Hip-Hop & Rap", "params": "genre-hiphop-rap", "query": "hip hop rap hits"},
            {"title": "Jazz & Akustik", "params": "genre-jazz-akustik", "query": "jazz acoustic chill"},
            {"title": "Rock & Alternatif", "params": "genre-rock-alternatif", "query": "alternative rock hits"},
            {"title": "K-Pop", "params": "genre-kpop", "query": "k-pop top hits"},
            {"title": "J-Pop & Anime", "params": "genre-jpop", "query": "j-pop hits"},
        ],
    },
]

MOOD_PARAM_MAP: Dict[str, Dict[str, str]] = {
    item["params"]: item
    for group in MOOD_GROUPS
    for item in group["items"]
}


class MusicProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class TTLCache:
    def __init__(self, default_ttl: int = 420, max_items: int = 1024) -> None:
        self._default_ttl = max(1, int(default_ttl))
        self._max_items = max(16, int(max_items))
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.RLock()

    def get(self, key: str) -> Any:
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at <= now:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        ttl = self._default_ttl if ttl_seconds is None else max(1, int(ttl_seconds))
        expires_at = time.monotonic() + ttl
        with self._lock:
            if len(self._store) >= self._max_items and key not in self._store:
                self._evict_expired_or_oldest(time.monotonic())
            self._store[key] = (expires_at, value)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def _evict_expired_or_oldest(self, now: float) -> None:
        expired = [k for k, (exp, _) in self._store.items() if exp <= now]
        for k in expired:
            self._store.pop(k, None)
        while len(self._store) >= self._max_items:
            oldest_key = min(self._store.items(), key=lambda kv: kv[1][0])[0]
            self._store.pop(oldest_key, None)


def _is_indian_or_mandarin_text(text: str) -> bool:
    if not text:
        return False
    if INDIC_SCRIPT_RE.test(text) if hasattr(INDIC_SCRIPT_RE, "test") else INDIC_SCRIPT_RE.search(text):
        return True
    if INDIAN_KEYWORD_RE.search(text):
        return True
    if MANDARIN_KEYWORD_RE.search(text):
        return True
    if CJK_HAN_RE.search(text) and not (
        JAPANESE_KANA_RE.search(text) or KOREAN_HANGUL_RE.search(text)
    ):
        return True
    return False


def _is_excluded_home_item(item: Mapping[str, Any]) -> bool:
    parts = [str(item.get("title") or "")]
    for artist in item.get("artists") or []:
        if isinstance(artist, Mapping) and artist.get("name"):
            parts.append(str(artist["name"]))
    album = item.get("album")
    if isinstance(album, Mapping) and album.get("name"):
        parts.append(str(album["name"]))
    return _is_indian_or_mandarin_text(" ".join(parts))


def extract_spotify_id(uri_or_id: Optional[str]) -> Optional[str]:
    if not uri_or_id or not isinstance(uri_or_id, str):
        return None
    raw = uri_or_id.strip()
    if not raw:
        return None
    if raw.startswith("spotify:"):
        return raw.split(":")[-1] or None
    if "open.spotify.com/" in raw:
        parsed = urlparse(raw)
        segments = [seg for seg in parsed.path.split("/") if seg]
        if segments:
            return segments[-1]
    if "?" in raw:
        raw = raw.split("?", 1)[0]
    if "/" in raw:
        raw = raw.rstrip("/").split("/")[-1]
    return raw or None


def format_duration_ms(duration_ms: Any) -> Tuple[Optional[str], Optional[int]]:
    if duration_ms is None:
        return None, None
    try:
        ms_val = float(duration_ms)
    except (TypeError, ValueError):
        return None, None
    if ms_val < 0:
        return None, None
    total_sec = int(round(ms_val / 1000.0))
    hrs = total_sec // 3600
    mins = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}", total_sec
    return f"{mins}:{secs:02d}", total_sec


def format_total_seconds(total_sec: int) -> Optional[str]:
    if total_sec <= 0:
        return None
    hrs = total_sec // 3600
    mins = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hrs > 0:
        return f"{hrs} jam {mins} mnt"
    if mins > 0:
        return f"{mins} mnt {secs} dtk"
    return f"{secs} dtk"


def format_compact_count(value: Any, suffix: str = "") -> Optional[str]:
    if value is None:
        return None
    try:
        num = int(value)
    except (TypeError, ValueError):
        return None
    if num <= 0:
        return None
    if num >= 1_000_000:
        text = f"{num / 1_000_000:.1f} jt".replace(".0 ", " ")
    elif num >= 1_000:
        text = f"{num / 1_000:.1f} rb".replace(".0 ", " ")
    else:
        text = str(num)
    return f"{text} {suffix}".strip() if suffix else text


def pick_largest_image(node: Any, fallback: Optional[str] = None) -> Optional[str]:
    if not node:
        return fallback
    candidates: List[Mapping[str, Any]] = []

    if isinstance(node, list):
        for entry in node:
            if isinstance(entry, Mapping):
                if "sources" in entry and isinstance(entry["sources"], list):
                    candidates.extend(s for s in entry["sources"] if isinstance(s, Mapping))
                elif "url" in entry:
                    candidates.append(entry)
    elif isinstance(node, Mapping):
        if isinstance(node.get("sources"), list):
            candidates.extend(s for s in node["sources"] if isinstance(s, Mapping))
        elif isinstance(node.get("items"), list):
            return pick_largest_image(node["items"], fallback=fallback)
        elif isinstance(node.get("avatarImage"), Mapping):
            return pick_largest_image(node["avatarImage"], fallback=fallback)
        elif isinstance(node.get("headerImage"), Mapping):
            return pick_largest_image(node["headerImage"], fallback=fallback)
        elif isinstance(node.get("squareCoverImage"), Mapping):
            sq = node["squareCoverImage"]
            if isinstance(sq.get("image"), Mapping):
                img_data = sq["image"].get("data") if isinstance(sq["image"].get("data"), Mapping) else sq["image"]
                return pick_largest_image(img_data, fallback=fallback)
            return pick_largest_image(sq, fallback=fallback)

    best_url: Optional[str] = None
    best_area = -1
    for item in candidates:
        url = item.get("url")
        if not isinstance(url, str) or not url:
            continue
        width = item.get("width") or 0
        height = item.get("height") or 0
        try:
            area = int(width) * int(height)
        except (TypeError, ValueError):
            area = 0
        if area >= best_area:
            best_area = area
            best_url = url
    return best_url or fallback


def _extract_year(date_node: Any) -> Optional[str]:
    if isinstance(date_node, Mapping):
        if date_node.get("year"):
            return str(date_node["year"])
        iso = date_node.get("isoString")
        if isinstance(iso, str):
            m = YEAR_RE.search(iso)
            if m:
                return m.group(0)
    elif isinstance(date_node, str):
        m = YEAR_RE.search(date_node)
        if m:
            return m.group(0)
    return None


def _extract_artists(artists_node: Any) -> List[Dict[str, Optional[str]]]:
    items = []
    if isinstance(artists_node, Mapping):
        items = artists_node.get("items") or []
    elif isinstance(artists_node, list):
        items = artists_node
    result: List[Dict[str, Optional[str]]] = []
    for entry in items:
        if not isinstance(entry, Mapping):
            continue
        profile = entry.get("profile") if isinstance(entry.get("profile"), Mapping) else {}
        name = profile.get("name") or entry.get("name")
        if not name or not isinstance(name, str):
            continue
        artist_id = extract_spotify_id(entry.get("id") or entry.get("uri"))
        result.append({"id": artist_id, "name": name.strip()})
    return result


def normalize_track(
    raw_track: Any,
    *,
    fallback_album: Optional[Dict[str, Optional[str]]] = None,
    fallback_cover: Optional[str] = None,
    fallback_year: Optional[str] = None,
    item_type: str = "song",
) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_track, Mapping):
        return None
    if "item" in raw_track and isinstance(raw_track["item"], Mapping):
        raw_track = raw_track["item"]
    if "itemV2" in raw_track and isinstance(raw_track["itemV2"], Mapping):
        raw_track = raw_track["itemV2"]
    if "track" in raw_track and isinstance(raw_track["track"], Mapping):
        raw_track = raw_track["track"]
    if "data" in raw_track and isinstance(raw_track["data"], Mapping):
        raw_track = raw_track["data"]

    typename = raw_track.get("__typename")
    if typename and typename not in ("Track", "Episode"):
        if typename == "NotFound" or typename == "RestrictedContent":
            return None

    track_id = extract_spotify_id(raw_track.get("id") or raw_track.get("uri"))
    title = raw_track.get("name") or raw_track.get("title")
    if not track_id or not isinstance(title, str) or not title.strip():
        return None

    artists_source = raw_track.get("artists")
    if not artists_source and (raw_track.get("firstArtist") or raw_track.get("otherArtists")):
        combined_artist_items: List[Any] = []
        for key in ("firstArtist", "otherArtists"):
            node = raw_track.get(key)
            if isinstance(node, Mapping) and isinstance(node.get("items"), list):
                combined_artist_items.extend(node["items"])
        artists_source = {"items": combined_artist_items}
    artists = _extract_artists(artists_source)
    album_node = raw_track.get("albumOfTrack") if isinstance(raw_track.get("albumOfTrack"), Mapping) else None
    album_ref: Optional[Dict[str, Optional[str]]] = fallback_album
    cover = fallback_cover
    year = fallback_year
    if album_node:
        alb_id = extract_spotify_id(album_node.get("id") or album_node.get("uri"))
        alb_name = album_node.get("name")
        if isinstance(alb_name, str) and alb_name.strip():
            album_ref = {"id": alb_id, "name": alb_name.strip()}
        cover = pick_largest_image(album_node.get("coverArt"), fallback=cover)
        if not year:
            year = _extract_year(album_node.get("date"))
    cover = pick_largest_image(raw_track.get("coverArt"), fallback=cover)

    raw_dur = raw_track.get("duration") or raw_track.get("trackDuration")
    duration_node = raw_dur if isinstance(raw_dur, Mapping) else {}
    ms = duration_node.get("totalMilliseconds") or raw_track.get("duration_ms")
    duration_str, duration_sec = format_duration_ms(ms)

    rating = raw_track.get("contentRating") if isinstance(raw_track.get("contentRating"), Mapping) else {}
    is_explicit = str(rating.get("label") or "").upper() == "EXPLICIT"

    return {
        "id": track_id,
        "videoId": track_id,
        "title": title.strip(),
        "artists": artists,
        "album": album_ref,
        "duration": duration_str,
        "durationSeconds": duration_sec,
        "thumbnail": cover,
        "type": item_type,
        "year": year,
        "views": format_compact_count(raw_track.get("playcount"), "putar"),
        "isExplicit": is_explicit,
        "playlistId": None,
        "browseId": None,
        "creditsBrowseId": None,
    }


def normalize_album(
    raw_album: Any,
    *,
    default_artists: Optional[List[Dict[str, Optional[str]]]] = None,
    item_type: str = "album",
) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_album, Mapping):
        return None
    if "data" in raw_album and isinstance(raw_album["data"], Mapping):
        raw_album = raw_album["data"]
    if "releases" in raw_album and isinstance(raw_album["releases"], Mapping):
        items = raw_album["releases"].get("items") or []
        if items and isinstance(items[0], Mapping):
            raw_album = items[0]

    album_id = extract_spotify_id(raw_album.get("id") or raw_album.get("uri"))
    title = raw_album.get("name") or raw_album.get("title")
    if not album_id or not isinstance(title, str) or not title.strip():
        return None

    artists = _extract_artists(raw_album.get("artists"))
    if not artists and default_artists:
        artists = default_artists

    cover = pick_largest_image(raw_album.get("coverArt"))
    year = _extract_year(raw_album.get("date"))

    return {
        "id": album_id,
        "browseId": album_id,
        "title": title.strip(),
        "artists": artists,
        "album": None,
        "duration": None,
        "durationSeconds": None,
        "thumbnail": cover,
        "type": item_type,
        "year": year,
        "isExplicit": False,
    }


def normalize_artist(raw_artist: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_artist, Mapping):
        return None
    if "data" in raw_artist and isinstance(raw_artist["data"], Mapping):
        raw_artist = raw_artist["data"]
    if raw_artist.get("__typename") == "GenericError":
        return None

    artist_id = extract_spotify_id(raw_artist.get("id") or raw_artist.get("uri"))
    profile = raw_artist.get("profile") if isinstance(raw_artist.get("profile"), Mapping) else {}
    name = profile.get("name") or raw_artist.get("name")
    if not artist_id or not isinstance(name, str) or not name.strip():
        return None

    cover = pick_largest_image(raw_artist.get("visuals"))
    if not cover:
        cover = pick_largest_image(raw_artist.get("visualIdentity"))

    stats = raw_artist.get("stats") if isinstance(raw_artist.get("stats"), Mapping) else {}
    views = format_compact_count(stats.get("monthlyListeners"), "pendengar/bln")

    return {
        "id": artist_id,
        "browseId": artist_id,
        "title": name.strip(),
        "artists": [],
        "album": None,
        "duration": None,
        "durationSeconds": None,
        "thumbnail": cover,
        "type": "artist",
        "views": views,
        "isExplicit": False,
    }


def normalize_playlist(raw_playlist: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_playlist, Mapping):
        return None
    if "data" in raw_playlist and isinstance(raw_playlist["data"], Mapping):
        raw_playlist = raw_playlist["data"]
    if raw_playlist.get("__typename") == "GenericError":
        return None

    pl_id = extract_spotify_id(raw_playlist.get("id") or raw_playlist.get("uri"))
    title = raw_playlist.get("name") or raw_playlist.get("title")
    if not pl_id or not isinstance(title, str) or not title.strip():
        return None

    owner_node = raw_playlist.get("ownerV2") if isinstance(raw_playlist.get("ownerV2"), Mapping) else {}
    owner_data = owner_node.get("data") if isinstance(owner_node.get("data"), Mapping) else owner_node
    owner_name = owner_data.get("name") or owner_data.get("username")
    artists = [{"id": None, "name": owner_name.strip()}] if isinstance(owner_name, str) and owner_name.strip() else []

    cover = pick_largest_image(raw_playlist.get("images"))
    if not cover:
        cover = pick_largest_image(raw_playlist.get("visualIdentity"))

    return {
        "id": pl_id,
        "browseId": pl_id,
        "playlistId": pl_id,
        "title": title.strip(),
        "artists": artists,
        "album": None,
        "duration": None,
        "durationSeconds": None,
        "thumbnail": cover,
        "type": "playlist",
        "description": raw_playlist.get("description") or None,
        "isExplicit": False,
    }


def normalize_podcast(raw_podcast: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_podcast, Mapping):
        return None
    if "data" in raw_podcast and isinstance(raw_podcast["data"], Mapping):
        raw_podcast = raw_podcast["data"]
    if raw_podcast.get("__typename") == "GenericError":
        return None

    pod_id = extract_spotify_id(raw_podcast.get("id") or raw_podcast.get("uri"))
    title = raw_podcast.get("name") or raw_podcast.get("title")
    if not pod_id or not isinstance(title, str) or not title.strip():
        return None

    pub_node = raw_podcast.get("publisher") if isinstance(raw_podcast.get("publisher"), Mapping) else {}
    pub_name = pub_node.get("name")
    artists = [{"id": None, "name": pub_name.strip()}] if isinstance(pub_name, str) and pub_name.strip() else []
    cover = pick_largest_image(raw_podcast.get("coverArt"))

    return {
        "id": pod_id,
        "browseId": pod_id,
        "title": title.strip(),
        "artists": artists,
        "album": None,
        "duration": None,
        "durationSeconds": None,
        "thumbnail": cover,
        "type": "podcast",
        "description": raw_podcast.get("description") or None,
        "isExplicit": False,
    }


def normalize_episode(
    raw_ep: Any,
    *,
    podcast_id: Optional[str] = None,
    podcast_title: Optional[str] = None,
    fallback_cover: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_ep, Mapping):
        return None
    if "entity" in raw_ep and isinstance(raw_ep["entity"], Mapping):
        raw_ep = raw_ep["entity"]
    if "data" in raw_ep and isinstance(raw_ep["data"], Mapping):
        raw_ep = raw_ep["data"]
    if raw_ep.get("__typename") == "GenericError":
        return None

    ep_id = extract_spotify_id(raw_ep.get("id") or raw_ep.get("_uri") or raw_ep.get("uri"))
    title = raw_ep.get("name") or raw_ep.get("title")
    if not ep_id or not isinstance(title, str) or not title.strip():
        return None

    pod_v2 = raw_ep.get("podcastV2") if isinstance(raw_ep.get("podcastV2"), Mapping) else {}
    pod_data = pod_v2.get("data") if isinstance(pod_v2.get("data"), Mapping) else {}
    resolved_pod_id = podcast_id or extract_spotify_id(pod_data.get("uri") or pod_data.get("id"))
    resolved_pod_title = podcast_title or pod_data.get("name")
    pod_cover = pick_largest_image(pod_data.get("coverArt"), fallback=fallback_cover)
    cover = pick_largest_image(raw_ep.get("coverArt"), fallback=pod_cover)

    duration_node = raw_ep.get("duration") if isinstance(raw_ep.get("duration"), Mapping) else {}
    duration_str, duration_sec = format_duration_ms(duration_node.get("totalMilliseconds"))

    release = raw_ep.get("releaseDate") if isinstance(raw_ep.get("releaseDate"), Mapping) else {}
    published = release.get("isoString")
    if isinstance(published, str) and "T" in published:
        published = published.split("T", 1)[0]

    artists = (
        [{"id": resolved_pod_id, "name": resolved_pod_title}]
        if isinstance(resolved_pod_title, str) and resolved_pod_title.strip()
        else []
    )

    return {
        "id": ep_id,
        "videoId": ep_id,
        "title": title.strip(),
        "artists": artists,
        "album": None,
        "duration": duration_str,
        "durationSeconds": duration_sec,
        "thumbnail": cover,
        "type": "episode",
        "description": raw_ep.get("description") or None,
        "published": published if isinstance(published, str) else None,
        "podcastId": resolved_pod_id,
        "isExplicit": str((raw_ep.get("contentRating") or {}).get("label") or "").upper() == "EXPLICIT",
    }


def parse_cookie_input(raw_cookies: Any) -> Dict[str, str]:
    if isinstance(raw_cookies, Mapping):
        return {
            str(k).strip(): str(v).strip()
            for k, v in raw_cookies.items()
            if str(k).strip() and v is not None
        }
    if isinstance(raw_cookies, list):
        parsed: Dict[str, str] = {}
        for item in raw_cookies:
            if isinstance(item, Mapping) and item.get("name") and item.get("value") is not None:
                parsed[str(item["name"]).strip()] = str(item["value"]).strip()
        return parsed
    if isinstance(raw_cookies, str):
        text = raw_cookies.strip()
        if not text:
            return {}
        if text.startswith("{") or text.startswith("["):
            try:
                return parse_cookie_input(json.loads(text))
            except json.JSONDecodeError:
                pass
        parsed_dict: Dict[str, str] = {}
        for chunk in text.split(";"):
            part = chunk.strip()
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip()
            v = v.strip()
            if k:
                parsed_dict[k] = v
        return parsed_dict
    return {}


STREAM_TIER_ORDER = [
    ("low", "Rendah"),
    ("normal", "Normal"),
    ("high", "Tinggi"),
    ("very_high", "Sangat Tinggi"),
    ("lossless", "Lossless"),
    ("hi_res", "Hi-Res Lossless"),
]

_MP3_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_MP3_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_MP3_SAMPLERATES_V1 = [44100, 48000, 32000, 0]
_MP3_SAMPLERATES_V2 = [22050, 24000, 16000, 0]
_MP3_SAMPLERATES_V25 = [11025, 12000, 8000, 0]


def probe_audio_stream_metadata(
    data: bytes,
    *,
    content_type: str = "",
    url: str = "",
    content_length: Optional[int] = None,
) -> Dict[str, Any]:
    """Inspect real audio container/codec headers without faking or upsampling metadata."""
    ctype = (content_type or "").split(";", 1)[0].strip().lower()
    lower_url = (url or "").lower()

    codec: Optional[str] = None
    bitrate_kbps: Optional[int] = None
    sample_rate_hz: Optional[int] = None
    bit_depth: Optional[int] = None
    lossless = False

    # 1. FLAC ('fLaC' magic + STREAMINFO metadata block)
    flac_idx = data.find(b"fLaC")
    if flac_idx != -1 and len(data) >= flac_idx + 26:
        # Block header (4 bytes) + min/max block (4) + min/max frame (6) = 14 bytes -> bytes 14..22 hold SR/ch/bps/samples
        si_start = flac_idx + 8
        if len(data) >= si_start + 18:
            packed = int.from_bytes(data[si_start + 10 : si_start + 14], "big")
            sr = (packed >> 12) & 0xFFFFF
            bps = ((packed >> 4) & 0x1F) + 1
            if sr > 0:
                sample_rate_hz = sr
            if 4 <= bps <= 32:
                bit_depth = bps
            codec = "FLAC"
            lossless = True

    # 2. WAV ('RIFF' ... 'WAVEfmt ')
    elif data[:4] == b"RIFF" and b"WAVE" in data[8:16]:
        fmt_idx = data.find(b"fmt ")
        if fmt_idx != -1 and len(data) >= fmt_idx + 24:
            _audio_fmt, _channels, sr, byte_rate, _block_align, bps = struct.unpack(
                "<HHIIHH", data[fmt_idx + 8 : fmt_idx + 24]
            )
            codec = "WAV (PCM)"
            lossless = True
            if sr > 0:
                sample_rate_hz = sr
            if bps > 0:
                bit_depth = bps
            if byte_rate > 0:
                bitrate_kbps = int(round((byte_rate * 8) / 1000.0))

    # 3. OGG / Opus / Vorbis ('OggS')
    elif data[:4] == b"OggS":
        if b"OpusHead" in data[:128]:
            codec = "Opus"
            sample_rate_hz = 48000
        elif b"\x01vorbis" in data[:128]:
            codec = "OGG Vorbis"
            v_idx = data.find(b"\x01vorbis")
            if len(data) >= v_idx + 16:
                sr = struct.unpack("<I", data[v_idx + 12 : v_idx + 16])[0]
                if sr > 0:
                    sample_rate_hz = sr
        else:
            codec = "OGG"
        lossless = False

    # 4. MP3 (skip ID3v2 tag if present, locate MPEG frame sync)
    if codec is None:
        offset = 0
        if len(data) >= 10 and data[:3] == b"ID3":
            tag_size = (
                ((data[6] & 0x7F) << 21)
                | ((data[7] & 0x7F) << 14)
                | ((data[8] & 0x7F) << 7)
                | (data[9] & 0x7F)
            )
            offset = min(len(data), 10 + tag_size)
        scan_limit = min(len(data) - 3, offset + 4096)
        for idx in range(offset, max(offset, scan_limit)):
            if data[idx] == 0xFF and (data[idx + 1] & 0xE0) == 0xE0:
                b1, b2 = data[idx + 1], data[idx + 2]
                ver_bits = (b1 >> 3) & 0x03
                layer_bits = (b1 >> 1) & 0x03
                br_idx = (b2 >> 4) & 0x0F
                sr_idx = (b2 >> 2) & 0x03
                if ver_bits != 1 and layer_bits == 1 and 0 < br_idx < 15 and sr_idx < 3:
                    codec = "MP3"
                    bitrate_kbps = (
                        _MP3_BITRATES_V1_L3[br_idx] if ver_bits == 3 else _MP3_BITRATES_V2_L3[br_idx]
                    )
                    if ver_bits == 3:
                        sample_rate_hz = _MP3_SAMPLERATES_V1[sr_idx]
                    elif ver_bits == 2:
                        sample_rate_hz = _MP3_SAMPLERATES_V2[sr_idx]
                    else:
                        sample_rate_hz = _MP3_SAMPLERATES_V25[sr_idx]
                    lossless = False
                    break

    # 5. MP4 / AAC fallback
    if codec is None and (b"ftyp" in data[:32] or "mp4" in ctype or "aac" in ctype or ".m4a" in lower_url):
        codec = "AAC (M4A)"
        lossless = False
    elif codec is None and ("mpeg" in ctype or "mp3" in ctype or "mp3-preview" in lower_url):
        codec = "MP3"
        lossless = False
    elif codec is None and ("flac" in ctype or lower_url.endswith(".flac")):
        codec = "FLAC"
        lossless = True
    elif codec is None and ("wav" in ctype or lower_url.endswith(".wav")):
        codec = "WAV"
        lossless = True

    if bitrate_kbps is None and codec == "MP3" and "mp3-preview" in lower_url:
        bitrate_kbps = 128
        sample_rate_hz = sample_rate_hz or 44100
    if bitrate_kbps is None and lossless and sample_rate_hz and bit_depth:
        bitrate_kbps = int(round((sample_rate_hz * bit_depth * 2) / 1000.0))

    hi_res = bool(
        lossless
        and (
            (bit_depth is not None and bit_depth > 16)
            or (sample_rate_hz is not None and sample_rate_hz > 44100)
        )
    )

    return {
        "codec": codec or "Audio",
        "bitrateKbps": bitrate_kbps,
        "sampleRateHz": sample_rate_hz,
        "bitDepth": bit_depth,
        "lossless": lossless,
        "hiRes": hi_res,
        "contentLength": content_length,
    }


def classify_stream_tier(meta: Mapping[str, Any]) -> str:
    if meta.get("lossless"):
        return "hi_res" if meta.get("hiRes") else "lossless"
    br = meta.get("bitrateKbps")
    if isinstance(br, (int, float)):
        if br <= 96:
            return "low"
        if br < 192:
            return "normal"
        if br < 288:
            return "high"
        return "very_high"
    return "normal"


class AudioSettingsStore:
    """Server-side per-account persistence for user audio preferences."""

    def __init__(self, file_path: Optional[str] = None) -> None:
        self._file_path = file_path or os.environ.get(
            "SOUNDCLEAR_AUDIO_SETTINGS_FILE",
            os.path.join(os.path.dirname(__file__), ".audio_settings.json"),
        )
        self._lock = threading.RLock()

    def _read_all(self) -> Dict[str, Any]:
        if not os.path.exists(self._file_path):
            return {}
        try:
            with open(self._file_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _write_all(self, data: Mapping[str, Any]) -> None:
        parent = os.path.dirname(os.path.abspath(self._file_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        tmp = f"{self._file_path}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, self._file_path)

    def get(self, account_key: str) -> Optional[Dict[str, Any]]:
        clean = (account_key or "local").strip() or "local"
        with self._lock:
            all_data = self._read_all()
            val = all_data.get(clean)
            return dict(val) if isinstance(val, Mapping) else None

    def save(self, account_key: str, settings: Mapping[str, Any]) -> Dict[str, Any]:
        clean = (account_key or "local").strip() or "local"
        payload = dict(settings)
        with self._lock:
            all_data = self._read_all()
            all_data[clean] = payload
            self._write_all(all_data)
        return payload

    def delete(self, account_key: str) -> None:
        clean = (account_key or "local").strip() or "local"
        with self._lock:
            all_data = self._read_all()
            if clean in all_data:
                all_data.pop(clean, None)
                self._write_all(all_data)


class SpotAPIClientGateway:
    """Thread-safe wrapper encapsulating all SpotAPI SDK calls."""

    def __init__(
        self,
        *,
        language: str = "en",
        session_file: Optional[str] = None,
        identifier: Optional[str] = None,
        cookies_raw: Optional[str] = None,
    ) -> None:
        self._language = language
        self._lock = threading.RLock()
        self._song_client: Optional[Song] = None
        self._artist_client: Optional[Artist] = None
        self._podcast_client: Optional[Podcast] = None

        self._session_file = session_file or os.environ.get(
            "SPOTAPI_SESSION_FILE",
            os.path.join(os.path.dirname(__file__), ".spotapi_sessions.json"),
        )
        self._identifier = identifier or os.environ.get("SPOTAPI_IDENTIFIER", "") or None
        self._login: Optional[Login] = None
        self._auth_checked = False
        self._auth_message = "Mode lokal aktif (pustaka tersimpan di browser)."

        initial_cookies = cookies_raw if cookies_raw is not None else os.environ.get("SPOTAPI_COOKIES_JSON", "")
        if initial_cookies and initial_cookies.strip():
            try:
                self.import_cookies(self._identifier or "default", initial_cookies, verify=False)
            except Exception:
                # Never crash startup if env cookies are malformed; fall back to local mode
                self._login = None
        else:
            self._try_load_saver_session(verify=False)

    def _get_shared_song(self) -> Song:
        if self._song_client is None:
            tls = TLSClient("chrome120", "", auto_retries=3)
            self._song_client = Song(client=tls, language=self._language)
        return self._song_client

    def _get_shared_artist(self) -> Artist:
        song = self._get_shared_song()
        if self._artist_client is None:
            art = Artist(language=self._language)
            art.base = song.base
            self._artist_client = art
        return self._artist_client

    def _get_shared_podcast(self, podcast_id: Optional[str] = None) -> Podcast:
        song = self._get_shared_song()
        pod = Podcast(podcast_id, language=self._language)
        pod.base = song.base
        return pod

    def query_songs(self, query: str, limit: int = 10, offset: int = 0) -> Mapping[str, Any]:
        with self._lock:
            return self._get_shared_song().query_songs(query, limit=limit, offset=offset)

    def get_track_info(self, track_id: str) -> Mapping[str, Any]:
        with self._lock:
            return self._get_shared_song().get_track_info(track_id)

    def query_artists(self, query: str, limit: int = 10, offset: int = 0) -> Mapping[str, Any]:
        with self._lock:
            return self._get_shared_artist().query_artists(query, limit=limit, offset=offset)

    def get_artist(self, artist_id: str) -> Mapping[str, Any]:
        with self._lock:
            return self._get_shared_artist().get_artist(artist_id, locale_code=self._language)

    def get_artist_discography(
        self,
        artist_id: str,
        section: str = "all",
        offset: int = 0,
        limit: int = 50,
    ) -> Mapping[str, Any]:
        with self._lock:
            return self._get_shared_artist().get_artist_discography(
                artist_id,
                section=section,  # type: ignore[arg-type]
                offset=offset,
                limit=limit,
            )

    def get_album_info(self, album_id: str, limit: int = 50, offset: int = 0) -> Mapping[str, Any]:
        with self._lock:
            song = self._get_shared_song()
            album_api = PublicAlbum(album_id, language=self._language)
            album_api.base = song.base
            return album_api.get_album_info(limit=limit, offset=offset)

    def get_playlist_info(self, playlist_id: str, limit: int = 100, offset: int = 0) -> Mapping[str, Any]:
        with self._lock:
            song = self._get_shared_song()
            playlist_api = PublicPlaylist(playlist_id, language=self._language)
            playlist_api.base = song.base
            return playlist_api.get_playlist_info(limit=limit, offset=offset)

    def get_podcast_info(self, podcast_id: str, limit: int = 100, offset: int = 0) -> Mapping[str, Any]:
        with self._lock:
            pod = self._get_shared_podcast(podcast_id)
            return pod.get_podcast_info(limit=limit, offset=offset)

    def get_episode(self, episode_id: str) -> Mapping[str, Any]:
        with self._lock:
            pod = self._get_shared_podcast()
            return pod.get_episode(episode_id)

    def _resolve_identifier_from_file(self) -> Optional[str]:
        if self._identifier:
            return self._identifier
        if not os.path.exists(self._session_file):
            return None
        try:
            with open(self._session_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list) and data and isinstance(data[0], Mapping):
                ident = data[0].get("identifier")
                if isinstance(ident, str) and ident.strip():
                    return ident.strip()
        except Exception:
            return None
        return None

    def _try_load_saver_session(self, verify: bool = True) -> bool:
        with self._lock:
            if not os.path.exists(self._session_file):
                self._login = None
                self._auth_message = "Mode lokal aktif (pustaka tersimpan di browser)."
                return False
            ident = self._resolve_identifier_from_file()
            if not ident:
                self._login = None
                self._auth_message = "Mode lokal aktif (belum ada sesi cookie SpotAPI di server)."
                return False
            try:
                saver = JSONSaver(self._session_file)
                cfg = Config(
                    logger=NoopLogger(),
                    solver=None,
                    client=TLSClient("chrome120", "", auto_retries=3),
                )
                login = Login.from_saver(saver, cfg, ident)
                if verify:
                    user = User(login)
                    if not user.verify_login():
                        self._login = None
                        self._auth_message = "Sesi cookie server kedaluwarsa. Jalankan mode lokal atau perbarui cookie."
                        return False
                self._identifier = ident
                self._login = login
                self._auth_checked = verify
                self._auth_message = "Akun Spotify terhubung melalui sesi cookie server (JSONSaver)."
                return True
            except Exception:
                self._login = None
                self._auth_message = "Mode lokal aktif (pustaka tersimpan di browser)."
                return False

    def import_cookies(
        self,
        identifier: str,
        raw_cookies: Any,
        *,
        verify: bool = True,
    ) -> bool:
        cookies = parse_cookie_input(raw_cookies)
        clean_id = (identifier or "default").strip() or "default"
        if not cookies:
            raise MusicProviderError("Cookie tidak valid atau kosong.", 400)
        with self._lock:
            parent_dir = os.path.dirname(os.path.abspath(self._session_file))
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            saver = JSONSaver(self._session_file)
            saver.save([
                {
                    "identifier": clean_id,
                    "password": "",
                    "cookies": cookies,
                }
            ])
            self._identifier = clean_id
            return self._try_load_saver_session(verify=verify)

    def get_account_status(self) -> Dict[str, Any]:
        with self._lock:
            if self._login and not self._auth_checked:
                self._try_load_saver_session(verify=True)
            authenticated = bool(self._login and self._login.logged_in)
            return {
                "authenticated": authenticated,
                "mode": "ytmusic" if authenticated else "local",
                "message": self._auth_message
                if authenticated
                else "Mode lokal aktif (pustaka tersimpan di browser).",
            }

    def get_account_library_raw(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            if not (self._login and self._login.logged_in):
                return None
            priv = PrivatePlaylist(self._login, language=self._language)
            saved_tracks = priv.get_saved_tracks_info(limit=50)
            library = priv.get_library(limit=50)
            return {"saved_tracks": saved_tracks, "library": library}

    def like_song(self, track_id: str) -> bool:
        with self._lock:
            if not (self._login and self._login.logged_in):
                return False
            priv = PrivatePlaylist(self._login, playlist=track_id, language=self._language)
            song_api = Song(playlist=priv, language=self._language)
            song_api.like_song(track_id)
            return True

    def create_playlist(self, name: str, track_ids: Optional[List[str]] = None) -> Optional[str]:
        with self._lock:
            if not (self._login and self._login.logged_in):
                return None
            priv = PrivatePlaylist(self._login, language=self._language)
            pl_uri = priv.create_playlist(name)
            pl_id = extract_spotify_id(pl_uri)
            if pl_id and track_ids:
                priv.set_playlist(pl_id)
                song_api = Song(playlist=priv, language=self._language)
                song_api.add_songs_to_playlist(track_ids)
            return pl_id

    def add_playlist_items(self, playlist_id: str, track_ids: List[str]) -> bool:
        with self._lock:
            if not (self._login and self._login.logged_in):
                return False
            priv = PrivatePlaylist(self._login, playlist=playlist_id, language=self._language)
            song_api = Song(playlist=priv, language=self._language)
            song_api.add_songs_to_playlist(track_ids)
            return True

    def follow_artist(self, artist_id: str, subscribe: bool = True) -> bool:
        with self._lock:
            if not (self._login and self._login.logged_in):
                return False
            art = Artist(login=self._login, language=self._language)
            if subscribe:
                art.follow(artist_id)
            else:
                art.unfollow(artist_id)
            return True


class MusicProvider:
    """Unified SpotAPI-backed provider returning SoundClear JSON schemas."""

    def __init__(
        self,
        *,
        gateway: Optional[SpotAPIClientGateway] = None,
        cache_ttl_seconds: Optional[int] = None,
        country: str = "ID",
        max_retries: int = 3,
        base_backoff_seconds: float = 0.35,
        sleep_fn: Callable[[float], None] = time.sleep,
        http_get_fn: Optional[Callable[..., Any]] = None,
        audio_settings_file: Optional[str] = None,
    ) -> None:
        env_ttl = os.environ.get("CACHE_TTL_SECONDS", "").strip()
        resolved_ttl = cache_ttl_seconds if cache_ttl_seconds is not None else (int(env_ttl) if env_ttl.isdigit() else 420)
        self._ttl = max(30, resolved_ttl)
        self._country = (country or "ID").upper()
        self._cache = TTLCache(default_ttl=self._ttl, max_items=1024)
        self._gateway = gateway or SpotAPIClientGateway(language="en")
        self._max_retries = max(1, int(max_retries))
        self._base_backoff = max(0.0, float(base_backoff_seconds))
        self._sleep = sleep_fn
        self._http_get = http_get_fn or requests.get
        self._audio_settings_store = AudioSettingsStore(audio_settings_file)

    def warmup(self) -> None:
        """Pre-warm SpotAPI BaseClient and prime home/charts cache in background."""
        try:
            self.get_charts(self._country)
            self.get_home(10)
        except Exception:
            pass

    def _with_retry(self, op_label: str, fn: Callable[[], T]) -> T:
        last_err: Optional[Exception] = None
        for attempt in range(self._max_retries):
            try:
                return fn()
            except MusicProviderError as exc:
                if 400 <= exc.status_code < 500 and exc.status_code != 429:
                    raise
                last_err = exc
            except Exception as exc:
                last_err = exc

            if attempt + 1 < self._max_retries:
                jitter = 0.85 + (0.3 * random.random())
                delay = min(4.0, self._base_backoff * (2 ** attempt)) * jitter
                if delay > 0:
                    self._sleep(delay)

        detail = str(last_err) if last_err else "Kesalahan tidak diketahui"
        raise MusicProviderError(
            f"Gagal mengambil {op_label} dari Spotify: {detail}",
            status_code=502,
        )

    def _cached(
        self,
        cache_key: str,
        op_label: str,
        loader: Callable[[], T],
        ttl_seconds: Optional[int] = None,
    ) -> T:
        hit = self._cache.get(cache_key)
        if hit is not None:
            return hit
        value = self._with_retry(op_label, loader)
        self._cache.set(cache_key, value, ttl_seconds=ttl_seconds)
        return value

    def _search_v2_items(
        self,
        query: str,
        search_filter: Optional[str] = None,
        limit: int = 25,
    ) -> List[Dict[str, Any]]:
        req_limit = max(1, min(50, limit))
        raw = self._gateway.query_songs(query, limit=req_limit)
        sv2 = (raw.get("data") or {}).get("searchV2") or {}

        tracks = [
            x
            for x in (
                normalize_track(entry)
                for entry in ((sv2.get("tracksV2") or {}).get("items") or [])
            )
            if x is not None
        ]
        albums = [
            x
            for x in (
                normalize_album(entry)
                for entry in ((sv2.get("albumsV2") or {}).get("items") or [])
            )
            if x is not None
        ]
        artists = [
            x
            for x in (
                normalize_artist(entry)
                for entry in ((sv2.get("artists") or {}).get("items") or [])
            )
            if x is not None
        ]
        playlists = [
            x
            for x in (
                normalize_playlist(entry)
                for entry in ((sv2.get("playlists") or {}).get("items") or [])
            )
            if x is not None
        ]
        podcasts = [
            x
            for x in (
                normalize_podcast(entry)
                for entry in ((sv2.get("podcasts") or {}).get("items") or [])
            )
            if x is not None
        ]
        episodes = [
            x
            for x in (
                normalize_episode(entry)
                for entry in ((sv2.get("episodes") or {}).get("items") or [])
            )
            if x is not None
        ]

        flt = (search_filter or "all").lower()
        if flt == "songs":
            return tracks[:limit]
        if flt == "videos":
            # Prefer tracks with video associations if available, fallback to tracks marked video
            video_items = []
            for entry in (sv2.get("tracksV2") or {}).get("items") or []:
                norm = normalize_track(entry, item_type="video")
                if norm:
                    video_items.append(norm)
            return video_items[:limit]
        if flt == "albums":
            return albums[:limit]
        if flt == "artists":
            if len(artists) < min(limit, 8):
                try:
                    art_raw = self._gateway.query_artists(query, limit=req_limit)
                    art_items = (((art_raw.get("data") or {}).get("searchV2") or {}).get("artists") or {}).get("items") or []
                    extra_artists = [
                        x for x in (normalize_artist(entry) for entry in art_items) if x is not None
                    ]
                    if extra_artists:
                        artists = extra_artists
                except Exception:
                    pass
            return artists[:limit]
        if flt == "playlists":
            return playlists[:limit]
        if flt == "podcasts":
            return podcasts[:limit]
        if flt == "episodes":
            return episodes[:limit]

        # "all": interleave top result cleanly (songs, artists, albums, playlists, podcasts, episodes)
        combined: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for pool in (tracks[:8], artists[:4], albums[:4], playlists[:4], podcasts[:3], episodes[:3]):
            for item in pool:
                key = f"{item['type']}:{item['id']}"
                if key not in seen:
                    seen.add(key)
                    combined.append(item)
        return combined[:limit]

    def search(
        self,
        query: str,
        search_filter: Optional[str] = None,
        limit: int = 25,
    ) -> Dict[str, Any]:
        clean = (query or "").strip()
        if not clean:
            return {"query": "", "filter": search_filter or "all", "items": []}

        safe_filter = (search_filter or "all").strip().lower()
        safe_limit = max(1, min(50, int(limit)))
        cache_key = f"search:{clean.lower()}:{safe_filter}:{safe_limit}"
        items = self._cached(
            cache_key,
            "hasil pencarian",
            lambda: self._search_v2_items(clean, safe_filter, safe_limit),
            ttl_seconds=min(self._ttl, 300),
        )
        return {
            "query": clean,
            "filter": safe_filter,
            "items": items,
        }

    def suggest(self, query: str) -> Dict[str, Any]:
        clean = (query or "").strip()
        if len(clean) < 2:
            return {"query": clean, "suggestions": []}

        def _load() -> List[str]:
            raw = self._gateway.query_songs(clean, limit=6)
            sv2 = (raw.get("data") or {}).get("searchV2") or {}
            suggestions: List[str] = []
            seen: set[str] = set()

            for entry in ((sv2.get("artists") or {}).get("items") or [])[:3]:
                art = normalize_artist(entry)
                if art and art["title"].lower() not in seen:
                    seen.add(art["title"].lower())
                    suggestions.append(art["title"])

            for entry in ((sv2.get("tracksV2") or {}).get("items") or [])[:5]:
                tr = normalize_track(entry)
                if tr:
                    label = tr["title"]
                    if label.lower() not in seen:
                        seen.add(label.lower())
                        suggestions.append(label)

            for entry in ((sv2.get("albumsV2") or {}).get("items") or [])[:2]:
                alb = normalize_album(entry)
                if alb and alb["title"].lower() not in seen:
                    seen.add(alb["title"].lower())
                    suggestions.append(alb["title"])

            return suggestions[:7]

        suggestions = self._cached(
            f"suggest:{clean.lower()}",
            "saran pencarian",
            _load,
            ttl_seconds=180,
        )
        return {"query": clean, "suggestions": suggestions}

    def get_home(self, limit: int = 8) -> Dict[str, Any]:
        safe_limit = max(1, min(20, int(limit)))

        def _load() -> Dict[str, Any]:
            section_specs = [
                ("Lagu Populer Indonesia", "pop indonesia tulus bernadya mahalini sal priadi", "songs"),
                ("Album & Rilisan Pilihan", "album tulus manusia hindia bernadya", "albums"),
                ("Playlist Pilihan Hari Ini", "top hits indonesia playlist", "playlists"),
                ("Artis Indonesia Terkini", "tulus raisa pamungkas hindia", "artists"),
            ]
            sections: List[Dict[str, Any]] = []
            for title, q, flt in section_specs:
                try:
                    items = self._search_v2_items(q, flt, max(12, safe_limit + 6))
                except Exception:
                    items = []
                filtered: List[Dict[str, Any]] = []
                artist_counts: Dict[str, int] = {}
                for it in items:
                    if _is_excluded_home_item(it):
                        continue
                    if flt == "songs" and it.get("artists"):
                        primary = str((it["artists"][0] or {}).get("name") or "").lower()
                        if primary:
                            if artist_counts.get(primary, 0) >= 2:
                                continue
                            artist_counts[primary] = artist_counts.get(primary, 0) + 1
                    filtered.append(it)
                    if len(filtered) >= safe_limit:
                        break
                if filtered:
                    sections.append({"title": title, "items": filtered})
            return {"sections": sections}

        return self._cached(f"home:{safe_limit}", "beranda", _load, ttl_seconds=self._ttl)

    def get_charts(self, country: str = "ID") -> Dict[str, Any]:
        code = (country or self._country or "ID").upper()

        def _load() -> Dict[str, Any]:
            songs: List[Dict[str, Any]] = []
            playlists: List[Dict[str, Any]] = []
            artists: List[Dict[str, Any]] = []
            trending: List[Dict[str, Any]] = []

            query_term = "Top 50 Indonesia" if code == "ID" else f"Top 50 {code}"
            search_res = self._gateway.query_songs(query_term, limit=12)
            sv2 = (search_res.get("data") or {}).get("searchV2") or {}

            playlists = [
                p
                for p in (
                    normalize_playlist(entry)
                    for entry in ((sv2.get("playlists") or {}).get("items") or [])
                )
                if p is not None and not _is_excluded_home_item(p)
            ][:10]

            if playlists:
                try:
                    pl_detail = self.get_playlist(playlists[0]["id"], limit=25)
                    songs = [t for t in pl_detail.get("tracks", []) if not _is_excluded_home_item(t)][:20]
                except Exception:
                    songs = []

            if not songs:
                songs = [
                    t
                    for t in (
                        normalize_track(entry)
                        for entry in ((sv2.get("tracksV2") or {}).get("items") or [])
                    )
                    if t is not None and not _is_excluded_home_item(t)
                ][:20]

            viral_res = self._gateway.query_songs(
                "lagu viral indonesia populer" if code == "ID" else f"viral hits {code}",
                limit=10,
            )
            viral_sv2 = (viral_res.get("data") or {}).get("searchV2") or {}
            trending = [
                t
                for t in (
                    normalize_track(entry)
                    for entry in ((viral_sv2.get("tracksV2") or {}).get("items") or [])
                )
                if t is not None and not _is_excluded_home_item(t)
            ][:10]

            # Build chart artists from artist search + unique track artists
            seen_art_ids: set[str] = set()
            for entry in (viral_sv2.get("artists") or {}).get("items") or []:
                art = normalize_artist(entry)
                if art and art["id"] not in seen_art_ids and not _is_excluded_home_item(art):
                    seen_art_ids.add(art["id"])
                    artists.append(art)

            if len(artists) < 8:
                indonesian_search = self._gateway.query_songs("Tulus Hindia Mahalini Nadin Amizah", limit=10)
                ind_sv2 = (indonesian_search.get("data") or {}).get("searchV2") or {}
                for entry in (ind_sv2.get("artists") or {}).get("items") or []:
                    art = normalize_artist(entry)
                    if art and art["id"] not in seen_art_ids:
                        seen_art_ids.add(art["id"])
                        artists.append(art)

            return {
                "country": code,
                "songs": songs,
                "videos": playlists,
                "artists": artists[:10],
                "trending": trending or songs[:10],
            }

        return self._cached(f"charts:{code}", "tangga lagu", _load, ttl_seconds=max(self._ttl, 480))

    def get_moods(self) -> Dict[str, Any]:
        return {
            "groups": [
                {
                    "title": g["title"],
                    "items": [{"title": it["title"], "params": it["params"]} for it in g["items"]],
                }
                for g in MOOD_GROUPS
            ]
        }

    def get_mood_playlists(self, params: str) -> Dict[str, Any]:
        clean = (params or "").strip()
        if not clean:
            raise MusicProviderError("Parameter kategori mood tidak valid.", 400)

        spec = MOOD_PARAM_MAP.get(clean)
        query_term = spec["query"] if spec else clean.replace("-", " ")

        def _load() -> Dict[str, Any]:
            playlists = self._search_v2_items(query_term, "playlists", 20)
            if not playlists:
                playlists = self._search_v2_items(query_term, "albums", 16)
            return {
                "params": clean,
                "playlists": playlists,
            }

        return self._cached(f"mood:{clean}", "playlist mood & genre", _load, ttl_seconds=480)

    def get_artist(self, artist_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(artist_id)
        if not clean_id:
            raise MusicProviderError("ID artis tidak valid.", 400)

        def _load() -> Dict[str, Any]:
            raw = self._gateway.get_artist(clean_id)
            au = (raw.get("data") or {}).get("artistUnion")
            if not isinstance(au, Mapping) or au.get("__typename") == "NotFound":
                raise MusicProviderError("Artis tidak ditemukan.", 404)

            profile = au.get("profile") if isinstance(au.get("profile"), Mapping) else {}
            name = profile.get("name") or "Artis"
            bio_node = profile.get("biography") if isinstance(profile.get("biography"), Mapping) else {}
            description = bio_node.get("text") or None

            stats = au.get("stats") if isinstance(au.get("stats"), Mapping) else {}
            subscribers = format_compact_count(stats.get("followers"), "")
            views = format_compact_count(stats.get("monthlyListeners"), "pendengar bulanan")

            visuals = au.get("visuals") if isinstance(au.get("visuals"), Mapping) else {}
            thumbnail = pick_largest_image(visuals.get("avatarImage")) or pick_largest_image(
                visuals.get("headerImage")
            )
            default_artist_ref = [{"id": clean_id, "name": str(name)}]

            disc = au.get("discography") if isinstance(au.get("discography"), Mapping) else {}
            songs = [
                x
                for x in (
                    normalize_track(entry, fallback_cover=thumbnail)
                    for entry in ((disc.get("topTracks") or {}).get("items") or [])
                )
                if x is not None
            ]
            albums = [
                x
                for x in (
                    normalize_album(entry, default_artists=default_artist_ref, item_type="album")
                    for entry in ((disc.get("albums") or {}).get("items") or [])
                )
                if x is not None
            ]
            singles = [
                x
                for x in (
                    normalize_album(entry, default_artists=default_artist_ref, item_type="album")
                    for entry in ((disc.get("singles") or {}).get("items") or [])
                )
                if x is not None
            ]
            compilations = [
                x
                for x in (
                    normalize_album(entry, default_artists=default_artist_ref, item_type="album")
                    for entry in ((disc.get("compilations") or {}).get("items") or [])
                )
                if x is not None
            ]

            rel_node = au.get("relatedContent") if isinstance(au.get("relatedContent"), Mapping) else {}
            appears_on = [
                x
                for x in (
                    normalize_album(entry, item_type="album")
                    for entry in ((rel_node.get("appearsOn") or {}).get("items") or [])
                )
                if x is not None
            ]
            related = [
                x
                for x in (
                    normalize_artist(entry)
                    for entry in ((rel_node.get("relatedArtists") or {}).get("items") or [])
                )
                if x is not None
            ]

            return {
                "id": clean_id,
                "name": str(name),
                "description": description,
                "subscribers": subscribers,
                "views": views,
                "thumbnail": thumbnail,
                "shuffleId": None,
                "radioId": None,
                "songs": songs,
                "albums": albums,
                "singles": singles,
                "compilations": compilations,
                "appearsOn": appears_on,
                "videos": [],
                "related": related,
            }

        return self._cached(f"artist:{clean_id}", "detail artis", _load, ttl_seconds=480)

    def get_artist_albums(self, artist_id: str, params: str) -> List[Dict[str, Any]]:
        clean_id = extract_spotify_id(artist_id)
        if not clean_id:
            raise MusicProviderError("ID artis tidak valid.", 400)
        section = params if params in ("all", "albums", "singles", "compilations") else "albums"

        def _load() -> List[Dict[str, Any]]:
            raw = self._gateway.get_artist_discography(clean_id, section=section, limit=50)
            sec_data = (((raw.get("data") or {}).get("artistUnion") or {}).get("discography") or {}).get(section) or {}
            items = sec_data.get("items") or []
            return [
                x
                for x in (normalize_album(entry) for entry in items)
                if x is not None
            ]

        return self._cached(f"artist_albums:{clean_id}:{section}", "diskografi artis", _load, ttl_seconds=480)

    def get_album(self, album_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(album_id)
        if not clean_id:
            raise MusicProviderError("ID album tidak valid.", 400)

        def _load() -> Dict[str, Any]:
            raw = self._gateway.get_album_info(clean_id, limit=50)
            alb = (raw.get("data") or {}).get("albumUnion")
            if not isinstance(alb, Mapping) or alb.get("__typename") == "NotFound":
                raise MusicProviderError("Album tidak ditemukan.", 404)

            title = str(alb.get("name") or "Album")
            artists = _extract_artists(alb.get("artists"))
            year = _extract_year(alb.get("date"))
            cover = pick_largest_image(alb.get("coverArt"))
            album_ref = {"id": clean_id, "name": title}

            tracks_node = alb.get("tracksV2") if isinstance(alb.get("tracksV2"), Mapping) else {}
            raw_tracks = list(tracks_node.get("items") or [])
            total_count = int(tracks_node.get("totalCount") or len(raw_tracks))

            if total_count > len(raw_tracks) and len(raw_tracks) < 200:
                try:
                    more = self._gateway.get_album_info(clean_id, limit=100, offset=len(raw_tracks))
                    more_items = ((((more.get("data") or {}).get("albumUnion") or {}).get("tracksV2") or {}).get("items")) or []
                    raw_tracks.extend(more_items)
                except Exception:
                    pass

            tracks: List[Dict[str, Any]] = []
            total_duration_sec = 0
            for entry in raw_tracks:
                norm = normalize_track(
                    entry,
                    fallback_album=album_ref,
                    fallback_cover=cover,
                    fallback_year=year,
                )
                if norm:
                    if not norm["artists"] and artists:
                        norm["artists"] = artists
                    tracks.append(norm)
                    if norm.get("durationSeconds"):
                        total_duration_sec += int(norm["durationSeconds"])

            credits: List[Dict[str, Any]] = []
            label = alb.get("label")
            if isinstance(label, str) and label.strip():
                credits.append({"role": "Label Rekaman", "names": [label.strip()]})

            cp_items = (alb.get("copyright") or {}).get("items") or []
            cp_texts = [str(c["text"]).strip() for c in cp_items if isinstance(c, Mapping) and c.get("text")]
            if cp_texts:
                credits.append({"role": "Hak Cipta", "names": list(dict.fromkeys(cp_texts))})

            more_from_artist: List[Dict[str, Any]] = []
            more_node = alb.get("moreAlbumsByArtist") if isinstance(alb.get("moreAlbumsByArtist"), Mapping) else {}
            for artist_block in more_node.get("items") or []:
                if not isinstance(artist_block, Mapping):
                    continue
                pop_rel = ((artist_block.get("discography") or {}).get("popularReleasesAlbums") or {}).get("items") or []
                for rel in pop_rel:
                    norm_rel = normalize_album(rel, default_artists=artists)
                    if norm_rel and norm_rel["id"] != clean_id:
                        more_from_artist.append(norm_rel)

            return {
                "id": clean_id,
                "title": title,
                "artists": artists,
                "year": year,
                "trackCount": total_count or len(tracks),
                "duration": format_total_seconds(total_duration_sec),
                "description": alb.get("courtesyLine") or None,
                "thumbnail": cover,
                "audioPlaylistId": None,
                "credits": credits,
                "moreFromArtist": more_from_artist[:10],
                "tracks": tracks,
            }

        return self._cached(f"album:{clean_id}", "detail album", _load, ttl_seconds=480)

    def get_playlist(self, playlist_id: str, limit: int = 100) -> Dict[str, Any]:
        clean_id = extract_spotify_id(playlist_id)
        if not clean_id:
            raise MusicProviderError("ID playlist tidak valid.", 400)
        safe_limit = max(1, min(200, int(limit)))

        def _load() -> Dict[str, Any]:
            raw = self._gateway.get_playlist_info(clean_id, limit=min(safe_limit, 100))
            pl = (raw.get("data") or {}).get("playlistV2")
            if not isinstance(pl, Mapping) or pl.get("__typename") == "NotFound":
                raise MusicProviderError("Playlist tidak ditemukan.", 404)

            title = str(pl.get("name") or "Playlist")
            cover = pick_largest_image(pl.get("images"))
            owner_node = pl.get("ownerV2") if isinstance(pl.get("ownerV2"), Mapping) else {}
            owner_data = owner_node.get("data") if isinstance(owner_node.get("data"), Mapping) else {}
            author = owner_data.get("name") or owner_data.get("username") or None
            description = pl.get("description") or None

            content = pl.get("content") if isinstance(pl.get("content"), Mapping) else {}
            raw_items = list(content.get("items") or [])
            total_count = int(content.get("totalCount") or len(raw_items))

            tracks: List[Dict[str, Any]] = []
            total_duration_sec = 0
            for entry in raw_items[:safe_limit]:
                norm = normalize_track(entry, fallback_cover=cover)
                if norm:
                    tracks.append(norm)
                    if norm.get("durationSeconds"):
                        total_duration_sec += int(norm["durationSeconds"])

            return {
                "id": clean_id,
                "title": title,
                "author": author,
                "description": description,
                "year": None,
                "trackCount": total_count or len(tracks),
                "duration": format_total_seconds(total_duration_sec),
                "thumbnail": cover,
                "tracks": tracks,
            }

        return self._cached(f"playlist:{clean_id}:{safe_limit}", "detail playlist", _load, ttl_seconds=420)

    def get_watch_playlist(
        self,
        video_id: str,
        playlist_id: Optional[str] = None,
        radio: bool = True,
        limit: int = 25,
    ) -> Dict[str, Any]:
        clean_id = extract_spotify_id(video_id)
        if not clean_id:
            raise MusicProviderError("ID lagu tidak valid.", 400)
        safe_limit = max(1, min(50, int(limit)))
        clean_pl = extract_spotify_id(playlist_id)

        def _load() -> Dict[str, Any]:
            tracks: List[Dict[str, Any]] = []
            if clean_pl:
                try:
                    pl = self.get_playlist(clean_pl, limit=safe_limit)
                    tracks = pl.get("tracks", [])
                except Exception:
                    tracks = []

            if not tracks:
                try:
                    info = self._gateway.get_track_info(clean_id)
                    tu = (info.get("data") or {}).get("trackUnion") or {}
                    artists = _extract_artists(tu.get("artists"))
                    if not artists:
                        combined_tu_artists: List[Any] = []
                        for key in ("firstArtist", "otherArtists"):
                            node = tu.get(key)
                            if isinstance(node, Mapping) and isinstance(node.get("items"), list):
                                combined_tu_artists.extend(node["items"])
                        artists = _extract_artists({"items": combined_tu_artists})
                    if artists and artists[0].get("id"):
                        art = self.get_artist(artists[0]["id"])  # type: ignore[arg-type]
                        tracks = [t for t in art.get("songs", []) if t["id"] != clean_id][:safe_limit]
                        if len(tracks) < 10 and art.get("related"):
                            rel_name = art["related"][0]["title"]
                            extra = self._search_v2_items(rel_name, "songs", 10)
                            seen = {t["id"] for t in tracks}
                            for ex in extra:
                                if ex["id"] not in seen and ex["id"] != clean_id:
                                    seen.add(ex["id"])
                                    tracks.append(ex)
                except Exception:
                    tracks = []

            if not tracks and radio:
                tracks = self._search_v2_items("pop indonesia tulus bernadya mahalini", "songs", min(12, safe_limit))

            return {
                "videoId": clean_id,
                "playlistId": clean_pl,
                "lyricsBrowseId": clean_id,
                "relatedBrowseId": clean_id,
                "tracks": tracks[:safe_limit],
            }

        return self._cached(
            f"watch:{clean_id}:{clean_pl or ''}:{1 if radio else 0}:{safe_limit}",
            "antrean putar",
            _load,
            ttl_seconds=360,
        )

    def get_lyrics(self, browse_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(browse_id) or browse_id
        return {
            "browseId": clean_id,
            "hasTimestamps": False,
            "source": None,
            "lines": [],
            "plainText": None,
        }

    def get_song_credits(
        self,
        video_id: str,
        album_id: Optional[str] = None,
        credits_browse_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        clean_id = extract_spotify_id(video_id)
        if not clean_id:
            raise MusicProviderError("ID lagu tidak valid.", 400)
        clean_alb = extract_spotify_id(album_id)

        def _load() -> Dict[str, Any]:
            title = "Kredit Lagu"
            credits: List[Dict[str, Any]] = []

            try:
                info = self._gateway.get_track_info(clean_id)
                tu = (info.get("data") or {}).get("trackUnion") or {}
                if tu.get("name"):
                    title = str(tu["name"])
                raw_art_list = _extract_artists(tu.get("artists"))
                if not raw_art_list:
                    combined_tu_artists: List[Any] = []
                    for key in ("firstArtist", "otherArtists"):
                        node = tu.get(key)
                        if isinstance(node, Mapping) and isinstance(node.get("items"), list):
                            combined_tu_artists.extend(node["items"])
                    raw_art_list = _extract_artists({"items": combined_tu_artists})
                artists = [a["name"] for a in raw_art_list if a.get("name")]
                if artists:
                    credits.append({"role": "Dibawakan oleh", "names": artists})
                playcount = format_compact_count(tu.get("playcount"), "kali diputar")
                if playcount:
                    credits.append({"role": "Statistik Pemutaran", "names": [playcount]})
            except Exception:
                pass

            if clean_alb:
                try:
                    alb = self.get_album(clean_alb)
                    for c in alb.get("credits", []):
                        credits.append(c)
                    if alb.get("year"):
                        credits.append({"role": "Tahun Rilis", "names": [str(alb["year"])]})
                except Exception:
                    pass

            return {"videoId": clean_id, "title": title, "credits": credits}

        return self._cached(
            f"credits:{clean_id}:{clean_alb or ''}:{credits_browse_id or ''}",
            "kredit lagu",
            _load,
            ttl_seconds=600,
        )

    def get_song_related(self, video_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(video_id)
        if not clean_id:
            raise MusicProviderError("ID lagu tidak valid.", 400)

        def _load() -> Dict[str, Any]:
            tracks: List[Dict[str, Any]] = []
            playlists: List[Dict[str, Any]] = []
            artists: List[Dict[str, Any]] = []

            try:
                info = self._gateway.get_track_info(clean_id)
                tu = (info.get("data") or {}).get("trackUnion") or {}
                track_artists = _extract_artists(tu.get("artists"))
                if not track_artists:
                    combined_tu_artists: List[Any] = []
                    for key in ("firstArtist", "otherArtists"):
                        node = tu.get(key)
                        if isinstance(node, Mapping) and isinstance(node.get("items"), list):
                            combined_tu_artists.extend(node["items"])
                    track_artists = _extract_artists({"items": combined_tu_artists})
                primary_id = track_artists[0]["id"] if track_artists else None
                if primary_id:
                    art_detail = self.get_artist(primary_id)
                    tracks = [t for t in art_detail.get("songs", []) if t["id"] != clean_id]
                    artists = art_detail.get("related", [])
                    q_name = art_detail.get("name") or ""
                    if q_name:
                        playlists = self._search_v2_items(f"This Is {q_name}", "playlists", 6)
            except Exception:
                pass

            if not tracks:
                watch = self.get_watch_playlist(clean_id, None, True, 15)
                tracks = [t for t in watch.get("tracks", []) if t["id"] != clean_id]

            return {
                "videoId": clean_id,
                "tracks": tracks[:20],
                "playlists": playlists[:12],
                "artists": artists[:12],
            }

        return self._cached(f"song_related:{clean_id}", "lagu terkait", _load, ttl_seconds=420)

    def get_podcast(self, podcast_id: str, limit: int = 100) -> Dict[str, Any]:
        clean_id = extract_spotify_id(podcast_id)
        if not clean_id:
            raise MusicProviderError("ID podcast tidak valid.", 400)
        safe_limit = max(1, min(200, int(limit)))

        def _load() -> Dict[str, Any]:
            raw = self._gateway.get_podcast_info(clean_id, limit=min(safe_limit, 100))
            pod = (raw.get("data") or {}).get("podcastUnionV2")
            if not isinstance(pod, Mapping) or pod.get("__typename") == "NotFound":
                raise MusicProviderError("Podcast tidak ditemukan.", 404)

            title = str(pod.get("name") or "Podcast")
            pub_node = pod.get("publisher") if isinstance(pod.get("publisher"), Mapping) else {}
            author = pub_node.get("name") or None
            thumbnail = pick_largest_image(pod.get("coverArt"))
            description = pod.get("description") or None

            ep_items = ((pod.get("episodesV2") or {}).get("items")) or []
            episodes: List[Dict[str, Any]] = []
            for entry in ep_items[:safe_limit]:
                ep = normalize_episode(
                    entry,
                    podcast_id=clean_id,
                    podcast_title=title,
                    fallback_cover=thumbnail,
                )
                if ep:
                    if not thumbnail and ep.get("thumbnail"):
                        thumbnail = ep["thumbnail"]
                    episodes.append({
                        "id": ep["id"],
                        "videoId": ep["id"],
                        "title": ep["title"],
                        "description": ep.get("description"),
                        "duration": ep.get("duration"),
                        "durationSeconds": ep.get("durationSeconds"),
                        "published": ep.get("published"),
                        "thumbnail": ep.get("thumbnail"),
                        "podcastId": clean_id,
                        "podcastTitle": title,
                    })

            return {
                "id": clean_id,
                "title": title,
                "author": author,
                "authorId": None,
                "description": description,
                "thumbnail": thumbnail,
                "episodes": episodes,
            }

        return self._cached(f"podcast:{clean_id}:{safe_limit}", "detail podcast", _load, ttl_seconds=480)

    def get_episode(self, episode_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(episode_id)
        if not clean_id:
            raise MusicProviderError("ID episode tidak valid.", 400)

        def _load() -> Dict[str, Any]:
            raw = self._gateway.get_episode(clean_id)
            ep_node = (raw.get("data") or {}).get("episodeUnionV2")
            if not isinstance(ep_node, Mapping) or ep_node.get("__typename") == "NotFound":
                raise MusicProviderError("Episode tidak ditemukan.", 404)
            ep = normalize_episode(ep_node)
            if not ep:
                raise MusicProviderError("Episode tidak ditemukan.", 404)
            pod_v2 = ep_node.get("podcastV2") if isinstance(ep_node.get("podcastV2"), Mapping) else {}
            pod_data = pod_v2.get("data") if isinstance(pod_v2.get("data"), Mapping) else {}
            pod_title = pod_data.get("name") or None
            return {
                "id": ep["id"],
                "videoId": ep["id"],
                "title": ep["title"],
                "description": ep.get("description"),
                "duration": ep.get("duration"),
                "durationSeconds": ep.get("durationSeconds"),
                "published": ep.get("published"),
                "thumbnail": ep.get("thumbnail"),
                "podcastId": ep.get("podcastId"),
                "podcastTitle": pod_title,
                "author": pod_title,
                "authorId": ep.get("podcastId"),
            }

        return self._cached(f"episode:{clean_id}", "detail episode", _load, ttl_seconds=480)

    def get_channel_episodes(self, channel_id: str, params: str) -> List[Dict[str, Any]]:
        clean_id = extract_spotify_id(channel_id)
        if not clean_id:
            return []
        try:
            pod = self.get_podcast(clean_id, limit=50)
            return [
                {
                    "id": ep["id"],
                    "videoId": ep["id"],
                    "title": ep["title"],
                    "artists": [{"id": clean_id, "name": pod.get("title") or "Podcast"}],
                    "duration": ep.get("duration"),
                    "durationSeconds": ep.get("durationSeconds"),
                    "thumbnail": ep.get("thumbnail"),
                    "type": "episode",
                    "published": ep.get("published"),
                    "podcastId": clean_id,
                }
                for ep in pod.get("episodes", [])
            ]
        except Exception:
            return []

    def get_account_status(self) -> Dict[str, Any]:
        return self._gateway.get_account_status()

    def import_account_cookies(
        self,
        identifier: str,
        cookies: Any,
        *,
        verify: bool = True,
    ) -> Dict[str, Any]:
        self._gateway.import_cookies(identifier, cookies, verify=verify)
        self._cache.clear()
        return self._gateway.get_account_status()

    def get_account_library(self) -> Dict[str, Any]:
        empty = {
            "likedSongs": [],
            "playlists": [],
            "albums": [],
            "artists": [],
            "subscriptions": [],
            "history": [],
        }
        try:
            raw = self._gateway.get_account_library_raw()
        except Exception:
            return empty
        if not raw:
            return empty

        liked_songs: List[Dict[str, Any]] = []
        saved_items = ((((raw.get("saved_tracks") or {}).get("data") or {}).get("me") or {}).get("library") or {}).get("tracks", {}).get("items") or []
        for entry in saved_items:
            track_node = (entry.get("track") or {}) if isinstance(entry, Mapping) else {}
            norm = normalize_track(track_node)
            if norm:
                liked_songs.append(norm)

        playlists: List[Dict[str, Any]] = []
        albums: List[Dict[str, Any]] = []
        artists: List[Dict[str, Any]] = []
        subscriptions: List[Dict[str, Any]] = []

        lib_items = ((((raw.get("library") or {}).get("data") or {}).get("me") or {}).get("libraryV3") or {}).get("items") or []
        for entry in lib_items:
            if not isinstance(entry, Mapping):
                continue
            item_data = ((entry.get("item") or {}).get("data") or {})
            typename = item_data.get("__typename")
            if typename == "Playlist":
                pl = normalize_playlist(item_data)
                if pl:
                    playlists.append(pl)
            elif typename == "Album":
                alb = normalize_album(item_data)
                if alb:
                    albums.append(alb)
            elif typename == "Artist":
                art = normalize_artist(item_data)
                if art:
                    artists.append(art)
            elif typename == "Podcast":
                pod = normalize_podcast(item_data)
                if pod:
                    subscriptions.append(pod)

        return {
            "likedSongs": liked_songs,
            "playlists": playlists,
            "albums": albums,
            "artists": artists,
            "subscriptions": subscriptions,
            "history": [],
        }

    def account_rate(self, video_id: str, rating: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(video_id)
        if not clean_id or rating.upper() != "LIKE":
            return {"synced": False, "reason": "local_mode"}
        try:
            synced = self._gateway.like_song(clean_id)
            return {"synced": synced} if synced else {"synced": False, "reason": "local_mode"}
        except Exception:
            return {"synced": False, "reason": "sync_failed"}

    def account_create_playlist(
        self,
        title: str,
        description: str = "",
        video_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        clean_ids = [x for x in (extract_spotify_id(v) for v in (video_ids or [])) if x]
        try:
            pl_id = self._gateway.create_playlist(title, clean_ids)
            if not pl_id:
                return {"synced": False, "reason": "local_mode"}
            return {"synced": True, "playlistId": pl_id}
        except Exception:
            return {"synced": False, "reason": "sync_failed"}

    def account_add_playlist_items(self, playlist_id: str, video_ids: List[str]) -> Dict[str, Any]:
        clean_pl = extract_spotify_id(playlist_id)
        clean_ids = [x for x in (extract_spotify_id(v) for v in video_ids) if x]
        if not clean_pl or not clean_ids:
            return {"synced": False, "reason": "invalid_input"}
        try:
            synced = self._gateway.add_playlist_items(clean_pl, clean_ids)
            return {"synced": synced} if synced else {"synced": False, "reason": "local_mode"}
        except Exception:
            return {"synced": False, "reason": "sync_failed"}

    def account_subscribe(self, channel_ids: List[str], subscribe: bool = True) -> Dict[str, Any]:
        clean_ids = [x for x in (extract_spotify_id(c) for c in channel_ids) if x]
        if not clean_ids:
            return {"synced": False, "reason": "invalid_input"}
        try:
            any_synced = False
            for cid in clean_ids:
                if self._gateway.follow_artist(cid, subscribe=subscribe):
                    any_synced = True
            return {"synced": True} if any_synced else {"synced": False, "reason": "local_mode"}
        except Exception:
            return {"synced": False, "reason": "sync_failed"}

    def extract_artwork_color(self, image_url: str) -> Dict[str, Any]:
        try:
            parsed = urlparse(image_url)
        except Exception as exc:
            raise MusicProviderError("URL gambar tidak valid.", 400) from exc

        if parsed.scheme not in ("http", "https") or parsed.hostname not in ALLOWED_ARTWORK_HOSTS:
            raise MusicProviderError("URL gambar tidak diizinkan.", 400)

        cache_key = f"artcolor:{image_url}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        fallback = {"r": 22, "g": 48, "b": 40, "hex": "#163028"}
        try:
            resp = self._http_get(image_url, timeout=8)
            status = getattr(resp, "status_code", 200)
            if status >= 400:
                return fallback
            content = getattr(resp, "content", b"")
            img = Image.open(io.BytesIO(content)).convert("RGB")
            img.thumbnail((64, 64))
            pixels = list(img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata())
            if not pixels:
                return fallback

            all_samples: List[Tuple[int, int, int]] = []
            vibrant_samples: List[Tuple[int, int, int]] = []
            for r, g, b in pixels:
                all_samples.append((r, g, b))
                mean = (r + g + b) / 3.0
                chroma = max(r, g, b) - min(r, g, b)
                if 28 <= mean <= 220 and chroma >= 18:
                    vibrant_samples.append((r, g, b))

            pool = vibrant_samples if len(vibrant_samples) >= 16 else all_samples
            avg_r = int(sum(p[0] for p in pool) / len(pool))
            avg_g = int(sum(p[1] for p in pool) / len(pool))
            avg_b = int(sum(p[2] for p in pool) / len(pool))

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

            result = {
                "r": avg_r,
                "g": avg_g,
                "b": avg_b,
                "hex": f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}",
            }
            self._cache.set(cache_key, result, ttl_seconds=600)
            return result
        except Exception:
            return fallback

    def resolve_playable_youtube(
        self,
        track_id: str,
        *,
        title: str = "",
        artist: str = "",
        item_type: str = "song",
        duration_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        raw_id = (track_id or "").strip()
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", raw_id):
            return {"id": raw_id, "youtubeVideoId": raw_id, "candidates": [raw_id]}

        clean_id = extract_spotify_id(raw_id) or raw_id
        clean_title = (title or "").strip()
        clean_artist = (artist or "").strip()
        if clean_artist.lower() == "artis tidak diketahui":
            clean_artist = ""

        cache_key = f"ytresolve:{clean_id}:{clean_title.lower()}:{clean_artist.lower()}:{item_type}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if not clean_title and clean_id:
            try:
                if item_type == "episode":
                    ep_detail = self.get_episode(clean_id)
                    clean_title = str(ep_detail.get("title") or "").strip()
                    clean_artist = str(ep_detail.get("podcastTitle") or "").strip()
                else:
                    info = self._gateway.get_track_info(clean_id)
                    tu = (info.get("data") or {}).get("trackUnion") or {}
                    clean_title = str(tu.get("name") or "").strip()
                    art_list = _extract_artists(tu.get("artists"))
                    if not art_list:
                        combined: List[Any] = []
                        for key in ("firstArtist", "otherArtists"):
                            node = tu.get(key)
                            if isinstance(node, Mapping) and isinstance(node.get("items"), list):
                                combined.extend(node["items"])
                        art_list = _extract_artists({"items": combined})
                    if art_list:
                        clean_artist = ", ".join(a["name"] for a in art_list if a.get("name"))
            except Exception:
                pass

        if not clean_title and not clean_artist:
            raise MusicProviderError("Informasi lagu tidak cukup untuk diputar.", 400)

        def _parse_yt_length(text: str) -> Optional[int]:
            parts = [p for p in (text or "").strip().split(":") if p.isdigit()]
            if not parts:
                return None
            total = 0
            for p in parts:
                total = total * 60 + int(p)
            return total

        def _fetch_candidates(search_q: str) -> List[Tuple[int, str]]:
            resp = self._http_get(
                "https://www.youtube.com/results",
                params={"search_query": search_q},
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                    ),
                    "Accept-Language": "en-US,en;q=0.9",
                },
                timeout=10,
            )
            html = getattr(resp, "text", "") or ""
            m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.DOTALL)
            scored: List[Tuple[int, str]] = []
            seen_vids: set[str] = set()

            if m:
                try:
                    data = json.loads(m.group(1))
                except Exception:
                    data = {}
                sections = (
                    data.get("contents", {})
                    .get("twoColumnSearchResultsRenderer", {})
                    .get("primaryContents", {})
                    .get("sectionListRenderer", {})
                    .get("contents", [])
                )
                title_lower = clean_title.lower()
                artist_tokens = [tok.strip().lower() for tok in re.split(r"[,&]", clean_artist) if tok.strip()]

                for sec in sections:
                    for item in (sec.get("itemSectionRenderer") or {}).get("contents", []) or []:
                        vr = item.get("videoRenderer")
                        if not isinstance(vr, Mapping):
                            continue
                        vid = vr.get("videoId")
                        if not isinstance(vid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
                            continue
                        if vid in seen_vids:
                            continue
                        length_text = ((vr.get("lengthText") or {}).get("simpleText")) or ""
                        dur_sec = _parse_yt_length(length_text)
                        if dur_sec is None or dur_sec < 15:
                            continue
                        if item_type != "episode" and dur_sec > 900:
                            # Skip long full-album / 1-hour compilation mixes for single songs
                            continue

                        vtitle = "".join(r.get("text", "") for r in (vr.get("title") or {}).get("runs", [])).lower()
                        chan = "".join(r.get("text", "") for r in (vr.get("ownerText") or {}).get("runs", [])).lower()

                        score = 0
                        if title_lower and title_lower in vtitle:
                            score += 30
                        if any(tok in vtitle or tok in chan for tok in artist_tokens):
                            score += 20
                        if "official audio" in vtitle or "official lyric" in vtitle or "topic" in chan:
                            score += 18
                        elif "official music video" in vtitle or "official video" in vtitle or "lyrics" in vtitle:
                            score += 10
                        if any(bad in vtitle for bad in ("full album", "playlist", "compilation", "kompilasi", "1 jam", "sped up", "slowed", "karaoke", "reaction")):
                            score -= 40
                        if duration_seconds and duration_seconds > 0:
                            diff = abs(dur_sec - duration_seconds)
                            if diff <= 15:
                                score += 15
                            elif diff <= 45:
                                score += 6
                            elif diff > 180:
                                score -= 20

                        seen_vids.add(vid)
                        scored.append((score, vid))

            if not scored:
                for vid in re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', html):
                    if vid not in seen_vids:
                        seen_vids.add(vid)
                        scored.append((0, vid))
                        if len(scored) >= 6:
                            break

            scored.sort(key=lambda pair: pair[0], reverse=True)
            return scored

        primary_artist = re.split(r"[,&]", clean_artist)[0].strip() if clean_artist else ""
        if item_type == "episode":
            queries = [
                f"{clean_title} {primary_artist or clean_artist} podcast".strip(),
                f"{clean_title} {clean_artist}".strip(),
            ]
        else:
            queries = [
                f"{primary_artist or clean_artist} {clean_title} official audio".strip(),
                f"{clean_artist} {clean_title}".strip(),
            ]

        candidates: List[str] = []
        for q in dict.fromkeys(q for q in queries if q):
            try:
                ranked = _fetch_candidates(q)
                for _, vid in ranked:
                    if vid not in candidates:
                        candidates.append(vid)
                    if len(candidates) >= 6:
                        break
            except Exception:
                continue
            if len(candidates) >= 3:
                break

        if not candidates:
            raise MusicProviderError("Tidak dapat menemukan sumber audio yang dapat diputar.", 404)

        result = {
            "id": clean_id,
            "youtubeVideoId": candidates[0],
            "candidates": candidates,
        }
        self._cache.set(cache_key, result, ttl_seconds=21600)
        return result

    def get_track_preview_url(self, track_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(track_id)
        if not clean_id:
            raise MusicProviderError("ID lagu tidak valid.", 400)

        cache_key = f"spotpreview:{clean_id}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        preview_url: Optional[str] = None
        try:
            resp = self._http_get(
                f"https://open.spotify.com/embed/track/{clean_id}",
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=8,
            )
            html = getattr(resp, "text", "") or ""
            m = re.search(r"https://p\.scdn\.co/mp3-preview/[A-Za-z0-9_-]+(?:\?[^\"'\\< ]*)?", html)
            if m:
                preview_url = m.group(0)
        except Exception:
            preview_url = None

        if not preview_url:
            raise MusicProviderError("Pratinjau audio tidak tersedia untuk lagu ini.", 404)

        result = {"id": clean_id, "previewUrl": preview_url}
        self._cache.set(cache_key, result, ttl_seconds=21600)
        return result

    def _probe_direct_stream(self, url: str) -> Dict[str, Any]:
        cache_key = f"streamprobe:{url}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        headers = {
            "User-Agent": "Mozilla/5.0",
            "Range": "bytes=0-16383",
            "Origin": "http://localhost:3000",
        }
        try:
            resp = self._http_get(url, headers=headers, timeout=8)
            status = getattr(resp, "status_code", 200)
            if status >= 400:
                raise MusicProviderError("Stream sumber tidak dapat diakses.", 502)
            resp_headers = {str(k).lower(): str(v) for k, v in (getattr(resp, "headers", None) or {}).items()}
            acao = resp_headers.get("access-control-allow-origin", "").strip()
            cors_supported = acao == "*" or "localhost" in acao
            content_type = resp_headers.get("content-type", "")
            content_length: Optional[int] = None
            content_range = resp_headers.get("content-range", "")
            if "/" in content_range:
                total_part = content_range.split("/")[-1].strip()
                if total_part.isdigit():
                    content_length = int(total_part)
            elif resp_headers.get("content-length", "").isdigit():
                content_length = int(resp_headers["content-length"])
            raw_bytes = getattr(resp, "content", b"") or b""
            meta = probe_audio_stream_metadata(
                raw_bytes,
                content_type=content_type,
                url=url,
                content_length=content_length,
            )
            meta["corsSupported"] = cors_supported
            meta["contentType"] = content_type.split(";", 1)[0].strip() or "audio/mpeg"
            self._cache.set(cache_key, meta, ttl_seconds=3600)
            return meta
        except MusicProviderError:
            raise
        except Exception:
            fallback = {
                "codec": "MP3" if "mp3" in url.lower() else "Audio",
                "bitrateKbps": 128 if "mp3-preview" in url.lower() else None,
                "sampleRateHz": 44100 if "mp3-preview" in url.lower() else None,
                "bitDepth": None,
                "lossless": False,
                "hiRes": False,
                "contentLength": None,
                "corsSupported": False,
                "contentType": "audio/mpeg",
            }
            return fallback

    def get_stream_options(self, track_id: str) -> Dict[str, Any]:
        clean_id = extract_spotify_id(track_id) or (track_id or "").strip()
        if not clean_id:
            raise MusicProviderError("ID lagu tidak valid.", 400)

        cache_key = f"streamopts:{clean_id}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        discovered_sources: Dict[str, Dict[str, Any]] = {}

        # Discover real preview stream from Spotify embed endpoint if not a bare YouTube video ID
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", clean_id):
            try:
                preview_info = self.get_track_preview_url(clean_id)
                preview_url = preview_info.get("previewUrl")
                if isinstance(preview_url, str) and preview_url:
                    probed = self._probe_direct_stream(preview_url)
                    tier_id = classify_stream_tier(probed)
                    proxy_url = f"/api/stream/{clean_id}?tier={tier_id}"
                    discovered_sources[tier_id] = {
                        "rawUrl": preview_url,
                        "streamUrl": preview_url if probed.get("corsSupported") else proxy_url,
                        "proxyUrl": proxy_url,
                        "corsSupported": bool(probed.get("corsSupported")),
                        "codec": probed.get("codec"),
                        "bitrateKbps": probed.get("bitrateKbps"),
                        "sampleRateHz": probed.get("sampleRateHz"),
                        "bitDepth": probed.get("bitDepth"),
                        "lossless": bool(probed.get("lossless")),
                        "hiRes": bool(probed.get("hiRes")),
                        "contentType": probed.get("contentType") or "audio/mpeg",
                        "isPreview": True,
                    }
            except MusicProviderError:
                pass

        options: List[Dict[str, Any]] = []
        for tier_id, label in STREAM_TIER_ORDER:
            src = discovered_sources.get(tier_id)
            if src:
                options.append(
                    {
                        "tier": tier_id,
                        "label": label,
                        "available": True,
                        "unavailableReason": None,
                        "codec": src["codec"],
                        "bitrateKbps": src["bitrateKbps"],
                        "sampleRateHz": src["sampleRateHz"],
                        "bitDepth": src["bitDepth"],
                        "lossless": src["lossless"],
                        "hiRes": src["hiRes"],
                        "corsSupported": src["corsSupported"],
                        "streamUrl": src["streamUrl"],
                        "proxyUrl": src["proxyUrl"],
                        "rawUrl": src["rawUrl"],
                        "isPreview": bool(src.get("isPreview")),
                    }
                )
            else:
                options.append(
                    {
                        "tier": tier_id,
                        "label": label,
                        "available": False,
                        "unavailableReason": "Tidak tersedia untuk lagu ini",
                        "codec": None,
                        "bitrateKbps": None,
                        "sampleRateHz": None,
                        "bitDepth": None,
                        "lossless": False,
                        "hiRes": False,
                        "corsSupported": False,
                        "streamUrl": None,
                        "proxyUrl": None,
                        "rawUrl": None,
                        "isPreview": False,
                    }
                )

        # Commercial streaming previews / YouTube embeds do not carry audiodownload_allowed permission
        result = {
            "trackId": clean_id,
            "audiodownload_allowed": False,
            "downloadDisabledReason": "Sumber lagu ini tidak mengizinkan unduhan offline (audiodownload_allowed = false).",
            "replayGainDb": None,
            "youtubeFallbackAvailable": True,
            "options": options,
        }
        self._cache.set(cache_key, result, ttl_seconds=1800)
        return result

    def open_audio_stream(
        self,
        track_id: str,
        *,
        tier: Optional[str] = None,
        range_header: Optional[str] = None,
    ) -> Tuple[int, Dict[str, str], Iterator[bytes]]:
        opts = self.get_stream_options(track_id)
        available_opts = [o for o in opts.get("options", []) if o.get("available") and o.get("rawUrl")]
        if not available_opts:
            raise MusicProviderError("Stream audio langsung tidak tersedia untuk lagu ini.", 404)

        chosen = next((o for o in available_opts if o["tier"] == tier), None) or available_opts[0]
        raw_url = str(chosen["rawUrl"])
        parsed = urlparse(raw_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise MusicProviderError("URL stream tidak valid.", 400)

        req_headers: Dict[str, str] = {"User-Agent": "Mozilla/5.0"}
        if range_header:
            req_headers["Range"] = range_header

        try:
            upstream = self._http_get(raw_url, headers=req_headers, stream=True, timeout=20)
        except Exception as exc:
            raise MusicProviderError(f"Gagal mengunduh stream audio: {exc}", 502) from exc

        status = int(getattr(upstream, "status_code", 200))
        if status >= 400:
            raise MusicProviderError(f"Upstream stream mengembalikan status {status}.", 502 if status >= 500 else status)

        up_headers = {str(k).lower(): str(v) for k, v in (getattr(upstream, "headers", None) or {}).items()}
        out_headers: Dict[str, str] = {
            "Content-Type": up_headers.get("content-type", "audio/mpeg"),
            "Accept-Ranges": up_headers.get("accept-ranges", "bytes"),
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
            "Cache-Control": "public, max-age=1800",
        }
        if "content-length" in up_headers:
            out_headers["Content-Length"] = up_headers["content-length"]
        if "content-range" in up_headers:
            out_headers["Content-Range"] = up_headers["content-range"]

        def _iter_chunks() -> Iterator[bytes]:
            try:
                if hasattr(upstream, "iter_content"):
                    for chunk in upstream.iter_content(chunk_size=32768):
                        if chunk:
                            yield chunk
                else:
                    raw_content = getattr(upstream, "content", b"")
                    if raw_content:
                        yield raw_content
            finally:
                close_fn = getattr(upstream, "close", None)
                if callable(close_fn):
                    close_fn()

        return status, out_headers, _iter_chunks()

    def _active_account_settings_key(self) -> str:
        status = self.get_account_status()
        if status.get("authenticated"):
            return "ytmusic"
        return "local"

    def get_audio_settings(self, account_key: Optional[str] = None) -> Dict[str, Any]:
        key = account_key or self._active_account_settings_key()
        stored = self._audio_settings_store.get(key)
        return {"accountKey": key, "settings": stored}

    def save_audio_settings(
        self,
        settings: Mapping[str, Any],
        *,
        account_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not isinstance(settings, Mapping):
            raise MusicProviderError("Format pengaturan audio tidak valid.", 400)
        key = account_key or self._active_account_settings_key()
        saved = self._audio_settings_store.save(key, settings)
        return {"accountKey": key, "settings": saved}

    def reset_audio_settings(self, account_key: Optional[str] = None) -> Dict[str, Any]:
        key = account_key or self._active_account_settings_key()
        self._audio_settings_store.delete(key)
        return {"accountKey": key, "settings": None}



