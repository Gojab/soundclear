import type { HomeSection, MediaItem, MoodCategoryGroup, MoodCategoryItem, SearchFilter } from '../types/music';
import {
  formatArtists,
  getPlayableVideoId,
  isExcludedRegionalItem,
  isExcludedRegionalText,
} from './playerLogic';

export type BrowseCardAction =
  | { kind: 'mood'; params: string; title: string }
  | { kind: 'search'; query: string; filter: SearchFilter }
  | { kind: 'mix'; id: string }
  | { kind: 'library' };

export interface BrowseCategoryCard {
  id: string;
  title: string;
  bgColor: string;
  thumbnail: string | null;
  badgeText?: string;
  action: BrowseCardAction;
}

interface CuratedCategoryTemplate {
  id: string;
  title: string;
  bgColor: string;
  badgeText?: string;
  moodHints: string[];
  fallbackSearch: { query: string; filter: SearchFilter };
  specialAction?: BrowseCardAction;
}

const QUICK_CATEGORY_TEMPLATES: CuratedCategoryTemplate[] = [
  {
    id: 'quick-musik',
    title: 'Musik',
    bgColor: '#DC148C',
    badgeText: 'HITS',
    moodHints: ['pop', 'hits'],
    fallbackSearch: { query: 'musik pop indonesia terbaru', filter: 'songs' },
  },
  {
    id: 'quick-podcast',
    title: 'Podcast',
    bgColor: '#006450',
    badgeText: 'PODCAST',
    moodHints: ['podcast'],
    fallbackSearch: { query: 'podcast indonesia populer', filter: 'podcasts' },
  },
  {
    id: 'quick-lokal',
    title: 'Audio Lokal',
    bgColor: '#1E3264',
    badgeText: 'FLAC / MP3',
    moodHints: [],
    fallbackSearch: { query: 'audio lokal', filter: 'all' },
    specialAction: { kind: 'library' },
  },
  {
    id: 'quick-live',
    title: 'Acara Langsung',
    bgColor: '#8400E7',
    badgeText: 'LIVE',
    moodHints: ['live', 'party', 'energize'],
    fallbackSearch: { query: 'konser live session indonesia', filter: 'videos' },
  },
  {
    id: 'quick-kpop',
    title: 'K-Pop',
    bgColor: '#1E3264',
    badgeText: 'K-POP',
    moodHints: ['k-pop', 'korean', 'kpop'],
    fallbackSearch: { query: 'k-pop hits terbaru', filter: 'songs' },
  },
  {
    id: 'quick-mix',
    title: 'Dibuat Untukmu',
    bgColor: '#8D67AB',
    badgeText: 'DAILY MIX',
    moodHints: [],
    fallbackSearch: { query: 'daily mix indonesia', filter: 'playlists' },
    specialAction: { kind: 'mix', id: 'daily-mix-1' },
  },
];

