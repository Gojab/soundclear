import {
  fetchMoodPlaylists,
  fetchPlaylist,
  fetchSearch,
  fetchSongRelated,
  fetchWatchPlaylist,
} from '../api/client';
import type { MediaItem, MoodCategoryItem } from '../types/music';
import {
  buildCustomMixMeta,
  CURATED_MIX_GENRES,
  curateCustomMixTracks,
  type MixBuilderMode,
} from './createMixLogic';
import { getPlayableVideoId } from './playerLogic';

export interface GenerateCuratedMixParams {
  mode: MixBuilderMode;
  seedTracks: MediaItem[];
  selectedGenres: string[];
  moodCategories?: MoodCategoryItem[];
  targetCount: number;
  customTitle?: string;
  fallbackPool?: MediaItem[];
  hiddenTrackIds?: string[];
  excludedTasteIds?: string[];
  hideExplicit?: boolean;
  shuffleOffset?: number;
  signal?: AbortSignal;
}

export interface GeneratedMixResult {
  title: string;
  subtitle: string;
  description: string;
  coverArt: string | null;
  secondaryArt: string[];
  accentColor: string;
  accentGradient: string;
  badgeTextColor: string;
  tracks: MediaItem[];
}

function findMatchingMoodCategory(
  genreLabel: string,
  moodCategories: MoodCategoryItem[],
): MoodCategoryItem | null {
  const lower = genreLabel.trim().toLowerCase();
  const curated = CURATED_MIX_GENRES.find(
    (g) => g.label.toLowerCase() === lower || g.id.toLowerCase() === lower,
  );
  const hints = curated ? [lower, ...curated.moodHints] : [lower];

  for (const hint of hints) {
    const exact = moodCategories.find((m) => m.title.toLowerCase() === hint);
    if (exact) return exact;
  }
  for (const hint of hints) {
    const partial = moodCategories.find((m) => m.title.toLowerCase().includes(hint));
    if (partial) return partial;
  }
  return null;
}

function buildGenreSearchQuery(genreLabel: string): string {
  const lower = genreLabel.trim().toLowerCase();
  const curated = CURATED_MIX_GENRES.find(
    (g) => g.label.toLowerCase() === lower || g.id.toLowerCase() === lower,
  );
  return curated ? curated.searchQuery : `${genreLabel} hits songs`;
}

export async function generateCuratedMix(
  params: GenerateCuratedMixParams,
): Promise<GeneratedMixResult> {
  const {
    mode,
    seedTracks,
    selectedGenres,
    moodCategories = [],
    targetCount,
    customTitle,
    fallbackPool = [],
    hiddenTrackIds,
    excludedTasteIds,
    hideExplicit,
    shuffleOffset = 0,
    signal,
  } = params;

  const buckets: MediaItem[][] = [];
  const tasks: Array<Promise<MediaItem[]>> = [];

  // 1. Track-seeded curation: Watch Radio + Song Related + Artist Songs search
  if (mode === 'track' || mode === 'blend') {
    for (const seed of seedTracks.slice(0, 3)) {
      const vid = getPlayableVideoId(seed);
      const artistName = seed.artists?.[0]?.name?.trim();
      if (vid) {
        tasks.push(
          fetchWatchPlaylist(vid, true, seed.playlistId, signal)
            .then((res) => res.tracks || [])
            .catch(() => []),
        );
        tasks.push(
          fetchSongRelated(vid, signal)
            .then((res) => res.tracks || [])
            .catch(() => []),
        );
      }
      if (artistName && artistName !== 'Artis tidak diketahui') {
        tasks.push(
          fetchSearch(artistName, 'songs', signal)
            .then((res) => res.items || [])
            .catch(() => []),
        );
      }
    }
  }

  // 2. Genre / Mood curation: Song Search + Mood Playlist lookup
  if (mode === 'genre' || mode === 'blend') {
    for (const genreLabel of selectedGenres.slice(0, 2)) {
      const searchQ = buildGenreSearchQuery(genreLabel);
      tasks.push(
        fetchSearch(searchQ, 'songs', signal)
          .then((res) => res.items || [])
          .catch(() => []),
      );

      const matchedMood = findMatchingMoodCategory(genreLabel, moodCategories);
      if (matchedMood) {
        tasks.push(
          fetchMoodPlaylists(matchedMood.params, signal, matchedMood.title)
            .then(async (moodRes) => {
              const firstPlaylist = moodRes.playlists?.[0];
              if (!firstPlaylist) return [];
              const plId = firstPlaylist.playlistId || firstPlaylist.id;
              if (!plId) return [];
              const detail = await fetchPlaylist(plId, signal, firstPlaylist.title);
              return detail.tracks || [];
            })
            .catch(() => []),
        );
      }
    }
  }

  const settled = await Promise.all(tasks);
  for (const items of settled) {
    if (items.length > 0) {
      buckets.push(items);
    }
  }

  // Always include fallback pool at the end so mixes never fail silently if offline/sparse
  if (fallbackPool.length > 0) {
    buckets.push(fallbackPool);
  }

  const curatedTracks = curateCustomMixTracks({
    seedTracks: mode === 'genre' ? [] : seedTracks,
    buckets,
    targetCount,
    hiddenTrackIds,
    excludedTasteIds,
    hideExplicit,
    shuffleOffset,
  });

  const meta = buildCustomMixMeta({
    mode,
    seedTracks: mode === 'genre' ? [] : seedTracks,
    selectedGenres: mode === 'track' ? [] : selectedGenres,
    tracks: curatedTracks,
    customTitle,
  });

  return {
    title: meta.title,
    subtitle: meta.subtitle,
    description: meta.description,
    coverArt: meta.coverArt,
    secondaryArt: meta.secondaryArt,
    accentColor: meta.theme.accentColor,
    accentGradient: meta.theme.accentGradient,
    badgeTextColor: meta.theme.badgeTextColor,
    tracks: curatedTracks,
  };
}
