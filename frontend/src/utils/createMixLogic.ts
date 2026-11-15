import type { MediaItem } from '../types/music';
import {
  diversifyIndonesianTracks,
  getPlayableVideoId,
  getTrackUniqueId,
  isExcludedRegionalItem,
} from './playerLogic';

export type MixBuilderMode = 'track' | 'genre' | 'blend';

export interface MixGenreOption {
  id: string;
  label: string;
  searchQuery: string;
  moodHints: string[];
  accentColor: string;
}

export const CURATED_MIX_GENRES: MixGenreOption[] = [
  {
    id: 'pop',
    label: 'Pop Indonesia',
    searchQuery: 'lagu pop indonesia terbaru hits',
    moodHints: ['pop', 'musik indonesia', 'hits'],
    accentColor: '#19EE8A',
  },
  {
    id: 'indie',
    label: 'Indie & Senja',
    searchQuery: 'lagu indie indonesia santai akustik',
    moodHints: ['indie', 'chill', 'folk'],
    accentColor: '#38BDF8',
  },
  {
    id: 'chill',
    label: 'Chill & Santai',
    searchQuery: 'lagu santai chill acoustic relax',
    moodHints: ['chill', 'feel good', 'sleep'],
    accentColor: '#2DD4BF',
  },
  {
    id: 'rnb',
    label: 'R&B & Soul',
    searchQuery: 'r&b soul smooth hits',
    moodHints: ['r&b', 'rnb', 'romance'],
    accentColor: '#A78BFA',
  },
  {
    id: 'kpop',
    label: 'K-Pop',
    searchQuery: 'k-pop top hits',
    moodHints: ['k-pop', 'kpop'],
    accentColor: '#FB7185',
  },
  {
    id: 'rock',
    label: 'Rock & Alternatif',
    searchQuery: 'rock alternative hits',
    moodHints: ['rock', 'metal'],
    accentColor: '#F97316',
  },
  {
    id: 'hiphop',
    label: 'Hip Hop & Rap',
    searchQuery: 'hip hop rap hits',
    moodHints: ['hip hop', 'rap'],
    accentColor: '#F59E0B',
  },
  {
    id: 'jazz',
    label: 'Jazz & Akustik',
    searchQuery: 'jazz acoustic cafe relaxing',
    moodHints: ['jazz', 'focus', 'acoustic'],
    accentColor: '#60A5FA',
  },
  {
    id: 'workout',
    label: 'Energik & Olahraga',
    searchQuery: 'upbeat workout party hits',
    moodHints: ['workout', 'energize', 'party'],
    accentColor: '#10B981',
  },
  {
    id: 'romance',
    label: 'Romantis',
    searchQuery: 'lagu cinta romantis galau indonesia',
    moodHints: ['romance', 'sad'],
    accentColor: '#EC4899',
  },
];

const MIX_PALETTES = [
  {
    accentColor: '#19EE8A',
    accentGradient: 'from-[#19EE8A]/35 via-[#0AD36C]/15 to-[#06130D]',
    badgeTextColor: '#19EE8A',
  },
  {
    accentColor: '#38BDF8',
    accentGradient: 'from-[#38BDF8]/35 via-[#0284C7]/15 to-[#061018]',
    badgeTextColor: '#7DD3FC',
  },
  {
    accentColor: '#F59E0B',
    accentGradient: 'from-[#F59E0B]/35 via-[#D97706]/15 to-[#161006]',
    badgeTextColor: '#FCD34D',
  },
  {
    accentColor: '#A78BFA',
    accentGradient: 'from-[#A78BFA]/35 via-[#7C3AED]/15 to-[#110B1A]',
    badgeTextColor: '#C4B5FD',
  },
  {
    accentColor: '#FB7185',
    accentGradient: 'from-[#FB7185]/35 via-[#E11D48]/15 to-[#18080D]',
    badgeTextColor: '#FDA4AF',
  },
];

export interface CurateMixInput {
  seedTracks: MediaItem[];
  buckets: MediaItem[][];
  targetCount: number;
  hiddenTrackIds?: string[];
  excludedTasteIds?: string[];
  hideExplicit?: boolean;
  shuffleOffset?: number;
}