const BROWSE_CATEGORY_TEMPLATES: CuratedCategoryTemplate[] = [
  {
    id: 'cat-upcoming',
    title: 'Rilis Mendatang',
    bgColor: '#146E5A',
    badgeText: 'SEGERA',
    moodHints: ['upcoming', 'new'],
    fallbackSearch: { query: 'lagu indonesia terbaru 2026', filter: 'songs' },
  },
  {
    id: 'cat-new-release',
    title: 'Rilis Baru',
    bgColor: '#5B7F00',
    badgeText: 'BARU',
    moodHints: ['new release', 'fresh'],
    fallbackSearch: { query: 'rilisan musik baru minggu ini', filter: 'songs' },
  },
  {
    id: 'cat-pop',
    title: 'Pop',
    bgColor: '#477D95',
    badgeText: 'TOP POP',
    moodHints: ['pop'],
    fallbackSearch: { query: 'pop hits indonesia', filter: 'songs' },
  },
  {
    id: 'cat-indie',
    title: 'Indie',
    bgColor: '#8C1932',
    badgeText: 'INDIE',
    moodHints: ['indie', 'alternative'],
    fallbackSearch: { query: 'indie indonesia santai', filter: 'songs' },
  },
  {
    id: 'cat-musik-indonesia',
    title: 'Musik Indonesia',
    bgColor: '#E8115B',
    badgeText: 'ID HITS',
    moodHints: ['indonesia', 'indonesian'],
    fallbackSearch: { query: 'musik indonesia terpopuler', filter: 'songs' },
  },
  {
    id: 'cat-kpop',
    title: 'K-Pop',
    bgColor: '#D8182C',
    badgeText: 'K-POP ON',
    moodHints: ['k-pop', 'korean', 'kpop'],
    fallbackSearch: { query: 'k-pop populer', filter: 'songs' },
  },
  {
    id: 'cat-charts',
    title: 'Tangga Lagu',
    bgColor: '#8D67AB',
    badgeText: 'TOP 50',
    moodHints: ['chart', 'top'],
    fallbackSearch: { query: 'tangga lagu top indonesia', filter: 'playlists' },
  },
  {
    id: 'cat-podcast-charts',
    title: 'Peringkat Podcast',
    bgColor: '#1E4C9A',
    badgeText: 'TERATAS',
    moodHints: [],
    fallbackSearch: { query: 'peringkat podcast indonesia', filter: 'podcasts' },
  },
  {
    id: 'cat-hiphop',
    title: 'Hip Hop',
    bgColor: '#4F7A94',
    badgeText: 'RAP',
    moodHints: ['hip-hop', 'hip hop', 'rap'],
    fallbackSearch: { query: 'hip hop rap hits', filter: 'songs' },
  },
  {
    id: 'cat-rock',
    title: 'Rock',
    bgColor: '#006450',
    badgeText: 'ROCK',
    moodHints: ['rock'],
    fallbackSearch: { query: 'band rock indonesia alternatif', filter: 'songs' },
  },
  {
    id: 'cat-discover',
    title: 'Temukan',
    bgColor: '#8D67AB',
    badgeText: 'EXPLORE',
    moodHints: ['feel good', 'discover'],
    fallbackSearch: { query: 'rekomendasi lagu enak didengar', filter: 'playlists' },
  },
  {
    id: 'cat-radio',
    title: 'Radio',
    bgColor: '#DC148C',
    badgeText: 'RADIO',
    moodHints: ['commute'],
    fallbackSearch: { query: 'radio hits mix indonesia', filter: 'playlists' },
  },
  {
    id: 'cat-fresh-finds',
    title: 'Fresh Finds',
    bgColor: '#E1118C',
    badgeText: 'FRESH',
    moodHints: ['energize'],
    fallbackSearch: { query: 'musisi pendatang baru indonesia', filter: 'songs' },
  },
  {
    id: 'cat-rnb',
    title: 'RnB',
    bgColor: '#BA5D07',
    badgeText: 'RNB',
    moodHints: ['r&b', 'rnb', 'soul'],
    fallbackSearch: { query: 'rnb soul indonesia', filter: 'songs' },
  },
  {
    id: 'cat-dance',
    title: 'Dance/Elektronik',
    bgColor: '#0D73EC',
    badgeText: 'EDM',
    moodHints: ['dance', 'electronic', 'edm', 'gaming'],
    fallbackSearch: { query: 'dance electronic hits', filter: 'songs' },
  },
  {
    id: 'cat-mood',
    title: 'Mood',
    bgColor: '#C2185B',
    badgeText: 'MOOD',
    moodHints: ['mood', 'sad', 'feel good'],
    fallbackSearch: { query: 'playlist mood galau senang', filter: 'playlists' },
  },
  {
    id: 'cat-sleep',
    title: 'Tidur',
    bgColor: '#1E3264',
    badgeText: 'SLEEP',
    moodHints: ['sleep'],
    fallbackSearch: { query: 'musik pengantar tidur tenang', filter: 'playlists' },
  },
  {
    id: 'cat-at-home',
    title: 'Di Rumah',
    bgColor: '#5179A1',
    badgeText: 'SANTAI',
    moodHints: ['focus', 'chill'],
    fallbackSearch: { query: 'musik santai di rumah akustik', filter: 'playlists' },
  },
  {
    id: 'cat-chill',
    title: 'Chill',
    bgColor: '#B86E3D',
    badgeText: 'CHILL',
    moodHints: ['chill'],
    fallbackSearch: { query: 'lagu chill akustik sore', filter: 'songs' },
  },
  {
    id: 'cat-pop-melayu',
    title: 'Pop Melayu',
    bgColor: '#5B3749',
    badgeText: 'MELAYU',
    moodHints: ['melayu'],
    fallbackSearch: { query: 'pop melayu hits nostalgia', filter: 'songs' },
  },
  {
    id: 'cat-jazz',
    title: 'Jazz',
    bgColor: '#73589D',
    badgeText: 'JAZZ',
    moodHints: ['jazz'],
    fallbackSearch: { query: 'jazz indonesia santai', filter: 'songs' },
  },
  {
    id: 'cat-party',
    title: 'Pesta',
    bgColor: '#8D58A2',
    badgeText: 'PARTY',
    moodHints: ['party'],
    fallbackSearch: { query: 'lagu pesta upbeat remix', filter: 'songs' },
  },
  {
    id: 'cat-workout',
    title: 'Musik Olahraga',
    bgColor: '#777777',
    badgeText: 'WORKOUT',
    moodHints: ['workout', 'fitness'],
    fallbackSearch: { query: 'lagu semangat olahraga lari', filter: 'playlists' },
  },
  {
    id: 'cat-love',
    title: 'Cinta',
    bgColor: '#E1118C',
    badgeText: 'ROMANCE',
    moodHints: ['romance', 'love'],
    fallbackSearch: { query: 'lagu cinta romantis indonesia', filter: 'songs' },
  },
];

