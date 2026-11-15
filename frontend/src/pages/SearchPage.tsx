import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  CornerDownRight,
  Loader2,
  Mic2,
  MoreHorizontal,
  Music2,
  Play,
  Radio,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  fetchCharts,
  fetchHome,
  fetchMoods,
  fetchSearch,
  fetchSongRelated,
  fetchSuggest,
  fetchWatchPlaylist,
} from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { MediaCard } from '../components/MediaCard';
import { CardGridSkeleton, ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem, SearchFilter } from '../types/music';
import { playAnyMediaItem } from '../utils/playCollection';
import {
  buildSearchFollowUps,
  formatArtists,
  getPlayableVideoId,
  isExcludedRegionalItem,
  isExcludedRegionalText,
} from '../utils/playerLogic';
import {
  buildAllBrowseCategoryCards,
  buildQuickBrowseCards,
  pickDiscoverSomethingElse,
  pickSearchSpotlight,
  type BrowseCategoryCard,
} from '../utils/searchBrowseLogic';

interface SearchPageProps {
  initialQuery?: string;
  initialFilter?: SearchFilter;
  onAddToPlaylist: (track: MediaItem) => void;
  onOpenProfileDrawer?: () => void;
}

const FILTER_TABS: Array<{ id: SearchFilter; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'songs', label: 'Lagu' },
  { id: 'albums', label: 'Album' },
  { id: 'artists', label: 'Artis' },
  { id: 'playlists', label: 'Playlist' },
  { id: 'videos', label: 'Video' },
  { id: 'podcasts', label: 'Podcast' },
  { id: 'episodes', label: 'Episode' },
];

