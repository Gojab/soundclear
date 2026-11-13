from __future__ import annotations

import html
import io
import json
import os
import random
import re
import threading
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple, TypeVar
from urllib.parse import urlparse

import requests
from PIL import Image
from ytmusicapi import YTMusic
from ytmusicapi.exceptions import (
    YTMusicError,
    YTMusicGatedError,
    YTMusicServerError,
    YTMusicUserError,
)

T = TypeVar("T")

ALLOWED_ARTWORK_HOSTS = {
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
    "lh4.googleusercontent.com",
    "lh5.googleusercontent.com",
    "lh6.googleusercontent.com",
    "i.ytimg.com",
    "i9.ytimg.com",
    "s.ytimg.com",
    "yt3.ggpht.com",
    "music.youtube.com",
    "i.scdn.co",
    "image-cdn-ak.spotifycdn.com",
    "mosaic.scdn.co",
}

CJK_HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
JAPANESE_KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]")
KOREAN_HANGUL_RE = re.compile(r"[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]")
INDIC_SCRIPT_RE = re.compile(r"[\u0900-\u0d7f]")
MANDARIN_KEYWORD_RE = re.compile(
    r"\b(?:mandarin|mandopop|cantopop|c-?pop|chinese|zhongwen|hokkien|guoyu|taiwanese)\b",
    re.IGNORECASE,
)
JAPANESE_KEYWORD_RE = re.compile(
    r"\b(?:j-?pop|j-?rock|j-?rap|j-?indie|j-?metal|japanese|nihon|nippon|japan|"
    r"anisong|vocaloid|hatsune\s*miku|city\s*pop|enka|shibuya-?kei|touhou|hololive|nijisanji|"
    r"anime\s+(?:ost|song|opening|ending|op|ed|theme)|"
    r"yoasobi|ado|fujii\s*kaze|kenshi\s*yonezu|radwimps|official\s*hige\s*dandism|king\s*gnu|"
    r"mrs\.?\s*green\s*apple|vaundy|creepy\s*nuts|aimyon|yorushika|zutomayo|aimer|milet|"
    r"utada\s*hikaru|one\s*ok\s*rock|babymetal|kis-?my-?ft2|hey!\s*say!\s*jump|"
    r"jinto\s*yoshida|snow\s*man|sixtones|naniwa\s*danshi|arashi|number_i|travis\s*japan|"
    r"be:first|nogizaka46|sakurazaka46|hinatazaka46|akb48|ske48|nmb48|hkt48|"
    r"atarashii\s*gakko|kyary\s*pamyu\s*pamyu|sekai\s*no\s*owari|back\s*number|"
    r"bump\s*of\s*chicken|kana-?boon|asian\s*kung-?fu\s*generation|my\s*first\s*story|"
    r"man\s*with\s*a\s*mission|uverworld|spyair|l'arc~?en~?ciel|x\s*japan|sakanaction|"
    r"hoshino\s*gen|gen\s*hoshino|masaki\s*suda|tatsuya\s*kitani|natori|yuuri|imase|"
    r"hoshimachi\s*suisei|mafumafu|soraru|syudou|kairiki\s*bear|deco\*?27|pinocchiop|"
    r"inabakumori|millennium\s*parade|sheena\s*ringo|shiina\s*ringo|joe\s*hisaishi|"
    r"hiroyuki\s*sawano|yuki\s*kajiura|yoko\s*kanno|ryuichi\s*sakamoto|miki\s*matsubara|"
    r"mariya\s*takeuchi|tatsuro\s*yamashita|taeko\s*onuki|ichiko\s*aoba|haruomi\s*hosono|"
    r"kaneko\s*ayano|saucy\s*dog|macaroni\s*empitsu|wagakkiband|namie\s*amuro|"
    r"ayumi\s*hamasaki|koda\s*kumi|mika\s*nakashima|ai\s*otsuka|suiatsu|"
    r"ai\s+no\s+katachi|yoru\s+ni\s+kakeru|kaibutsu|gurenge|zankyou\s+sanka|"
    r"shinunoga\s+e-?wa|odoriko|hakujitsu|sayonara|arigatou|aishiteru|daisuki|"
    r"watashi\s+no|kimi\s+no|anata\s+no|boku\s+no|ai\s+no|koi\s+no|kokoro|shiawase|"
    r"kanashimi|yoru\s+ni|seishun|kanojo|kareshi|tomodachi|natsukashii|"
    r"japanese\s+ver\.?|jp\s+ver\.?|nihongo|komorebi|taiyou|hanabi|matsuri)\b",
    re.IGNORECASE,
)
INDIAN_KEYWORD_RE = re.compile(
    r"\b(?:india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|punjabi|hindi|tamil|"
    r"telugu|malayalam|kannada|bhojpuri|marathi|gujarati|bengali|hindustani|carnatic|bhangra|"
    r"ghazal|qawwali|bhajan|desi|i-?pop|t-?series|zee\s*music|saregama|sony\s*music\s*india|"
    r"yrf|tips\s*official|speed\s*records|eros\s*now|desimelodies|white\s*hill\s*music|"
    r"udit\s*narayan|arijit\s*singh|arjit\s*singh|shreya\s*ghoshal|alka\s*ynik|alka\s*yagnik|kumar\s*sanu|"
    r"lata\s*mangeshkar|kishore\s*kumar|sonu\s*nigam|a\.?\s*r\.?\s*rahman|diljit\s*dosanjh|"
    r"sidhu\s*moose\s*wala|ap\s*dhillon|anirudh\s*ravichander|neha\s*kakkar|jubin\s*nautiyal|"
    r"atif\s*aslam|sunidhi\s*chauhan|asha\s*bhosle|mohammed\s*rafi|ilayaraja|sp\s*balasubrahmanyam|"
    r"rito\s*riba|siddhant\s*kaushal|badshah|honey\s*singh|guru\s*randhawa|armaan\s*malik|"
    r"darshan\s*raval|vishal\s*mishra|b\s*praak|tanishk\s*bagchi|pritam|mithoon|"
    r"sachet\s*tandon|shankar\s*mahadevan|kailash\s*kher|rahat\s*fateh\s*ali\s*khan|"
    r"nusrat\s*fateh\s*ali\s*khan|mohit\s*chauhan|himesh\s*reshammiya|mika\s*singh|"
    r"sukhwinder\s*singh|karan\s*aujla|shubh|talwinder|anuv\s*jain|prateek\s*kuhad|"
    r"emiway\s*bantai|mc\s*stan|harrdy\s*sandhu|jass\s*manak|ammy\s*virk|parmish\s*verma|"
    r"satinder\s*sartaaj|nimrat\s*khaira|sunanda\s*sharma|tulsi\s*kumar|dhvani\s*bhanushali|"
    r"palak\s*muchhal|jonita\s*gandhi|shilpa\s*rao|kanika\s*kapoor|jasleen\s*royal|"
    r"rekha\s*bhardwaj|kavita\s*krishnamurthy|salim-?sulaiman|amit\s*trivedi|vishal-?shekhar|"
    r"sachin-?jigar|devi\s*sri\s*prasad|yuvan\s*shankar\s*raja|santhosh\s*narayanan|"
    r"harris\s*jayaraj|sid\s*sriram|stebin\s*ben|asees\s*kaur|tony\s*kakkar|"
    r"raghav\s*chaitanya|arjan\s*dhillon|babbu\s*maan|gurdas\s*maan|daler\s*mehndi|"
    r"dilruba|dilnasheen|ishq|pyaar|pyar|mohabbat|zindagi|aashiq|ashiqui|deewana|bewafa|"
    r"judai|tanhai|khwab|musafir|barsaat|mehndi|sangeet|balam|sajna|sajni|rabba|maula|"
    r"yaara|heeriye|sohniye|soniye|channa\s+mereya|"
    r"(?:tera|mera)\s+(?:yaar|naam|ishq|pyaar|dil|chehra|nasha|fitoor)|"
    r"(?:tum|hum)\s+(?:hi|se|ko|bin|mile|safar|tum)|"
    r"dil\s+(?:se|ko|mein|ne|ke|ka|ki|bara|galti|chori|de|diya)|"
    r"ae\s+dil|o\s+sajna|o\s+maahi|tu\s+(?:hi|jaane|mera|hai|mere)|kaise\s+hua|"
    r"kuch\s+kuch|kabhi\s+(?:khushi|alvida))\b",
    re.IGNORECASE,
)
YEAR_RE = re.compile(r"(19|20)\d{2}")
HTML_TAG_RE = re.compile(r"<[^>]+>")
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
GOOGLEUSERCONTENT_WH_RE = re.compile(r"=w(\d+)-h(\d+)([^?&#]*)")
GOOGLEUSERCONTENT_S_RE = re.compile(r"=s(\d+)([^?&#]*)")
BRAND_TERM_RE = re.compile(r"\b(?:youtube\s*music|youtube|yt\s*music|spotify|spotapi)\b", re.IGNORECASE)