const EXTRA_CARD_COLORS = [
  '#0D73EC',
  '#148A08',
  '#BC5900',
  '#8D67AB',
  '#BA5D07',
  '#503750',
  '#006450',
  '#E13300',
];

function findMatchingMood(
  moods: MoodCategoryItem[],
  hints: string[],
): MoodCategoryItem | null {
  if (hints.length === 0 || moods.length === 0) return null;
  for (const hint of hints) {
    const cleanHint = hint.toLowerCase();
    const exact = moods.find((m) => m.title.toLowerCase() === cleanHint);
    if (exact) return exact;
    const partial = moods.find((m) => m.title.toLowerCase().includes(cleanHint));
    if (partial) return partial;
  }
  return null;
}

function collectArtworkPool(
  chartSongs: MediaItem[],
  homeSections: HomeSection[],
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const all = [...chartSongs, ...homeSections.flatMap((s) => s.items || [])];
  for (const item of all) {
    if (isExcludedRegionalItem(item)) continue;
    if (!item.thumbnail || seen.has(item.thumbnail)) continue;
    seen.add(item.thumbnail);
    urls.push(item.thumbnail);
  }
  return urls;
}

function resolveTemplateAction(
  template: CuratedCategoryTemplate,
  allMoods: MoodCategoryItem[],
): BrowseCardAction {
  if (template.specialAction) return template.specialAction;
  const matched = findMatchingMood(allMoods, template.moodHints);
  if (matched) {
    return { kind: 'mood', params: matched.params, title: matched.title };
  }
  return {
    kind: 'search',
    query: template.fallbackSearch.query,
    filter: template.fallbackSearch.filter,
  };
}

export function buildQuickBrowseCards(input: {
  moodGroups: MoodCategoryGroup[];
  chartSongs: MediaItem[];
  homeSections: HomeSection[];
}): BrowseCategoryCard[] {
  const allMoods = input.moodGroups
    .flatMap((g) => g.items || [])
    .filter((m) => !isExcludedRegionalText(m.title));
  const artPool = collectArtworkPool(input.chartSongs, input.homeSections);

  return QUICK_CATEGORY_TEMPLATES.map((tpl, idx) => ({
    id: tpl.id,
    title: tpl.title,
    bgColor: tpl.bgColor,
    badgeText: tpl.badgeText,
    thumbnail: artPool.length > 0 ? artPool[idx % artPool.length] : null,
    action: resolveTemplateAction(tpl, allMoods),
  }));
}