function getTrackSignatureKey(item: MediaItem): string | null {
  const rawTitle = (item.title || '')
    .replace(/\s*[\(\[](?:official|lyric|lyrics|audio|video|mv|hd|4k|live|acoustic|remix)[^\)\]]*[\)\]]/gi, '')
    .replace(/[^a-z0-9\u00C0-\u024F]+/gi, ' ')
    .trim()
    .toLowerCase();
  const primaryArtist = (item.artists?.[0]?.name || '')
    .replace(/[^a-z0-9\u00C0-\u024F]+/gi, ' ')
    .trim()
    .toLowerCase();
  if (!rawTitle || !primaryArtist || primaryArtist === 'artis tidak diketahui') {
    return null;
  }
  return `${rawTitle}::${primaryArtist}`;
}

function isTrackEligible(
  item: MediaItem,
  blockedIds: Set<string>,
  hideExplicit: boolean,
): boolean {
  if (!item) return false;
  if (item.type !== 'song' && item.type !== 'video' && item.type !== 'local') {
    return false;
  }
  const playable = item.type === 'local' ? item.id : getPlayableVideoId(item);
  const key = getTrackUniqueId(item) || item.id;
  if (!playable || !key) return false;
  if (blockedIds.has(key) || blockedIds.has(playable) || blockedIds.has(item.id)) return false;
  if (hideExplicit && item.isExplicit) return false;
  if (isExcludedRegionalItem(item)) return false;
  return true;
}

export function curateCustomMixTracks(input: CurateMixInput): MediaItem[] {
  const safeCount = Math.max(5, Math.min(50, input.targetCount || 20));
  const blockedIds = new Set<string>([
    ...(input.hiddenTrackIds || []),
    ...(input.excludedTasteIds || []),
  ]);
  const hideExplicit = Boolean(input.hideExplicit);
  const offset = Math.max(0, input.shuffleOffset || 0);

  const seen = new Set<string>();
  const seenSignatures = new Set<string>();
  const collected: MediaItem[] = [];

  const pushIfNew = (track: MediaItem) => {
    if (!isTrackEligible(track, blockedIds, hideExplicit)) return;
    const key = getTrackUniqueId(track) || track.id;
    const sig = getTrackSignatureKey(track);
    if (seen.has(key) || (sig && seenSignatures.has(sig))) return;
    seen.add(key);
    if (sig) seenSignatures.add(sig);
    collected.push(track);
  };

  // 1. Always anchor with valid user-selected seed tracks first
  for (const seed of input.seedTracks) {
    pushIfNew(seed);
  }

  // 2. Round-robin interleave across seed/genre buckets so blends stay balanced
  const normalizedBuckets = input.buckets
    .map((bucket) => {
      if (!Array.isArray(bucket) || bucket.length === 0) return [];
      const rot = offset % bucket.length;
      return [...bucket.slice(rot), ...bucket.slice(0, rot)];
    })
    .filter((b) => b.length > 0);

  const maxLen = normalizedBuckets.reduce((acc, b) => Math.max(acc, b.length), 0);
  for (let row = 0; row < maxLen; row += 1) {
    for (let col = 0; col < normalizedBuckets.length; col += 1) {
      const candidate = normalizedBuckets[col][row];
      if (candidate) pushIfNew(candidate);
      if (collected.length >= safeCount * 2) break;
    }
    if (collected.length >= safeCount * 2) break;
  }

  // 3. Re-anchor seed tracks while diversifying remaining tracks against artist clustering
  const seedKeys = new Set(
    input.seedTracks.map((t) => getTrackUniqueId(t) || t.id).filter(Boolean),
  );
  const anchored = collected.filter((t) => seedKeys.has(getTrackUniqueId(t) || t.id));
  const remainder = diversifyIndonesianTracks(
    collected.filter((t) => !seedKeys.has(getTrackUniqueId(t) || t.id)),
    1,
    2,
  );

  // Interleave anchors gently near top while avoiding consecutive duplicates
  const merged: MediaItem[] = [];
  let rIdx = 0;
  for (let aIdx = 0; aIdx < anchored.length; aIdx += 1) {
    merged.push(anchored[aIdx]);
    for (let step = 0; step < 2 && rIdx < remainder.length; step += 1) {
      merged.push(remainder[rIdx]);
      rIdx += 1;
    }
  }
  while (rIdx < remainder.length) {
    merged.push(remainder[rIdx]);
    rIdx += 1;
  }

  return merged.slice(0, safeCount);
}

