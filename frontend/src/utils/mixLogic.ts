import type { HomeSection, MediaItem, PlayHistoryEntry } from '../types/music';
import {
  diversifyIndonesianTracks,
  getPlayableVideoId,
  getTrackUniqueId,
  isExcludedRegionalItem,
} from './playerLogic';

export interface DailyMixCollection {
  id: string;
  numberLabel: string;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  accentGradient: string;
  badgeTextColor: string;
  coverArt: string | null;
  secondaryArt: string[];
  tracks: MediaItem[];
}

export interface BuildDailyMixesInput {
  chartSongs: MediaItem[];
  homeSections: HomeSection[];
  likedTracks: MediaItem[];
  playHistory: PlayHistoryEntry[];
  hiddenTrackIds?: string[];
  excludedTasteIds?: string[];
  hideExplicit?: boolean;
  watchTracksBySeed?: Record<string, MediaItem[]>;
}

const MIX_THEMES = [
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

function dedupePlayableTracks(
  items: MediaItem[],
  blockedIds: Set<string>,
  hideExplicit: boolean,
): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    const vid = getPlayableVideoId(item);
    const key = getTrackUniqueId(item) || item.id;
    if (!vid || !key || seen.has(key) || blockedIds.has(key)) continue;
    if (hideExplicit && item.isExplicit) continue;
    if (isExcludedRegionalItem(item)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function summarizeArtists(tracks: MediaItem[], fallbackLabel: string): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const t of tracks) {
    for (const a of t.artists || []) {
      const clean = a.name?.trim();
      if (!clean || clean === 'Artis tidak diketahui') continue;
      const lower = clean.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      names.push(clean);
      if (names.length >= 3) break;
    }
    if (names.length >= 3) break;
  }
  if (names.length === 0) return fallbackLabel;
  if (names.length === 1) return `${names[0]} dan lagu pilihan`;
  return `${names.join(', ')} dan lainnya`;
}

function collectSecondaryArt(tracks: MediaItem[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const t of tracks) {
    if (!t.thumbnail || seen.has(t.thumbnail)) continue;
    seen.add(t.thumbnail);
    urls.push(t.thumbnail);
    if (urls.length >= 4) break;
  }
  return urls;
}

const INDIE_CHILL_HINTS =
  /\b(?:indie|santai|chill|akustik|acoustic|galau|senja|lofi|slow|malam|nyaman|hindie|hindia|nadin|pamungkas|fiersa|payung teduh|fourtwnty|kunto aji|sal priadi|feast|reality club|efek rumah kaca|float|stars and rabbit|danilla|barasuara|juicy luicy|sheila on 7|nosstress)\b/i;

const POP_ID_HINTS =
  /\b(?:pop|hits|tulus|mahalini|tiara|lyodra|rais[ae]|ziva|keisya|fabio|rizky|rossa|judika|afgan|yura|isiana|isyana|bernadya|salma|nyoman|anggi|aruma|maudy|vira|adrian|virgoun|budi doremi|noah|peterpan|armada|dewa|slank)\b/i;