export function buildAllBrowseCategoryCards(input: {
  moodGroups: MoodCategoryGroup[];
  chartSongs: MediaItem[];
  homeSections: HomeSection[];
}): BrowseCategoryCard[] {
  const allMoods = input.moodGroups
    .flatMap((g) => g.items || [])
    .filter((m) => !isExcludedRegionalText(m.title));
  const artPool = collectArtworkPool(input.chartSongs, input.homeSections);

  const cards: BrowseCategoryCard[] = BROWSE_CATEGORY_TEMPLATES.map((tpl, idx) => ({
    id: tpl.id,
    title: tpl.title,
    bgColor: tpl.bgColor,
    badgeText: tpl.badgeText,
    thumbnail:
      artPool.length > 0 ? artPool[(idx + QUICK_CATEGORY_TEMPLATES.length) % artPool.length] : null,
    action: resolveTemplateAction(tpl, allMoods),
  }));

  const usedMoodParams = new Set(
    cards
      .map((c) => (c.action.kind === 'mood' ? c.action.params : null))
      .filter((p): p is string => Boolean(p)),
  );
  const usedTitles = new Set(cards.map((c) => c.title.toLowerCase()));

  let extraIdx = 0;
  for (const mood of allMoods) {
    if (usedMoodParams.has(mood.params) || usedTitles.has(mood.title.toLowerCase())) continue;
    usedMoodParams.add(mood.params);
    usedTitles.add(mood.title.toLowerCase());
    cards.push({
      id: `mood-${mood.params}`,
      title: mood.title,
      bgColor: EXTRA_CARD_COLORS[extraIdx % EXTRA_CARD_COLORS.length],
      thumbnail:
        artPool.length > 0
          ? artPool[(cards.length + extraIdx) % artPool.length]
          : null,
      action: { kind: 'mood', params: mood.params, title: mood.title },
    });
    extraIdx += 1;
    if (cards.length >= 30) break;
  }

  return cards;
}

export interface SearchSpotlight {
  item: MediaItem;
  artistLine: string;
  description: string;
}

export function pickSearchSpotlight(
  chartSongs: MediaItem[],
  homeSections: HomeSection[],
): SearchSpotlight | null {
  const candidates = [
    ...chartSongs,
    ...homeSections.flatMap((s) => s.items || []),
  ].filter(
    (item) =>
      !isExcludedRegionalItem(item) &&
      Boolean(getPlayableVideoId(item)) &&
      Boolean(item.thumbnail),
  );

  if (candidates.length === 0) return null;

  // Prefer a second or third distinct track for editorial variety (so it differs from the very first quick-tile)
  const chosen = candidates[Math.min(3, candidates.length - 1)] || candidates[0];
  const artistLine = formatArtists(chosen.artists);
  const albumPart = chosen.album?.name ? `Dari album ${chosen.album.name}. ` : '';
  const description =
    chosen.description?.trim() ||
    `${albumPart}Dengarkan rilisan pilihan dari ${artistLine} di SoundClear dengan kualitas jernih dan lirik tersinkron.`;

  return {
    item: chosen,
    artistLine,
    description,
  };
}

export function pickDiscoverSomethingElse(
  chartSongs: MediaItem[],
  homeSections: HomeSection[],
  excludeId?: string | null,
): MediaItem[] {
  const pool = [...homeSections.flatMap((s) => s.items || []), ...chartSongs];
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of pool) {
    if (isExcludedRegionalItem(item)) continue;
    if (!item.thumbnail) continue;
    if (excludeId && item.id === excludeId) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= 6) break;
  }
  return out;
}