def sanitize_brand_name(name: Optional[str], fallback: Optional[str] = None) -> Optional[str]:
    if not isinstance(name, str) or not name.strip():
        return fallback
    clean = name.strip()
    if BRAND_TERM_RE.search(clean):
        replaced = BRAND_TERM_RE.sub("SoundClear", clean).strip()
        return replaced or (fallback or "SoundClear")
    return clean


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


def clean_html_text(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    stripped = HTML_TAG_RE.sub("", value)
    decoded = html.unescape(stripped).strip()
    return decoded or None


SPACED_LETTERS_RE = re.compile(r"(?:\b[A-Za-z]\s+){2,}[A-Za-z]\b")


def _collapse_spaced_letters(text: str) -> str:
    return SPACED_LETTERS_RE.sub(lambda m: re.sub(r"\s+", "", m.group(0)), text)


def _is_excluded_regional_text(text: str) -> bool:
    if not text:
        return False
    if INDIC_SCRIPT_RE.search(text):
        return True
    if JAPANESE_KANA_RE.search(text):
        return True
    collapsed = _collapse_spaced_letters(text)
    for candidate in (text, collapsed) if collapsed != text else (text,):
        if INDIAN_KEYWORD_RE.search(candidate):
            return True
        if JAPANESE_KEYWORD_RE.search(candidate):
            return True
        if MANDARIN_KEYWORD_RE.search(candidate):
            return True
    if CJK_HAN_RE.search(text) and not KOREAN_HANGUL_RE.search(text):
        return True
    return False


def _is_indian_or_mandarin_text(text: str) -> bool:
    return _is_excluded_regional_text(text)


def _is_excluded_catalog_item(item: Mapping[str, Any]) -> bool:
    parts = [str(item.get("title") or "")]
    for artist in item.get("artists") or []:
        if isinstance(artist, Mapping) and artist.get("name"):
            parts.append(str(artist["name"]))
    album = item.get("album")
    if isinstance(album, Mapping) and album.get("name"):
        parts.append(str(album["name"]))
    desc = item.get("description")
    if isinstance(desc, str) and desc:
        parts.append(desc)
    return _is_excluded_regional_text(" ".join(parts))


def _is_excluded_home_item(item: Mapping[str, Any]) -> bool:
    return _is_excluded_catalog_item(item)


def upgrade_thumbnail_url(url: Optional[str]) -> Optional[str]:
    if not url or not isinstance(url, str):
        return None
    clean = url.strip()
    if not clean:
        return None
    if clean.startswith("//"):
        clean = f"https:{clean}"

    parsed = urlparse(clean)
    host = (parsed.hostname or "").lower()
    if host.endswith("googleusercontent.com") or host.endswith("ggpht.com"):
        m_wh = GOOGLEUSERCONTENT_WH_RE.search(clean)
        if m_wh:
            w, h = int(m_wh.group(1)), int(m_wh.group(2))
            if w < 544 or h < 544:
                clean = GOOGLEUSERCONTENT_WH_RE.sub("=w544-h544-l90-rj", clean, count=1)
        else:
            m_s = GOOGLEUSERCONTENT_S_RE.search(clean)
            if m_s and int(m_s.group(1)) < 544:
                clean = GOOGLEUSERCONTENT_S_RE.sub("=s544", clean, count=1)
    return clean


def pick_largest_thumbnail(
    node: Any,
    fallback: Optional[str] = None,
) -> Optional[str]:
    if not node:
        return upgrade_thumbnail_url(fallback)

    candidates: List[Mapping[str, Any]] = []
    if isinstance(node, list):
        for entry in node:
            if isinstance(entry, Mapping) and entry.get("url"):
                candidates.append(entry)
    elif isinstance(node, Mapping):
        if isinstance(node.get("thumbnails"), list):
            return pick_largest_thumbnail(node["thumbnails"], fallback=fallback)
        if isinstance(node.get("thumbnail"), list):
            return pick_largest_thumbnail(node["thumbnail"], fallback=fallback)
        if node.get("url"):
            candidates.append(node)
    elif isinstance(node, str):
        return upgrade_thumbnail_url(node)

    best_url: Optional[str] = None
    best_area = -1
    for item in candidates:
        url = item.get("url")
        if not isinstance(url, str) or not url.strip():
            continue
        try:
            area = int(item.get("width") or 0) * int(item.get("height") or 0)
        except (TypeError, ValueError):
            area = 0
        if area >= best_area:
            best_area = area
            best_url = url

    return upgrade_thumbnail_url(best_url or fallback)


def parse_duration_seconds(duration_str: Optional[str], duration_seconds: Any = None) -> Tuple[Optional[str], Optional[int]]:
    sec_val: Optional[int] = None
    if duration_seconds is not None:
        try:
            parsed = int(round(float(duration_seconds)))
            if parsed > 0:
                sec_val = parsed
        except (TypeError, ValueError):
            sec_val = None

    clean_str = duration_str.strip() if isinstance(duration_str, str) and duration_str.strip() else None
    if clean_str and sec_val is None:
        parts = clean_str.split(":")
        if all(p.isdigit() for p in parts):
            nums = [int(p) for p in parts]
            if len(nums) == 2:
                sec_val = nums[0] * 60 + nums[1]
            elif len(nums) == 3:
                sec_val = nums[0] * 3600 + nums[1] * 60 + nums[2]

    if not clean_str and sec_val is not None:
        hrs = sec_val // 3600
        mins = (sec_val % 3600) // 60
        secs = sec_val % 60
        clean_str = f"{hrs}:{mins:02d}:{secs:02d}" if hrs > 0 else f"{mins}:{secs:02d}"

    return clean_str, sec_val


def _normalize_artists(raw_artists: Any, fallback_author: Any = None) -> List[Dict[str, Optional[str]]]:
    result: List[Dict[str, Optional[str]]] = []
    if isinstance(raw_artists, list):
        for entry in raw_artists:
            if isinstance(entry, Mapping):
                name = sanitize_brand_name(entry.get("name"))
                if name:
                    art_id = entry.get("id")
                    result.append(
                        {
                            "id": str(art_id).strip() if isinstance(art_id, str) and art_id.strip() else None,
                            "name": name,
                        }
                    )
            elif isinstance(entry, str) and entry.strip():
                clean_name = sanitize_brand_name(entry)
                if clean_name:
                    result.append({"id": None, "name": clean_name})
    elif isinstance(raw_artists, Mapping):
        name = sanitize_brand_name(raw_artists.get("name"))
        if name:
            art_id = raw_artists.get("id")
            result.append(
                {
                    "id": str(art_id).strip() if isinstance(art_id, str) and art_id.strip() else None,
                    "name": name,
                }
            )
    elif isinstance(raw_artists, str) and raw_artists.strip():
        clean_name = sanitize_brand_name(raw_artists)
        if clean_name:
            result.append({"id": None, "name": clean_name})

    if not result and fallback_author is not None:
        return _normalize_artists(fallback_author)
    return result


def _normalize_album_ref(raw_album: Any, fallback_album: Optional[Dict[str, Optional[str]]] = None) -> Optional[Dict[str, Optional[str]]]:
    if isinstance(raw_album, Mapping):
        name = raw_album.get("name")
        if isinstance(name, str) and name.strip():
            alb_id = raw_album.get("id")
            return {
                "id": str(alb_id).strip() if isinstance(alb_id, str) and alb_id.strip() else None,
                "name": name.strip(),
            }
    elif isinstance(raw_album, str) and raw_album.strip():
        if fallback_album and fallback_album.get("name") == raw_album.strip():
            return fallback_album
        return {
            "id": fallback_album.get("id") if fallback_album else None,
            "name": raw_album.strip(),
        }
    return fallback_album


def _extract_year(raw: Any) -> Optional[str]:
    if isinstance(raw, (int, float)):
        s = str(int(raw))
        return s if YEAR_RE.fullmatch(s) else None
    if isinstance(raw, str):
        m = YEAR_RE.search(raw)
        return m.group(0) if m else None
    return None


def _clean_playlist_id(playlist_id: str) -> str:
    raw = (playlist_id or "").strip()
    if raw.startswith("VL") and len(raw) > 4:
        return raw[2:]
    return raw


def normalize_yt_item(
    raw: Any,
    *,
    default_type: Optional[str] = None,
    fallback_artists: Optional[List[Dict[str, Optional[str]]]] = None,
    fallback_album: Optional[Dict[str, Optional[str]]] = None,
    fallback_thumbnail: Optional[str] = None,
    fallback_year: Optional[str] = None,
    podcast_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, Mapping):
        return None

    res_type = str(raw.get("resultType") or "").lower().strip()
    title = raw.get("title") or raw.get("name")
    if (not isinstance(title, str) or not title.strip()) and (
        res_type == "artist" or default_type == "artist"
    ):
        raw_artist = raw.get("artist")
        if isinstance(raw_artist, str) and raw_artist.strip():
            title = raw_artist
        elif isinstance(raw.get("artists"), list) and raw["artists"]:
            first = raw["artists"][0]
            if isinstance(first, Mapping) and isinstance(first.get("name"), str):
                title = first.get("name")
            elif isinstance(first, str):
                title = first

    if not isinstance(title, str) or not title.strip():
        return None

    video_id = raw.get("videoId") if isinstance(raw.get("videoId"), str) and raw.get("videoId").strip() else None
    browse_id = raw.get("browseId") if isinstance(raw.get("browseId"), str) and raw.get("browseId").strip() else None
    playlist_id = raw.get("playlistId") if isinstance(raw.get("playlistId"), str) and raw.get("playlistId").strip() else None
    audio_playlist_id = (
        raw.get("audioPlaylistId")
        if isinstance(raw.get("audioPlaylistId"), str) and raw.get("audioPlaylistId").strip()
        else None
    )

    item_type = default_type
    if not item_type:
        if res_type in ("song", "video", "album", "artist", "playlist", "podcast", "episode"):
            item_type = res_type
        elif video_id:
            vtype = str(raw.get("videoType") or "")
            if "PODCAST" in vtype:
                item_type = "episode"
            elif vtype == "MUSIC_VIDEO_TYPE_OMV" or vtype == "MUSIC_VIDEO_TYPE_UGC":
                item_type = "video"
            else:
                item_type = "song"
        elif playlist_id:
            if playlist_id.startswith("OLAK5uy_") and browse_id and browse_id.startswith("MPREb"):
                item_type = "album"
            else:
                item_type = "playlist"
        elif browse_id:
            if browse_id.startswith("UC"):
                item_type = "artist"
            elif browse_id.startswith("MPREb") or browse_id.startswith("OLAK5uy_"):
                item_type = "album"
            elif browse_id.startswith("MPSP"):
                item_type = "podcast"
            elif browse_id.startswith("VL") or browse_id.startswith("PL") or browse_id.startswith("RDCLAK"):
                item_type = "playlist"
            elif raw.get("type") and str(raw.get("type")).lower() in ("album", "single", "ep"):
                item_type = "album"
            else:
                item_type = "playlist"

    if not item_type:
        return None

    if not browse_id and item_type == "artist" and isinstance(raw.get("artists"), list) and raw["artists"]:
        first = raw["artists"][0]
        if isinstance(first, Mapping) and isinstance(first.get("id"), str) and first["id"].strip():
            browse_id = first["id"].strip()

    # Resolve canonical ID
    if item_type in ("song", "video", "episode"):
        item_id = video_id or browse_id
    elif item_type == "playlist":
        clean_pl = _clean_playlist_id(playlist_id or browse_id or "")
        item_id = clean_pl or browse_id or playlist_id
        if clean_pl and not playlist_id:
            playlist_id = clean_pl
        if not browse_id and item_id:
            browse_id = item_id
    elif item_type == "album":
        item_id = browse_id or audio_playlist_id or playlist_id
        if not browse_id and item_id:
            browse_id = item_id
    else:
        item_id = browse_id or playlist_id or video_id

    if not item_id or not isinstance(item_id, str):
        return None

    artists = _normalize_artists(
        raw.get("artists"),
        fallback_author=raw.get("author") or raw.get("artist"),
    )
    if not artists and fallback_artists:
        artists = fallback_artists

    album_ref = _normalize_album_ref(raw.get("album"), fallback_album=fallback_album)
    duration_str, duration_sec = parse_duration_seconds(
        raw.get("duration") or raw.get("length"),
        raw.get("duration_seconds"),
    )
    thumbnail = pick_largest_thumbnail(
        raw.get("thumbnails") or raw.get("thumbnail"),
        fallback=fallback_thumbnail,
    )
    year = _extract_year(raw.get("year")) or fallback_year

    views_raw = raw.get("views") or raw.get("subscribers") or raw.get("monthlyListeners")
    views = str(views_raw).strip() if views_raw is not None and str(views_raw).strip() else None

    description = clean_html_text(raw.get("description") or raw.get("subtitle"))
    published = raw.get("date") if isinstance(raw.get("date"), str) else None

    return {
        "id": item_id,
        "videoId": video_id if item_type in ("song", "video", "episode") else None,
        "browseId": browse_id,
        "playlistId": _clean_playlist_id(playlist_id) if playlist_id else None,
        "title": title.strip(),
        "artists": artists,
        "album": album_ref,
        "duration": duration_str,
        "durationSeconds": duration_sec,
        "thumbnail": thumbnail,
        "type": item_type,
        "year": year,
        "views": views,
        "isExplicit": bool(raw.get("isExplicit")),
        "description": description,
        "published": published,
        "podcastId": podcast_id or (raw.get("podcast") or {}).get("id") if isinstance(raw.get("podcast"), Mapping) else podcast_id,
        "creditsBrowseId": None,
    }


def _extract_yt_error_message(exc: Exception) -> Tuple[str, int]:
    if isinstance(exc, YTMusicUserError):
        msg = str(exc).strip()
        lower = msg.lower()
        if "not found" in lower or "unable to find" in lower or "does not exist" in lower:
            return ("Konten atau ID yang diminta tidak ditemukan di katalog.", 404)
        return (f"Permintaan tidak valid: {msg}" if msg else "Permintaan ke katalog musik tidak valid.", 400)
    if isinstance(exc, YTMusicGatedError):
        return ("Konten ini dibatasi wilayah atau usia oleh penyedia katalog.", 403)
    if isinstance(exc, YTMusicServerError):
        return ("Server katalog musik sedang sibuk atau tidak merespons. Coba lagi sebentar.", 502)
    if isinstance(exc, YTMusicError):
        msg = str(exc).strip()
        return (
            f"Terjadi kesalahan katalog musik: {msg}" if msg else "Gagal memuat data dari katalog musik.",
            502,
        )
    return (f"Gagal terhubung ke layanan katalog musik: {exc}", 502)


class AudioSettingsStore:
    """Server-side per-account persistence for user audio preferences."""

    def __init__(self, file_path: Optional[str] = None) -> None:
        default_dir = (
            "/tmp"
            if os.environ.get("VERCEL") or not os.access(os.path.dirname(__file__), os.W_OK)
            else os.path.dirname(__file__)
        )
        self._file_path = file_path or os.environ.get(
            "SOUNDCLEAR_AUDIO_SETTINGS_FILE",
            os.path.join(default_dir, ".audio_settings.json"),
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


class YTMusicClientGateway:
    """Thread-safe unauthenticated wrapper around ytmusicapi.YTMusic."""

    def __init__(self, *, client_factory: Optional[Callable[[], Any]] = None) -> None:
        self._lock = threading.RLock()
        self._client_factory = client_factory or (lambda: YTMusic())
        self._client: Optional[Any] = None

    def _get_client(self) -> Any:
        if self._client is None:
            self._client = self._client_factory()
        return self._client

    def search(self, query: str, filter: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._get_client().search(query, filter=filter, limit=limit) or [])

    def get_search_suggestions(self, query: str) -> List[str]:
        with self._lock:
            raw = self._get_client().get_search_suggestions(query) or []
            return [str(s) for s in raw if isinstance(s, str) and s.strip()]

    def get_home(self, limit: int = 8) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._get_client().get_home(limit=limit) or [])

    def get_charts(self, country: str = "ID") -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_charts(country=country) or {})

    def get_mood_categories(self) -> Dict[str, List[Dict[str, Any]]]:
        with self._lock:
            return dict(self._get_client().get_mood_categories() or {})

    def get_mood_playlists(self, params: str) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._get_client().get_mood_playlists(params) or [])

    def get_artist(self, channel_id: str) -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_artist(channel_id) or {})

    def get_artist_albums(self, channel_id: str, params: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._get_client().get_artist_albums(channel_id, params, limit=limit) or [])

    def get_album(self, browse_id: str) -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_album(browse_id) or {})

    def get_album_browse_id(self, audio_playlist_id: str) -> Optional[str]:
        with self._lock:
            return self._get_client().get_album_browse_id(audio_playlist_id)

    def get_playlist(self, playlist_id: str, limit: int = 100) -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_playlist(playlist_id, limit=limit) or {})

    def get_watch_playlist(
        self,
        video_id: Optional[str] = None,
        playlist_id: Optional[str] = None,
        radio: bool = True,
        limit: int = 25,
    ) -> Dict[str, Any]:
        with self._lock:
            return dict(
                self._get_client().get_watch_playlist(
                    videoId=video_id,
                    playlistId=playlist_id,
                    radio=radio,
                    limit=limit,
                )
                or {}
            )

    def get_lyrics(self, browse_id: str, timestamps: bool = True) -> Optional[Dict[str, Any]]:
        with self._lock:
            res = self._get_client().get_lyrics(browse_id, timestamps=timestamps)
            return dict(res) if isinstance(res, Mapping) else None

    def get_song(self, video_id: str) -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_song(video_id) or {})

    def get_song_related(self, browse_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._get_client().get_song_related(browse_id) or [])

    def get_podcast(self, playlist_id: str, limit: int = 100) -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_podcast(playlist_id, limit=limit) or {})

    def get_episode(self, video_id: str) -> Dict[str, Any]:
        with self._lock:
            return dict(self._get_client().get_episode(video_id) or {})

    def get_channel_episodes(self, channel_id: str, params: str) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._get_client().get_channel_episodes(channel_id, params) or [])