export function buildDailyMixes(input: BuildDailyMixesInput): DailyMixCollection[] {
  const blockedIds = new Set<string>([
    ...(input.hiddenTrackIds || []),
    ...(input.excludedTasteIds || []),
  ]);
  const hideExplicit = Boolean(input.hideExplicit);

  const historyTracks = input.playHistory.map((h) => h.track);
  const homeSectionTracks = input.homeSections.flatMap((s) => s.items || []);
  const watchPool = Object.values(input.watchTracksBySeed || {}).flat();

  const masterPool = dedupePlayableTracks(
    [...input.likedTracks, ...historyTracks, ...watchPool, ...input.chartSongs, ...homeSectionTracks],
    blockedIds,
    hideExplicit,
  );

  if (masterPool.length === 0) {
    return [];
  }

  // Group candidate pools by primary artist for personalized Daily Mixes 1..3
  const artistBuckets = new Map<string, { artistName: string; tracks: MediaItem[] }>();
  for (const t of [...input.likedTracks, ...historyTracks, ...masterPool]) {
    const cleanPool = dedupePlayableTracks([t], blockedIds, hideExplicit);
    if (cleanPool.length === 0) continue;
    const primaryArtist = t.artists?.[0]?.name?.trim();
    if (!primaryArtist || primaryArtist === 'Artis tidak diketahui') continue;
    const key = primaryArtist.toLowerCase();
    const bucket = artistBuckets.get(key) || { artistName: primaryArtist, tracks: [] };
    if (!bucket.tracks.some((x) => (getTrackUniqueId(x) || x.id) === (getTrackUniqueId(t) || t.id))) {
      bucket.tracks.push(t);
    }
    artistBuckets.set(key, bucket);
  }

  const orderedArtists = Array.from(artistBuckets.values());
  const mixes: DailyMixCollection[] = [];
  const usedTrackSets: Set<string>[] = [];

  // Daily Mix 1, 2, 3: personalized artist-seeded mixes + companion watch tracks
  for (let i = 0; i < 3; i += 1) {
    const theme = MIX_THEMES[i];
    const seedBucket = orderedArtists[i] || null;
    const seedVid = seedBucket?.tracks[0] ? getPlayableVideoId(seedBucket.tracks[0]) : null;
    const watchRelated = seedVid ? input.watchTracksBySeed?.[seedVid] || [] : [];

    // Collect tracks around this artist seed plus complementary pool items offset by i
    const rotatedOffset = (i * 4) % masterPool.length;
    const rotatedPool = [
      ...masterPool.slice(rotatedOffset),
      ...masterPool.slice(0, rotatedOffset),
    ];

    const rawMixTracks = dedupePlayableTracks(
      [...(seedBucket?.tracks || []), ...watchRelated, ...rotatedPool],
      blockedIds,
      hideExplicit,
    );
    const diversified = diversifyIndonesianTracks(rawMixTracks, 1, 2).slice(0, 15);
    if (diversified.length === 0) continue;

    // Avoid identical ordering across mixes if pool is small
    const sig = new Set(diversified.slice(0, 5).map((t) => t.id));
    usedTrackSets.push(sig);

    const artUrls = collectSecondaryArt(diversified);
    mixes.push({
      id: `daily-mix-${i + 1}`,
      numberLabel: `0${i + 1}`,
      title: `Daily Mix ${i + 1}`,
      subtitle: summarizeArtists(diversified, 'Campuran lagu pilihan harian'),
      description: seedBucket
        ? `Dibuat dari ${seedBucket.artistName} serta lagu yang selaras dengan selera dengarmu.`
        : 'Campuran lagu populer dan rilisan terbaru yang dikurasi untukmu hari ini.',
      accentColor: theme.accentColor,
      accentGradient: theme.accentGradient,
      badgeTextColor: theme.badgeTextColor,
      coverArt: artUrls[0] || null,
      secondaryArt: artUrls,
      tracks: diversified,
    });
  }

  // Mix 4: Pop Indonesia Mix
  const popMatches = masterPool.filter((t) => {
    const text = `${t.title} ${(t.artists || []).map((a) => a.name).join(' ')}`;
    return POP_ID_HINTS.test(text);
  });
  const popTracks = diversifyIndonesianTracks(
    dedupePlayableTracks([...popMatches, ...input.chartSongs, ...masterPool], blockedIds, hideExplicit),
    0,
    2,
  ).slice(0, 15);
  if (popTracks.length > 0) {
    const theme = MIX_THEMES[3];
    const artUrls = collectSecondaryArt(popTracks);
    mixes.push({
      id: 'pop-indonesia-mix',
      numberLabel: 'ID',
      title: 'Pop Indonesia Mix',
      subtitle: summarizeArtists(popTracks, 'Hits Pop Indonesia pilihan'),
      description: 'Lagu-lagu Pop Indonesia favorit dan tangga lagu teratas hari ini.',
      accentColor: theme.accentColor,
      accentGradient: theme.accentGradient,
      badgeTextColor: theme.badgeTextColor,
      coverArt: artUrls[0] || null,
      secondaryArt: artUrls,
      tracks: popTracks,
    });
  }

  // Mix 5: Indie & Santai Mix
  const indieMatches = masterPool.filter((t) => {
    const text = `${t.title} ${(t.artists || []).map((a) => a.name).join(' ')}`;
    return INDIE_CHILL_HINTS.test(text);
  });
  const indieTracks = diversifyIndonesianTracks(
    dedupePlayableTracks(
      [...indieMatches, ...[...masterPool].reverse()],
      blockedIds,
      hideExplicit,
    ),
    0,
    2,
  ).slice(0, 15);
  if (indieTracks.length > 0) {
    const theme = MIX_THEMES[4];
    const artUrls = collectSecondaryArt(indieTracks);
    mixes.push({
      id: 'indie-santai-mix',
      numberLabel: 'CH',
      title: 'Indie & Santai Mix',
      subtitle: summarizeArtists(indieTracks, 'Akustik & Indie pilihan'),
      description: 'Pilihan lagu santai, akustik, dan indie Indonesia untuk menemani aktivitasmu.',
      accentColor: theme.accentColor,
      accentGradient: theme.accentGradient,
      badgeTextColor: theme.badgeTextColor,
      coverArt: artUrls[0] || null,
      secondaryArt: artUrls,
      tracks: indieTracks,
    });
  }

  return mixes;
}
