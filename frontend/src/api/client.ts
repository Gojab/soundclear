import type {
  AccountLibraryResponse,
  AccountStatusResponse,
  AlbumDetailResponse,
  ArtistDetailResponse,
  ArtworkColorResponse,
  ChartsResponse,
  EpisodeDetailResponse,
  HomeResponse,
  LocalAudioProfile,
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
  StreamOptionsResponse,
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
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
  const clean = params.trim();
  if (!clean) return Promise.reject(new ApiError('Parameter kategori mood tidak valid.', 400));
  return requestJson<MoodPlaylistsResponse>(`/moods/${encodeURIComponent(clean)}`, { signal });
}

function buildDetailQuery(fallbackQuery?: string): string {
  const clean = fallbackQuery?.trim();
  return clean ? `?q=${encodeURIComponent(clean)}` : '';
}

export function fetchArtist(
  id: string,
  signal?: AbortSignal,
  fallbackQuery?: string,
): Promise<ArtistDetailResponse> {
  const cleanId = id.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID artis tidak valid.', 400));
  return requestJson<ArtistDetailResponse>(
    `/artist/${encodeURIComponent(cleanId)}${buildDetailQuery(fallbackQuery)}`,
    { signal },
  );
}

export function fetchArtistAlbums(
  id: string,
  params: string,
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  const cleanId = id.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID artis tidak valid.', 400));
  return requestJson<MediaItem[]>(
    `/artist/${encodeURIComponent(cleanId)}/albums?params=${encodeURIComponent(params)}`,
    { signal },
  );
}

export function fetchAlbum(
  id: string,
  signal?: AbortSignal,
  fallbackQuery?: string,
): Promise<AlbumDetailResponse> {
  const cleanId = id.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID album tidak valid.', 400));
  return requestJson<AlbumDetailResponse>(
    `/album/${encodeURIComponent(cleanId)}${buildDetailQuery(fallbackQuery)}`,
    { signal },
  );
}

export function fetchPlaylist(
  id: string,
  signal?: AbortSignal,
  fallbackQuery?: string,
): Promise<PlaylistDetailResponse> {
  const cleanId = id.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID playlist tidak valid.', 400));
  return requestJson<PlaylistDetailResponse>(
    `/playlist/${encodeURIComponent(cleanId)}${buildDetailQuery(fallbackQuery)}`,
    { signal },
  );
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

export function fetchPodcast(
  id: string,
  signal?: AbortSignal,
  fallbackQuery?: string,
): Promise<PodcastDetailResponse> {
  const cleanId = id.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID podcast tidak valid.', 400));
  return requestJson<PodcastDetailResponse>(
    `/podcast/${encodeURIComponent(cleanId)}${buildDetailQuery(fallbackQuery)}`,
    { signal },
  );
}

export function fetchEpisode(
  id: string,
  signal?: AbortSignal,
  fallbackQuery?: string,
): Promise<EpisodeDetailResponse> {
  const cleanId = id.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID episode tidak valid.', 400));
  return requestJson<EpisodeDetailResponse>(
    `/episode/${encodeURIComponent(cleanId)}${buildDetailQuery(fallbackQuery)}`,
    { signal },
  );
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

export interface PlayResolveResponse {
  id: string;
  youtubeVideoId: string;
  candidates: string[];
}

const playResolveCache = new Map<string, Promise<PlayResolveResponse>>();

export function resolvePlayableYoutube(
  id: string,
  meta?: {
    title?: string;
    artist?: string;
    type?: string;
    durationSeconds?: number | null;
  },
): Promise<PlayResolveResponse> {
  const key = `${id}|${meta?.title || ''}|${meta?.artist || ''}`;
  const cached = playResolveCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({ id });
  if (meta?.title) params.set('title', meta.title);
  if (meta?.artist) params.set('artist', meta.artist);
  if (meta?.type) params.set('type', meta.type);
  if (meta?.durationSeconds && meta.durationSeconds > 0) {
    params.set('durationSeconds', String(Math.round(meta.durationSeconds)));
  }

  const req = requestJson<PlayResolveResponse>(`/play/resolve?${params.toString()}`).catch((err) => {
    playResolveCache.delete(key);
    throw err;
  });
  playResolveCache.set(key, req);
  return req;
}

export function fetchTrackPreviewUrl(
  trackId: string,
  itemType?: string,
): Promise<{ id: string; previewUrl: string }> {
  const cleanId = trackId.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID lagu tidak valid.', 400));
  const qs = itemType ? `?type=${encodeURIComponent(itemType)}` : '';
  return requestJson<{ id: string; previewUrl: string }>(
    `/play/preview/${encodeURIComponent(cleanId)}${qs}`,
  );
}

const streamOptionsCache = new Map<string, Promise<StreamOptionsResponse>>();

export function fetchStreamOptions(
  trackId: string,
  forceRefresh = false,
  itemType?: string,
): Promise<StreamOptionsResponse> {
  const cleanId = trackId.trim();
  if (!cleanId) return Promise.reject(new ApiError('ID lagu tidak valid.', 400));
  const cacheKey = `${cleanId}|${itemType || ''}`;
  if (forceRefresh) {
    streamOptionsCache.delete(cacheKey);
  }
  const hit = streamOptionsCache.get(cacheKey);
  if (hit) return hit;

  const qs = itemType ? `?type=${encodeURIComponent(itemType)}` : '';
  const req = requestJson<StreamOptionsResponse>(
    `/stream/options/${encodeURIComponent(cleanId)}${qs}`,
  ).catch((err) => {
    streamOptionsCache.delete(cacheKey);
    throw err;
  });
  streamOptionsCache.set(cacheKey, req);
  return req;
}

export interface ServerAudioSettingsBundle {
  localProfile?: Partial<LocalAudioProfile>;
  defaultPlaybackRate?: number;
  fadeOnPauseResume?: boolean;
  trackFadeSeconds?: number;
  maxVolumeLimit?: number;
  dataSaver?: boolean;
}

export function fetchAccountAudioSettings(
  accountKey?: string,
  signal?: AbortSignal,
): Promise<{ accountKey: string; settings: ServerAudioSettingsBundle | null }> {
  const qs = accountKey ? `?accountKey=${encodeURIComponent(accountKey)}` : '';
  return requestJson<{ accountKey: string; settings: ServerAudioSettingsBundle | null }>(
    `/account/audio-settings${qs}`,
    { signal },
  );
}

export function saveAccountAudioSettings(
  settings: ServerAudioSettingsBundle,
  accountKey?: string,
): Promise<{ accountKey: string; settings: ServerAudioSettingsBundle }> {
  return requestJson<{ accountKey: string; settings: ServerAudioSettingsBundle }>(
    '/account/audio-settings',
    {
      method: 'PUT',
      body: { accountKey, settings },
    },
  );
}

export function resetAccountAudioSettings(
  accountKey?: string,
): Promise<{ accountKey: string; settings: null }> {
  const qs = accountKey ? `?accountKey=${encodeURIComponent(accountKey)}` : '';
  return requestJson<{ accountKey: string; settings: null }>(
    `/account/audio-settings/reset${qs}`,
    { method: 'POST' },
  );
}



