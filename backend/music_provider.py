from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import html
import io
import json
import os
import random
import re
import shutil
import subprocess
import threading
import time
import unicodedata
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple, TypeVar
from urllib.parse import urljoin, urlparse

import requests
from requests.adapters import HTTPAdapter
from PIL import Image
import yt_dlp
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
    r"\b(?:mandarin|mandopop|cantopop|c-?pop|chinese|zhongwen|hokkien|guoyu|taiwanese|taiwan)\b",
    re.IGNORECASE,
)
XG_ARTIST_RE = re.compile(r"\b(?:XG|XGALX)\b")
JAPANESE_KEYWORD_RE = re.compile(
    r"\b(?:j-?pop|j-?rock|j-?rap|j-?indie|j-?metal|japanese|nihon|nippon|japan|"
    r"anisong|anison|anime|vocaloid|hatsune\s*miku|city\s*pop|japanese\s*city\s*pop|enka|shibuya-?kei|touhou|hololive|nijisanji|"
    r"anime\s+(?:ost|song|opening|ending|op|ed|theme)|"
    r"yoasobi|ado|fujii\s*kaze|kenshi\s*yonezu|radwimps|official\s*hige\s*dandism|king\s*gnu|"
    r"mrs\.?\s*green\s*apple|vaundy|creepy\s*nuts|aimyon|yorushika|zutomayo|aimer|milet|"
    r"utada\s*hikaru|hikaru\s*utada|one\s*ok\s*rock|babymetal|kis-?my-?ft2|hey!\s*say!\s*jump|"
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
    r"ayumi\s*hamasaki|koda\s*kumi|mika\s*nakashima|ai\s*otsuka|suiatsu|musashi|"
    r"ai\s+no\s+katachi|yoru\s+ni\s+kakeru|kaibutsu|gurenge|zankyou\s+sanka|"
    r"shinunoga\s+e-?wa|odoriko|hakujitsu|sayonara|arigatou|aishiteru|daisuki|"
    r"watashi\s+no|kimi\s+no|anata\s+no|boku\s+no|ai\s+no|koi\s+no|kokoro|shiawase|"
    r"kanashimi|yoru\s+ni|seishun|kanojo|kareshi|tomodachi|natsukashii|"
    r"japanese\s+ver\.?|jp\s+ver\.?|nihongo|komorebi|taiyou|hanabi|matsuri|"
    r"oshi\s*no\s*ko|lilas|ikura|lagu\s+jepang|musik\s+jepang)\b",
    re.IGNORECASE,
)
INDIAN_KEYWORD_RE = re.compile(
    r"\b(?:india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|punjabi|hindi|tamil|"
    r"telugu|malayalam|kannada|bhojpuri|marathi|gujarati|bengali|hindustani|carnatic|bhangra|"
    r"ghazal|qawwali|bhajan|desi|i-?pop|t-?series|zee\s*music|saregama|sony\s*music\s*india|"
    r"yrf|tips\s*official|speed\s*records|eros\s*now|desimelodies|white\s*hill\s*music|"
    r"udit\s*narayan|arijit\s*singh|arjit\s*singh|arijitsingh|arjitsingh|shreya\s*ghoshal|"
    r"alka\s*ynik|alka\s*yagnik|kumar\s*sanu|"
    r"lata\s*mangeshkar|kishore\s*kumar|sonu\s*nigam|a\.?\s*r\.?\s*rahman|diljit\s*dosanjh|"
    r"sidhu\s*moose\s*wala|ap\s*dhillon|anirudh\s*ravichander|neha\s*kakkar|jubin\s*nautiyal|"
    r"atif\s*aslam|sunidhi\s*chauhan|asha\s*bhosle|mohammed\s*rafi|ilayaraja|sp\s*balasubrahmanyam|"
    r"rito\s*riba|siddhant\s*kaushal|badshah|honey\s*singh|guru\s*randhawa|armaan\s*malik|"
    r"darshan\s*raval|vishal\s*mishra|b\s*praak|tanishk\s*bagchi|pritam|mithoon|"
    r"sachet\s*tandon|shankar\s*mahadevan|kailash\s*kher|rahat\s*fateh\s*ali\s*khan|"
    r"nusrat\s*fateh\s*ali\s*khan|mohit\s*chauhan|himesh\s*reshammiya|mika\s*singh|"
    r"sukhwinder\s*singh|karan\s*aujla|shubh|talwinder|anuv\s*jain|prateek\s*kuhad|"
    r"emiway\s*bantai|mc\s*stan|mc\s*sairaj|jyoti\s*magar|akshay\s*kumar|dhadkan|ramayana|"
    r"harrdy\s*sandhu|jass\s*manak|ammy\s*virk|parmish\s*verma|"
    r"satinder\s*sartaaj|nimrat\s*khaira|sunanda\s*sharma|tulsi\s*kumar|dhvani\s*bhanushali|"
    r"palak\s*muchhal|jonita\s*gandhi|shilpa\s*rao|kanika\s*kapoor|jasleen\s*royal|"
    r"rekha\s*bhardwaj|kavita\s*krishnamurthy|salim-?sulaiman|amit\s*trivedi|vishal-?shekhar|"
    r"sachin-?jigar|devi\s*sri\s*prasad|yuvan\s*shankar\s*raja|santhosh\s*narayanan|"
    r"harris\s*jayaraj|sid\s*sriram|stebin\s*ben|asees\s*kaur|tony\s*kakkar|"
    r"raghav\s*chaitanya|arjan\s*dhillon|babbu\s*maan|gurdas\s*maan|daler\s*mehndi|"
    r"dilruba|dilnasheen|ishq|pyaar|pyar|mohabbat|zindagi|aashiq|aashiqui|ashiqui|deewana|bewafa|"
    r"judai|tanhai|khwab|musafir|barsaat|mehndi|sangeet|balam|sajna|sajni|rabba|maula|"
    r"yaara|heeriye|sohniye|soniye|shayari|lagu\s+india|musik\s+india|channa\s+mereya|"
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
    norm_text = unicodedata.normalize("NFKC", text)
    if INDIC_SCRIPT_RE.search(norm_text):
        return True
    if JAPANESE_KANA_RE.search(norm_text):
        return True
    collapsed = _collapse_spaced_letters(norm_text)
    for candidate in (norm_text, collapsed) if collapsed != norm_text else (norm_text,):
        if INDIAN_KEYWORD_RE.search(candidate):
            return True
        if JAPANESE_KEYWORD_RE.search(candidate):
            return True
        if XG_ARTIST_RE.search(candidate):
            return True
        if MANDARIN_KEYWORD_RE.search(candidate):
            return True
    if CJK_HAN_RE.search(norm_text) and not KOREAN_HANGUL_RE.search(norm_text):
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


LRC_TAG_RE = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")
LRCLIB_USER_AGENT = "SoundClear/3.0 (https://soundclear.local)"
STREAM_CACHE_DIR = os.environ.get("SOUNDCLEAR_STREAM_CACHE_DIR", "/tmp/soundclear_stream_cache")
VERCEL_MAX_STREAM_CHUNK_BYTES = 1_572_864  # 1.5 MiB (stays safely below Vercel 4.5 MB payload limit)
VERCEL_FULL_RESPONSE_LIMIT_BYTES = 3_145_728  # 3.0 MiB
M3U8_MAP_URI_RE = re.compile(r'URI="([^"]+)"')
CONTENT_RANGE_TOTAL_RE = re.compile(r"bytes\s+\d+-\d+/(\d+)", re.IGNORECASE)
TITLE_NOISE_RE = re.compile(
    r"\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|official\s*lyric\s*video|"
    r"lyric\s*video|lyrics?|mv|m/v|hd|4k|audio|video\s*klip|live\s*performance)[\)\]]",
    re.IGNORECASE,
)
FEAT_SUFFIX_RE = re.compile(r"\s+(?:feat\.?|ft\.?|featuring)\s+.*$", re.IGNORECASE)
VARIANT_WORDS = (
    "cover",
    "remix",
    "slowed",
    "reverb",
    "sped up",
    "nightcore",
    "koplo",
    "dangdut",
    "karaoke",
    "instrumental",
    "8d",
    "parody",
)


def _clean_track_title_for_query(title: str) -> str:
    clean = TITLE_NOISE_RE.sub("", (title or "").strip()).strip()
    clean = re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", clean).strip()
    clean = FEAT_SUFFIX_RE.sub("", clean).strip()
    return clean or (title or "").strip()


def _clean_artist_for_query(artist: str) -> str:
    raw = (artist or "").strip()
    if not raw or raw.lower() == "artis tidak diketahui":
        return ""
    primary = raw.split(",")[0].strip()
    primary = re.sub(r"\s*-\s*topic$", "", primary, flags=re.IGNORECASE).strip()
    primary = re.sub(r"\bvevo$", "", primary, flags=re.IGNORECASE).strip()
    return primary or raw


def parse_lrc_lyrics(synced_lrc: str) -> List[Dict[str, Any]]:
    if not isinstance(synced_lrc, str) or not synced_lrc.strip():
        return []
    raw_entries: List[Tuple[int, str]] = []
    for raw_line in synced_lrc.splitlines():
        tags = list(LRC_TAG_RE.finditer(raw_line))
        if not tags:
            continue
        text = LRC_TAG_RE.sub("", raw_line).strip()
        if not text:
            continue
        for match in tags:
            mins = int(match.group(1))
            secs = int(match.group(2))
            frac = match.group(3) or "0"
            if len(frac) == 1:
                ms_frac = int(frac) * 100
            elif len(frac) == 2:
                ms_frac = int(frac) * 10
            else:
                ms_frac = int(frac[:3])
            start_ms = mins * 60_000 + secs * 1_000 + ms_frac
            raw_entries.append((start_ms, text))

    if not raw_entries:
        return []

    raw_entries.sort(key=lambda item: item[0])
    parsed: List[Dict[str, Any]] = []
    for idx, (start_ms, text) in enumerate(raw_entries):
        if idx + 1 < len(raw_entries) and raw_entries[idx + 1][0] > start_ms:
            end_ms = raw_entries[idx + 1][0]
        else:
            end_ms = start_ms + 4500
        parsed.append({"text": text, "startTimeMs": start_ms, "endTimeMs": end_ms})
    return parsed


def _normalize_quality_tier(quality: Optional[str]) -> str:
    q = (quality or "high").strip().lower()
    if q in ("low", "normal", "high", "very_high", "lossless", "hi_res"):
        return q
    if q == "auto":
        return "high"
    return "high"


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
        self._client_factory = client_factory or (lambda: YTMusic(language="en", location="ID"))
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
        self._stream_locks_guard = threading.Lock()
        self._stream_locks: Dict[str, threading.Lock] = {}
        self._yt_bot_blocked_until: float = 0.0

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
        if _is_excluded_regional_text(clean_q):
            return {"query": clean_q, "filter": norm_filter, "items": []}

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
        if not clean_q or _is_excluded_regional_text(clean_q):
            return {"query": clean_q, "suggestions": []}

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
            if norm and not _is_excluded_catalog_item(norm):
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
                if norm and not _is_excluded_catalog_item(norm):
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
            if norm and not _is_excluded_catalog_item(norm):
                tracks.append(norm)

        more_from_artist: List[Dict[str, Any]] = []
        for rec_group in raw.get("related_recommendations") or []:
            if isinstance(rec_group, Mapping):
                for entry in rec_group.get("contents") or []:
                    norm = normalize_yt_item(entry, default_type="album")
                    if norm and not _is_excluded_catalog_item(norm):
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
            if norm and not _is_excluded_catalog_item(norm):
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

    def fetch_lrclib_lyrics(
        self,
        title: str,
        artist: str = "",
        album: str = "",
        duration_seconds: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        clean_title = _clean_track_title_for_query(title)
        if not clean_title:
            return None
        clean_artist = _clean_artist_for_query(artist)
        clean_album = (album or "").strip()
        headers = {"User-Agent": LRCLIB_USER_AGENT}

        def _build_from_record(rec: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
            synced = rec.get("syncedLyrics")
            plain = rec.get("plainLyrics")
            lines = parse_lrc_lyrics(synced) if isinstance(synced, str) and synced.strip() else []
            plain_str = plain.strip() if isinstance(plain, str) and plain.strip() else None
            if not plain_str and lines:
                plain_str = "\n".join(line["text"] for line in lines)
            if not lines and not plain_str:
                return None
            return {
                "browseId": f"lrclib:{rec.get('id') or 'track'}",
                "hasTimestamps": len(lines) > 0,
                "source": "LRCLIB (Tersinkron)" if lines else "LRCLIB",
                "lines": lines,
                "plainText": plain_str,
            }

        if clean_artist:
            params: Dict[str, Any] = {
                "artist_name": clean_artist,
                "track_name": clean_title,
            }
            if clean_album:
                params["album_name"] = clean_album
            if duration_seconds and duration_seconds > 0:
                params["duration"] = int(round(duration_seconds))
            try:
                resp = self._http_get(
                    "https://lrclib.net/api/get",
                    params=params,
                    headers=headers,
                    timeout=6,
                )
                if getattr(resp, "status_code", 0) == 200:
                    data = resp.json()
                    if isinstance(data, Mapping):
                        built = _build_from_record(data)
                        if built:
                            return built
            except Exception:
                pass

        # Fallback: /api/search with combined query & candidate scoring
        search_q = f"{clean_artist} {clean_title}".strip()
        try:
            resp = self._http_get(
                "https://lrclib.net/api/search",
                params={"q": search_q},
                headers=headers,
                timeout=6,
            )
            if getattr(resp, "status_code", 0) == 200:
                candidates = resp.json()
                if isinstance(candidates, list) and candidates:
                    title_tokens = set(re.findall(r"[a-z0-9]+", clean_title.lower()))
                    artist_tokens = set(re.findall(r"[a-z0-9]+", clean_artist.lower()))
                    scored: List[Tuple[int, Mapping[str, Any]]] = []
                    for rec in candidates:
                        if not isinstance(rec, Mapping):
                            continue
                        if not (rec.get("syncedLyrics") or rec.get("plainLyrics")):
                            continue
                        rec_title = str(rec.get("trackName") or rec.get("name") or "").lower()
                        rec_artist = str(rec.get("artistName") or "").lower()
                        rec_title_tokens = set(re.findall(r"[a-z0-9]+", rec_title))
                        rec_artist_tokens = set(re.findall(r"[a-z0-9]+", rec_artist))
                        score = len(title_tokens & rec_title_tokens) * 15
                        if artist_tokens:
                            score += len(artist_tokens & rec_artist_tokens) * 12
                        if rec.get("syncedLyrics"):
                            score += 8
                        rec_dur = rec.get("duration")
                        if duration_seconds and duration_seconds > 0 and isinstance(rec_dur, (int, float)):
                            diff = abs(float(rec_dur) - float(duration_seconds))
                            if diff <= 8:
                                score += 10
                            elif diff <= 20:
                                score += 4
                            else:
                                score -= 12
                        if score > 0 or not title_tokens:
                            scored.append((score, rec))
                    scored.sort(key=lambda pair: pair[0], reverse=True)
                    for _, best in scored:
                        built = _build_from_record(best)
                        if built:
                            return built
        except Exception:
            pass

        return None

    def get_lyrics(
        self,
        browse_id: str = "",
        *,
        title: str = "",
        artist: str = "",
        album: str = "",
        duration_seconds: Optional[int] = None,
        video_id: str = "",
    ) -> Dict[str, Any]:
        clean_id = (browse_id or "").strip()
        clean_title = (title or "").strip()
        clean_artist = (artist or "").strip()
        clean_vid = (video_id or "").strip()

        if not clean_id and not clean_title:
            raise MusicProviderError("ID lirik atau judul lagu wajib diisi.", 400)

        cache_key = (
            f"lyrics:{clean_id}:{clean_vid}:{clean_title.lower()}:"
            f"{clean_artist.lower()}:{duration_seconds or 0}"
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if clean_title:
            lrc_res = self.fetch_lrclib_lyrics(
                clean_title,
                artist=clean_artist,
                album=album,
                duration_seconds=duration_seconds,
            )
            if lrc_res is not None:
                if clean_id and clean_id not in ("lrclib", "auto"):
                    lrc_res["browseId"] = clean_id
                self._cache.set(cache_key, lrc_res, ttl_seconds=600)
                return lrc_res

        if clean_id and clean_id not in ("lrclib", "auto"):
            raw = None
            try:
                raw = self._call_with_retry(lambda: self._gateway.get_lyrics(clean_id, timestamps=True))
            except MusicProviderError:
                raw = None

            if not raw:
                try:
                    raw = self._call_with_retry(lambda: self._gateway.get_lyrics(clean_id, timestamps=False))
                except MusicProviderError:
                    raw = None

            if raw:
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

        raise MusicProviderError("Lirik tidak tersedia untuk lagu ini.", 404)

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
            if _is_excluded_catalog_item(entry):
                continue
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

    def _get_stream_lock(self, cache_key: str) -> threading.Lock:
        with self._stream_locks_guard:
            lock = self._stream_locks.get(cache_key)
            if lock is None:
                lock = threading.Lock()
                self._stream_locks[cache_key] = lock
            return lock

    def _should_use_ffmpeg_remux(self) -> bool:
        if "_remux_audio_only" in self.__dict__:
            return True
        if os.environ.get("VERCEL"):
            return False
        if os.environ.get("SOUNDCLEAR_PURE_PYTHON_STREAM") == "1":
            return False
        return bool(shutil.which("ffmpeg"))

    def _create_stream_http_session(self) -> requests.Session:
        session = requests.Session()
        adapter = HTTPAdapter(pool_connections=16, pool_maxsize=16)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _probe_url_content_length(
        self,
        session: requests.Session,
        url: str,
        http_headers: Optional[Mapping[str, str]] = None,
    ) -> int:
        req_headers = dict(http_headers or {})
        req_headers.setdefault("Accept-Encoding", "identity")
        try:
            head_resp = session.head(url, headers=req_headers, timeout=8, allow_redirects=True)
            try:
                if head_resp.status_code < 400:
                    cl = head_resp.headers.get("content-length")
                    if cl and cl.isdigit() and int(cl) > 0:
                        return int(cl)
            finally:
                head_resp.close()
        except Exception:
            pass

        range_headers = {**req_headers, "Range": "bytes=0-0"}
        get_resp = session.get(url, headers=range_headers, stream=True, timeout=10, allow_redirects=True)
        try:
            if get_resp.status_code >= 400:
                raise MusicProviderError(
                    f"Gagal memeriksa ukuran aliran audio (HTTP {get_resp.status_code}).",
                    502,
                )
            cr = get_resp.headers.get("content-range") or ""
            match = CONTENT_RANGE_TOTAL_RE.search(cr)
            if match:
                return int(match.group(1))
            cl = get_resp.headers.get("content-length")
            if cl and cl.isdigit() and int(cl) > 0:
                return int(cl)
        finally:
            get_resp.close()

        raise MusicProviderError("Ukuran aliran audio tidak tersedia dari CDN.", 502)

    def _parse_hls_playlist(
        self,
        session: requests.Session,
        playlist_url: str,
        http_headers: Optional[Mapping[str, str]] = None,
    ) -> Tuple[Optional[str], List[str]]:
        req_headers = dict(http_headers or {})
        resp = session.get(playlist_url, headers=req_headers, timeout=10)
        if resp.status_code >= 400:
            raise MusicProviderError(f"Gagal memuat daftar putar HLS (HTTP {resp.status_code}).", 502)
        text = resp.text
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        # Follow master playlist to highest-bitrate variant if present
        if any(line.startswith("#EXT-X-STREAM-INF") for line in lines):
            variant_urls: List[Tuple[int, str]] = []
            pending_bw = 0
            for line in lines:
                if line.startswith("#EXT-X-STREAM-INF"):
                    bw_match = re.search(r"BANDWIDTH=(\d+)", line)
                    pending_bw = int(bw_match.group(1)) if bw_match else 0
                elif not line.startswith("#"):
                    variant_urls.append((pending_bw, urljoin(playlist_url, line)))
                    pending_bw = 0
            if variant_urls:
                variant_urls.sort(key=lambda item: item[0], reverse=True)
                return self._parse_hls_playlist(session, variant_urls[0][1], http_headers)

        init_url: Optional[str] = None
        segment_urls: List[str] = []
        for line in lines:
            if line.startswith("#EXT-X-KEY"):
                if "METHOD=NONE" not in line.upper():
                    raise MusicProviderError("Aliran HLS terenkripsi belum didukung tanpa ffmpeg.", 502)
            elif line.startswith("#EXT-X-MAP:"):
                match = M3U8_MAP_URI_RE.search(line)
                if match:
                    init_url = urljoin(playlist_url, match.group(1))
            elif not line.startswith("#"):
                segment_urls.append(urljoin(playlist_url, line))

        if not segment_urls:
            raise MusicProviderError("Daftar segmen audio HLS kosong.", 502)

        return init_url, segment_urls

    def _build_virtual_hls_plan(
        self,
        m3u8_url: str,
        http_headers: Optional[Mapping[str, str]] = None,
    ) -> Dict[str, Any]:
        session = self._create_stream_http_session()
        try:
            init_url, segment_urls = self._parse_hls_playlist(session, m3u8_url, http_headers)
            all_urls = ([init_url] if init_url else []) + segment_urls
            with ThreadPoolExecutor(max_workers=min(12, max(1, len(all_urls)))) as pool:
                lengths = list(
                    pool.map(
                        lambda u: self._probe_url_content_length(session, u, http_headers),
                        all_urls,
                    )
                )
        finally:
            session.close()

        segments: List[Dict[str, Any]] = []
        offset = 0
        for seg_url, seg_len in zip(all_urls, lengths):
            if seg_len <= 0:
                continue
            segments.append(
                {
                    "url": seg_url,
                    "start": offset,
                    "end": offset + seg_len - 1,
                    "length": seg_len,
                }
            )
            offset += seg_len

        if offset <= 0 or not segments:
            raise MusicProviderError("Segmen audio HLS tidak memiliki konten yang valid.", 502)

        return {
            "kind": "hls",
            "segments": segments,
            "totalSize": offset,
            "httpHeaders": dict(http_headers or {}),
        }

    def _build_virtual_progressive_plan(
        self,
        source_url: str,
        http_headers: Optional[Mapping[str, str]] = None,
    ) -> Dict[str, Any]:
        session = self._create_stream_http_session()
        try:
            total_size = self._probe_url_content_length(session, source_url, http_headers)
        finally:
            session.close()
        return {
            "kind": "progressive",
            "sourceUrl": source_url,
            "totalSize": total_size,
            "httpHeaders": dict(http_headers or {}),
        }

    def read_virtual_stream_bytes(self, meta: Mapping[str, Any], start: int, end: int) -> bytes:
        plan = meta.get("plan")
        if not isinstance(plan, Mapping):
            raise MusicProviderError("Rencana aliran audio tidak tersedia.", 500)

        kind = str(plan.get("kind") or "")
        http_headers = plan.get("httpHeaders")
        req_headers = dict(http_headers) if isinstance(http_headers, Mapping) else {}
        req_headers.setdefault("Accept-Encoding", "identity")
        expected_len = max(0, end - start + 1)
        if expected_len == 0:
            return b""

        session = self._create_stream_http_session()
        try:
            if kind == "progressive":
                source_url = str(plan.get("sourceUrl") or "")
                if not source_url:
                    raise MusicProviderError("URL sumber audio tidak valid.", 502)
                headers = {**req_headers, "Range": f"bytes={start}-{end}"}
                resp = session.get(source_url, headers=headers, stream=True, timeout=20)
                try:
                    if resp.status_code >= 400:
                        raise MusicProviderError(
                            f"Gagal mengambil segmen audio (HTTP {resp.status_code}).",
                            502,
                        )
                    if resp.status_code == 206:
                        raw = resp.content
                        return raw[:expected_len]
                    # Fallback if upstream ignored Range and returned 200
                    buf = bytearray()
                    bytes_seen = 0
                    for chunk in resp.iter_content(chunk_size=65536):
                        if not chunk:
                            continue
                        chunk_start = bytes_seen
                        chunk_end = bytes_seen + len(chunk) - 1
                        bytes_seen += len(chunk)
                        if chunk_end < start:
                            continue
                        if chunk_start > end:
                            break
                        lo = max(0, start - chunk_start)
                        hi = min(len(chunk), end - chunk_start + 1)
                        buf.extend(chunk[lo:hi])
                        if bytes_seen > end:
                            break
                    return bytes(buf[:expected_len])
                finally:
                    resp.close()

            if kind == "hls":
                raw_segments = plan.get("segments") or []
                overlapping = [
                    seg
                    for seg in raw_segments
                    if isinstance(seg, Mapping)
                    and int(seg["end"]) >= start
                    and int(seg["start"]) <= end
                ]
                if not overlapping:
                    return b""

                def _fetch_seg(seg: Mapping[str, Any]) -> bytes:
                    seg_url = str(seg["url"])
                    resp = session.get(seg_url, headers=req_headers, timeout=20)
                    if resp.status_code >= 400:
                        raise MusicProviderError(
                            f"Gagal mengunduh segmen audio HLS (HTTP {resp.status_code}).",
                            502,
                        )
                    return resp.content

                with ThreadPoolExecutor(max_workers=min(8, max(1, len(overlapping)))) as pool:
                    seg_blobs = list(pool.map(_fetch_seg, overlapping))

                out = bytearray()
                for seg, blob in zip(overlapping, seg_blobs):
                    seg_start = int(seg["start"])
                    lo = max(0, start - seg_start)
                    hi = min(len(blob), end - seg_start + 1)
                    if hi > lo:
                        out.extend(blob[lo:hi])
                return bytes(out[:expected_len])

            raise MusicProviderError(f"Mode aliran audio '{kind}' tidak didukung.", 500)
        finally:
            session.close()

    def _stream_cache_paths(self, video_id: str, tier: str) -> Tuple[str, str]:
        safe_vid = re.sub(r"[^A-Za-z0-9_-]", "_", video_id)
        os.makedirs(STREAM_CACHE_DIR, exist_ok=True)
        meta_path = os.path.join(STREAM_CACHE_DIR, f"{safe_vid}_{tier}.meta.json")
        m4a_path = os.path.join(STREAM_CACHE_DIR, f"{safe_vid}_{tier}.m4a")
        return meta_path, m4a_path

    def _virtual_plan_cache_path(self, video_id: str, tier: str) -> str:
        safe_vid = re.sub(r"[^A-Za-z0-9_-]", "_", video_id)
        os.makedirs(STREAM_CACHE_DIR, exist_ok=True)
        return os.path.join(STREAM_CACHE_DIR, f"{safe_vid}_{tier}.plan.json")

    def _read_cached_stream_meta(self, meta_path: str) -> Optional[Dict[str, Any]]:
        if not os.path.isfile(meta_path):
            return None
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict) and data.get("filePath") and os.path.isfile(str(data["filePath"])):
                if os.path.getsize(str(data["filePath"])) > 1024:
                    return data
        except Exception:
            pass
        return None

    def _read_cached_virtual_plan(self, video_id: str, tier: str) -> Optional[Dict[str, Any]]:
        mem_key = f"vstream:{video_id}:{tier}"
        mem = self._cache.get(mem_key)
        if isinstance(mem, dict) and mem.get("expiresAt", 0) > time.time():
            return mem
        plan_path = self._virtual_plan_cache_path(video_id, tier)
        if not os.path.isfile(plan_path):
            return None
        try:
            with open(plan_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if (
                isinstance(data, dict)
                and data.get("streamMode") == "virtual"
                and float(data.get("expiresAt") or 0) > time.time()
                and int(data.get("totalSize") or 0) > 0
            ):
                self._cache.set(mem_key, data, ttl_seconds=1800)
                return data
        except Exception:
            pass
        return None

    def _pick_audio_only_format(
        self,
        formats: List[Mapping[str, Any]],
        tier: str,
        *,
        allow_ffmpeg_only: bool = True,
    ) -> Optional[Mapping[str, Any]]:
        audio_only: List[Mapping[str, Any]] = []
        for fmt in formats:
            if not isinstance(fmt, Mapping) or not fmt.get("url"):
                continue
            vcodec = str(fmt.get("vcodec") or "none").lower()
            acodec = str(fmt.get("acodec") or "").lower()
            if vcodec not in ("none", ""):
                continue
            if acodec == "none":
                continue
            ext = str(fmt.get("ext") or "").lower()
            proto = str(fmt.get("protocol") or "").lower()
            if not allow_ffmpeg_only:
                # Without ffmpeg, skip raw MPEG-TS or non-HTTP protocols
                if proto and not (proto.startswith("http") or "m3u8" in proto):
                    continue
                if ext == "ts" or "mpegts" in proto:
                    continue
            audio_only.append(fmt)

        if not audio_only:
            return None

        def _fmt_score(fmt: Mapping[str, Any]) -> Tuple[int, float]:
            ext = str(fmt.get("ext") or "").lower()
            acodec = str(fmt.get("acodec") or "").lower()
            fmt_id = str(fmt.get("format_id") or "").lower()
            proto = str(fmt.get("protocol") or "").lower()
            abr = float(fmt.get("abr") or fmt.get("tbr") or 0)
            is_aac_mp3 = (
                2
                if (
                    ext in ("m4a", "mp3", "aac")
                    or "aac" in acodec
                    or "mp3" in acodec
                    or "aac" in fmt_id
                    or "mp3" in fmt_id
                )
                else 1
            )
            is_progressive = 1 if (proto in ("http", "https") and "m3u8" not in str(fmt.get("url") or "").lower()) else 0
            if not allow_ffmpeg_only and is_aac_mp3 == 1 and ext in ("opus", "ogg"):
                # Prefer universally supported AAC/MP3 containers over raw opus/ogg when no ffmpeg
                is_aac_mp3 = 0
            if tier == "low":
                cap_ok = 1 if abr <= 96 or abr == 0 else 0
                return (cap_ok, is_aac_mp3 * 100 + is_progressive * 10 - abs(abr - 80))
            if tier == "normal":
                cap_ok = 1 if abr <= 145 or abr == 0 else 0
                return (cap_ok, is_aac_mp3 * 100 + is_progressive * 10 - abs(abr - 128))
            return (is_aac_mp3, abr + is_progressive * 5)

        audio_only.sort(key=_fmt_score, reverse=True)
        return audio_only[0]

    def _remux_audio_only(
        self,
        source_url: str,
        out_path: str,
        codec_hint: str,
        target_ext: str,
        http_headers: Optional[Mapping[str, str]] = None,
    ) -> None:
        tmp_path = f"{out_path}.{os.getpid()}.{threading.get_ident()}.tmp{os.path.splitext(out_path)[1]}"
        header_args: List[str] = []
        if http_headers:
            header_lines = "".join(f"{k}: {v}\r\n" for k, v in http_headers.items() if k and v)
            if header_lines:
                header_args = ["-headers", header_lines]

        base_cmd = [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-loglevel",
            "error",
            *header_args,
            "-i",
            source_url,
            "-vn",
        ]
        copy_cmd = [*base_cmd, "-c:a", "copy"]
        if target_ext == "m4a":
            copy_cmd.extend(["-movflags", "+faststart"])
        copy_cmd.append(tmp_path)

        res = subprocess.run(copy_cmd, capture_output=True, text=True, timeout=75)
        if res.returncode != 0 or not os.path.isfile(tmp_path) or os.path.getsize(tmp_path) <= 1024:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            # Transcode fallback when raw stream container doesn't support stream copy into m4a
            transcode_cmd = [
                *base_cmd,
                "-c:a",
                "libmp3lame" if target_ext == "mp3" else "aac",
                "-b:a",
                "160k" if "160" in codec_hint else "128k",
                *(["-movflags", "+faststart"] if target_ext == "m4a" else []),
                tmp_path,
            ]
            res2 = subprocess.run(transcode_cmd, capture_output=True, text=True, timeout=90)
            if res2.returncode != 0 or not os.path.isfile(tmp_path) or os.path.getsize(tmp_path) <= 1024:
                err_msg = (res2.stderr or res.stderr or "Gagal memproses aliran audio.").strip()
                raise MusicProviderError(f"Gagal memproses aliran audio: {err_msg[:180]}", 502)

        os.replace(tmp_path, out_path)

    def _score_soundcloud_entry(
        self,
        entry: Mapping[str, Any],
        clean_title: str,
        clean_artist: str,
        target_dur: Optional[int],
    ) -> Optional[int]:
        cand_title = str(entry.get("title") or "").strip()
        cand_uploader = str(entry.get("uploader") or entry.get("artist") or "").strip()
        combined = f"{cand_title} {cand_uploader}"
        if not cand_title or _is_excluded_regional_text(combined):
            return None

        cand_dur = entry.get("duration")
        if target_dur and target_dur > 45 and isinstance(cand_dur, (int, float)) and cand_dur <= 35:
            # Skip short 30-second preview snippets
            return None

        target_lower = clean_title.lower()
        cand_lower = cand_title.lower()
        penalty = 0
        for variant in VARIANT_WORDS:
            if variant in cand_lower and variant not in target_lower:
                penalty += 80

        title_tokens = set(re.findall(r"[a-z0-9]+", target_lower))
        artist_tokens = set(re.findall(r"[a-z0-9]+", clean_artist.lower()))
        cand_tokens = set(re.findall(r"[a-z0-9]+", f"{cand_lower} {cand_uploader.lower()}"))

        title_overlap = len(title_tokens & cand_tokens)
        if title_tokens and title_overlap == 0:
            return None

        artist_overlap = len(artist_tokens & cand_tokens)
        score = title_overlap * 25 + artist_overlap * 18 - penalty
        if isinstance(cand_dur, (int, float)) and cand_dur > 45:
            score += 12
        if target_dur and isinstance(cand_dur, (int, float)):
            diff = abs(float(cand_dur) - float(target_dur))
            score -= int(min(diff, 60) // 2)
        return score

    def _extract_audio_source(
        self,
        video_id: str,
        title: str,
        artist: str,
        duration_seconds: Optional[int],
        tier: str,
    ) -> Tuple[Mapping[str, Any], str]:
        allow_ffmpeg_only = self._should_use_ffmpeg_remux()
        ydl_base_opts: Dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "nocheckcertificate": True,
            "socket_timeout": 12,
            "cachedir": False,
        }

        clean_title = _clean_track_title_for_query(title)
        clean_artist = _clean_artist_for_query(artist)
        skip_yt_on_vercel = bool(
            os.environ.get("VERCEL")
            and os.environ.get("SOUNDCLEAR_TRY_YT_ON_VERCEL") != "1"
            and clean_title
        )

        # 1. Try direct YouTube audio-only extraction unless recently bot-blocked or on Vercel serverless
        if (
            not skip_yt_on_vercel
            and time.monotonic() >= self._yt_bot_blocked_until
            and VIDEO_ID_RE.fullmatch(video_id)
        ):
            try:
                with yt_dlp.YoutubeDL({**ydl_base_opts, "skip_download": True}) as ydl:
                    info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if isinstance(info, Mapping):
                    fmt = self._pick_audio_only_format(
                        list(info.get("formats") or []),
                        tier,
                        allow_ffmpeg_only=allow_ffmpeg_only,
                    )
                    if fmt and fmt.get("url"):
                        return fmt, "YouTube Audio"
            except Exception as exc:
                err_str = str(exc).lower()
                if "sign in to confirm" in err_str or "bot" in err_str or "login" in err_str:
                    self._yt_bot_blocked_until = time.monotonic() + 600

        # 2. Fallback to SoundCloud full audio-only search (works reliably on serverless)
        core_title = re.split(r"\s*(?:\|\||\|+|//|•)\s*", clean_title, maxsplit=1)[0].strip()
        core_title = re.sub(
            r"\s+[-–—]\s+(?:official|lyric|audio|video|live|cover|remix|jazz|acoustic).*$",
            "",
            core_title,
            flags=re.IGNORECASE,
        ).strip()
        core_title_plain = re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", core_title or clean_title)).strip()

        raw_queries: List[str] = []
        if clean_artist and clean_title:
            raw_queries.append(f"{clean_artist} {clean_title}")
        if clean_artist and core_title_plain:
            raw_queries.append(f"{clean_artist} {core_title_plain}")
        if core_title_plain:
            raw_queries.append(core_title_plain)
        words = core_title_plain.split()
        if len(words) > 6:
            raw_queries.append(" ".join(words[:6]))

        queries: List[str] = []
        seen_q: set[str] = set()
        for q_cand in raw_queries:
            norm_q = " ".join(q_cand.split()).strip()
            if norm_q and norm_q.lower() not in seen_q:
                seen_q.add(norm_q.lower())
                queries.append(norm_q)

        if not queries:
            raise MusicProviderError("Metadata lagu tidak cukup untuk memutar audio.", 404)

        search_opts = {**ydl_base_opts, "extract_flat": True}
        last_search_exc: Optional[Exception] = None
        score_target_title = core_title_plain or clean_title

        for sc_query in queries[:3]:
            entries: List[Mapping[str, Any]] = []
            try:
                with yt_dlp.YoutubeDL(search_opts) as ydl:
                    res = ydl.extract_info(f"scsearch8:{sc_query}", download=False)
                if isinstance(res, Mapping):
                    entries = [e for e in (res.get("entries") or []) if isinstance(e, Mapping)]
            except Exception as exc:
                last_search_exc = exc
                continue

            if not entries:
                continue

            scored: List[Tuple[int, Mapping[str, Any]]] = []
            for entry in entries:
                s = self._score_soundcloud_entry(entry, score_target_title, clean_artist, duration_seconds)
                if s is not None:
                    scored.append((s, entry))
            scored.sort(key=lambda pair: pair[0], reverse=True)

            if not scored:
                for entry in entries:
                    if _is_excluded_regional_text(f"{entry.get('title') or ''} {entry.get('uploader') or ''}"):
                        continue
                    dur = entry.get("duration")
                    if isinstance(dur, (int, float)) and dur > 35:
                        scored.append((1, entry))
                if not scored:
                    for entry in entries:
                        if not _is_excluded_regional_text(f"{entry.get('title') or ''} {entry.get('uploader') or ''}"):
                            scored.append((0, entry))

            for _, candidate in scored[:4]:
                target_url = candidate.get("url") or candidate.get("webpage_url")
                if not isinstance(target_url, str) or not target_url:
                    continue
                try:
                    with yt_dlp.YoutubeDL({**ydl_base_opts, "skip_download": True}) as ydl:
                        full_info = ydl.extract_info(target_url, download=False)
                    if not isinstance(full_info, Mapping):
                        continue
                    dur_val = full_info.get("duration")
                    if duration_seconds and duration_seconds > 45 and isinstance(dur_val, (int, float)) and dur_val <= 35:
                        continue
                    fmt = self._pick_audio_only_format(
                        list(full_info.get("formats") or []),
                        tier,
                        allow_ffmpeg_only=allow_ffmpeg_only,
                    )
                    if fmt and fmt.get("url"):
                        return fmt, "SoundCloud Audio"
                except Exception:
                    continue

        if last_search_exc is not None:
            raise MusicProviderError(f"Gagal mencari sumber audio: {last_search_exc}", 502) from last_search_exc
        raise MusicProviderError("Sumber aliran audio belum tersedia untuk lagu ini.", 404)

    def _resolve_track_metadata_for_stream(
        self,
        clean_vid: str,
        title: str,
        artist: str,
        duration_seconds: Optional[int],
    ) -> Tuple[str, str, Optional[int]]:
        resolved_title = (title or "").strip()
        resolved_artist = _clean_artist_for_query(artist)
        resolved_dur = duration_seconds

        if not resolved_title:
            try:
                watch = self.get_watch_playlist(clean_vid, radio=False, limit=1)
                first = (watch.get("tracks") or [None])[0]
                if isinstance(first, Mapping):
                    resolved_title = str(first.get("title") or "").strip()
                    if not resolved_artist and first.get("artists"):
                        resolved_artist = _clean_artist_for_query(str(first["artists"][0].get("name") or ""))
                    if not resolved_dur:
                        resolved_dur = first.get("durationSeconds")
            except Exception:
                pass

        if not resolved_title and VIDEO_ID_RE.fullmatch(clean_vid):
            try:
                song_raw = self._gateway.get_song(clean_vid)
                details = song_raw.get("videoDetails") if isinstance(song_raw, Mapping) else None
                if isinstance(details, Mapping):
                    resolved_title = str(details.get("title") or "").strip()
                    if not resolved_artist and details.get("author"):
                        resolved_artist = _clean_artist_for_query(str(details.get("author") or ""))
                    if not resolved_dur and details.get("lengthSeconds"):
                        try:
                            resolved_dur = int(details["lengthSeconds"])
                        except (TypeError, ValueError):
                            pass
            except Exception:
                pass

        if resolved_title and _is_excluded_regional_text(f"{resolved_title} {resolved_artist}"):
            raise MusicProviderError("Konten regional ini difilter dari pemutaran.", 403)

        return resolved_title, resolved_artist, resolved_dur

    def resolve_or_build_audio_stream(
        self,
        video_id: str,
        *,
        title: str = "",
        artist: str = "",
        duration_seconds: Optional[int] = None,
        quality: Optional[str] = "high",
    ) -> Dict[str, Any]:
        clean_vid = (video_id or "").strip()
        if not clean_vid:
            raise MusicProviderError("ID lagu tidak valid.", 400)

        tier = _normalize_quality_tier(quality)
        use_ffmpeg = self._should_use_ffmpeg_remux()

        if not use_ffmpeg:
            existing_virtual = self._read_cached_virtual_plan(clean_vid, tier)
            if existing_virtual is not None:
                return existing_virtual

            lock = self._get_stream_lock(f"v:{clean_vid}:{tier}")
            with lock:
                existing_virtual = self._read_cached_virtual_plan(clean_vid, tier)
                if existing_virtual is not None:
                    return existing_virtual

                resolved_title, resolved_artist, resolved_dur = self._resolve_track_metadata_for_stream(
                    clean_vid, title, artist, duration_seconds
                )
                fmt, source_label = self._extract_audio_source(
                    clean_vid,
                    resolved_title,
                    resolved_artist,
                    resolved_dur,
                    tier,
                )
                stream_url = str(fmt.get("url") or "")
                raw_ext = str(fmt.get("ext") or "m4a").lower()
                proto = str(fmt.get("protocol") or "").lower()
                acodec_raw = str(fmt.get("acodec") or "").lower()
                fmt_id = str(fmt.get("format_id") or "").lower()
                http_headers = fmt.get("http_headers") if isinstance(fmt.get("http_headers"), Mapping) else None

                if raw_ext == "mp3" or "mp3" in acodec_raw or "mp3" in fmt_id:
                    target_ext = "mp3"
                    codec_label = "MP3"
                    mime_type = "audio/mpeg"
                elif raw_ext in ("webm", "opus") and "aac" not in acodec_raw:
                    target_ext = "webm" if raw_ext == "webm" else "ogg"
                    codec_label = "Opus"
                    mime_type = "audio/webm" if target_ext == "webm" else "audio/ogg"
                else:
                    target_ext = "m4a"
                    codec_label = "AAC"
                    mime_type = "audio/mp4"

                abr_val = fmt.get("abr") or fmt.get("tbr")
                bitrate_kbps = (
                    int(round(float(abr_val)))
                    if isinstance(abr_val, (int, float)) and abr_val > 0
                    else (96 if tier == "low" else 128 if tier == "normal" else 160)
                )
                asr_val = fmt.get("asr")
                sample_rate_hz = int(asr_val) if isinstance(asr_val, (int, float)) and asr_val > 0 else 44100

                is_hls = "m3u8" in proto or ".m3u8" in stream_url.lower()
                plan = (
                    self._build_virtual_hls_plan(stream_url, http_headers)
                    if is_hls
                    else self._build_virtual_progressive_plan(stream_url, http_headers)
                )

                meta: Dict[str, Any] = {
                    "trackId": clean_vid,
                    "available": True,
                    "codec": codec_label,
                    "bitrateKbps": bitrate_kbps,
                    "sampleRateHz": sample_rate_hz,
                    "ext": target_ext,
                    "mimeType": mime_type,
                    "source": source_label,
                    "tier": tier,
                    "cacheReady": True,
                    "streamMode": "virtual",
                    "totalSize": int(plan["totalSize"]),
                    "plan": plan,
                    "expiresAt": time.time() + 1800,
                }
                self._cache.set(f"vstream:{clean_vid}:{tier}", meta, ttl_seconds=1800)
                try:
                    plan_path = self._virtual_plan_cache_path(clean_vid, tier)
                    tmp_plan = f"{plan_path}.{os.getpid()}.{threading.get_ident()}.tmp"
                    with open(tmp_plan, "w", encoding="utf-8") as fh:
                        json.dump(meta, fh, ensure_ascii=False)
                    os.replace(tmp_plan, plan_path)
                except Exception:
                    pass
                return meta

        meta_path, _ = self._stream_cache_paths(clean_vid, tier)
        existing = self._read_cached_stream_meta(meta_path)
        if existing is not None:
            return existing

        lock = self._get_stream_lock(f"{clean_vid}:{tier}")
        with lock:
            existing = self._read_cached_stream_meta(meta_path)
            if existing is not None:
                return existing

            resolved_title, resolved_artist, resolved_dur = self._resolve_track_metadata_for_stream(
                clean_vid, title, artist, duration_seconds
            )

            fmt, source_label = self._extract_audio_source(
                clean_vid,
                resolved_title,
                resolved_artist,
                resolved_dur,
                tier,
            )
            stream_url = str(fmt.get("url") or "")
            raw_ext = str(fmt.get("ext") or "m4a").lower()
            target_ext = "mp3" if raw_ext == "mp3" else "m4a"
            safe_vid = re.sub(r"[^A-Za-z0-9_-]", "_", clean_vid)
            out_path = os.path.join(STREAM_CACHE_DIR, f"{safe_vid}_{tier}.{target_ext}")

            acodec_raw = str(fmt.get("acodec") or "").lower()
            fmt_id = str(fmt.get("format_id") or "").lower()
            if target_ext == "mp3" or "mp3" in acodec_raw or "mp3" in fmt_id:
                codec_label = "MP3"
                mime_type = "audio/mpeg"
            else:
                codec_label = "AAC"
                mime_type = "audio/mp4"

            abr_val = fmt.get("abr") or fmt.get("tbr")
            bitrate_kbps = int(round(float(abr_val))) if isinstance(abr_val, (int, float)) and abr_val > 0 else (
                96 if tier == "low" else 128 if tier == "normal" else 160
            )
            asr_val = fmt.get("asr")
            sample_rate_hz = int(asr_val) if isinstance(asr_val, (int, float)) and asr_val > 0 else 44100

            self._remux_audio_only(
                stream_url,
                out_path,
                fmt_id,
                target_ext,
                http_headers=fmt.get("http_headers") if isinstance(fmt.get("http_headers"), Mapping) else None,
            )

            meta: Dict[str, Any] = {
                "trackId": clean_vid,
                "available": True,
                "codec": codec_label,
                "bitrateKbps": bitrate_kbps,
                "sampleRateHz": sample_rate_hz,
                "ext": target_ext,
                "mimeType": mime_type,
                "source": source_label,
                "tier": tier,
                "cacheReady": True,
                "filePath": out_path,
            }
            tmp_meta = f"{meta_path}.tmp"
            with open(tmp_meta, "w", encoding="utf-8") as fh:
                json.dump(meta, fh, ensure_ascii=False)
            os.replace(tmp_meta, meta_path)
            return meta

    def get_audio_stream_info(
        self,
        video_id: str,
        *,
        title: str = "",
        artist: str = "",
        duration_seconds: Optional[int] = None,
        quality: Optional[str] = "high",
    ) -> Dict[str, Any]:
        meta = self.resolve_or_build_audio_stream(
            video_id,
            title=title,
            artist=artist,
            duration_seconds=duration_seconds,
            quality=quality,
        )
        excluded_keys = {"filePath", "plan", "expiresAt"}
        return {k: v for k, v in meta.items() if k not in excluded_keys}


