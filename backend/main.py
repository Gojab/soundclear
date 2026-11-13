from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from schemas import (
    AccountAddPlaylistItemsRequest,
    AccountCreatePlaylistRequest,
    AccountLibraryResponse,
    AccountRateRequest,
    AccountStatusResponse,
    AccountSubscribeRequest,
    AlbumDetailResponse,
    ArtistDetailResponse,
    ArtworkColorResponse,
    ChartsResponse,
    EpisodeDetailResponse,
    HomeResponse,
    LyricsResponse,
    MediaItem,
    MoodPlaylistsResponse,
    MoodsResponse,
    PlaylistDetailResponse,
    PodcastDetailResponse,
    SearchResponse,
    SongCreditsResponse,
    SongRelatedResponse,
    SuggestResponse,
    WatchPlaylistResponse,
)
from service import MusicServiceError, SoundClearService

app = FastAPI(title="SoundClear API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
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
        description="songs | albums | artists | playlists | videos | podcasts | episodes",
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


@app.get("/artist/{artist_id}/albums", response_model=list[MediaItem])
def artist_albums(artist_id: str, params: str = Query(..., min_length=1)) -> list[MediaItem]:
    return service.get_artist_albums(artist_id=artist_id, params=params)


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


@app.get("/song/{video_id}/credits", response_model=SongCreditsResponse)
def song_credits(
    video_id: str,
    albumId: Optional[str] = Query(default=None),
    creditsBrowseId: Optional[str] = Query(default=None),
) -> SongCreditsResponse:
    return service.get_song_credits(
        video_id=video_id, album_id=albumId, credits_browse_id=creditsBrowseId
    )


@app.get("/song/{video_id}/related", response_model=SongRelatedResponse)
def song_related(video_id: str) -> SongRelatedResponse:
    return service.get_song_related(video_id=video_id)


@app.get("/podcast/{podcast_id}", response_model=PodcastDetailResponse)
def podcast_detail(
    podcast_id: str, limit: int = Query(default=100, ge=1, le=200)
) -> PodcastDetailResponse:
    return service.get_podcast(podcast_id=podcast_id, limit=limit)


@app.get("/episode/{video_id}", response_model=EpisodeDetailResponse)
def episode_detail(video_id: str) -> EpisodeDetailResponse:
    return service.get_episode(video_id=video_id)


@app.get("/channel/{channel_id}/episodes", response_model=list[MediaItem])
def channel_episodes(channel_id: str, params: str = Query(..., min_length=1)) -> list[MediaItem]:
    return service.get_channel_episodes(channel_id=channel_id, params=params)


@app.get("/account/status", response_model=AccountStatusResponse)
def account_status() -> AccountStatusResponse:
    return service.get_account_status()


@app.get("/account/library", response_model=AccountLibraryResponse)
def account_library() -> AccountLibraryResponse:
    return service.get_account_library()


@app.post("/account/rate")
def account_rate(req: AccountRateRequest) -> dict[str, Any]:
    return service.account_rate_song(video_id=req.videoId, rating=req.rating)


@app.post("/account/playlist")
def account_create_playlist(req: AccountCreatePlaylistRequest) -> dict[str, Any]:
    return service.account_create_playlist(
        title=req.title, description=req.description, video_ids=req.videoIds
    )


@app.post("/account/playlist/items")
def account_add_playlist_items(req: AccountAddPlaylistItemsRequest) -> dict[str, Any]:
    return service.account_add_playlist_items(
        playlist_id=req.playlistId, video_ids=req.videoIds
    )


@app.post("/account/subscribe")
def account_subscribe(req: AccountSubscribeRequest) -> dict[str, Any]:
    return service.account_subscribe_artists(
        channel_ids=req.channelIds, subscribe=req.subscribe
    )


@app.get("/artwork-color", response_model=ArtworkColorResponse)
async def artwork_color(url: str = Query(..., min_length=10)) -> ArtworkColorResponse:
    return await service.extract_artwork_color(image_url=url)
