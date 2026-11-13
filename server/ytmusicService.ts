import jpeg from 'jpeg-js';
import type {
  AccountLibraryResponse,
  AccountStatusResponse,
  AlbumDetailResponse,
  AlbumRef,
  ArtistDetailResponse,
  ArtistRef,
  ArtworkColorResponse,
  ChartsResponse,
  EpisodeDetailResponse,
  HomeResponse,
  HomeSection,
  LyricLine,
  LyricsResponse,
  MediaItem,
  MediaItemType,
  MoodCategoryGroup,
  MoodCategoryItem,
  MoodPlaylistsResponse,
  MoodsResponse,
  PlaylistDetailResponse,
  PodcastDetailResponse,
  PodcastEpisode,
  SearchResponse,
  SongCredit,
  SongCreditsResponse,
  SongRelatedResponse,
  SuggestResponse,
  WatchPlaylistResponse,
} from '../frontend/src/types/music.ts';
import { TTLCache } from './cache.ts';

const YTMUSIC_API_BASE = 'https://music.youtube.com/youtubei/v1';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const ALLOWED_ARTWORK_HOSTS = new Set([
  'yt3.googleusercontent.com',
  'lh3.googleusercontent.com',
  'i.ytimg.com',
  'i9.ytimg.com',
  'music.youtube.com',
  'yt3.ggpht.com',
]);

const SEARCH_FILTER_PARAMS: Record<string, string> = {
  songs: 'EgWKAQIIAWoSEAMQBBAQEAUQChAVEAkQDhAR',
  videos: 'EgWKAQIQAWoSEAMQBBAQEAUQChAVEAkQDhAR',
  albums: 'EgWKAQIYAWoSEAMQBBAQEAUQChAVEAkQDhAR',
  artists: 'EgWKAQIgAWoSEAMQBBAQEAUQChAVEAkQDhAR',
  playlists: 'EgeKAQQoAEABahIQAxAEEBAQBRAKEBUQCRAOEBE%3D',
  podcasts: 'EgWKAQJQAWoSEAMQBBAQEAUQChAVEAkQDhAR',
  episodes: 'EgWKAQJIAWoSEAMQBBAQEAUQChAVEAkQDhAR',
};

const CJK_HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const JAPANESE_KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff]/;
const KOREAN_HANGUL_RE = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/;
const INDIC_SCRIPT_RE = /[\u0900-\u0d7f]/;

const MANDARIN_KEYWORD_RE =
  /\b(?:mandarin|mandopop|cantopop|c-?pop|chinese|zhongwen|hokkien|guoyu|taiwanese)\b/i;

const INDIAN_KEYWORD_RE =
  /\b(?:india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|punjabi|hindi|tamil|telugu|malayalam|kannada|bhojpuri|marathi|gujarati|bengali|hindustani|carnatic|bhangra|ghazal|qawwali|bhajan|desi|i-?pop|t-?series|zee\s*music|saregama|sony\s*music\s*india|yrf|tips\s*official|udit\s*narayan|arijit\s*singh|shreya\s*ghoshal|alka\s*ynik|alka\s*yagnik|kumar\s*sanu|lata\s*mangeshkar|kishore\s*kumar|sonu\s*nigam|a\.?\s*r\.?\s*rahman|diljit\s*dosanjh|sidhu\s*moose\s*wala|ap\s*dhillon|anirudh\s*ravichander|neha\s*kakkar|jubin\s*nautiyal|atif\s*aslam|sunidhi\s*chauhan|asha\s*bhosle|mohammed\s*rafi|ilayaraja|sp\s*balasubrahmanyam)\b/i;

const DURATION_RE = /^\d{1,2}(?::\d{2}){1,2}$/;
const YEAR_RE = /^(?:19|20)\d{2}$/;

export class MusicServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'MusicServiceError';
    this.statusCode = statusCode;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function isIndianOrMandarinText(text: string): boolean {
  if (!text) return false;
  if (INDIC_SCRIPT_RE.test(text)) return true;
  if (INDIAN_KEYWORD_RE.test(text)) return true;
  if (MANDARIN_KEYWORD_RE.test(text)) return true;
  if (CJK_HAN_RE.test(text) && !(JAPANESE_KANA_RE.test(text) || KOREAN_HANGUL_RE.test(text))) {
    return true;
  }
  return false;
}

function isExcludedHomeItem(item: MediaItem): boolean {
  const parts = [
    item.title,
    ...item.artists.map((a) => a.name),
    item.album?.name ?? '',
  ];
  return isIndianOrMandarinText(parts.filter(Boolean).join(' '));
}

function getRunsText(node: AnyRecord | string | undefined | null): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node.simpleText === 'string') return node.simpleText.trim() || null;
  if (Array.isArray(node.runs)) {
    const joined = node.runs
      .map((r: AnyRecord) => (typeof r?.text === 'string' ? r.text : ''))
      .join('')
      .trim();
    return joined || null;
  }
  return null;
}

function pickLargestThumbnail(thumbnails: unknown, fallback: string | null = null): string | null {
  const list = Array.isArray(thumbnails)
    ? thumbnails
    : (thumbnails as AnyRecord)?.thumbnails && Array.isArray((thumbnails as AnyRecord).thumbnails)
      ? (thumbnails as AnyRecord).thumbnails
      : null;

  if (!list || list.length === 0) return fallback;
  let bestUrl: string | null = null;
  let bestArea = -1;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const url = (item as AnyRecord).url;
    if (typeof url !== 'string' || !url) continue;
    const w = Number((item as AnyRecord).width) || 0;
    const h = Number((item as AnyRecord).height) || 0;
    const area = w * h;
    if (area >= bestArea) {
      bestArea = area;
      bestUrl = url;
    }
  }
  return bestUrl || fallback;
}

function parseDurationSeconds(duration?: string | null, durationSeconds?: number | null): number | null {
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds >= 0) {
    return Math.round(durationSeconds);
  }
  if (!duration || typeof duration !== 'string') return null;
  const parts = duration.trim().split(':');
  if (!parts.length || !parts.every((p) => /^\d+$/.test(p))) return null;
  let total = 0;
  for (const p of parts) {
    total = total * 60 + Number(p);
  }
  return total;
}

function hasExplicitBadge(badges: unknown): boolean {
  if (!Array.isArray(badges)) return false;
  return badges.some((b: AnyRecord) => {
    const iconType = b?.musicInlineBadgeRenderer?.icon?.iconType;
    return iconType === 'MUSIC_EXPLICIT_BADGE';
  });
}

