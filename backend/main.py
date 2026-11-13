from __future__ import annotations

from contextlib import asynccontextmanager
import os
import threading
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.music_provider import MusicProvider, MusicProviderError

load_dotenv()

provider = MusicProvider(country="ID")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.environ.get("SOUNDCLEAR_DISABLE_WARMUP") != "1" and not os.environ.get("VERCEL"):
        threading.Thread(target=provider.warmup, daemon=True).start()
    yield


app = FastAPI(title="SoundClear API", version="2.0.0", lifespan=lifespan)


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


class ImportCookiesBody(BaseModel):
    identifier: str = "default"
    cookies: Any


class AudioSettingsBody(BaseModel):
    accountKey: Optional[str] = None
    settings: Dict[str, Any]



@app.exception_handler(MusicProviderError)
async def music_provider_error_handler(_request: Request, exc: MusicProviderError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "soundclear", "provider": "spotapi"}


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


@app.get("/api/lyrics/{browse_id}")
def lyrics(browse_id: str) -> Dict[str, Any]:
    return provider.get_lyrics(browse_id)


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


@app.post("/api/account/cookies")
def account_import_cookies(body: ImportCookiesBody) -> Dict[str, Any]:
    # Cookies are persisted server-side via JSONSaver only and never returned to frontend.
    return provider.import_account_cookies(body.identifier, body.cookies, verify=True)


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
) -> Dict[str, Any]:
    if not id and not title:
        raise HTTPException(status_code=400, detail="Parameter id atau title wajib diisi.")
    return provider.resolve_playable_youtube(
        id,
        title=title,
        artist=artist,
        item_type=type,
        duration_seconds=durationSeconds,
    )


@app.get("/api/play/preview/{track_id}")
def play_preview(track_id: str, type: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_track_preview_url(track_id, item_type=type)


@app.get("/api/stream/options/{track_id}")
def stream_options(track_id: str, type: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_stream_options(track_id, item_type=type)


@app.options("/api/stream/{track_id}")
def stream_audio_options(track_id: str) -> Response:
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        },
    )


@app.get("/api/stream/{track_id}")
def stream_audio(
    track_id: str,
    tier: Optional[str] = Query(default=None),
    range_hdr: Optional[str] = Header(default=None, alias="Range"),
) -> StreamingResponse:
    status_code, headers, chunk_iter = provider.open_audio_stream(
        track_id,
        tier=tier,
        range_header=range_hdr,
    )
    return StreamingResponse(chunk_iter, status_code=status_code, headers=headers)


@app.get("/api/account/audio-settings")
def get_account_audio_settings(accountKey: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.get_audio_settings(account_key=accountKey)


@app.put("/api/account/audio-settings")
def put_account_audio_settings(body: AudioSettingsBody) -> Dict[str, Any]:
    return provider.save_audio_settings(body.settings, account_key=body.accountKey)


@app.post("/api/account/audio-settings/reset")
def reset_account_audio_settings(accountKey: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return provider.reset_audio_settings(account_key=accountKey)



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