class MusicProvider:
    def __init__(
        self,
        *,
        country: str = "ID",
        cache_ttl_seconds: Optional[int] = None,
        max_retries: int = 2,
        base_backoff_seconds: float = 0.35,
        gateway: Optional[YTMusicClientGateway] = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        http_get_fn: Optional[Callable[..., Any]] = None,
        audio_settings_file: Optional[str] = None,
    ) -> None:
        env_ttl = os.environ.get("CACHE_TTL_SECONDS")
        ttl = cache_ttl_seconds if cache_ttl_seconds is not None else int(env_ttl or 420)
        self._country = (country or "ID").upper()
        self._cache = TTLCache(default_ttl=ttl, max_items=1024)
        self._max_retries = max(1, int(max_retries))
        self._base_backoff = max(0.0, float(base_backoff_seconds))
        self._gateway = gateway or YTMusicClientGateway()
        self._sleep = sleep_fn
        self._http_get = http_get_fn or requests.get
        self._audio_settings_store = AudioSettingsStore(file_path=audio_settings_file)

    def clear_cache(self) -> None:
        self._cache.clear()

    def _call_with_retry(self, fn: Callable[[], T]) -> T:
        last_exc: Optional[Exception] = None
        for attempt in range(self._max_retries):
            try:
                return fn()
            except MusicProviderError:
                raise
            except YTMusicUserError as exc:
                msg, code = _extract_yt_error_message(exc)
                raise MusicProviderError(msg, code) from exc
            except YTMusicGatedError as exc:
                msg, code = _extract_yt_error_message(exc)
                raise MusicProviderError(msg, code) from exc
            except (YTMusicServerError, YTMusicError, Exception) as exc:
                last_exc = exc
                if attempt + 1 >= self._max_retries:
                    break
                delay = self._base_backoff * (2**attempt) + random.uniform(0.0, 0.1)
                self._sleep(delay)

        msg, code = _extract_yt_error_message(last_exc or RuntimeError("Unknown error"))
        raise MusicProviderError(msg, code)

    def warmup(self) -> None:
        for fn in (
            lambda: self.get_home(limit=6),
            lambda: self.get_charts(self._country),
            self.get_moods,
        ):
            try:
                fn()
            except Exception:
                pass

    def search(
        self,
        query: str,
        filter: Optional[str] = None,
        limit: int = 25,
    ) -> Dict[str, Any]:
        clean_q = (query or "").strip()
        if not clean_q:
            raise MusicProviderError("Kata kunci pencarian wajib diisi.", 400)

        norm_filter = (filter or "").strip().lower() or None
        if norm_filter == "all":
            norm_filter = None

        valid_filters = {
            None,
            "songs",
            "videos",
            "albums",
            "artists",
            "playlists",
            "podcasts",
            "episodes",
        }
        if norm_filter not in valid_filters:
            raise MusicProviderError(f"Filter pencarian '{norm_filter}' tidak didukung.", 400)

        safe_limit = max(1, min(50, int(limit)))
        cache_key = f"search:{norm_filter or 'all'}:{safe_limit}:{clean_q.lower()}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        fetch_limit = min(50, max(safe_limit * 2, 30))
        raw_items = self._call_with_retry(
            lambda: self._gateway.search(clean_q, filter=norm_filter, limit=fetch_limit)
        )

        default_map = {
            "songs": "song",
            "videos": "video",
            "albums": "album",
            "artists": "artist",
            "playlists": "playlist",
            "podcasts": "podcast",
            "episodes": "episode",
        }
        default_t = default_map.get(norm_filter) if norm_filter else None

        items: List[Dict[str, Any]] = []
        top_artist_refs: Optional[List[Dict[str, Optional[str]]]] = None
        for idx, entry in enumerate(raw_items):
            norm = normalize_yt_item(entry, default_type=default_t)
            if not norm:
                continue
            if idx == 0 and norm.get("type") == "artist" and norm.get("title"):
                top_artist_refs = [{"id": norm.get("id"), "name": norm["title"]}]
            if (
                norm_filter is None
                and top_artist_refs
                and norm.get("type") == "song"
                and not norm.get("artists")
                and isinstance(entry, Mapping)
                and entry.get("category") is None
            ):
                norm["artists"] = top_artist_refs
            if _is_excluded_catalog_item(norm):
                continue
            items.append(norm)

        result = {
            "query": clean_q,
            "filter": norm_filter,
            "items": items[:safe_limit],
        }
        self._cache.set(cache_key, result)
        return result

    def suggest(self, query: str) -> Dict[str, Any]:
        clean_q = (query or "").strip()
        if not clean_q:
            return {"query": "", "suggestions": []}

        cache_key = f"suggest:{clean_q.lower()}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw_suggestions = self._call_with_retry(lambda: self._gateway.get_search_suggestions(clean_q))
        suggestions = [s for s in raw_suggestions if not _is_excluded_regional_text(s)]
        result = {"query": clean_q, "suggestions": suggestions[:10]}
        self._cache.set(cache_key, result, ttl_seconds=300)
        return result

    def get_home(self, limit: int = 8) -> Dict[str, Any]:
        safe_limit = max(1, min(20, int(limit)))
        cache_key = f"home:{safe_limit}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw_sections = self._call_with_retry(lambda: self._gateway.get_home(limit=safe_limit))
        sections: List[Dict[str, Any]] = []
        for sec in raw_sections:
            if not isinstance(sec, Mapping):
                continue
            title = sec.get("title")
            if not isinstance(title, str) or not title.strip():
                continue
            if _is_excluded_regional_text(title):
                continue
            contents = sec.get("contents") or []
            norm_items: List[Dict[str, Any]] = []
            for raw_item in contents:
                norm = normalize_yt_item(raw_item)
                if norm and not _is_excluded_catalog_item(norm):
                    norm_items.append(norm)
            if norm_items:
                sections.append({"title": title.strip(), "items": norm_items})

        result = {"sections": sections}
        self._cache.set(cache_key, result)
        return result

    def get_charts(self, country: str = "ID") -> Dict[str, Any]:
        cc = (country or self._country or "ID").strip().upper()
        cache_key = f"charts:{cc}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = self._call_with_retry(lambda: self._gateway.get_charts(country=cc))

        def _norm_list(raw_list: Any, default_type: Optional[str] = None) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            if not isinstance(raw_list, list):
                return out
            for entry in raw_list:
                norm = normalize_yt_item(entry, default_type=default_type)
                if norm and not _is_excluded_catalog_item(norm):
                    out.append(norm)
            return out

        songs = _norm_list(raw.get("songs"), default_type="song")
        raw_videos = raw.get("videos") or []
        videos: List[Dict[str, Any]] = []
        chart_playlist_ids: List[str] = []
        for entry in raw_videos:
            norm = normalize_yt_item(entry)
            if norm and not _is_excluded_catalog_item(norm):
                videos.append(norm)
                if norm.get("playlistId"):
                    chart_playlist_ids.append(str(norm["playlistId"]))

        artists = _norm_list(raw.get("artists"), default_type="artist")
        trending = _norm_list(raw.get("trending"))

        # In unauthenticated mode, charts['songs'] may be empty while charts['videos'] lists chart playlists
        if not songs and chart_playlist_ids:
            for pl_id in chart_playlist_ids[:2]:
                try:
                    pl_detail = self.get_playlist(pl_id, limit=35)
                    tracks = [
                        t
                        for t in (pl_detail.get("tracks") or [])
                        if not _is_excluded_catalog_item(t)
                    ]
                    if tracks:
                        if not songs:
                            songs = tracks[:20]
                        elif not trending:
                            trending = tracks[:20]
                except Exception:
                    continue

        if not trending and songs:
            trending = songs[:12]

        result = {
            "country": cc,
            "songs": songs,
            "videos": videos,
            "artists": artists,
            "trending": trending,
        }
        self._cache.set(cache_key, result)
        return result

    def get_moods(self) -> Dict[str, Any]:
        cache_key = "moods:all"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = self._call_with_retry(self._gateway.get_mood_categories)
        groups: List[Dict[str, Any]] = []
        for group_title, cats in raw.items():
            if not isinstance(cats, list):
                continue
            items: List[Dict[str, str]] = []
            for cat in cats:
                if not isinstance(cat, Mapping):
                    continue
                t = cat.get("title")
                p = cat.get("params")
                if isinstance(t, str) and t.strip() and isinstance(p, str) and p.strip():
                    items.append({"title": t.strip(), "params": p.strip()})
            if items:
                label = "Mood & Momen" if "mood" in str(group_title).lower() else (
                    "Genre Musik" if "genre" in str(group_title).lower() else str(group_title)
                )
                groups.append({"title": label, "items": items})

        result = {"groups": groups}
        self._cache.set(cache_key, result, ttl_seconds=600)
        return result

    def get_mood_playlists(self, params: str) -> Dict[str, Any]:
        clean = (params or "").strip()
        if not clean:
            raise MusicProviderError("Parameter kategori mood tidak valid.", 400)

        cache_key = f"mood_pl:{clean}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = self._call_with_retry(lambda: self._gateway.get_mood_playlists(clean))
        playlists: List[Dict[str, Any]] = []
        for entry in raw:
            norm = normalize_yt_item(entry, default_type="playlist")
            if norm:
                playlists.append(norm)

        result = {"params": clean, "playlists": playlists}
        self._cache.set(cache_key, result)
        return result

    def get_artist(self, artist_id: str, *, fallback_query: Optional[str] = None) -> Dict[str, Any]:
        clean_id = (artist_id or "").strip()
        if not clean_id:
            raise MusicProviderError("ID artis tidak valid.", 400)

        cache_key = f"artist:{clean_id}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            raw = self._call_with_retry(lambda: self._gateway.get_artist(clean_id))
        except MusicProviderError:
            if not fallback_query:
                raise
            search_res = self.search(fallback_query, filter="artists", limit=3)
            if not search_res["items"]:
                raise
            resolved_id = search_res["items"][0]["id"]
            raw = self._call_with_retry(lambda: self._gateway.get_artist(resolved_id))
            clean_id = resolved_id

        name = str(raw.get("name") or "Artis").strip()
        artist_ref = [{"id": raw.get("channelId") or clean_id, "name": name}]

        def _extract_section(key: str, default_type: str) -> List[Dict[str, Any]]:
            sec = raw.get(key)
            if not isinstance(sec, Mapping):
                return []
            results = sec.get("results") or []
            out: List[Dict[str, Any]] = []
            for entry in results:
                norm = normalize_yt_item(
                    entry,
                    default_type=default_type,
                    fallback_artists=artist_ref,
                )
                if norm:
                    out.append(norm)
            return out

        songs = _extract_section("songs", "song")
        albums = _extract_section("albums", "album")
        singles = _extract_section("singles", "album")
        videos = _extract_section("videos", "video")
        related = _extract_section("related", "artist")

        result = {
            "id": raw.get("channelId") or clean_id,
            "name": name,
            "description": clean_html_text(raw.get("description")),
            "subscribers": raw.get("subscribers"),
            "views": raw.get("views") or raw.get("monthlyListeners"),
            "thumbnail": pick_largest_thumbnail(raw.get("thumbnails")),
            "shuffleId": raw.get("shuffleId"),
            "radioId": raw.get("radioId"),
            "songs": songs,
            "albums": albums,
            "singles": singles,
            "compilations": [],
            "appearsOn": [],
            "videos": videos,
            "related": related,
        }
        self._cache.set(cache_key, result)
        return result

    def get_artist_albums(self, artist_id: str, params: str) -> List[Dict[str, Any]]:
        clean_id = (artist_id or "").strip()
        clean_params = (params or "").strip()
        if not clean_id or not clean_params:
            raise MusicProviderError("ID artis dan params wajib diisi.", 400)

        cache_key = f"artist_albums:{clean_id}:{clean_params}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = self._call_with_retry(lambda: self._gateway.get_artist_albums(clean_id, clean_params))
        albums: List[Dict[str, Any]] = []
        for entry in raw:
            norm = normalize_yt_item(entry, default_type="album")
            if norm:
                albums.append(norm)

        self._cache.set(cache_key, albums)
        return albums

    def get_album(self, album_id: str, *, fallback_query: Optional[str] = None) -> Dict[str, Any]:
        clean_id = (album_id or "").strip()
        if not clean_id:
            raise MusicProviderError("ID album tidak valid.", 400)

        cache_key = f"album:{clean_id}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        browse_id = clean_id
        if browse_id.startswith("OLAK5uy_"):
            try:
                resolved = self._call_with_retry(lambda: self._gateway.get_album_browse_id(browse_id))
                if resolved:
                    browse_id = resolved
            except MusicProviderError:
                pass

        try:
            raw = self._call_with_retry(lambda: self._gateway.get_album(browse_id))
        except MusicProviderError:
            if not fallback_query:
                raise
            search_res = self.search(fallback_query, filter="albums", limit=3)
            if not search_res["items"]:
                raise
            browse_id = search_res["items"][0]["id"]
            raw = self._call_with_retry(lambda: self._gateway.get_album(browse_id))

        title = str(raw.get("title") or "Album").strip()
        artists = _normalize_artists(raw.get("artists"))
        year = _extract_year(raw.get("year"))
        cover = pick_largest_thumbnail(raw.get("thumbnails"))
        album_ref = {"id": browse_id, "name": title}

        tracks: List[Dict[str, Any]] = []
        for entry in raw.get("tracks") or []:
            norm = normalize_yt_item(
                entry,
                default_type="song",
                fallback_artists=artists,
                fallback_album=album_ref,
                fallback_thumbnail=cover,
                fallback_year=year,
            )
            if norm:
                tracks.append(norm)

        more_from_artist: List[Dict[str, Any]] = []
        for rec_group in raw.get("related_recommendations") or []:
            if isinstance(rec_group, Mapping):
                for entry in rec_group.get("contents") or []:
                    norm = normalize_yt_item(entry, default_type="album")
                    if norm:
                        more_from_artist.append(norm)

        credits: List[Dict[str, Any]] = []
        if artists:
            credits.append({"role": "Artis", "names": [a["name"] for a in artists if a.get("name")]})
        if year:
            credits.append({"role": "Tahun Rilis", "names": [year]})

        result = {
            "id": browse_id,
            "title": title,
            "artists": artists,
            "year": year,
            "trackCount": raw.get("trackCount") or len(tracks),
            "duration": raw.get("duration"),
            "description": clean_html_text(raw.get("description")),
            "thumbnail": cover,
            "audioPlaylistId": raw.get("audioPlaylistId"),
            "credits": credits,
            "moreFromArtist": more_from_artist,
            "tracks": tracks,
        }
        self._cache.set(cache_key, result)
        return result

    def get_playlist(
        self,
        playlist_id: str,
        limit: int = 100,
        *,
        fallback_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        clean_id = _clean_playlist_id(playlist_id)
        if not clean_id:
            raise MusicProviderError("ID playlist tidak valid.", 400)

        safe_limit = max(1, min(200, int(limit)))
        cache_key = f"playlist:{clean_id}:{safe_limit}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            raw = self._call_with_retry(lambda: self._gateway.get_playlist(clean_id, limit=safe_limit))
        except MusicProviderError:
            if not fallback_query:
                raise
            search_res = self.search(fallback_query, filter="playlists", limit=3)
            if not search_res["items"]:
                raise
            clean_id = _clean_playlist_id(search_res["items"][0]["id"])
            raw = self._call_with_retry(lambda: self._gateway.get_playlist(clean_id, limit=safe_limit))

        author_node = raw.get("author")
        if isinstance(author_node, Mapping):
            author_name = sanitize_brand_name(author_node.get("name"))
        elif isinstance(author_node, str):
            author_name = sanitize_brand_name(author_node)
        else:
            author_name = None

        cover = pick_largest_thumbnail(raw.get("thumbnails"))
        tracks: List[Dict[str, Any]] = []
        for entry in raw.get("tracks") or []:
            norm = normalize_yt_item(entry, fallback_thumbnail=cover)
            if norm:
                tracks.append(norm)

        result = {
            "id": str(raw.get("id") or clean_id),
            "title": str(raw.get("title") or "Playlist").strip(),
            "author": author_name,
            "description": clean_html_text(raw.get("description")),
            "year": _extract_year(raw.get("year")),
            "trackCount": raw.get("trackCount") or len(tracks),
            "duration": raw.get("duration"),
            "thumbnail": cover,
            "tracks": tracks,
        }
        self._cache.set(cache_key, result)
        return result

    def get_watch_playlist(
        self,
        video_id: str,
        playlist_id: Optional[str] = None,
        radio: bool = True,
        limit: int = 25,
    ) -> Dict[str, Any]:
        clean_vid = (video_id or "").strip()
        if not clean_vid:
            raise MusicProviderError("ID video tidak valid.", 400)

        clean_pl = _clean_playlist_id(playlist_id) if playlist_id else None
        safe_limit = max(1, min(50, int(limit)))
        cache_key = f"watch:{clean_vid}:{clean_pl or ''}:{int(radio)}:{safe_limit}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = self._call_with_retry(
            lambda: self._gateway.get_watch_playlist(
                video_id=clean_vid,
                playlist_id=clean_pl,
                radio=radio,
                limit=safe_limit,
            )
        )

        tracks: List[Dict[str, Any]] = []
        for entry in raw.get("tracks") or []:
            norm = normalize_yt_item(entry, default_type="song")
            if norm and (norm.get("videoId") == clean_vid or not _is_excluded_catalog_item(norm)):
                tracks.append(norm)

        result = {
            "videoId": clean_vid,
            "playlistId": raw.get("playlistId") or clean_pl,
            "lyricsBrowseId": raw.get("lyrics"),
            "relatedBrowseId": raw.get("related"),
            "tracks": tracks,
        }
        self._cache.set(cache_key, result)
        return result

    def get_lyrics(self, browse_id: str) -> Dict[str, Any]:
        clean_id = (browse_id or "").strip()
        if not clean_id:
            raise MusicProviderError("ID lirik tidak valid.", 400)

        cache_key = f"lyrics:{clean_id}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = None
        try:
            raw = self._call_with_retry(lambda: self._gateway.get_lyrics(clean_id, timestamps=True))
        except MusicProviderError:
            raw = None

        if not raw:
            raw = self._call_with_retry(lambda: self._gateway.get_lyrics(clean_id, timestamps=False))

        if not raw:
            raise MusicProviderError("Lirik tidak tersedia untuk lagu ini.", 404)

        has_timestamps = bool(raw.get("hasTimestamps"))
        raw_lyrics = raw.get("lyrics")
        source = sanitize_brand_name(raw.get("source")) if isinstance(raw.get("source"), str) else raw.get("source")
        lines: List[Dict[str, Any]] = []
        plain_text: Optional[str] = None

        if has_timestamps and isinstance(raw_lyrics, list):
            text_chunks: List[str] = []
            for entry in raw_lyrics:
                if isinstance(entry, Mapping):
                    text = str(entry.get("text") or "").strip()
                    start_ms = int(entry.get("start_time") or entry.get("startTimeMs") or 0)
                    end_ms = int(entry.get("end_time") or entry.get("endTimeMs") or start_ms + 3000)
                else:
                    text = str(getattr(entry, "text", "") or "").strip()
                    start_ms = int(getattr(entry, "start_time", 0) or 0)
                    end_ms = int(getattr(entry, "end_time", start_ms + 3000) or (start_ms + 3000))
                if text:
                    lines.append({"text": text, "startTimeMs": start_ms, "endTimeMs": end_ms})
                    text_chunks.append(text)
            plain_text = "\n".join(text_chunks) if text_chunks else None
        elif isinstance(raw_lyrics, str) and raw_lyrics.strip():
            has_timestamps = False
            plain_text = raw_lyrics.strip()

        result = {
            "browseId": clean_id,
            "hasTimestamps": has_timestamps and len(lines) > 0,
            "source": source,
            "lines": lines,
            "plainText": plain_text,
        }
        self._cache.set(cache_key, result, ttl_seconds=600)
        return result

    def get_song_credits(
        self,
        video_id: str,
        album_id: Optional[str] = None,
        credits_browse_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        clean_vid = (video_id or "").strip()
        if not clean_vid:
            raise MusicProviderError("ID lagu tidak valid.", 400)

        cache_key = f"credits:{clean_vid}:{album_id or ''}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        title = "Lagu"
        credits: List[Dict[str, Any]] = []

        try:
            watch = self.get_watch_playlist(clean_vid, radio=False, limit=3)
            match = next(
                (t for t in watch.get("tracks") or [] if t.get("videoId") == clean_vid or t.get("id") == clean_vid),
                (watch.get("tracks") or [None])[0],
            )
            if isinstance(match, Mapping):
                title = str(match.get("title") or title)
                artist_names = [a["name"] for a in (match.get("artists") or []) if a.get("name")]
                if artist_names:
                    credits.append({"role": "Artis / Penampil", "names": artist_names})
                alb = match.get("album")
                if isinstance(alb, Mapping) and alb.get("name"):
                    credits.append({"role": "Album", "names": [str(alb["name"])]})
                if match.get("year"):
                    credits.append({"role": "Tahun Rilis", "names": [str(match["year"])]})
        except Exception:
            pass

        if not credits and album_id:
            try:
                alb = self.get_album(album_id)
                title = alb.get("title") or title
                credits.extend(alb.get("credits") or [])
            except Exception:
                pass

        result = {"videoId": clean_vid, "title": title, "credits": credits}
        self._cache.set(cache_key, result, ttl_seconds=600)
        return result

    def get_song_related(self, video_id: str) -> Dict[str, Any]:
        clean_vid = (video_id or "").strip()
        if not clean_vid:
            raise MusicProviderError("ID lagu tidak valid.", 400)

        cache_key = f"related:{clean_vid}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        watch = self.get_watch_playlist(clean_vid, radio=True, limit=15)
        related_browse_id = watch.get("relatedBrowseId")

        tracks: List[Dict[str, Any]] = []
        playlists: List[Dict[str, Any]] = []
        artists: List[Dict[str, Any]] = []

        if related_browse_id:
            try:
                sections = self._call_with_retry(
                    lambda: self._gateway.get_song_related(str(related_browse_id))
                )
                for sec in sections:
                    if not isinstance(sec, Mapping):
                        continue
                    for entry in sec.get("contents") or []:
                        norm = normalize_yt_item(entry)
                        if not norm or _is_excluded_catalog_item(norm):
                            continue
                        t = norm.get("type")
                        if t in ("song", "video"):
                            tracks.append(norm)
                        elif t == "playlist":
                            playlists.append(norm)
                        elif t == "artist":
                            artists.append(norm)
            except Exception:
                pass

        if not tracks:
            tracks = [
                t
                for t in watch.get("tracks") or []
                if t.get("videoId") != clean_vid and not _is_excluded_catalog_item(t)
            ]

        result = {
            "videoId": clean_vid,
            "tracks": tracks[:20],
            "playlists": playlists[:12],
            "artists": artists[:10],
        }
        self._cache.set(cache_key, result)
        return result

    def get_podcast(
        self,
        podcast_id: str,
        limit: int = 100,
        *,
        fallback_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        clean_id = (podcast_id or "").strip()
        if not clean_id:
            raise MusicProviderError("ID podcast tidak valid.", 400)

        safe_limit = max(1, min(200, int(limit)))
        cache_key = f"podcast:{clean_id}:{safe_limit}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            raw = self._call_with_retry(lambda: self._gateway.get_podcast(clean_id, limit=safe_limit))
        except MusicProviderError:
            if not fallback_query:
                raise
            search_res = self.search(fallback_query, filter="podcasts", limit=3)
            if not search_res["items"]:
                raise
            clean_id = search_res["items"][0]["id"]
            raw = self._call_with_retry(lambda: self._gateway.get_podcast(clean_id, limit=safe_limit))

        author_node = raw.get("author")
        raw_author_name = author_node.get("name") if isinstance(author_node, Mapping) else (
            author_node if isinstance(author_node, str) else None
        )
        author_name = sanitize_brand_name(raw_author_name)
        author_id = author_node.get("id") if isinstance(author_node, Mapping) else None
        cover = pick_largest_thumbnail(raw.get("thumbnails"))
        pod_title = str(raw.get("title") or "Podcast").strip()

        episodes: List[Dict[str, Any]] = []
        for ep in raw.get("episodes") or []:
            if not isinstance(ep, Mapping):
                continue
            vid = ep.get("videoId")
            ep_title = ep.get("title")
            if not isinstance(vid, str) or not vid.strip() or not isinstance(ep_title, str) or not ep_title.strip():
                continue
            dur_str, dur_sec = parse_duration_seconds(ep.get("duration"), ep.get("duration_seconds"))
            episodes.append(
                {
                    "id": vid.strip(),
                    "videoId": vid.strip(),
                    "title": ep_title.strip(),
                    "description": clean_html_text(ep.get("description")),
                    "duration": dur_str,
                    "durationSeconds": dur_sec,
                    "published": ep.get("date") if isinstance(ep.get("date"), str) else None,
                    "thumbnail": pick_largest_thumbnail(ep.get("thumbnails"), fallback=cover),
                    "podcastId": clean_id,
                    "podcastTitle": pod_title,
                }
            )

        result = {
            "id": clean_id,
            "title": pod_title,
            "author": author_name,
            "authorId": author_id,
            "description": clean_html_text(raw.get("description")),
            "thumbnail": cover,
            "episodes": episodes,
        }
        self._cache.set(cache_key, result)
        return result

    def get_episode(self, video_id: str, *, fallback_query: Optional[str] = None) -> Dict[str, Any]:
        clean_id = (video_id or "").strip()
        if not clean_id:
            raise MusicProviderError("ID episode tidak valid.", 400)

        cache_key = f"episode:{clean_id}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            raw = self._call_with_retry(lambda: self._gateway.get_episode(clean_id))
        except MusicProviderError:
            if not fallback_query:
                raise
            search_res = self.search(fallback_query, filter="episodes", limit=3)
            if not search_res["items"]:
                raise
            clean_id = search_res["items"][0]["id"]
            raw = self._call_with_retry(lambda: self._gateway.get_episode(clean_id))

        author_node = raw.get("author")
        raw_author_name = author_node.get("name") if isinstance(author_node, Mapping) else (
            author_node if isinstance(author_node, str) else None
        )
        author_name = sanitize_brand_name(raw_author_name)
        author_id = author_node.get("id") if isinstance(author_node, Mapping) else None
        dur_str, dur_sec = parse_duration_seconds(raw.get("duration"), raw.get("duration_seconds"))

        result = {
            "id": clean_id,
            "videoId": clean_id,
            "title": str(raw.get("title") or "Episode").strip(),
            "description": clean_html_text(raw.get("description")),
            "duration": dur_str,
            "durationSeconds": dur_sec,
            "published": raw.get("date") if isinstance(raw.get("date"), str) else None,
            "thumbnail": pick_largest_thumbnail(raw.get("thumbnails")),
            "podcastId": raw.get("playlistId"),
            "podcastTitle": author_name,
            "author": author_name,
            "authorId": author_id,
        }
        self._cache.set(cache_key, result)
        return result

    def get_channel_episodes(self, channel_id: str, params: str) -> List[Dict[str, Any]]:
        clean_id = (channel_id or "").strip()
        clean_params = (params or "").strip()
        if not clean_id or not clean_params:
            raise MusicProviderError("ID channel dan params wajib diisi.", 400)

        raw = self._call_with_retry(lambda: self._gateway.get_channel_episodes(clean_id, clean_params))
        episodes: List[Dict[str, Any]] = []
        for entry in raw:
            norm = normalize_yt_item(entry, default_type="episode")
            if norm:
                episodes.append(norm)
        return episodes

    def resolve_playable_youtube(
        self,
        item_id: str,
        *,
        title: str = "",
        artist: str = "",
        item_type: str = "song",
        duration_seconds: Optional[int] = None,
        fallback: bool = False,
        exclude_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        clean_id = (item_id or "").strip()
        if not clean_id and not title:
            raise MusicProviderError("ID atau judul lagu wajib diisi.", 400)

        excluded = {
            vid.strip()
            for vid in (exclude_ids or [])
            if isinstance(vid, str) and VIDEO_ID_RE.fullmatch(vid.strip())
        }
        if fallback and clean_id and VIDEO_ID_RE.fullmatch(clean_id):
            excluded.add(clean_id)

        if not fallback and clean_id and VIDEO_ID_RE.fullmatch(clean_id):
            return {
                "id": clean_id,
                "youtubeVideoId": clean_id,
                "candidates": [clean_id],
            }

        clean_title = (title or "").strip()
        clean_artist = (artist or "").strip()
        if clean_artist.lower() == "artis tidak diketahui":
            clean_artist = ""
        exclude_key = ",".join(sorted(excluded))
        cache_key = (
            f"resolve:{int(fallback)}:{clean_id}:{clean_title.lower()}:"
            f"{clean_artist.lower()}:{item_type}:{duration_seconds or 0}:{exclude_key}"
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        query = f"{clean_artist} {clean_title}".strip() or clean_id
        raw_results: List[Dict[str, Any]] = []
        if fallback:
            raw_results.extend(
                self._call_with_retry(lambda: self._gateway.search(query, filter="videos", limit=8))
            )
            raw_results.extend(
                self._call_with_retry(lambda: self._gateway.search(query, filter="songs", limit=6))
            )
        else:
            search_filter = "episodes" if item_type == "episode" else "songs"
            raw_results = self._call_with_retry(
                lambda: self._gateway.search(query, filter=search_filter, limit=6)
            )
            if not raw_results and search_filter == "songs":
                raw_results = self._call_with_retry(
                    lambda: self._gateway.search(query, filter=None, limit=6)
                )

        scored: List[Tuple[int, int, str]] = []
        seen_vids = set(excluded)
        target_dur = int(duration_seconds) if duration_seconds and duration_seconds > 0 else None

        for idx, entry in enumerate(raw_results):
            vid = entry.get("videoId")
            if not isinstance(vid, str) or not VIDEO_ID_RE.fullmatch(vid) or vid in seen_vids:
                continue
            seen_vids.add(vid)
            _, entry_dur = parse_duration_seconds(
                entry.get("duration") or entry.get("length"),
                entry.get("duration_seconds"),
            )
            if target_dur and entry_dur:
                diff = abs(entry_dur - target_dur)
                penalty = 0 if diff <= 45 else (500 + diff)
                score = penalty + diff
            else:
                score = 200 + idx * 10
            scored.append((score, idx, vid))

        scored.sort(key=lambda t: (t[0], t[1]))
        candidates = [vid for _, _, vid in scored]

        if not candidates:
            raise MusicProviderError("Tidak dapat menemukan media audio yang cocok di katalog.", 404)

        result = {
            "id": clean_id or candidates[0],
            "youtubeVideoId": candidates[0],
            "candidates": candidates,
        }
        self._cache.set(cache_key, result, ttl_seconds=3600)
        return result

    def extract_artwork_color(self, url: str) -> Dict[str, Any]:
        parsed = urlparse((url or "").strip())
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise MusicProviderError("URL sampul tidak valid.", 400)
        host = parsed.hostname.lower()
        if host not in ALLOWED_ARTWORK_HOSTS and not (
            host.endswith(".googleusercontent.com") or host.endswith(".ggpht.com") or host.endswith(".ytimg.com")
        ):
            raise MusicProviderError("Host gambar sampul tidak diizinkan.", 400)

        cache_key = f"color:{url}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            resp = self._http_get(url, timeout=8)
            if getattr(resp, "status_code", 200) >= 400:
                raise MusicProviderError("Gagal mengunduh gambar sampul.", 502)
            raw_bytes = getattr(resp, "content", b"")
            with Image.open(io.BytesIO(raw_bytes)) as img:
                rgb_img = img.convert("RGB").resize((24, 24))
                pixels = list(rgb_img.getdata())
        except MusicProviderError:
            raise
        except Exception as exc:
            raise MusicProviderError(f"Gagal memproses warna sampul: {exc}", 502) from exc

        if not pixels:
            result = {"r": 22, "g": 48, "b": 40, "hex": "#163028"}
            self._cache.set(cache_key, result, ttl_seconds=600)
            return result

        # Pick vibrant-leaning average pixel while avoiding pure black/white extremes
        weighted_r, weighted_g, weighted_b, total_w = 0.0, 0.0, 0.0, 0.0
        for r, g, b in pixels:
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if lum < 18 or lum > 240:
                w = 0.2
            else:
                sat = max(r, g, b) - min(r, g, b)
                w = 1.0 + (sat / 255.0) * 1.5
            weighted_r += r * w
            weighted_g += g * w
            weighted_b += b * w
            total_w += w

        if total_w <= 0:
            avg_r, avg_g, avg_b = 22, 48, 40
        else:
            avg_r = max(12, min(230, int(round(weighted_r / total_w))))
            avg_g = max(12, min(230, int(round(weighted_g / total_w))))
            avg_b = max(12, min(230, int(round(weighted_b / total_w))))

        result = {
            "r": avg_r,
            "g": avg_g,
            "b": avg_b,
            "hex": f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}",
        }
        self._cache.set(cache_key, result, ttl_seconds=600)
        return result

    def get_account_status(self) -> Dict[str, Any]:
        return {
            "authenticated": False,
            "mode": "local",
            "message": "Mode tanpa login aktif. Katalog musik siap diputar dan pustaka tersimpan di browser Anda.",
        }

    def get_account_library(self) -> Dict[str, Any]:
        return {
            "likedSongs": [],
            "playlists": [],
            "albums": [],
            "artists": [],
            "subscriptions": [],
            "history": [],
        }

    def account_rate(self, _video_id: str, _rating: str) -> Dict[str, Any]:
        return {"synced": False, "reason": "local_mode"}

    def account_create_playlist(
        self, _title: str, _description: str, _video_ids: List[str]
    ) -> Dict[str, Any]:
        return {"synced": False, "playlistId": None, "reason": "local_mode"}

    def account_add_playlist_items(self, _playlist_id: str, _video_ids: List[str]) -> Dict[str, Any]:
        return {"synced": False, "reason": "local_mode"}

    def account_subscribe(self, _channel_ids: List[str], _subscribe: bool = True) -> Dict[str, Any]:
        return {"synced": False, "reason": "local_mode"}

    def get_audio_settings(self, account_key: Optional[str] = None) -> Dict[str, Any]:
        key = (account_key or "local").strip() or "local"
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
        key = (account_key or "local").strip() or "local"
        saved = self._audio_settings_store.save(key, settings)
        return {"accountKey": key, "settings": saved}

    def reset_audio_settings(self, account_key: Optional[str] = None) -> Dict[str, Any]:
        key = (account_key or "local").strip() or "local"
        self._audio_settings_store.delete(key)
        return {"accountKey": key, "settings": None}