function inferTypeFromIds(
  browseId?: string | null,
  videoId?: string | null,
  playlistId?: string | null,
  pageType?: string | null,
  videoType?: string | null,
  defaultType?: MediaItemType,
): MediaItemType {
  if (defaultType) return defaultType;
  const pt = (pageType || '').toUpperCase();
  if (pt.includes('ARTIST')) return 'artist';
  if (pt.includes('ALBUM')) return 'album';
  if (pt.includes('PODCAST_SHOW') || browseId?.startsWith('MPSP')) return 'podcast';
  if (pt.includes('PLAYLIST')) return 'playlist';

  const vt = (videoType || '').toUpperCase();
  if (vt.includes('PODCAST_EPISODE')) return 'episode';
  if (videoId) {
    if (vt.includes('OMV') || vt.includes('UGC')) return 'video';
    return 'song';
  }
  if (browseId?.startsWith('UC')) return 'artist';
  if (browseId?.startsWith('MPRE')) return 'album';
  if (browseId?.startsWith('VL') || playlistId) return 'playlist';
  return 'song';
}

function extractCreditsBrowseId(menu: AnyRecord | undefined | null): string | null {
  const items = menu?.menuRenderer?.items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const browseId =
      item?.menuNavigationItemRenderer?.navigationEndpoint?.browseEndpoint?.browseId;
    if (typeof browseId === 'string' && browseId.startsWith('MPTC')) {
      return browseId;
    }
  }
  return null;
}

function parseSubtitleRuns(
  runs: AnyRecord[],
  itemType: MediaItemType,
): {
  artists: ArtistRef[];
  album: AlbumRef | null;
  duration: string | null;
  year: string | null;
  views: string | null;
  published: string | null;
  typeHint: MediaItemType | null;
} {
  const artists: ArtistRef[] = [];
  let album: AlbumRef | null = null;
  let duration: string | null = null;
  let year: string | null = null;
  let views: string | null = null;
  let published: string | null = null;
  let typeHint: MediaItemType | null = null;

  const plainParts: string[] = [];

  for (const run of runs) {
    const text = typeof run?.text === 'string' ? run.text.trim() : '';
    if (!text || text === '•' || text === '·' || text === ',') continue;

    const nav = run?.navigationEndpoint;
    const browseId = nav?.browseEndpoint?.browseId as string | undefined;
    const pageType =
      nav?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
        ?.pageType as string | undefined;

    if (browseId) {
      if (browseId.startsWith('MPRE') || pageType?.includes('ALBUM')) {
        album = { id: browseId, name: text };
        continue;
      }
      if (browseId.startsWith('UC') || pageType?.includes('ARTIST')) {
        artists.push({ id: browseId, name: text });
        continue;
      }
      if (browseId.startsWith('MPSP')) {
        artists.push({ id: browseId, name: text });
        continue;
      }
    }

    if (DURATION_RE.test(text)) {
      duration = text;
      continue;
    }
    if (YEAR_RE.test(text)) {
      year = text;
      continue;
    }

    const lower = text.toLowerCase();
    if (lower === 'lagu' || lower === 'song') {
      typeHint = 'song';
      continue;
    }
    if (lower === 'video') {
      typeHint = 'video';
      continue;
    }
    if (lower === 'album' || lower === 'singel' || lower === 'single' || lower === 'ep') {
      typeHint = 'album';
      continue;
    }
    if (lower === 'playlist') {
      typeHint = 'playlist';
      continue;
    }
    if (lower === 'artis' || lower === 'artist') {
      typeHint = 'artist';
      continue;
    }
    if (lower === 'podcast') {
      typeHint = 'podcast';
      continue;
    }
    if (lower === 'episode') {
      typeHint = 'episode';
      continue;
    }
    if (
      lower.includes('ditonton') ||
      lower.includes('views') ||
      lower.includes('diputar') ||
      lower.includes('plays') ||
      lower.includes('pelanggan') ||
      lower.includes('subscribers')
    ) {
      views = text;
      continue;
    }
    if (
      lower.includes('lalu') ||
      lower.includes('ago') ||
      /\b(?:jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)\b/i.test(text)
    ) {
      published = text;
      continue;
    }

    plainParts.push(text);
  }

  if (artists.length === 0 && plainParts.length > 0 && itemType !== 'artist') {
    artists.push({ id: null, name: plainParts[0] });
  }

  return { artists, album, duration, year, views, published, typeHint };
}