export function SearchPage({
  initialQuery = '',
  initialFilter = 'all',
  onAddToPlaylist,
  onOpenProfileDrawer,
}: SearchPageProps) {
  const [inputValue, setInputValue] = useState(initialQuery);
  const [debouncedInput, setDebouncedInput] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>(initialFilter);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resolvingTopPlay, setResolvingTopPlay] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const navigate = useNavigationStore((s) => s.navigate);
  const navigateToItem = useNavigationStore((s) => s.navigateToItem);
  const openContextMenu = useContextMenuStore((s) => s.openMenu);

  const recentSearches = useLibraryStore((s) => s.recentSearches);
  const addRecentSearch = useLibraryStore((s) => s.addRecentSearch);
  const removeRecentSearch = useLibraryStore((s) => s.removeRecentSearch);
  const clearRecentSearches = useLibraryStore((s) => s.clearRecentSearches);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const excludedTasteIds = useLibraryStore((s) => s.excludedTasteIds);
  const hideExplicit = useSettingsStore((s) => s.hideExplicit);

  useEffect(() => {
    const cleanInit = (initialQuery || '').trim();
    if (cleanInit) {
      setInputValue(cleanInit);
      setDebouncedInput(cleanInit);
      setSubmittedQuery(cleanInit);
      setShowSuggestions(false);
    } else if (initialQuery === '') {
      setInputValue('');
      setDebouncedInput('');
      setSubmittedQuery('');
      setShowSuggestions(false);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedInput(inputValue.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    if (!showSuggestions) return;
    const onPointerDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSuggestions(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showSuggestions]);

  const suggestQuery = useQuery({
    queryKey: ['suggest', debouncedInput],
    queryFn: ({ signal }) => fetchSuggest(debouncedInput, signal),
    enabled: debouncedInput.length >= 2 && showSuggestions,
  });

  const searchQuery = useQuery({
    queryKey: ['search', submittedQuery, filter],
    queryFn: ({ signal }) => fetchSearch(submittedQuery, filter, signal),
    enabled: submittedQuery.length > 0,
  });

  const followUpSuggestQuery = useQuery({
    queryKey: ['followup-suggest', submittedQuery],
    queryFn: ({ signal }) => fetchSuggest(submittedQuery, signal),
    enabled: submittedQuery.length >= 2,
  });

  const moodsQuery = useQuery({
    queryKey: ['moods'],
    queryFn: ({ signal }) => fetchMoods(signal),
    enabled: !submittedQuery,
  });

  const chartsQuery = useQuery({
    queryKey: ['charts', 'ID'],
    queryFn: ({ signal }) => fetchCharts('ID', signal),
    enabled: !submittedQuery,
  });

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(signal),
    enabled: !submittedQuery,
  });

  const runSearch = (q: string, nextFilter?: SearchFilter) => {
    const clean = q.trim();
    if (!clean) return;
    const effectiveFilter = nextFilter ?? filter;
    setInputValue(clean);
    setSubmittedQuery(clean);
    if (nextFilter) setFilter(nextFilter);
    setShowSuggestions(false);
    addRecentSearch(clean);
    if (clean !== (initialQuery || '').trim() || effectiveFilter !== initialFilter) {
      navigate({ name: 'search', query: clean, filter: effectiveFilter });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(inputValue);
  };

  const blockedSet = new Set([...hiddenTrackIds, ...excludedTasteIds]);
  const filterSafeItem = (item: MediaItem) => {
    const k = getPlayableVideoId(item) || item.id;
    if (blockedSet.has(k)) return false;
    if (hideExplicit && item.isExplicit) return false;
    if (isExcludedRegionalItem(item)) return false;
    return true;
  };

  const queryBlockedRegional = isExcludedRegionalText(submittedQuery);
  const items = queryBlockedRegional ? [] : (searchQuery.data?.items ?? []).filter(filterSafeItem);
  const filteredSuggestions = useMemo(
    () => (suggestQuery.data?.suggestions ?? []).filter((s) => !isExcludedRegionalText(s)),
    [suggestQuery.data],
  );
  const filteredFollowUpSuggestions = useMemo(
    () => (followUpSuggestQuery.data?.suggestions ?? []).filter((s) => !isExcludedRegionalText(s)),
    [followUpSuggestQuery.data],
  );

  const safeChartSongs = useMemo(
    () => (chartsQuery.data?.songs ?? []).filter(filterSafeItem),
    [chartsQuery.data?.songs, hiddenTrackIds, excludedTasteIds, hideExplicit],
  );

  const safeHomeSections = useMemo(
    () =>
      (homeQuery.data?.sections ?? []).map((sec) => ({
        ...sec,
        items: sec.items.filter(filterSafeItem),
      })),
    [homeQuery.data?.sections, hiddenTrackIds, excludedTasteIds, hideExplicit],
  );

  const quickBrowseCards = useMemo(
    () =>
      buildQuickBrowseCards({
        moodGroups: moodsQuery.data?.groups ?? [],
        chartSongs: safeChartSongs,
        homeSections: safeHomeSections,
      }),
    [moodsQuery.data?.groups, safeChartSongs, safeHomeSections],
  );

  const allBrowseCards = useMemo(
    () =>
      buildAllBrowseCategoryCards({
        moodGroups: moodsQuery.data?.groups ?? [],
        chartSongs: safeChartSongs,
        homeSections: safeHomeSections,
      }),
    [moodsQuery.data?.groups, safeChartSongs, safeHomeSections],
  );

  const spotlight = useMemo(
    () => pickSearchSpotlight(safeChartSongs, safeHomeSections),
    [safeChartSongs, safeHomeSections],
  );

  const discoverMoreItems = useMemo(
    () => pickDiscoverSomethingElse(safeChartSongs, safeHomeSections, spotlight?.item.id),
    [safeChartSongs, safeHomeSections, spotlight?.item.id],
  );

  const handleBrowseCardClick = (card: BrowseCategoryCard) => {
    if (card.action.kind === 'mood') {
      navigate({ name: 'mood-detail', params: card.action.params, title: card.action.title });
    } else if (card.action.kind === 'mix') {
      navigate({ name: 'mix', id: card.action.id });
    } else if (card.action.kind === 'library') {
      navigate({ name: 'library' });
    } else {
      runSearch(card.action.query, card.action.filter);
    }
  };

  const topResult = filter === 'all' && items.length > 0 ? items[0] : null;
  const remainingItems = topResult ? items.slice(1) : items;
  const playableTracks = remainingItems.filter(
    (item) => Boolean(getPlayableVideoId(item)) && item.type !== 'podcast',
  );
  const collectionItems = remainingItems.filter(
    (item) => !getPlayableVideoId(item) || item.type === 'podcast',
  );

  const topSongItem = useMemo(
    () =>
      items.find(
        (item) =>
          (item.type === 'song' || item.type === 'video') && Boolean(getPlayableVideoId(item)),
      ) ?? null,
    [items],
  );
  const topSongVideoId = topSongItem ? getPlayableVideoId(topSongItem) : null;

  const relatedFollowUpQuery = useQuery({
    queryKey: ['search-followup-related', topSongVideoId],
    queryFn: ({ signal }) => fetchSongRelated(topSongVideoId!, signal),
    enabled: Boolean(submittedQuery && topSongVideoId),
  });

  const watchFollowUpQuery = useQuery({
    queryKey: ['search-followup-watch', topSongVideoId],
    queryFn: ({ signal }) => fetchWatchPlaylist(topSongVideoId!, true, null, signal),
    enabled:
      Boolean(submittedQuery && topSongVideoId) &&
      !relatedFollowUpQuery.isLoading &&
      (relatedFollowUpQuery.data?.tracks?.length ?? 0) === 0,
  });

  const followUpChips = useMemo(
    () =>
      buildSearchFollowUps(
        submittedQuery,
        items,
        filteredFollowUpSuggestions,
        filter,
      ),
    [submittedQuery, items, filteredFollowUpSuggestions, filter],
  );

  const relatedFollowUpTracks = useMemo(() => {
    const existingIds = new Set(items.map((it) => getPlayableVideoId(it) || it.id));
    const rawTracks = [
      ...(relatedFollowUpQuery.data?.tracks ?? []),
      ...(watchFollowUpQuery.data?.tracks ?? []),
    ];
    const seen = new Set<string>();
    const out: MediaItem[] = [];
    for (const tr of rawTracks) {
      if (!filterSafeItem(tr)) continue;
      const vid = getPlayableVideoId(tr) || tr.id;
      if (!vid || existingIds.has(vid) || seen.has(vid)) continue;
      seen.add(vid);
      out.push(tr);
      if (out.length >= 6) break;
    }
    return out;
  }, [items, relatedFollowUpQuery.data, watchFollowUpQuery.data, hiddenTrackIds, excludedTasteIds, hideExplicit]);

  const relatedFollowUpCollections = useMemo(() => {
    const existingIds = new Set(items.map((it) => it.id));
    const combined = [
      ...(relatedFollowUpQuery.data?.artists ?? []),
      ...(relatedFollowUpQuery.data?.playlists ?? []),
    ];
    const seen = new Set<string>();
    const out: MediaItem[] = [];
    for (const entry of combined) {
      if (!filterSafeItem(entry)) continue;
      if (existingIds.has(entry.id) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
      if (out.length >= 5) break;
    }
    return out;
  }, [items, relatedFollowUpQuery.data, hiddenTrackIds, excludedTasteIds, hideExplicit]);

  return (
    <div className="space-y-6">
      {/* Top Spotify-style Cari Header & White Search Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onOpenProfileDrawer && (
              <button
                type="button"
                onClick={onOpenProfileDrawer}
                aria-label="Buka menu profil"
                className="md:hidden w-8 h-8 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-extrabold flex items-center justify-center shrink-0 shadow-md shadow-[#01BA53]/20"
              >
                S
              </button>
            )}
            <h1 className="text-2xl font-extrabold text-[#E8FFF3] tracking-tight">Cari</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate({ name: 'moods' })}
            className="text-xs font-semibold text-[#19EE8A] hover:underline"
          >
            Semua Mood
          </button>
        </div>

        {/* Sticky Crisp White Search Box matching IMG_4319 */}
        <div
          ref={searchBoxRef}
          className="sticky top-0 z-20 pt-1 pb-1"
        >
          <form onSubmit={handleSubmit} className="relative flex items-center max-w-2xl">
            <Search
              className="w-5 h-5 text-[#121212] absolute left-3.5 pointer-events-none"
              strokeWidth={2.2}
            />
            <input
              type="text"
              enterKeyHint="search"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Apa yang ingin kamu dengarkan?"
              aria-label="Apa yang ingin kamu dengarkan?"
              className={`w-full h-12 pl-11 rounded-lg bg-white text-[14px] sm:text-[15px] font-medium text-[#121212] placeholder:text-[#525252] shadow-lg focus:outline-none focus:ring-2 focus:ring-[#19EE8A] ${
                inputValue ? 'pr-24' : 'pr-4'
              }`}
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setInputValue('');
                  setDebouncedInput('');
                  setSubmittedQuery('');
                  setShowSuggestions(false);
                  navigate({ name: 'search', query: '', filter });
                }}
                aria-label="Bersihkan pencarian"
                className="absolute right-16 w-8 h-8 rounded-full flex items-center justify-center text-[#525252] hover:text-[#121212] hover:bg-black/5"
              >
                <X className="w-4 h-4" strokeWidth={2.2} />
              </button>
            )}
            {inputValue.trim().length > 0 && (
              <button
                type="submit"
                className="absolute right-1.5 px-3 py-1.5 rounded-md bg-[#0F1F17] text-[#19EE8A] text-xs font-bold hover:brightness-110 transition-all"
              >
                Cari
              </button>
            )}
          </form>

          {showSuggestions &&
            debouncedInput.length >= 2 &&
            filteredSuggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Saran pencarian"
                className="absolute left-0 right-0 max-w-2xl top-14 z-30 rounded-xl p-1.5 bg-[#0B0F0D]/95 backdrop-blur-2xl border border-white/[0.14] shadow-2xl"
              >
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => runSearch(suggestion)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm text-[#E8FFF3]/90 hover:bg-white/[0.1] hover:text-[#E8FFF3] transition-colors"
                  >
                    <Search className="w-4 h-4 text-[#B3F7D1]/55 shrink-0" strokeWidth={1.9} />
                    <span className="truncate">{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
        </div>

        {/* Filter Chips & Follow-up only shown when actively searching */}
        {submittedQuery && (
          <>
            <div
              role="tablist"
              aria-label="Filter hasil pencarian"
              className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
            >
              {FILTER_TABS.map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setFilter(tab.id);
                      if (submittedQuery && tab.id !== filter) {
                        navigate({ name: 'search', query: submittedQuery, filter: tab.id });
                      }
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-sc-gradient text-[#0F1F17] font-semibold'
                        : 'bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.1]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {followUpChips.length > 0 && (
              <div
                aria-label="Follow-up pencarian"
                className="flex items-center gap-2 flex-wrap pt-1"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B3F7D1]/50 mr-0.5">
                  Follow-up:
                </span>
                {followUpChips.slice(0, 6).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => runSearch(chip.query, chip.filter)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.055] backdrop-blur-xl hover:bg-[#19EE8A]/15 border border-white/[0.11] hover:border-[#19EE8A]/45 text-xs text-[#E8FFF3]/85 hover:text-[#E8FFF3] transition-colors"
                  >
                    <CornerDownRight className="w-3 h-3 text-[#19EE8A] shrink-0" strokeWidth={2} />
                    <span className="truncate max-w-[220px]">{chip.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!submittedQuery ? (
        <div className="space-y-6">
          {/* Top 6 Compact Colored Quick-Access Cards (IMG_4319 2-col mobile / 3x2 desktop) */}
          <section aria-label="Mulai jelajahi" className="grid grid-cols-2 @[520px]:grid-cols-3 gap-2.5">
            {quickBrowseCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => handleBrowseCardClick(card)}
                style={{ backgroundColor: card.bgColor }}
                className="group relative h-[64px] rounded-lg overflow-hidden p-3 text-left transition-transform active:scale-[0.98] hover:brightness-110 shadow-md"
              >
                <span className="relative z-10 block text-[13px] sm:text-sm font-bold text-white leading-tight max-w-[66%] drop-shadow-sm">
                  {card.title}
                </span>
                <div
                  aria-hidden="true"
                  className="absolute -right-2 -bottom-2 w-13 h-13 rounded-md overflow-hidden rotate-[24deg] shadow-xl bg-black/30 border border-white/15 transition-transform duration-200 group-hover:rotate-[18deg] group-hover:scale-105"
                >
                  {card.thumbnail ? (
                    <ArtworkImage
                      src={card.thumbnail}
                      alt=""
                      className="w-full h-full"
                      roundedClass="rounded-none"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/70">
                      <Music2 className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </section>

          {/* Featured Spotlight Release Banner (IMG_4319 middle card) */}
          {spotlight && (
            <section aria-label="Rilisan pilihan">
              <div className="relative rounded-2xl overflow-hidden min-h-[210px] sm:min-h-[240px] border border-white/[0.12] shadow-2xl group">
                <ArtworkImage
                  src={spotlight.item.thumbnail}
                  alt={spotlight.item.title}
                  className="absolute inset-0 w-full h-full"
                  roundedClass="rounded-none"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/45 to-black/35"
                />

                <div className="relative z-10 h-full min-h-[210px] sm:min-h-[240px] p-4 sm:p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white drop-shadow">
                      {spotlight.artistLine}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openContextMenu(e.clientX, e.clientY, spotlight.item, {
                          onAddToPlaylist,
                        });
                      }}
                      aria-label={`Opsi untuk ${spotlight.item.title}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white/90 hover:bg-black/40 transition-colors"
                    >
                      <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
                    </button>
                  </div>

                  <div className="flex items-end justify-between gap-4 pt-10">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate drop-shadow">
                        {spotlight.item.title}
                      </h2>
                      <p className="text-xs text-white/80 line-clamp-2 max-w-xl leading-relaxed">
                        {spotlight.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => playTrack(spotlight.item)}
                      aria-label={`Putar ${spotlight.item.title}`}
                      className="w-11 h-11 rounded-full bg-white text-[#0F1F17] flex items-center justify-center shrink-0 shadow-xl hover:scale-105 hover:bg-[#19EE8A] transition-all"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Temukan sesuatu yang lain (IMG_4319 bottom strip) */}
          {discoverMoreItems.length > 0 && (
            <section aria-labelledby="discover-other-heading" className="space-y-3">
              <h2 id="discover-other-heading" className="text-lg font-extrabold text-[#E8FFF3] tracking-tight">
                Temukan sesuatu yang lain
              </h2>
              <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-6 gap-3 overflow-x-auto @[440px]:overflow-visible pb-1 scrollbar-none snap-x [&>*]:w-[136px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
                {discoverMoreItems.map((item, idx) => (
                  <MediaCard
                    key={`disc-${item.id}-${idx}`}
                    item={item}
                    onAddToPlaylist={onAddToPlaylist}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Pencarian Terakhir */}
          {recentSearches.length > 0 && (
            <section aria-labelledby="recent-searches-heading" className="space-y-2.5">
              <div className="flex items-center justify-between gap-4">
                <h2 id="recent-searches-heading" className="text-base font-bold text-[#E8FFF3]">
                  Pencarian Terakhir
                </h2>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="inline-flex items-center gap-1 text-xs text-[#B3F7D1]/60 hover:text-[#E8FFF3] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Hapus semua
                </button>
              </div>
              <div className="grid grid-cols-1 @[500px]:grid-cols-2 @[760px]:grid-cols-3 gap-2">
                {recentSearches.map((entry, idx) => (
                  <div
                    key={`${entry.query}-${entry.uid ?? idx}`}
                    className="glass-card rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => runSearch(entry.query)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#B3F7D1]/50 shrink-0" strokeWidth={1.75} />
                      <span className="text-sm text-[#E8FFF3]/90 truncate">{entry.query}</span>
                    </button>
                    {entry.uid !== undefined && (
                      <button
                        type="button"
                        onClick={() => removeRecentSearch(entry.uid!)}
                        aria-label={`Hapus pencarian ${entry.query}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#B3F7D1]/50 hover:text-[#E8FFF3] hover:bg-white/[0.1] shrink-0"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Jelajahi Semua Kategori (IMG_4320, IMG_4321, IMG_4322 colored tilted cards) */}
          <section aria-labelledby="browse-categories-heading" className="space-y-3">
            <h2 id="browse-categories-heading" className="text-lg font-extrabold text-[#E8FFF3] tracking-tight">
              Jelajahi semua
            </h2>
            <div className="grid grid-cols-2 @[540px]:grid-cols-3 @[760px]:grid-cols-4 gap-3">
              {allBrowseCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleBrowseCardClick(card)}
                  style={{ backgroundColor: card.bgColor }}
                  className="group relative h-[106px] sm:h-[118px] rounded-xl overflow-hidden p-3.5 text-left transition-transform active:scale-[0.98] hover:brightness-110 shadow-lg"
                >
                  <span className="relative z-10 block text-[15px] sm:text-base font-bold text-white leading-snug max-w-[64%] drop-shadow-sm">
                    {card.title}
                  </span>
                  <div
                    aria-hidden="true"
                    className="absolute -right-2 -bottom-2 w-[68px] h-[68px] sm:w-[76px] sm:h-[76px] rounded-md overflow-hidden rotate-[24deg] shadow-2xl bg-black/30 border border-white/15 transition-transform duration-200 group-hover:rotate-[18deg] group-hover:scale-105"
                  >
                    {card.thumbnail ? (
                      <ArtworkImage
                        src={card.thumbnail}
                        alt=""
                        className="w-full h-full"
                        roundedClass="rounded-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/75">
                        <Music2 className="w-6 h-6" />
                      </div>
                    )}
                    {card.badgeText && (
                      <span className="absolute bottom-1 left-1 right-1 bg-black/75 text-[7px] font-extrabold tracking-wider text-white uppercase text-center py-0.5 rounded-sm truncate px-0.5">
                        {card.badgeText}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : searchQuery.isLoading ? (
        filter === 'albums' || filter === 'artists' || filter === 'playlists' || filter === 'podcasts' ? (
          <CardGridSkeleton count={8} />
        ) : (
          <TrackListSkeleton count={8} />
        )
      ) : searchQuery.isError ? (
        <ErrorBanner
          message={
            searchQuery.error instanceof Error
              ? searchQuery.error.message
              : 'Gagal melakukan pencarian.'
          }
          onRetry={() => void searchQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-4">
          <div>
            <p className="text-sm font-medium text-[#E8FFF3]/85">
              {queryBlockedRegional
                ? 'Hasil untuk pencarian ini disembunyikan'
                : <>Tidak ada hasil untuk &ldquo;{submittedQuery}&rdquo;</>}
            </p>
            <p className="text-xs text-[#B3F7D1]/50 mt-1">
              Lagu Jepang, India &amp; Mandarin disembunyikan dari pencarian. Coba kata kunci atau follow-up berikut:
            </p>
          </div>
          {followUpChips.length > 0 && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {followUpChips.slice(0, 6).map((chip) => (
                <button
                  key={`empty-${chip.id}`}
                  type="button"
                  onClick={() => runSearch(chip.query, chip.filter)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.11] hover:bg-[#19EE8A] hover:text-[#0F1F17] text-xs font-medium text-[#E8FFF3]/90 transition-colors"
                >
                  <CornerDownRight className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hasil Teratas */}
          {topResult && (
            <section aria-labelledby="top-result-heading" className="space-y-2.5">
              <h2 id="top-result-heading" className="text-base font-semibold text-[#E8FFF3]">
                Hasil Teratas
              </h2>
              <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-2xl">
                <button
                  type="button"
                  onClick={() => {
                    const vid = getPlayableVideoId(topResult);
                    if (vid && topResult.type !== 'podcast') {
                      playTrack(topResult);
                    } else {
                      navigateToItem(topResult);
                    }
                  }}
                  className="flex items-center gap-4 min-w-0 flex-1 text-left"
                >
                  <ArtworkImage
                    src={topResult.thumbnail}
                    alt={topResult.title}
                    type={topResult.type}
                    className="w-20 h-20"
                    roundedClass={topResult.type === 'artist' ? 'rounded-full' : 'rounded-xl'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-[#19EE8A] font-medium capitalize">
                      {topResult.type}
                    </p>
                    <p className="text-lg font-bold text-[#E8FFF3] truncate mt-0.5">{topResult.title}</p>
                    <p className="text-xs text-[#B3F7D1]/65 truncate mt-0.5">
                      {topResult.artists.length > 0
                        ? formatArtists(topResult.artists)
                        : topResult.year || topResult.views || 'Katalog SoundClear'}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={resolvingTopPlay}
                    onClick={async () => {
                      if (resolvingTopPlay) return;
                      setResolvingTopPlay(true);
                      try {
                        await playAnyMediaItem(topResult);
                      } finally {
                        setResolvingTopPlay(false);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold shrink-0 hover:brightness-105 disabled:opacity-70"
                  >
                    {resolvingTopPlay ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    ) : (
                      <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                    )}
                    Putar
                  </button>
                  {(!getPlayableVideoId(topResult) ||
                    topResult.type === 'podcast' ||
                    topResult.type === 'episode') && (
                    <button
                      type="button"
                      onClick={() => navigateToItem(topResult)}
                      className="px-4 py-2.5 rounded-xl bg-white/[0.06] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] shrink-0"
                    >
                      Buka
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Immediate Follow-up Lagu bar when a song is found */}
          {topSongItem && (
            <section
              aria-label="Follow-up lagu"
              className="rounded-2xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.11] p-3.5 sm:p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#19EE8A]">
                    Follow-up Lagu
                  </p>
                  <p className="text-xs text-[#B3F7D1]/75 truncate mt-0.5">
                    Lanjutkan dari <span className="font-semibold text-[#E8FFF3]">{topSongItem.title}</span>
                    {topSongItem.artists[0]?.name ? ` — ${topSongItem.artists[0].name}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (relatedFollowUpTracks.length > 0) {
                        playTrackList(
                          [topSongItem, ...relatedFollowUpTracks],
                          0,
                          `Radio: ${topSongItem.title}`,
                        );
                      } else {
                        playTrack(topSongItem, {
                          autoRadio: true,
                          sourceLabel: `Radio: ${topSongItem.title}`,
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all"
                  >
                    <Radio className="w-3.5 h-3.5" strokeWidth={2} />
                    Putar Radio
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playTrack(topSongItem, { openPanel: true });
                      setRightPanelTab('lyrics');
                      setRightPanelOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.09] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-medium text-[#E8FFF3] transition-colors"
                  >
                    <Mic2 className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.9} />
                    Putar &amp; Lirik
                  </button>

                  {topSongItem.artists[0]?.id && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          name: 'artist',
                          id: topSongItem.artists[0].id!,
                          fallbackQuery: topSongItem.artists[0].name,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.11] text-xs text-[#E8FFF3]/90 transition-colors"
                    >
                      <span>Artis: {topSongItem.artists[0].name}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => runSearch(`${topSongItem.title} akustik`, 'songs')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-[#B3F7D1]/85 hover:text-[#E8FFF3] transition-colors"
                  >
                    <CornerDownRight className="w-3 h-3 text-[#19EE8A]" strokeWidth={2} />
                    Akustik
                  </button>

                  <button
                    type="button"
                    onClick={() => runSearch(`${topSongItem.title} live`, 'songs')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-[#B3F7D1]/85 hover:text-[#E8FFF3] transition-colors"
                  >
                    <CornerDownRight className="w-3 h-3 text-[#19EE8A]" strokeWidth={2} />
                    Live
                  </button>
                </div>
              </div>

              {relatedFollowUpTracks.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                  <span className="text-[11px] text-[#B3F7D1]/50 shrink-0">Lagu serupa:</span>
                  {relatedFollowUpTracks.slice(0, 4).map((rel, idx) => (
                    <button
                      key={`topfu-${rel.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        playTrackList(
                          relatedFollowUpTracks,
                          idx,
                          `Follow-up: ${topSongItem.title}`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-[#E8FFF3]/90 hover:text-[#E8FFF3] shrink-0 max-w-[220px] transition-colors"
                    >
                      <Play className="w-3 h-3 text-[#19EE8A] fill-current shrink-0" strokeWidth={2} />
                      <span className="truncate">{rel.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {playableTracks.length > 0 && (
            <section className="space-y-2">
              {filter === 'all' && collectionItems.length > 0 && (
                <h2 className="text-base font-semibold text-[#E8FFF3]">Lagu, Video & Episode</h2>
              )}
              <div className="space-y-1">
                {playableTracks.map((track, idx) => (
                  <TrackRow
                    key={`${track.id}-${idx}`}
                    track={track}
                    onPlay={() => {
                      if (playableTracks.length > 1) {
                        playTrackList(playableTracks, idx, `Pencarian: ${submittedQuery}`);
                      } else {
                        playTrack(track);
                      }
                    }}
                    onAddToPlaylist={onAddToPlaylist}
                  />
                ))}
              </div>
            </section>
          )}

          {collectionItems.length > 0 && (
            <section className="space-y-3">
              {filter === 'all' && playableTracks.length > 0 && (
                <h2 className="text-base font-semibold text-[#E8FFF3]">
                  Artis, Album, Playlist & Podcast
                </h2>
              )}
              <div className="grid grid-cols-2 @[540px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4">
                {collectionItems.map((item, idx) => (
                  <MediaCard
                    key={`${item.id}-${idx}`}
                    item={item}
                    onAddToPlaylist={onAddToPlaylist}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Follow-up Pencarian & Lagu Terkait */}
          {(followUpChips.length > 0 ||
            relatedFollowUpTracks.length > 0 ||
            relatedFollowUpCollections.length > 0 ||
            relatedFollowUpQuery.isLoading) && (
            <section
              aria-labelledby="search-followup-heading"
              className="rounded-2xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.11] p-4 sm:p-5 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2
                    id="search-followup-heading"
                    className="text-base font-semibold text-[#E8FFF3]"
                  >
                    Follow-up Pencarian &amp; Rekomendasi Lanjutan
                  </h2>
                  <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                    Jelajahi pencarian terkait atau putar lagu mirip dari &ldquo;{submittedQuery}&rdquo;
                  </p>
                </div>
                {relatedFollowUpTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      playTrackList(
                        relatedFollowUpTracks,
                        0,
                        `Radio Follow-up: ${submittedQuery}`,
                      )
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all shrink-0 self-start sm:self-auto"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                    Putar Radio Lanjutan
                  </button>
                )}
              </div>

              {followUpChips.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#B3F7D1]/65">Lanjutkan cari:</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {followUpChips.map((chip) => (
                      <button
                        key={`panel-${chip.id}`}
                        type="button"
                        onClick={() => runSearch(chip.query, chip.filter)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.11] text-xs font-medium text-[#E8FFF3]/90 hover:text-[#E8FFF3] transition-colors"
                      >
                        <CornerDownRight
                          className="w-3.5 h-3.5 text-[#19EE8A] shrink-0"
                          strokeWidth={1.9}
                        />
                        <span>{chip.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {relatedFollowUpQuery.isLoading ? (
                <TrackListSkeleton count={4} />
              ) : (
                <>
                  {relatedFollowUpTracks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[#B3F7D1]/65">
                        Lagu terkait yang mungkin kamu suka
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                        {relatedFollowUpTracks.map((track, idx) => (
                          <TrackRow
                            key={`relfu-${track.id}-${idx}`}
                            track={track}
                            showAlbum={false}
                            onPlay={() =>
                              playTrackList(
                                relatedFollowUpTracks,
                                idx,
                                `Follow-up: ${submittedQuery}`,
                              )
                            }
                            onAddToPlaylist={onAddToPlaylist}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {relatedFollowUpCollections.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-[#B3F7D1]/65">
                        Artis &amp; Playlist terkait
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {relatedFollowUpCollections.map((item, idx) => (
                          <MediaCard
                            key={`relcol-${item.id}-${idx}`}
                            item={item}
                            onAddToPlaylist={onAddToPlaylist}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
