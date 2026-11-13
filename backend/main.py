from __future__ import annotations

from contextlib import asynccontextmanager
import os
import re
import threading
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.music_provider import (
    MusicProvider,
    MusicProviderError,
    VERCEL_FULL_RESPONSE_LIMIT_BYTES,
    VERCEL_MAX_STREAM_CHUNK_BYTES,
)

load_dotenv()

provider = MusicProvider(country="ID")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.environ.get("SOUNDCLEAR_DISABLE_WARMUP") != "1" and not os.environ.get("VERCEL"):
        threading.Thread(target=provider.warmup, daemon=True).start()
    yield


app = FastAPI(title="SoundClear API", version="3.0.0", lifespan=lifespan)


class RateBody(BaseModel):
    videoId: str
    rating: str = "LIKE"


class CreatePlaylistBody(BaseModel):
    title: str
    description: str = ""
    videoIds: List[str] = Field(default_factory=list)


class AddPlaylistItemsBody(BaseModel):
    playlistId: str
    videoIds: List[str] = Field(default_factory=list)


class SubscribeBody(BaseModel):
    channelIds: List[str] = Field(default_factory=list)
    subscribe: bool = True


class AudioSettingsBody(BaseModel):
    accountKey: Optional[str] = None
    settings: Dict[str, Any]


@app.exception_handler(MusicProviderError)
async def music_provider_error_handler(_request: Request, exc: MusicProviderError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "soundclear", "provider": "soundclear-cloud"}


@app.get("/api/search")
def search(
    q: str = Query(default=""),
    filter: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=50),
) -> Dict[str, Any]:
    return provider.search(q, filter, limit)


@app.get("/api/suggest")
def suggest(q: str = Query(default="")) -> Dict[str, Any]:
    return provider.suggest(q)


@app.get("/api/home")
def home(limit: int = Query(default=8, ge=1, le=20)) -> Dict[str, Any]:
    return provider.get_home(limit)


@app.get("/api/charts")
def charts(country: str = Query(default="ID")) -> Dict[str, Any]:
    return provider.get_charts(country)


@app.get("/api/moods")
def moods() -> Dict[str, Any]:
    return provider.get_moods()


@app.get("/api/moods/{params}")
def mood_playlists(params: str) -> Dict[str, Any]:
    return provider.get_mood_playlists(params)