function normalizeResponsiveItem(
  raw: AnyRecord,
  options?: {
    defaultType?: MediaItemType;
    fallbackThumbnail?: string | null;
    fallbackArtist?: ArtistRef | null;
    fallbackAlbum?: AlbumRef | null;
  },
): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const flexCols = Array.isArray(raw.flexColumns) ? raw.flexColumns : [];
  const col0Run =
    flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0] ?? null;
  const title =
    (typeof col0Run?.text === 'string' && col0Run.text.trim()) ||
    getRunsText(flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
  if (!title) return null;

  const playWatch =
    raw.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint;
  const titleNav = col0Run?.navigationEndpoint || raw.navigationEndpoint;
  const browseEp = titleNav?.browseEndpoint || raw.navigationEndpoint?.browseEndpoint;
  const watchEp = playWatch || titleNav?.watchEndpoint;

  const videoId = (watchEp?.videoId as string | undefined) || null;
  const browseId = (browseEp?.browseId as string | undefined) || null;
  const playlistId = (watchEp?.playlistId as string | undefined) || null;
  const pageType =
    browseEp?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
  const videoType =
    watchEp?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;

  const allSubtitleRuns: AnyRecord[] = [];
  for (let i = 1; i < flexCols.length; i++) {
    const runs = flexCols[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    if (Array.isArray(runs)) {
      allSubtitleRuns.push(...runs);
    }
  }
  const fixedCols = Array.isArray(raw.fixedColumns) ? raw.fixedColumns : [];
  for (const fc of fixedCols) {
    const runs = fc?.musicResponsiveListItemFixedColumnRenderer?.text?.runs;
    if (Array.isArray(runs)) {
      allSubtitleRuns.push(...runs);
    }
  }

  const initialType = inferTypeFromIds(
    browseId,
    videoId,
    playlistId,
    pageType,
    videoType,
    options?.defaultType,
  );
  const parsedSub = parseSubtitleRuns(allSubtitleRuns, initialType);
  const itemType = options?.defaultType ?? parsedSub.typeHint ?? initialType;

  let itemId: string | null = null;
  if (itemType === 'song' || itemType === 'video' || itemType === 'episode') {
    itemId = videoId || browseId || playlistId;
  } else if (itemType === 'playlist') {
    const rawPl = playlistId || (browseId?.startsWith('VL') ? browseId.slice(2) : browseId);
    itemId = rawPl || null;
  } else {
    itemId = browseId || playlistId || videoId;
  }
  if (!itemId) return null;

  const artists =
    parsedSub.artists.length > 0
      ? parsedSub.artists
      : options?.fallbackArtist
        ? [options.fallbackArtist]
        : [];
  const album = parsedSub.album ?? options?.fallbackAlbum ?? null;
  const thumbnail = pickLargestThumbnail(
    raw.thumbnail?.musicThumbnailRenderer?.thumbnail,
    options?.fallbackThumbnail ?? null,
  );

  return {
    id: itemId,
    title,
    artists,
    album,
    duration: parsedSub.duration,
    durationSeconds: parseDurationSeconds(parsedSub.duration),
    thumbnail,
    type: itemType,
    year: parsedSub.year,
    views: parsedSub.views,
    isExplicit: hasExplicitBadge(raw.badges),
    playlistId,
    videoId,
    browseId,
    published: parsedSub.published,
    creditsBrowseId: extractCreditsBrowseId(raw.menu),
  };
}

function normalizeTwoRowItem(
  raw: AnyRecord,
  options?: {
    defaultType?: MediaItemType;
    fallbackThumbnail?: string | null;
    fallbackArtist?: ArtistRef | null;
    fallbackAlbum?: AlbumRef | null;
  },
): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const titleRun = raw.title?.runs?.[0];
  const title = getRunsText(raw.title);
  if (!title) return null;

  const nav = raw.navigationEndpoint || titleRun?.navigationEndpoint;
  const playWatch =
    raw.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint;

  const watchEp = nav?.watchEndpoint || playWatch;
  const browseEp = nav?.browseEndpoint;

  const videoId = (watchEp?.videoId as string | undefined) || null;
  const browseId = (browseEp?.browseId as string | undefined) || null;
  const playlistId = (watchEp?.playlistId as string | undefined) || null;
  const pageType =
    browseEp?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
  const videoType =
    watchEp?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;

  const subtitleRuns = Array.isArray(raw.subtitle?.runs) ? raw.subtitle.runs : [];
  const initialType = inferTypeFromIds(
    browseId,
    videoId,
    playlistId,
    pageType,
    videoType,
    options?.defaultType,
  );
  const parsedSub = parseSubtitleRuns(subtitleRuns, initialType);
  const itemType = options?.defaultType ?? parsedSub.typeHint ?? initialType;

  let itemId: string | null = null;
  if (itemType === 'song' || itemType === 'video' || itemType === 'episode') {
    itemId = videoId || browseId || playlistId;
  } else if (itemType === 'playlist') {
    const rawPl = playlistId || (browseId?.startsWith('VL') ? browseId.slice(2) : browseId);
    itemId = rawPl || null;
  } else {
    itemId = browseId || playlistId || videoId;
  }
  if (!itemId) return null;

  const artists =
    parsedSub.artists.length > 0
      ? parsedSub.artists
      : options?.fallbackArtist
        ? [options.fallbackArtist]
        : [];

  return {
    id: itemId,
    title,
    artists,
    album: parsedSub.album ?? options?.fallbackAlbum ?? null,
    duration: parsedSub.duration,
    durationSeconds: parseDurationSeconds(parsedSub.duration),
    thumbnail: pickLargestThumbnail(
      raw.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail,
      options?.fallbackThumbnail ?? null,
    ),
    type: itemType,
    year: parsedSub.year,
    views: parsedSub.views,
    isExplicit: hasExplicitBadge(raw.subtitleBadges),
    playlistId,
    videoId,
    browseId,
    published: parsedSub.published,
    creditsBrowseId: extractCreditsBrowseId(raw.menu),
  };
}

function normalizeAnyItem(
  entry: AnyRecord,
  options?: {
    defaultType?: MediaItemType;
    fallbackThumbnail?: string | null;
    fallbackArtist?: ArtistRef | null;
    fallbackAlbum?: AlbumRef | null;
  },
): MediaItem | null {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.musicResponsiveListItemRenderer) {
    return normalizeResponsiveItem(entry.musicResponsiveListItemRenderer, options);
  }
  if (entry.musicTwoRowItemRenderer) {
    return normalizeTwoRowItem(entry.musicTwoRowItemRenderer, options);
  }
  if (entry.playlistPanelVideoRenderer) {
    return normalizeWatchPanelItem(entry.playlistPanelVideoRenderer);
  }
  return null;
}

function normalizeWatchPanelItem(raw: AnyRecord): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const videoId = raw.videoId as string | undefined;
  const title = getRunsText(raw.title);
  if (!videoId || !title) return null;

  const runs = Array.isArray(raw.longBylineText?.runs)
    ? raw.longBylineText.runs
    : Array.isArray(raw.shortBylineText?.runs)
      ? raw.shortBylineText.runs
      : [];

  const artists: ArtistRef[] = [];
  let album: AlbumRef | null = null;
  let year: string | null = null;
  let views: string | null = null;

  for (const run of runs) {
    const text = typeof run?.text === 'string' ? run.text.trim() : '';
    if (!text || text === '•' || text === '·' || text === ',') continue;
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId as string | undefined;
    if (browseId?.startsWith('MPRE')) {
      album = { id: browseId, name: text };
    } else if (browseId?.startsWith('UC')) {
      artists.push({ id: browseId, name: text });
    } else if (YEAR_RE.test(text)) {
      year = text;
    } else if (text.toLowerCase().includes('ditonton') || text.toLowerCase().includes('views')) {
      views = text;
    } else if (artists.length === 0 && !album) {
      artists.push({ id: null, name: text });
    }
  }

  const duration = getRunsText(raw.lengthText);
  const playlistId =
    (raw.navigationEndpoint?.watchEndpoint?.playlistId as string | undefined) ?? null;

  return {
    id: videoId,
    title,
    artists,
    album,
    duration,
    durationSeconds: parseDurationSeconds(duration),
    thumbnail: pickLargestThumbnail(raw.thumbnail),
    type: 'song',
    year,
    views,
    isExplicit: hasExplicitBadge(raw.badges),
    playlistId,
    videoId,
    browseId: null,
    creditsBrowseId: extractCreditsBrowseId(raw.menu),
  };
}

export class SoundClearService {
  private readonly cache: TTLCache;
  private readonly location: string;

  constructor(cacheTtlSeconds = 420, location = 'ID') {
    this.cache = new TTLCache(cacheTtlSeconds, 768);
    this.location = location;
  }

