import type {
  AlbumDetailResponse,
  ArtistDetailResponse,
  ArtworkColorResponse,
  ChartsResponse,
  HomeResponse,
  LyricsResponse,
  MoodPlaylistsResponse,
  MoodsResponse,
  PlaylistDetailResponse,
  SearchFilter,
  SearchResponse,
  SuggestResponse,
  WatchPlaylistResponse,
} from '../types/music';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    let detail = `Terjadi kesalahan (${res.status})`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data?.detail) detail = data.detail;
    } catch {
      // Fallback to generic message
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export function fetchHome(signal?: AbortSignal): Promise<HomeResponse> {
  return requestJson<HomeResponse>('/home?limit=10', signal);
}

export function fetchCharts(country = 'ID', signal?: AbortSignal): Promise<ChartsResponse> {
  return requestJson<ChartsResponse>(`/charts?country=${encodeURIComponent(country)}`, signal);
}

export function fetchSearch(
  query: string,
  filter: SearchFilter = 'all',
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (filter && filter !== 'all') {
    params.set('filter', filter);
  }
  return requestJson<SearchResponse>(`/search?${params.toString()}`, signal);
}

export function fetchSuggest(query: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return requestJson<SuggestResponse>(`/suggest?q=${encodeURIComponent(query)}`, signal);
}

export function fetchMoods(signal?: AbortSignal): Promise<MoodsResponse> {
  return requestJson<MoodsResponse>('/moods', signal);
}

export function fetchMoodPlaylists(
  params: string,
  signal?: AbortSignal,
): Promise<MoodPlaylistsResponse> {
  return requestJson<MoodPlaylistsResponse>(`/moods/${encodeURIComponent(params)}`, signal);
}

export function fetchArtist(id: string, signal?: AbortSignal): Promise<ArtistDetailResponse> {
  return requestJson<ArtistDetailResponse>(`/artist/${encodeURIComponent(id)}`, signal);
}

export function fetchAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetailResponse> {
  return requestJson<AlbumDetailResponse>(`/album/${encodeURIComponent(id)}`, signal);
}

export function fetchPlaylist(id: string, signal?: AbortSignal): Promise<PlaylistDetailResponse> {
  return requestJson<PlaylistDetailResponse>(`/playlist/${encodeURIComponent(id)}`, signal);
}

export function fetchWatchPlaylist(
  videoId: string,
  radio = true,
  playlistId?: string | null,
  signal?: AbortSignal,
): Promise<WatchPlaylistResponse> {
  const params = new URLSearchParams({ radio: String(radio) });
  if (playlistId) params.set('playlistId', playlistId);
  return requestJson<WatchPlaylistResponse>(
    `/watch/${encodeURIComponent(videoId)}?${params.toString()}`,
    signal,
  );
}

export function fetchLyrics(browseId: string, signal?: AbortSignal): Promise<LyricsResponse> {
  return requestJson<LyricsResponse>(`/lyrics/${encodeURIComponent(browseId)}`, signal);
}

export function fetchArtworkColor(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ArtworkColorResponse> {
  return requestJson<ArtworkColorResponse>(
    `/artwork-color?url=${encodeURIComponent(imageUrl)}`,
    signal,
  );
}
