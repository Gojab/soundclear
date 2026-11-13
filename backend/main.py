from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from schemas import (
    AlbumDetailResponse,
    ArtistDetailResponse,
    ArtworkColorResponse,
    ChartsResponse,
    HomeResponse,
    LyricsResponse,
    MoodPlaylistsResponse,
    MoodsResponse,
    PlaylistDetailResponse,
    SearchResponse,
    SuggestResponse,
    WatchPlaylistResponse,
)
from service import MusicServiceError, SoundClearService

app = FastAPI(title="SoundClear API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

cache_ttl = int(os.environ.get("CACHE_TTL_SECONDS", "420"))
service = SoundClearService(cache_ttl_seconds=cache_ttl, location="ID")


@app.exception_handler(MusicServiceError)
async def music_service_error_handler(_, exc: MusicServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "soundclear"}


@app.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(default="", description="Kata kunci pencarian"),
    filter: Optional[str] = Query(
        default=None,
        description="songs | albums | artists | playlists | videos",
    ),
    limit: int = Query(default=25, ge=1, le=50),
) -> SearchResponse:
    return service.search(query=q, filter_type=filter, limit=limit)


@app.get("/suggest", response_model=SuggestResponse)
def suggest(
    q: str = Query(default="", description="Kata kunci saran pencarian"),
) -> SuggestResponse:
    return service.suggest(query=q)


@app.get("/home", response_model=HomeResponse)
def home(limit: int = Query(default=8, ge=1, le=20)) -> HomeResponse:
    return service.get_home(limit=limit)


@app.get("/charts", response_model=ChartsResponse)
def charts(country: str = Query(default="ID", min_length=2, max_length=2)) -> ChartsResponse:
    return service.get_charts(country=country)


@app.get("/moods", response_model=MoodsResponse)
def moods() -> MoodsResponse:
    return service.get_moods()


@app.get("/moods/{params}", response_model=MoodPlaylistsResponse)
def mood_playlists(params: str) -> MoodPlaylistsResponse:
    return service.get_mood_playlists(params=params)


@app.get("/artist/{artist_id}", response_model=ArtistDetailResponse)
def artist_detail(artist_id: str) -> ArtistDetailResponse:
    return service.get_artist(artist_id=artist_id)


@app.get("/album/{album_id}", response_model=AlbumDetailResponse)
def album_detail(album_id: str) -> AlbumDetailResponse:
    return service.get_album(album_id=album_id)


@app.get("/playlist/{playlist_id}", response_model=PlaylistDetailResponse)
def playlist_detail(
    playlist_id: str, limit: int = Query(default=100, ge=1, le=200)
) -> PlaylistDetailResponse:
    return service.get_playlist(playlist_id=playlist_id, limit=limit)


@app.get("/watch/{video_id}", response_model=WatchPlaylistResponse)
def watch_playlist(
    video_id: str,
    radio: bool = Query(default=True),
    playlistId: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=50),
) -> WatchPlaylistResponse:
    return service.get_watch_playlist(
        video_id=video_id, playlist_id=playlistId, radio=radio, limit=limit
    )


@app.get("/lyrics/{browse_id}", response_model=LyricsResponse)
def lyrics(browse_id: str) -> LyricsResponse:
    return service.get_lyrics(browse_id=browse_id)


@app.get("/artwork-color", response_model=ArtworkColorResponse)
async def artwork_color(url: str = Query(..., min_length=10)) -> ArtworkColorResponse:
    return await service.extract_artwork_color(image_url=url)