export function pickCustomMixTheme(seedKey: string) {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  }
  return MIX_PALETTES[hash % MIX_PALETTES.length];
}

export function buildCustomMixMeta(options: {
  mode: MixBuilderMode;
  seedTracks: MediaItem[];
  selectedGenres: string[];
  tracks: MediaItem[];
  customTitle?: string;
}): {
  title: string;
  subtitle: string;
  description: string;
  coverArt: string | null;
  secondaryArt: string[];
  theme: (typeof MIX_PALETTES)[number];
} {
  const cleanCustomTitle = options.customTitle?.trim();
  const trackNames = options.seedTracks.map((t) => t.title).filter(Boolean);
  const artistNames = Array.from(
    new Set(
      options.tracks
        .flatMap((t) => t.artists || [])
        .map((a) => a.name?.trim())
        .filter((n): n is string => Boolean(n) && n !== 'Artis tidak diketahui'),
    ),
  );

  let autoTitle = 'Mix Pilihanmu';
  if (options.mode === 'genre' && options.selectedGenres.length > 0) {
    autoTitle =
      options.selectedGenres.length === 1
        ? `Mix ${options.selectedGenres[0]}`
        : `Blend ${options.selectedGenres.slice(0, 2).join(' & ')}`;
  } else if (trackNames.length === 1 && options.selectedGenres.length > 0) {
    autoTitle = `Mix ${trackNames[0]} · ${options.selectedGenres[0]}`;
  } else if (trackNames.length === 1) {
    const leadArtist = options.seedTracks[0]?.artists?.[0]?.name?.trim();
    autoTitle = leadArtist ? `Mix ${leadArtist}: ${trackNames[0]}` : `Mix ${trackNames[0]}`;
  } else if (trackNames.length >= 2) {
    autoTitle = `Blend: ${trackNames.slice(0, 2).join(' + ')}`;
  } else if (options.selectedGenres.length > 0) {
    autoTitle = `Mix ${options.selectedGenres.slice(0, 2).join(' & ')}`;
  }

  const title = cleanCustomTitle || autoTitle;

  const subtitle =
    artistNames.length === 0
      ? 'Kurasi lagu sesuai selera musikmu'
      : artistNames.length === 1
        ? `${artistNames[0]} dan lagu pilihan`
        : `${artistNames.slice(0, 3).join(', ')} dan lainnya`;

  const descriptionParts: string[] = [];
  if (trackNames.length > 0) {
    descriptionParts.push(`Pemicu lagu: ${trackNames.join(', ')}`);
  }
  if (options.selectedGenres.length > 0) {
    descriptionParts.push(`Genre: ${options.selectedGenres.join(', ')}`);
  }
  const description =
    descriptionParts.length > 0
      ? `${descriptionParts.join(' · ')}. Diracik untuk mendengarkan tanpa jeda.`
      : 'Daftar putar terkurasi berdasarkan selera musik pilihanmu.';

  const artSet: string[] = [];
  const seenArt = new Set<string>();
  for (const t of [...options.seedTracks, ...options.tracks]) {
    if (!t.thumbnail || seenArt.has(t.thumbnail)) continue;
    seenArt.add(t.thumbnail);
    artSet.push(t.thumbnail);
    if (artSet.length >= 4) break;
  }

  return {
    title,
    subtitle,
    description,
    coverArt: artSet[0] || null,
    secondaryArt: artSet,
    theme: pickCustomMixTheme(`${title}:${options.selectedGenres.join(',')}`),
  };
}

export function formatMixDurationSummary(tracks: MediaItem[]): string {
  const totalSec = tracks.reduce((sum, t) => sum + Math.max(0, t.durationSeconds || 210), 0);
  const mins = Math.max(1, Math.round(totalSec / 60));
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0
      ? `${tracks.length} lagu · ${hrs} jam ${rem} mnt`
      : `${tracks.length} lagu · ${hrs} jam`;
  }
  return `${tracks.length} lagu · ${mins} mnt`;
}