@app.get("/api/artist/{artist_id}")
def artist(artist_id: str, q: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_artist(artist_id, fallback_query=q)


@app.get("/api/artist/{artist_id}/albums")
def artist_albums(artist_id: str, params: str = Query(default="")) -> List[Dict[str, Any]]:
    if not params:
        raise HTTPException(status_code=400, detail="Parameter params wajib diisi.")
    return provider.get_artist_albums(artist_id, params)


@app.get("/api/album/{album_id}")
def album(album_id: str, q: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_album(album_id, fallback_query=q)


@app.get("/api/playlist/{playlist_id}")
def playlist(
    playlist_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    q: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    return provider.get_playlist(playlist_id, limit, fallback_query=q)


@app.get("/api/watch/{video_id}")
def watch_playlist(
    video_id: str,
    radio: bool = Query(default=True),
    playlistId: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=50),
) -> Dict[str, Any]:
    return provider.get_watch_playlist(video_id, playlistId, radio, limit)


@app.get("/api/lyrics")
def lyrics_by_query(
    browseId: Optional[str] = Query(default=""),
    videoId: Optional[str] = Query(default=""),
    title: Optional[str] = Query(default=""),
    artist: Optional[str] = Query(default=""),
    album: Optional[str] = Query(default=""),
    durationSeconds: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    return provider.get_lyrics(
        browseId or "",
        title=title or "",
        artist=artist or "",
        album=album or "",
        duration_seconds=durationSeconds,
        video_id=videoId or "",
    )


@app.get("/api/lyrics/{browse_id}")
def lyrics(
    browse_id: str,
    videoId: Optional[str] = Query(default=""),
    title: Optional[str] = Query(default=""),
    artist: Optional[str] = Query(default=""),
    album: Optional[str] = Query(default=""),
    durationSeconds: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    return provider.get_lyrics(
        browse_id,
        title=title or "",
        artist=artist or "",
        album=album or "",
        duration_seconds=durationSeconds,
        video_id=videoId or "",
    )


@app.get("/api/song/{video_id}/credits")
def song_credits(
    video_id: str,
    albumId: Optional[str] = Query(default=None),
    creditsBrowseId: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    return provider.get_song_credits(video_id, albumId, creditsBrowseId)


@app.get("/api/song/{video_id}/related")
def song_related(video_id: str) -> Dict[str, Any]:
    return provider.get_song_related(video_id)


@app.get("/api/podcast/{podcast_id}")
def podcast(
    podcast_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    q: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    return provider.get_podcast(podcast_id, limit, fallback_query=q)


@app.get("/api/episode/{video_id}")
def episode(video_id: str, q: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_episode(video_id, fallback_query=q)


@app.get("/api/channel/{channel_id}/episodes")
def channel_episodes(channel_id: str, params: str = Query(default="")) -> List[Dict[str, Any]]:
    if not params:
        raise HTTPException(status_code=400, detail="Parameter params wajib diisi.")
    return provider.get_channel_episodes(channel_id, params)


@app.get("/api/account/status")
def account_status() -> Dict[str, Any]:
    return provider.get_account_status()


@app.get("/api/account/library")
def account_library() -> Dict[str, Any]:
    return provider.get_account_library()


@app.post("/api/account/rate")
def account_rate(body: RateBody) -> Dict[str, Any]:
    return provider.account_rate(body.videoId, body.rating)


@app.post("/api/account/playlist")
def account_create_playlist(body: CreatePlaylistBody) -> Dict[str, Any]:
    return provider.account_create_playlist(body.title, body.description, body.videoIds)


@app.post("/api/account/playlist/items")
def account_add_playlist_items(body: AddPlaylistItemsBody) -> Dict[str, Any]:
    return provider.account_add_playlist_items(body.playlistId, body.videoIds)


@app.post("/api/account/subscribe")
def account_subscribe(body: SubscribeBody) -> Dict[str, Any]:
    return provider.account_subscribe(body.channelIds, body.subscribe)


@app.get("/api/artwork-color")
def artwork_color(url: str = Query(default="")) -> Dict[str, Any]:
    if len(url) < 10:
        raise HTTPException(status_code=400, detail="Parameter url tidak valid.")
    return provider.extract_artwork_color(url)


@app.get("/api/play/resolve")
def resolve_play(
    id: str = Query(default=""),
    title: str = Query(default=""),
    artist: str = Query(default=""),
    type: str = Query(default="song"),
    durationSeconds: Optional[int] = Query(default=None),
    fallback: bool = Query(default=False),
    exclude: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    if not id and not title:
        raise HTTPException(status_code=400, detail="Parameter id atau title wajib diisi.")
    exclude_ids = [s.strip() for s in exclude.split(",") if s.strip()] if exclude else None
    return provider.resolve_playable_youtube(
        id,
        title=title,
        artist=artist,
        item_type=type,
        duration_seconds=durationSeconds,
        fallback=fallback,
        exclude_ids=exclude_ids,
    )


@app.get("/api/account/audio-settings")
def get_account_audio_settings(accountKey: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_audio_settings(account_key=accountKey)


@app.put("/api/account/audio-settings")
def put_account_audio_settings(body: AudioSettingsBody) -> Dict[str, Any]:
    return provider.save_audio_settings(body.settings, account_key=body.accountKey)


@app.post("/api/account/audio-settings/reset")
def reset_account_audio_settings(accountKey: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.reset_audio_settings(account_key=accountKey)


@app.get("/api/stream/{video_id}/meta")
def stream_audio_meta(
    video_id: str,
    title: str = Query(default=""),
    artist: str = Query(default=""),
    durationSeconds: Optional[int] = Query(default=None),
    quality: str = Query(default="high"),
) -> Dict[str, Any]:
    try:
        return provider.get_audio_stream_info(
            video_id,
            title=title,
            artist=artist,
            duration_seconds=durationSeconds,
            quality=quality,
        )
    except MusicProviderError as exc:
        if exc.status_code in (403, 404, 502):
            return {
                "trackId": video_id,
                "available": False,
                "fallbackMode": "youtube-iframe",
                "reason": exc.message,
                "codec": "YT Music",
                "bitrateKbps": None,
                "sampleRateHz": None,
                "ext": "mp4",
                "mimeType": "audio/mp4",
                "source": "YouTube Music",
                "tier": quality,
                "cacheReady": False,
            }
        raise


def _parse_http_range_header(range_header: str, file_size: int) -> Tuple[int, int]:
    match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip(), re.IGNORECASE)
    if not match or (not match.group(1) and not match.group(2)):
        raise HTTPException(
            status_code=416,
            detail="Header Range tidak valid.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )
    if match.group(1):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else file_size - 1
    else:
        suffix_len = int(match.group(2))
        start = max(0, file_size - suffix_len)
        end = file_size - 1

    if start >= file_size or end < start:
        raise HTTPException(
            status_code=416,
            detail="Rentang byte di luar ukuran berkas audio.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )
    end = min(end, file_size - 1)
    return start, end


@app.api_route("/api/stream/{video_id}", methods=["GET", "HEAD"])
def stream_audio(
    video_id: str,
    request: Request,
    title: str = Query(default=""),
    artist: str = Query(default=""),
    durationSeconds: Optional[int] = Query(default=None),
    quality: str = Query(default="high"),
) -> Response:
    meta = provider.resolve_or_build_audio_stream(
        video_id,
        title=title,
        artist=artist,
        duration_seconds=durationSeconds,
        quality=quality,
    )
    mime_type = str(meta.get("mimeType") or "audio/mp4")
    range_header = request.headers.get("range")
    is_vercel = bool(os.environ.get("VERCEL"))

    base_headers: Dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=1800",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, X-SoundClear-Codec, X-SoundClear-Bitrate",
        "X-SoundClear-Codec": str(meta.get("codec") or "AAC"),
        "X-SoundClear-Bitrate": str(meta.get("bitrateKbps") or 160),
    }

    if meta.get("streamMode") == "virtual":
        file_size = int(meta["totalSize"])
        start = 0
        end = file_size - 1
        status_code = 200

        if range_header:
            start, end = _parse_http_range_header(range_header, file_size)
            end = min(end, start + VERCEL_MAX_STREAM_CHUNK_BYTES - 1, file_size - 1)
            status_code = 206
            base_headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        elif (is_vercel and file_size > VERCEL_FULL_RESPONSE_LIMIT_BYTES) or file_size > 12_000_000:
            end = min(file_size - 1, VERCEL_MAX_STREAM_CHUNK_BYTES - 1)
            status_code = 206
            base_headers["Content-Range"] = f"bytes 0-{end}/{file_size}"

        content_length = end - start + 1
        base_headers["Content-Length"] = str(content_length)

        if request.method == "HEAD":
            return Response(status_code=status_code, media_type=mime_type, headers=base_headers)

        audio_bytes = provider.read_virtual_stream_bytes(meta, start, end)
        if len(audio_bytes) != content_length:
            actual_end = start + len(audio_bytes) - 1
            base_headers["Content-Length"] = str(len(audio_bytes))
            if status_code == 206 and len(audio_bytes) > 0:
                base_headers["Content-Range"] = f"bytes {start}-{actual_end}/{file_size}"
        return Response(
            content=audio_bytes,
            status_code=status_code,
            media_type=mime_type,
            headers=base_headers,
        )

    file_path = str(meta["filePath"])
    file_size = os.path.getsize(file_path)

    start = 0
    end = file_size - 1
    status_code = 200

    if range_header:
        start, end = _parse_http_range_header(range_header, file_size)
        if is_vercel:
            end = min(end, start + VERCEL_MAX_STREAM_CHUNK_BYTES - 1, file_size - 1)
        status_code = 206
        base_headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    content_length = end - start + 1
    base_headers["Content-Length"] = str(content_length)

    if request.method == "HEAD":
        return Response(status_code=status_code, media_type=mime_type, headers=base_headers)

    def _iter_file(path: str, offset: int, length: int, chunk_size: int = 65536):
        remaining = length
        with open(path, "rb") as fh:
            fh.seek(offset)
            while remaining > 0:
                to_read = min(chunk_size, remaining)
                chunk = fh.read(to_read)
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        _iter_file(file_path, start, content_length),
        status_code=status_code,
        media_type=mime_type,
        headers=base_headers,
    )


_dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
if os.path.isdir(_dist_dir) and os.path.isfile(os.path.join(_dist_dir, "index.html")):
    _assets_dir = os.path.join(_dist_dir, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> Any:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Endpoint tidak ditemukan.")
        candidate = os.path.abspath(os.path.join(_dist_dir, full_path))
        if (
            full_path
            and os.path.commonpath([_dist_dir, candidate]) == _dist_dir
            and os.path.isfile(candidate)
        ):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist_dir, "index.html"))
