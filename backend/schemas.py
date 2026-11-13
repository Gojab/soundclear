from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ArtistRef(BaseModel):
    id: Optional[str] = None
    name: str


class AlbumRef(BaseModel):
    id: Optional[str] = None
    name: str


ItemType = Literal["song", "video", "album", "artist", "playlist"]


class MediaItem(BaseModel):
    id: str
    title: str
    artists: list[ArtistRef] = Field(default_factory=list)
    album: Optional[AlbumRef] = None
    duration: Optional[str] = None
    durationSeconds: Optional[int] = None
    thumbnail: Optional[str] = None
    type: ItemType = "song"
    year: Optional[str] = None
    views: Optional[str] = None
    isExplicit: bool = False
    playlistId: Optional[str] = None
    videoId: Optional[str] = None
    browseId: Optional[str] = None


class HomeSection(BaseModel):
    title: str
    items: list[MediaItem] = Field(default_factory=list)


class HomeResponse(BaseModel):
    sections: list[HomeSection] = Field(default_factory=list)


class ChartsResponse(BaseModel):
    country: str
    songs: list[MediaItem] = Field(default_factory=list)
    videos: list[MediaItem] = Field(default_factory=list)
    artists: list[MediaItem] = Field(default_factory=list)
    trending: list[MediaItem] = Field(default_factory=list)


class MoodCategoryItem(BaseModel):
    title: str
    params: str


class MoodCategoryGroup(BaseModel):
    title: str
    items: list[MoodCategoryItem] = Field(default_factory=list)


class MoodsResponse(BaseModel):
    groups: list[MoodCategoryGroup] = Field(default_factory=list)


class MoodPlaylistsResponse(BaseModel):
    params: str
    playlists: list[MediaItem] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    filter: Optional[str] = None
    items: list[MediaItem] = Field(default_factory=list)


class SuggestResponse(BaseModel):
    query: str
    suggestions: list[str] = Field(default_factory=list)


class ArtistDetailResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    subscribers: Optional[str] = None
    views: Optional[str] = None
    thumbnail: Optional[str] = None
    shuffleId: Optional[str] = None
    radioId: Optional[str] = None
    songs: list[MediaItem] = Field(default_factory=list)
    albums: list[MediaItem] = Field(default_factory=list)
    singles: list[MediaItem] = Field(default_factory=list)
    videos: list[MediaItem] = Field(default_factory=list)
    related: list[MediaItem] = Field(default_factory=list)


class AlbumDetailResponse(BaseModel):
    id: str
    title: str
    artists: list[ArtistRef] = Field(default_factory=list)
    year: Optional[str] = None
    trackCount: Optional[int] = None
    duration: Optional[str] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    audioPlaylistId: Optional[str] = None
    tracks: list[MediaItem] = Field(default_factory=list)


class PlaylistDetailResponse(BaseModel):
    id: str
    title: str
    author: Optional[str] = None
    description: Optional[str] = None
    year: Optional[str] = None
    trackCount: Optional[int] = None
    duration: Optional[str] = None
    thumbnail: Optional[str] = None
    tracks: list[MediaItem] = Field(default_factory=list)


class WatchPlaylistResponse(BaseModel):
    videoId: str
    playlistId: Optional[str] = None
    lyricsBrowseId: Optional[str] = None
    relatedBrowseId: Optional[str] = None
    tracks: list[MediaItem] = Field(default_factory=list)


class LyricLine(BaseModel):
    text: str
    startTimeMs: int
    endTimeMs: int


class LyricsResponse(BaseModel):
    browseId: str
    hasTimestamps: bool = False
    source: Optional[str] = None
    lines: list[LyricLine] = Field(default_factory=list)
    plainText: Optional[str] = None


class ArtworkColorResponse(BaseModel):
    r: int
    g: int
    b: int
    hex: str
