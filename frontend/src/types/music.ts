export interface ArtistRef {
  id?: string | null;
  name: string;
}

export interface AlbumRef {
  id?: string | null;
  name: string;
}

export type MediaItemType = 'song' | 'video' | 'album' | 'artist' | 'playlist';

export interface MediaItem {
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef | null;
  duration?: string | null;
  durationSeconds?: number | null;
  thumbnail?: string | null;
  type: MediaItemType;
  year?: string | null;
  views?: string | null;
  isExplicit?: boolean;
  playlistId?: string | null;
  videoId?: string | null;
  browseId?: string | null;
}

export interface HomeSection {
  title: string;
  items: MediaItem[];
}

export interface HomeResponse {
  sections: HomeSection[];
}

export interface ChartsResponse {
  country: string;
  songs: MediaItem[];
  videos: MediaItem[];
  artists: MediaItem[];
  trending: MediaItem[];
}

export interface MoodCategoryItem {
  title: string;
  params: string;
}

export interface MoodCategoryGroup {
  title: string;
  items: MoodCategoryItem[];
}

export interface MoodsResponse {
  groups: MoodCategoryGroup[];
}

export interface MoodPlaylistsResponse {
  params: string;
  playlists: MediaItem[];
}

export type SearchFilter = 'all' | 'songs' | 'albums' | 'artists' | 'playlists' | 'videos';

export interface SearchResponse {
  query: string;
  filter?: string | null;
  items: MediaItem[];
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

export interface ArtistDetailResponse {
  id: string;
  name: string;
  description?: string | null;
  subscribers?: string | null;
  views?: string | null;
  thumbnail?: string | null;
  shuffleId?: string | null;
  radioId?: string | null;
  songs: MediaItem[];
  albums: MediaItem[];
  singles: MediaItem[];
  videos: MediaItem[];
  related: MediaItem[];
}

export interface AlbumDetailResponse {
  id: string;
  title: string;
  artists: ArtistRef[];
  year?: string | null;
  trackCount?: number | null;
  duration?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  audioPlaylistId?: string | null;
  tracks: MediaItem[];
}

export interface PlaylistDetailResponse {
  id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  year?: string | null;
  trackCount?: number | null;
  duration?: string | null;
  thumbnail?: string | null;
  tracks: MediaItem[];
}

export interface WatchPlaylistResponse {
  videoId: string;
  playlistId?: string | null;
  lyricsBrowseId?: string | null;
  relatedBrowseId?: string | null;
  tracks: MediaItem[];
}

export interface LyricLine {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
}

export interface LyricsResponse {
  browseId: string;
  hasTimestamps: boolean;
  source?: string | null;
  lines: LyricLine[];
  plainText?: string | null;
}

export interface ArtworkColorResponse {
  r: number;
  g: number;
  b: number;
  hex: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  tracks: MediaItem[];
}

export type RouteView =
  | { name: 'home' }
  | { name: 'search'; query?: string; filter?: SearchFilter }
  | { name: 'moods' }
  | { name: 'mood-detail'; params: string; title: string }
  | { name: 'artist'; id: string }
  | { name: 'album'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'library' }
  | { name: 'liked' }
  | { name: 'local-playlist'; id: string };
