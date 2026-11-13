import type {
  AccountLibraryResponse,
  AccountStatusResponse,
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
  SearchFilter,
  SearchResponse,
  SongCreditsResponse,
  SongRelatedResponse,
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

async function requestJson<T>(
  path: string,
  options?: {
    signal?: AbortSignal;
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
  },
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
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
  return requestJson<HomeResponse>('/home?limit=10', { signal });
}

export function fetchCharts(country = 'ID', signal?: AbortSignal): Promise<ChartsResponse> {
  return requestJson<ChartsResponse>(`/charts?country=${encodeURIComponent(country)}`, { signal });
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
  return requestJson<SearchResponse>(`/search?${params.toString()}`, { signal });
}

export function fetchSuggest(query: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return requestJson<SuggestResponse>(`/suggest?q=${encodeURIComponent(query)}`, { signal });
}

export function fetchMoods(signal?: AbortSignal): Promise<MoodsResponse> {
  return requestJson<MoodsResponse>('/moods', { signal });
}

export function fetchMoodPlaylists(
  params: string,
  signal?: AbortSignal,
): Promise<MoodPlaylistsResponse> {
  return requestJson<MoodPlaylistsResponse>(`/moods/${encodeURIComponent(params)}`, { signal });
}

export function fetchArtist(id: string, signal?: AbortSignal): Promise<ArtistDetailResponse> {
  return requestJson<ArtistDetailResponse>(`/artist/${encodeURIComponent(id)}`, { signal });
}

export function fetchArtistAlbums(
  id: string,
  params: string,
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  return requestJson<MediaItem[]>(
    `/artist/${encodeURIComponent(id)}/albums?params=${encodeURIComponent(params)}`,
    { signal },
  );
}

export function fetchAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetailResponse> {
  return requestJson<AlbumDetailResponse>(`/album/${encodeURIComponent(id)}`, { signal });
}

export function fetchPlaylist(id: string, signal?: AbortSignal): Promise<PlaylistDetailResponse> {
  return requestJson<PlaylistDetailResponse>(`/playlist/${encodeURIComponent(id)}`, { signal });
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
    { signal },
  );
}

export function fetchLyrics(browseId: string, signal?: AbortSignal): Promise<LyricsResponse> {
  return requestJson<LyricsResponse>(`/lyrics/${encodeURIComponent(browseId)}`, { signal });
}

export function fetchSongCredits(
  videoId: string,
  albumId?: string | null,
  creditsBrowseId?: string | null,
  signal?: AbortSignal,
): Promise<SongCreditsResponse> {
  const params = new URLSearchParams();
  if (albumId) params.set('albumId', albumId);
  if (creditsBrowseId) params.set('creditsBrowseId', creditsBrowseId);
  const qs = params.toString();
  return requestJson<SongCreditsResponse>(
    `/song/${encodeURIComponent(videoId)}/credits${qs ? `?${qs}` : ''}`,
    { signal },
  );
}

export function fetchSongRelated(
  videoId: string,
  signal?: AbortSignal,
): Promise<SongRelatedResponse> {
  return requestJson<SongRelatedResponse>(`/song/${encodeURIComponent(videoId)}/related`, {
    signal,
  });
}

export function fetchPodcast(id: string, signal?: AbortSignal): Promise<PodcastDetailResponse> {
  return requestJson<PodcastDetailResponse>(`/podcast/${encodeURIComponent(id)}`, { signal });
}

export function fetchEpisode(id: string, signal?: AbortSignal): Promise<EpisodeDetailResponse> {
  return requestJson<EpisodeDetailResponse>(`/episode/${encodeURIComponent(id)}`, { signal });
}

export function fetchChannelEpisodes(
  channelId: string,
  params: string,
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  return requestJson<MediaItem[]>(
    `/channel/${encodeURIComponent(channelId)}/episodes?params=${encodeURIComponent(params)}`,
    { signal },
  );
}

export function fetchAccountStatus(signal?: AbortSignal): Promise<AccountStatusResponse> {
  return requestJson<AccountStatusResponse>('/account/status', { signal });
}

export function fetchAccountLibrary(signal?: AbortSignal): Promise<AccountLibraryResponse> {
  return requestJson<AccountLibraryResponse>('/account/library', { signal });
}

export function postAccountRate(
  videoId: string,
  rating: 'LIKE' | 'DISLIKE' | 'INDIFFERENT',
): Promise<{ synced: boolean }> {
  return requestJson<{ synced: boolean }>('/account/rate', {
    method: 'POST',
    body: { videoId, rating },
  });
}

export function postAccountCreatePlaylist(
  title: string,
  description: string,
  videoIds: string[] = [],
): Promise<{ synced: boolean; playlistId?: string | null }> {
  return requestJson<{ synced: boolean; playlistId?: string | null }>('/account/playlist', {
    method: 'POST',
    body: { title, description, videoIds },
  });
}

export function postAccountAddPlaylistItems(
  playlistId: string,
  videoIds: string[],
): Promise<{ synced: boolean }> {
  return requestJson<{ synced: boolean }>('/account/playlist/items', {
    method: 'POST',
    body: { playlistId, videoIds },
  });
}

export function postAccountSubscribe(
  channelIds: string[],
  subscribe = true,
): Promise<{ synced: boolean }> {
  return requestJson<{ synced: boolean }>('/account/subscribe', {
    method: 'POST',
    body: { channelIds, subscribe },
  });
}

export function fetchArtworkColor(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ArtworkColorResponse> {
  return requestJson<ArtworkColorResponse>(
    `/artwork-color?url=${encodeURIComponent(imageUrl)}`,
    { signal },
  );
}