  private async ytPost<T = AnyRecord>(
    endpoint: string,
    body: AnyRecord,
    clientName: 'WEB_REMIX' | 'ANDROID_MUSIC' = 'WEB_REMIX',
  ): Promise<T> {
    const clientVersion = clientName === 'ANDROID_MUSIC' ? '7.21.50' : '1.20241118.01.00';
    const res = await fetch(`${YTMUSIC_API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName,
            clientVersion,
            hl: 'id',
            gl: this.location,
          },
        },
        ...body,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new MusicServiceError(
        `YouTube Music mengembalikan status ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`,
        502,
      );
    }

    return (await res.json()) as T;
  }

  private async cached<T>(
    key: string,
    action: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const existing = this.cache.get<T>(key);
    if (existing !== null) return existing;
    try {
      const result = await loader();
      this.cache.set(key, result, ttlSeconds);
      return result;
    } catch (err) {
      if (err instanceof MusicServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new MusicServiceError(`Gagal memuat ${action} dari YouTube Music: ${msg}`, 502);
    }
  }

  async getHome(limit = 10): Promise<HomeResponse> {
    return this.cached(
      `home:v2:${limit}`,
      'beranda',
      async () => {
        const raw = await this.ytPost('browse', { browseId: 'FEmusic_home' });
        const contents =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];

        const sections: HomeSection[] = [];
        for (const entry of contents) {
          const carousel = entry?.musicCarouselShelfRenderer;
          const shelf = entry?.musicShelfRenderer;
          const title = carousel
            ? getRunsText(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title)
            : shelf
              ? getRunsText(shelf.title)
              : null;
          const rawItems = carousel?.contents || shelf?.contents || [];
          if (!title || !Array.isArray(rawItems) || rawItems.length === 0) continue;
          if (isIndianOrMandarinText(title)) continue;

          const items: MediaItem[] = [];
          for (const rawItem of rawItems) {
            const norm = normalizeAnyItem(rawItem);
            if (norm && !isExcludedHomeItem(norm)) {
              items.push(norm);
            }
          }
          if (items.length > 0) {
            sections.push({ title, items });
          }
          if (sections.length >= limit) break;
        }
        return { sections };
      },
      480,
    );
  }

  async getCharts(country = 'ID'): Promise<ChartsResponse> {
    const cc = (country || 'ID').toUpperCase();
    return this.cached(
      `charts:${cc}`,
      `tangga lagu ${cc}`,
      async () => {
        const raw = await this.ytPost('browse', {
          browseId: 'FEmusic_charts',
          formData: { selectedValues: [cc] },
        });
        const contents =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];

        const songs: MediaItem[] = [];
        const videos: MediaItem[] = [];
        const artists: MediaItem[] = [];
        const trending: MediaItem[] = [];

        for (const sec of contents) {
          const carousel = sec?.musicCarouselShelfRenderer;
          if (!carousel) continue;
          const title = (
            getRunsText(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title) || ''
          ).toLowerCase();
          const list = Array.isArray(carousel.contents) ? carousel.contents : [];

          if (title.includes('artis') || title.includes('artist')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'artist' });
              if (norm) artists.push(norm);
            }
          } else if (title.includes('video')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry);
              if (norm) videos.push(norm);
            }
          } else if (title.includes('tren') || title.includes('trend')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry);
              if (norm) trending.push(norm);
            }
          } else if (title.includes('lagu') || title.includes('song')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'song' });
              if (norm) songs.push(norm);
            }
          }
        }

        if (songs.length === 0 && videos.length > 0) {
          const firstChartPl = videos.find((v) => v.playlistId || v.id);
          const plId = firstChartPl?.playlistId || firstChartPl?.id;
          if (plId) {
            try {
              const pl = await this.getPlaylist(plId, 25);
              songs.push(...pl.tracks.slice(0, 20));
            } catch {
              // Ignore fallback error
            }
          }
        }

        return { country: cc, songs, videos, artists, trending };
      },
      600,
    );
  }

  async getMoods(): Promise<MoodsResponse> {
    return this.cached(
      'moods:all',
      'kategori mood & genre',
      async () => {
        const raw = await this.ytPost('browse', { browseId: 'FEmusic_moods_and_genres' });
        const contents =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];

        const groups: MoodCategoryGroup[] = [];
        for (const sec of contents) {
          const grid = sec?.gridRenderer;
          if (!grid) continue;
          const groupTitle = getRunsText(grid.header?.gridHeaderRenderer?.title);
          if (!groupTitle) continue;
          const items: MoodCategoryItem[] = [];
          for (const item of grid.items || []) {
            const btn = item?.musicNavigationButtonRenderer;
            const title = getRunsText(btn?.buttonText);
            const params = btn?.clickCommand?.browseEndpoint?.params as string | undefined;
            if (title && params) {
              items.push({ title, params });
            }
          }
          if (items.length > 0) {
            groups.push({ title: groupTitle, items });
          }
        }
        return { groups };
      },
      600,
    );
  }

  async getMoodPlaylists(params: string): Promise<MoodPlaylistsResponse> {
    return this.cached(
      `mood_playlists:${params}`,
      'daftar putar mood',
      async () => {
        const raw = await this.ytPost('browse', {
          browseId: 'FEmusic_moods_and_genres_category',
          params,
        });
        const contents =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];

        const playlists: MediaItem[] = [];
        const seen = new Set<string>();
        for (const sec of contents) {
          const items =
            sec?.musicCarouselShelfRenderer?.contents ||
            sec?.gridRenderer?.items ||
            sec?.musicShelfRenderer?.contents ||
            [];
          for (const entry of items) {
            const norm = normalizeAnyItem(entry, { defaultType: 'playlist' });
            if (norm && !seen.has(norm.id)) {
              seen.add(norm.id);
              playlists.push(norm);
            }
          }
        }
        return { params, playlists };
      },
      480,
    );
  }

  async search(query: string, filterType?: string | null, limit = 25): Promise<SearchResponse> {
    const q = query.trim();
    if (!q) return { query: '', filter: filterType ?? null, items: [] };

    const resolvedFilter =
      filterType && filterType in SEARCH_FILTER_PARAMS ? filterType : null;

    return this.cached(
      `search:${q.toLowerCase()}:${resolvedFilter || 'all'}:${limit}`,
      `pencarian '${q}'`,
      async () => {
        const body: AnyRecord = { query: q };
        if (resolvedFilter) {
          body.params = decodeURIComponent(SEARCH_FILTER_PARAMS[resolvedFilter]);
        }
        const raw = await this.ytPost('search', body);
        const sections =
          raw.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];

        const defaultTypeMap: Record<string, MediaItemType> = {
          songs: 'song',
          albums: 'album',
          artists: 'artist',
          playlists: 'playlist',
          videos: 'video',
          podcasts: 'podcast',
          episodes: 'episode',
        };
        const defaultType = resolvedFilter ? defaultTypeMap[resolvedFilter] : undefined;

        const items: MediaItem[] = [];
        const seen = new Set<string>();

        for (const sec of sections) {
          const cardShelf = sec?.musicCardShelfRenderer;
          if (cardShelf) {
            const topTitle = getRunsText(cardShelf.title);
            const topNav = cardShelf.title?.runs?.[0]?.navigationEndpoint;
            const topVideoId = topNav?.watchEndpoint?.videoId as string | undefined;
            const topBrowseId = topNav?.browseEndpoint?.browseId as string | undefined;
            const topType = inferTypeFromIds(topBrowseId, topVideoId, null, null, null, defaultType);
            const topId = topVideoId || topBrowseId;
            if (topTitle && topId && !seen.has(topId)) {
              const sub = parseSubtitleRuns(
                Array.isArray(cardShelf.subtitle?.runs) ? cardShelf.subtitle.runs : [],
                topType,
              );
              seen.add(topId);
              items.push({
                id: topId,
                title: topTitle,
                artists: sub.artists,
                album: sub.album,
                duration: sub.duration,
                durationSeconds: parseDurationSeconds(sub.duration),
                thumbnail: pickLargestThumbnail(
                  cardShelf.thumbnail?.musicThumbnailRenderer?.thumbnail,
                ),
                type: sub.typeHint ?? topType,
                videoId: topVideoId ?? null,
                browseId: topBrowseId ?? null,
              });
            }
            for (const c of cardShelf.contents || []) {
              const norm = normalizeAnyItem(c, { defaultType });
              if (norm && !seen.has(norm.id)) {
                seen.add(norm.id);
                items.push(norm);
              }
            }
          }

          const shelfContents =
            sec?.musicShelfRenderer?.contents ||
            sec?.itemSectionRenderer?.contents ||
            [];
          for (const entry of shelfContents) {
            const nestedShelf = entry?.musicShelfRenderer?.contents;
            if (Array.isArray(nestedShelf)) {
              for (const subEntry of nestedShelf) {
                const norm = normalizeAnyItem(subEntry, { defaultType });
                if (norm && !seen.has(norm.id)) {
                  seen.add(norm.id);
                  items.push(norm);
                }
              }
              continue;
            }
            const norm = normalizeAnyItem(entry, { defaultType });
            if (norm && !seen.has(norm.id)) {
              seen.add(norm.id);
              items.push(norm);
            }
          }
          if (items.length >= limit) break;
        }

        return {
          query: q,
          filter: resolvedFilter,
          items: items.slice(0, limit),
        };
      },
      360,
    );
  }

  async suggest(query: string): Promise<SuggestResponse> {
    const q = query.trim();
    if (!q) return { query: '', suggestions: [] };

    return this.cached(
      `suggest:${q.toLowerCase()}`,
      'saran pencarian',
      async () => {
        const raw = await this.ytPost('music/get_search_suggestions', { input: q });
        const contents = raw.contents || [];
        const suggestions: string[] = [];
        for (const sec of contents) {
          const items = sec?.searchSuggestionsSectionRenderer?.contents || [];
          for (const entry of items) {
            const text = getRunsText(entry?.searchSuggestionRenderer?.suggestion);
            if (text && !suggestions.includes(text)) {
              suggestions.push(text);
            }
          }
        }
        return { query: q, suggestions: suggestions.slice(0, 10) };
      },
      300,
    );
  }

  async getArtist(artistId: string): Promise<ArtistDetailResponse> {
    return this.cached(
      `artist:v2:${artistId}`,
      'detail artis',
      async () => {
        const raw = await this.ytPost('browse', { browseId: artistId });
        const hdr =
          raw.header?.musicImmersiveHeaderRenderer ||
          raw.header?.musicVisualHeaderRenderer ||
          raw.header?.musicHeaderRenderer ||
          {};
        const name = getRunsText(hdr.title) || 'Artis';
        const fallbackArtist: ArtistRef = { id: artistId, name };
        const thumbnail = pickLargestThumbnail(hdr.thumbnail?.musicThumbnailRenderer?.thumbnail);
        const description = getRunsText(hdr.description);
        const subscribers =
          getRunsText(hdr.subscriptionButton?.subscribeButtonRenderer?.longSubscriberCountText) ||
          getRunsText(hdr.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText);
        const shuffleId =
          (hdr.playButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint?.playlistId as
            | string
            | undefined) ?? null;
        const radioId =
          (hdr.startRadioButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint?.playlistId as
            | string
            | undefined) ?? null;

        const sections =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];

        const songs: MediaItem[] = [];
        const albums: MediaItem[] = [];
        const singles: MediaItem[] = [];
        const compilations: MediaItem[] = [];
        const appearsOn: MediaItem[] = [];
        const videos: MediaItem[] = [];
        const related: MediaItem[] = [];
        let views: string | null = null;

        for (const sec of sections) {
          if (sec?.musicShelfRenderer) {
            const list = sec.musicShelfRenderer.contents || [];
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, {
                defaultType: 'song',
                fallbackArtist,
              });
              if (norm) songs.push(norm);
            }
            continue;
          }
          if (sec?.musicDescriptionShelfRenderer) {
            const subheader = getRunsText(sec.musicDescriptionShelfRenderer.subheader);
            if (subheader) views = subheader;
            continue;
          }

          const carousel = sec?.musicCarouselShelfRenderer;
          if (!carousel) continue;
          const secTitle = (
            getRunsText(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title) || ''
          ).toLowerCase();
          const list = carousel.contents || [];

          if (secTitle.includes('album')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'album', fallbackArtist });
              if (norm) albums.push(norm);
            }
          } else if (secTitle.includes('singel') || secTitle.includes('single') || secTitle.includes('ep')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'album', fallbackArtist });
              if (norm) singles.push(norm);
            }
          } else if (secTitle.includes('kompilasi') || secTitle.includes('compilation')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'album', fallbackArtist });
              if (norm) compilations.push(norm);
            }
          } else if (secTitle.includes('video')) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'video', fallbackArtist });
              if (norm) videos.push(norm);
            }
          } else if (
            secTitle.includes('tampil') ||
            secTitle.includes('appears') ||
            secTitle.includes('unggulan') ||
            secTitle.includes('featured')
          ) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry);
              if (norm) appearsOn.push(norm);
            }
          } else if (
            secTitle.includes('penggemar') ||
            secTitle.includes('juga suka') ||
            secTitle.includes('similar') ||
            secTitle.includes('related')
          ) {
            for (const entry of list) {
              const norm = normalizeAnyItem(entry, { defaultType: 'artist' });
              if (norm) related.push(norm);
            }
          }
        }

        return {
          id: artistId,
          name,
          description,
          subscribers,
          views,
          thumbnail,
          shuffleId,
          radioId,
          songs,
          albums,
          singles,
          compilations,
          appearsOn,
          videos,
          related,
        };
      },
      480,
    );
  }

  async getArtistAlbums(artistId: string, params: string): Promise<MediaItem[]> {
    return this.cached(
      `artist_albums:${artistId}:${params}`,
      'diskografi artis',
      async () => {
        const raw = await this.ytPost('browse', { browseId: artistId, params });
        const contents =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];
        const out: MediaItem[] = [];
        for (const sec of contents) {
          const items = sec?.gridRenderer?.items || sec?.musicShelfRenderer?.contents || [];
          for (const entry of items) {
            const norm = normalizeAnyItem(entry, { defaultType: 'album' });
            if (norm) out.push(norm);
          }
        }
        return out;
      },
      480,
    );
  }

  async getAlbum(albumId: string): Promise<AlbumDetailResponse> {
    return this.cached(
      `album:v2:${albumId}`,
      'detail album',
      async () => {
        const raw = await this.ytPost('browse', { browseId: albumId });
        const twoCol = raw.contents?.twoColumnBrowseResultsRenderer;
        const hdr =
          twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
            ?.musicResponsiveHeaderRenderer ||
          raw.header?.musicDetailHeaderRenderer ||
          {};

        const title = getRunsText(hdr.title) || 'Album';
        const thumbnail = pickLargestThumbnail(
          hdr.thumbnail?.musicThumbnailRenderer?.thumbnail,
        );
        const straplineRuns = Array.isArray(hdr.straplineTextOne?.runs)
          ? hdr.straplineTextOne.runs
          : [];
        const artists: ArtistRef[] = [];
        for (const run of straplineRuns) {
          const name = typeof run?.text === 'string' ? run.text.trim() : '';
          if (!name || name === '•' || name === ',') continue;
          const id = run?.navigationEndpoint?.browseEndpoint?.browseId || null;
          artists.push({ id, name });
        }
        if (artists.length === 0 && Array.isArray(hdr.subtitle?.runs)) {
          const parsed = parseSubtitleRuns(hdr.subtitle.runs, 'album');
          artists.push(...parsed.artists);
        }

        const subText = getRunsText(hdr.subtitle) || '';
        const yearMatch = subText.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : null;
        const secondSub = getRunsText(hdr.secondSubtitle) || '';
        const duration = secondSub.includes('•') ? secondSub.split('•').pop()?.trim() || null : secondSub || null;
        const description = getRunsText(
          hdr.description?.musicDescriptionShelfRenderer?.description,
        );

        const fallbackArtist = artists[0] ?? null;
        const albumRef: AlbumRef = { id: albumId, name: title };

        const secContents =
          twoCol?.secondaryContents?.sectionListRenderer?.contents || [];
        const trackItems = secContents[0]?.musicShelfRenderer?.contents || [];
        const tracks: MediaItem[] = [];
        let firstCreditsId: string | null = null;

        for (const entry of trackItems) {
          const norm = normalizeAnyItem(entry, {
            defaultType: 'song',
            fallbackThumbnail: thumbnail,
            fallbackArtist,
            fallbackAlbum: albumRef,
          });
          if (norm) {
            if (!firstCreditsId && norm.creditsBrowseId) {
              firstCreditsId = norm.creditsBrowseId;
            }
            tracks.push(norm);
          }
        }

        let credits: SongCredit[] = [];
        if (firstCreditsId) {
          try {
            credits = await this.fetchCreditsFromBrowseId(firstCreditsId);
          } catch {
            credits = [];
          }
        }

        const moreFromArtist: MediaItem[] = [];
        for (let i = 1; i < secContents.length; i++) {
          const carousel = secContents[i]?.musicCarouselShelfRenderer;
          if (!carousel) continue;
          for (const rec of carousel.contents || []) {
            const norm = normalizeAnyItem(rec, { defaultType: 'album' });
            if (norm && norm.id !== albumId) {
              moreFromArtist.push(norm);
            }
          }
        }

        const audioPlaylistId =
          (hdr.buttons?.find(
            (b: AnyRecord) =>
              b?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.playlistId,
          )?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.playlistId as
            | string
            | undefined) ||
          tracks[0]?.playlistId ||
          null;

        return {
          id: albumId,
          title,
          artists,
          year,
          trackCount: tracks.length,
          duration,
          description,
          thumbnail,
          audioPlaylistId,
          credits,
          moreFromArtist: moreFromArtist.slice(0, 10),
          tracks,
        };
      },
      480,
    );
  }

  async getPlaylist(playlistId: string, limit = 100): Promise<PlaylistDetailResponse> {
    const cleanId = playlistId.startsWith('VL') ? playlistId.slice(2) : playlistId;
    const browseId = `VL${cleanId}`;
    return this.cached(
      `playlist:${cleanId}:${limit}`,
      'detail playlist',
      async () => {
        const raw = await this.ytPost('browse', { browseId });
        const twoCol = raw.contents?.twoColumnBrowseResultsRenderer;
        const hdr =
          twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
            ?.musicResponsiveHeaderRenderer ||
          raw.header?.musicDetailHeaderRenderer ||
          {};

        const title = getRunsText(hdr.title) || 'Playlist';
        const thumbnail = pickLargestThumbnail(
          hdr.thumbnail?.musicThumbnailRenderer?.thumbnail,
        );
        const author = getRunsText(hdr.straplineTextOne);
        const subText = getRunsText(hdr.subtitle) || '';
        const yearMatch = subText.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : null;
        const secondSub = getRunsText(hdr.secondSubtitle) || '';
        const duration = secondSub.includes('•') ? secondSub.split('•').pop()?.trim() || null : null;
        const description = getRunsText(
          hdr.description?.musicDescriptionShelfRenderer?.description,
        );

        const shelf =
          twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]
            ?.musicPlaylistShelfRenderer ||
          twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer ||
          {};
        const rawTracks = Array.isArray(shelf.contents) ? shelf.contents : [];
        const tracks: MediaItem[] = [];
        for (const entry of rawTracks.slice(0, limit)) {
          const norm = normalizeAnyItem(entry, {
            defaultType: 'song',
            fallbackThumbnail: thumbnail,
          });
          if (norm) tracks.push(norm);
        }

        return {
          id: cleanId,
          title,
          author,
          description,
          year,
          trackCount: tracks.length,
          duration,
          thumbnail,
          tracks,
        };
      },
      420,
    );
  }

  async getWatchPlaylist(
    videoId: string,
    playlistId?: string | null,
    radio = true,
    limit = 25,
  ): Promise<WatchPlaylistResponse> {
    return this.cached(
      `watch:${videoId}:${playlistId || ''}:${radio ? 1 : 0}:${limit}`,
      'antrean putar',
      async () => {
        const body: AnyRecord = {
          videoId,
          isAudioOnly: true,
        };
        if (playlistId) {
          body.playlistId = playlistId;
        } else if (radio) {
          body.playlistId = `RDAMVM${videoId}`;
        }

        const raw = await this.ytPost('next', body);
        const tabs =
          raw.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
            ?.watchNextTabbedResultsRenderer?.tabs || [];

        const queueTab = tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content;
        const panel = queueTab?.playlistPanelRenderer;
        const tracks: MediaItem[] = [];
        for (const entry of (panel?.contents || []).slice(0, limit)) {
          const norm = normalizeAnyItem(entry, { defaultType: 'song' });
          if (norm) tracks.push(norm);
        }

        let lyricsBrowseId: string | null = null;
        let relatedBrowseId: string | null = null;
        for (const t of tabs) {
          const bId = t?.tabRenderer?.endpoint?.browseEndpoint?.browseId as string | undefined;
          if (!bId) continue;
          if (bId.startsWith('MPLYt')) lyricsBrowseId = bId;
          if (bId.startsWith('MPTRt')) relatedBrowseId = bId;
        }

        return {
          videoId,
          playlistId: panel?.playlistId ?? playlistId ?? null,
          lyricsBrowseId,
          relatedBrowseId,
          tracks,
        };
      },
      360,
    );
  }

  async getLyrics(browseId: string): Promise<LyricsResponse> {
    return this.cached(
      `lyrics:${browseId}`,
      'lirik lagu',
      async () => {
        // First try ANDROID_MUSIC for synced timed lyrics
        try {
          const mobileRaw = await this.ytPost('browse', { browseId }, 'ANDROID_MUSIC');
          const timedModel =
            mobileRaw.contents?.elementRenderer?.newElement?.type?.componentType?.model
              ?.timedLyricsModel;
          const lyricsData = timedModel?.lyricsData;
          const timedLines = lyricsData?.timedLyricsData;
          if (Array.isArray(timedLines) && timedLines.length > 0) {
            const lines: LyricLine[] = [];
            for (const ln of timedLines) {
              const text = typeof ln?.lyricLine === 'string' ? ln.lyricLine.trim() : '';
              const startMs = Number(ln?.cueRange?.startTimeMilliseconds ?? 0);
              const endMs = Number(ln?.cueRange?.endTimeMilliseconds ?? startMs + 3000);
              if (text) {
                lines.push({ text, startTimeMs: startMs, endTimeMs: endMs });
              }
            }
            if (lines.length > 0) {
              return {
                browseId,
                hasTimestamps: true,
                source: lyricsData?.sourceMessage || null,
                lines,
                plainText: lines.map((l) => l.text).join('\n'),
              };
            }
          }
        } catch {
          // Fall back to plain lyrics via WEB_REMIX
        }

        const raw = await this.ytPost('browse', { browseId }, 'WEB_REMIX');
        const descShelf =
          raw.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;
        const plainText = getRunsText(descShelf?.description);
        const source = getRunsText(descShelf?.footer);

        return {
          browseId,
          hasTimestamps: false,
          source,
          lines: [],
          plainText,
        };
      },
      600,
    );
  }

  private async fetchCreditsFromBrowseId(creditsBrowseId: string): Promise<SongCredit[]> {
    const raw = await this.ytPost('browse', { browseId: creditsBrowseId });
    const sections = raw.contents?.sectionListRenderer?.contents || [];
    const credits: SongCredit[] = [];
    for (const sec of sections) {
      const shelf = sec?.musicShelfRenderer;
      if (!shelf) continue;
      const role = getRunsText(shelf.title);
      if (!role) continue;
      const names: string[] = [];
      for (const item of shelf.contents || []) {
        const text = getRunsText(
          item?.musicResponsiveListItemRenderer?.flexColumns?.[0]
            ?.musicResponsiveListItemFlexColumnRenderer?.text,
        );
        if (text) names.push(text);
      }
      if (names.length > 0) {
        credits.push({ role, names });
      }
    }
    return credits;
  }

  async getSongCredits(
    videoId: string,
    albumId?: string | null,
    creditsBrowseId?: string | null,
  ): Promise<SongCreditsResponse> {
    return this.cached(
      `credits:${videoId}:${albumId || ''}:${creditsBrowseId || ''}`,
      'kredit lagu',
      async () => {
        let resolvedCreditsId =
          creditsBrowseId && creditsBrowseId.startsWith('MPTC') ? creditsBrowseId : null;
        let title = 'Kredit Lagu';
        let credits: SongCredit[] = [];

        if (!resolvedCreditsId && albumId) {
          try {
            const album = await this.getAlbum(albumId);
            const match = album.tracks.find((t) => t.videoId === videoId || t.id === videoId);
            if (match) {
              title = match.title;
              if (match.creditsBrowseId) resolvedCreditsId = match.creditsBrowseId;
            }
          } catch {
            // Ignore
          }
        }

        if (resolvedCreditsId) {
          try {
            credits = await this.fetchCreditsFromBrowseId(resolvedCreditsId);
          } catch {
            credits = [];
          }
        }

        if (credits.length === 0) {
          try {
            const player = await this.ytPost('player', { videoId });
            const details = player.videoDetails || {};
            if (details.title) title = String(details.title);
            if (details.author) {
              credits.push({ role: 'Dibawakan oleh', names: [String(details.author)] });
            }
            const cat = player.microformat?.microformatDataRenderer?.category;
            if (cat) {
              credits.push({ role: 'Kategori', names: [String(cat)] });
            }
          } catch {
            // Ignore
          }
        }

        return { videoId, title, credits };
      },
      600,
    );
  }

  async getSongRelated(videoId: string): Promise<SongRelatedResponse> {
    return this.cached(
      `song_related:${videoId}`,
      'lagu terkait',
      async () => {
        const watch = await this.getWatchPlaylist(videoId, null, true, 15);
        const tracks: MediaItem[] = [];
        const playlists: MediaItem[] = [];
        const artists: MediaItem[] = [];

        if (watch.relatedBrowseId) {
          try {
            const raw = await this.ytPost('browse', { browseId: watch.relatedBrowseId });
            const sections = raw.contents?.sectionListRenderer?.contents || [];
            for (const sec of sections) {
              const carousel = sec?.musicCarouselShelfRenderer;
              if (!carousel) continue;
              const secTitle = (
                getRunsText(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title) || ''
              ).toLowerCase();
              for (const entry of carousel.contents || []) {
                if (secTitle.includes('artis') || secTitle.includes('artist')) {
                  const norm = normalizeAnyItem(entry, { defaultType: 'artist' });
                  if (norm) artists.push(norm);
                } else if (secTitle.includes('playlist')) {
                  const norm = normalizeAnyItem(entry, { defaultType: 'playlist' });
                  if (norm) playlists.push(norm);
                } else {
                  const norm = normalizeAnyItem(entry);
                  if (norm) {
                    if (norm.type === 'playlist') playlists.push(norm);
                    else if (norm.type === 'artist') artists.push(norm);
                    else tracks.push(norm);
                  }
                }
              }
            }
          } catch {
            // Ignore
          }
        }

        if (tracks.length === 0) {
          for (const t of watch.tracks) {
            if (t.id !== videoId) tracks.push(t);
          }
        }

        return {
          videoId,
          tracks: tracks.slice(0, 20),
          playlists: playlists.slice(0, 12),
          artists: artists.slice(0, 12),
        };
      },
      420,
    );
  }

  async getPodcast(podcastId: string, limit = 100): Promise<PodcastDetailResponse> {
    return this.cached(
      `podcast:${podcastId}:${limit}`,
      'detail podcast',
      async () => {
        const raw = await this.ytPost('browse', { browseId: podcastId });
        const twoCol = raw.contents?.twoColumnBrowseResultsRenderer;
        const hdr =
          twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
            ?.musicResponsiveHeaderRenderer || {};

        const title = getRunsText(hdr.title) || 'Podcast';
        const thumbnail = pickLargestThumbnail(
          hdr.thumbnail?.musicThumbnailRenderer?.thumbnail,
        );
        const authorRun = hdr.straplineTextOne?.runs?.[0];
        const author = getRunsText(hdr.straplineTextOne);
        const authorId = (authorRun?.navigationEndpoint?.browseEndpoint?.browseId as string) ?? null;
        const description = getRunsText(
          hdr.description?.musicDescriptionShelfRenderer?.description,
        );

        const shelf =
          twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer || {};
        const episodes: PodcastEpisode[] = [];
        for (const entry of (shelf.contents || []).slice(0, limit)) {
          const ep = entry?.musicMultiRowListItemRenderer;
          if (!ep) continue;
          const vid =
            ep.onTap?.watchEndpoint?.videoId ||
            ep.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
          const epTitle = getRunsText(ep.title);
          if (!vid || !epTitle) continue;
          const sub = parseSubtitleRuns(
            Array.isArray(ep.subtitle?.runs) ? ep.subtitle.runs : [],
            'episode',
          );
          episodes.push({
            id: vid,
            videoId: vid,
            title: epTitle,
            description: getRunsText(ep.description),
            duration: sub.duration,
            durationSeconds: parseDurationSeconds(sub.duration),
            published: sub.published,
            thumbnail: pickLargestThumbnail(
              ep.thumbnail?.musicThumbnailRenderer?.thumbnail,
              thumbnail,
            ),
            podcastId,
            podcastTitle: title,
          });
        }

        return {
          id: podcastId,
          title,
          author,
          authorId,
          description,
          thumbnail,
          episodes,
        };
      },
      480,
    );
  }

  async getEpisode(videoId: string): Promise<EpisodeDetailResponse> {
    return this.cached(
      `episode:${videoId}`,
      'detail episode',
      async () => {
        const raw = await this.ytPost('browse', { browseId: `MPED${videoId}` });
        const twoCol = raw.contents?.twoColumnBrowseResultsRenderer;
        const hdr =
          twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
            ?.musicResponsiveHeaderRenderer || {};

        const title = getRunsText(hdr.title) || 'Episode Podcast';
        const thumbnail = pickLargestThumbnail(
          hdr.thumbnail?.musicThumbnailRenderer?.thumbnail,
        );
        const strapRun = hdr.straplineTextOne?.runs?.[0];
        const podcastTitle = getRunsText(hdr.straplineTextOne);
        const podcastBrowseId =
          (strapRun?.navigationEndpoint?.browseEndpoint?.browseId as string | undefined) ?? null;
        const sub = parseSubtitleRuns(
          Array.isArray(hdr.subtitle?.runs) ? hdr.subtitle.runs : [],
          'episode',
        );
        const secDesc = getRunsText(
          twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]
            ?.musicDescriptionShelfRenderer?.description,
        );

        return {
          id: videoId,
          videoId,
          title,
          description: secDesc,
          duration: sub.duration,
          durationSeconds: parseDurationSeconds(sub.duration),
          published: sub.published,
          thumbnail,
          podcastId: podcastBrowseId,
          podcastTitle,
          author: podcastTitle,
          authorId: podcastBrowseId,
        };
      },
      480,
    );
  }

  async getChannelEpisodes(channelId: string, params: string): Promise<MediaItem[]> {
    return this.cached(
      `channel_episodes:${channelId}:${params}`,
      'daftar episode',
      async () => {
        const raw = await this.ytPost('browse', { browseId: channelId, params });
        const contents =
          raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents || [];
        const out: MediaItem[] = [];
        for (const sec of contents) {
          const items = sec?.musicShelfRenderer?.contents || sec?.gridRenderer?.items || [];
          for (const entry of items) {
            const norm = normalizeAnyItem(entry, { defaultType: 'episode' });
            if (norm) out.push(norm);
          }
        }
        return out;
      },
      480,
    );
  }

  getAccountStatus(): AccountStatusResponse {
    return {
      authenticated: false,
      mode: 'local',
      message: 'Mode lokal aktif (pustaka tersimpan di browser).',
    };
  }

  getAccountLibrary(): AccountLibraryResponse {
    return {
      likedSongs: [],
      playlists: [],
      albums: [],
      artists: [],
      subscriptions: [],
      history: [],
    };
  }

  async extractArtworkColor(imageUrl: string): Promise<ArtworkColorResponse> {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new MusicServiceError('URL gambar tidak valid.', 400);
    }
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !ALLOWED_ARTWORK_HOSTS.has(parsed.hostname)
    ) {
      throw new MusicServiceError('URL gambar tidak diizinkan.', 400);
    }

    const cacheKey = `artcolor:${imageUrl}`;
    const cached = this.cache.get<ArtworkColorResponse>(cacheKey);
    if (cached) return cached;

    try {
      const resp = await fetch(imageUrl, {
        headers: { Accept: 'image/jpeg' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const decoded = jpeg.decode(buf, { useTArray: true });
      const data = decoded.data;

      const allSamples: Array<[number, number, number]> = [];
      const vibrantSamples: Array<[number, number, number]> = [];
      const step = Math.max(1, Math.floor((decoded.width * decoded.height) / 1024));

      for (let i = 0; i < data.length; i += 4 * step) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        allSamples.push([r, g, b]);
        const mean = (r + g + b) / 3;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        if (mean >= 28 && mean <= 220 && chroma >= 18) {
          vibrantSamples.push([r, g, b]);
        }
      }

      const pool = vibrantSamples.length >= 16 ? vibrantSamples : allSamples;
      if (pool.length === 0) {
        return { r: 22, g: 48, b: 40, hex: '#163028' };
      }

      let avgR = Math.floor(pool.reduce((acc, p) => acc + p[0], 0) / pool.length);
      let avgG = Math.floor(pool.reduce((acc, p) => acc + p[1], 0) / pool.length);
      let avgB = Math.floor(pool.reduce((acc, p) => acc + p[2], 0) / pool.length);

      const lum = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
      if (lum > 155) {
        const scale = 155 / lum;
        avgR = Math.floor(avgR * scale);
        avgG = Math.floor(avgG * scale);
        avgB = Math.floor(avgB * scale);
      } else if (lum < 36) {
        const boost = 36 / Math.max(lum, 1);
        avgR = Math.min(255, Math.floor(avgR * boost));
        avgG = Math.min(255, Math.floor(avgG * boost));
        avgB = Math.min(255, Math.floor(avgB * boost));
      }

      const hex = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
      const result: ArtworkColorResponse = { r: avgR, g: avgG, b: avgB, hex };
      this.cache.set(cacheKey, result, 600);
      return result;
    } catch {
      return { r: 22, g: 48, b: 40, hex: '#163028' };
    }
  }
}
