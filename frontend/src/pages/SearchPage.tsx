import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Clock,
  CornerDownRight,
  Loader2,
  Mic2,
  Play,
  Radio,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
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

interface SearchPageProps {
  initialQuery?: string;
  initialFilter?: SearchFilter;
  onAddToPlaylist: (track: MediaItem) => void;
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

  const recentSearches = useLibraryStore((s) => s.recentSearches);
  const addRecentSearch = useLibraryStore((s) => s.addRecentSearch);
  const removeRecentSearch = useLibraryStore((s) => s.removeRecentSearch);
  const clearRecentSearches = useLibraryStore((s) => s.clearRecentSearches);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
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

  const hiddenSet = new Set(hiddenTrackIds);
  const filterSafeItem = (item: MediaItem) => {
    const k = getPlayableVideoId(item) || item.id;
    if (hiddenSet.has(k)) return false;
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
  }, [items, relatedFollowUpQuery.data, watchFollowUpQuery.data, hiddenTrackIds, hideExplicit]);

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
  }, [items, relatedFollowUpQuery.data, hiddenTrackIds, hideExplicit]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-[#E8FFF3] tracking-tight">Cari Musik & Podcast</h1>

        <div ref={searchBoxRef} className="relative max-w-2xl">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <Search
              className="w-4 h-4 text-[#B3F7D1]/50 absolute left-3.5 pointer-events-none"
              strokeWidth={1.75}
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
              placeholder="Cari lagu, artis, album, playlist, atau podcast..."
              aria-label="Cari lagu, artis, album, playlist, atau podcast"
              className="w-full h-11 pl-10 pr-24 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] text-sm text-[#E8FFF3] placeholder:text-[#B3F7D1]/45 focus:outline-none focus:border-[#19EE8A]"
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
                className="absolute right-16 w-7 h-7 rounded-lg flex items-center justify-center text-[#B3F7D1]/55 hover:text-[#E8FFF3]"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all"
            >
              Cari
            </button>
          </form>

          {showSuggestions &&
            debouncedInput.length >= 2 &&
            filteredSuggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Saran pencarian"
                className="absolute left-0 right-0 top-12 z-20 rounded-xl p-1.5 bg-[#0B0F0D]/88 backdrop-blur-2xl border border-white/[0.14] shadow-2xl"
              >
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => runSearch(suggestion)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-[#E8FFF3]/90 hover:bg-white/[0.1] hover:text-[#E8FFF3] transition-colors"
                  >
                    <Search className="w-3.5 h-3.5 text-[#B3F7D1]/45 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
        </div>

        {/* Filter Chips */}
        <div
          role="tablist"
          aria-label="Filter hasil pencarian"
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
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
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-sc-gradient text-[#0F1F17] font-semibold'
                    : 'bg-white/[0.055] backdrop-blur-xl border border-white/[0.1] text-[#B3F7D1]/75 hover:text-[#E8FFF3] hover:bg-white/[0.1]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Inline Follow-up Query Chips right below filter tabs when searching */}
        {submittedQuery && followUpChips.length > 0 && (
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
      </div>

      {!submittedQuery ? (
        <div className="space-y-8">
          {/* Pencarian Terakhir */}
          {recentSearches.length > 0 && (
            <section aria-labelledby="recent-searches-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 id="recent-searches-heading" className="text-base font-semibold text-[#E8FFF3]">
                  Pencarian Terakhir
                </h2>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="inline-flex items-center gap-1 text-xs text-[#B3F7D1]/55 hover:text-[#E8FFF3] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Hapus semua
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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

          {/* Jelajahi Semua Kategori */}
          <section aria-labelledby="browse-categories-heading" className="space-y-4">
            <h2 id="browse-categories-heading" className="text-base font-semibold text-[#E8FFF3]">
              Jelajahi Semua Kategori
            </h2>
            {moodsQuery.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-pulse">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-white/[0.06]" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {moodsQuery.data?.groups.map((group) => (
                  <div key={group.title} className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-[#B3F7D1]/60">{group.title}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {group.items.map((cat) => (
                        <button
                          key={cat.params}
                          type="button"
                          onClick={() =>
                            navigate({ name: 'mood-detail', params: cat.params, title: cat.title })
                          }
                          className="glass-card rounded-xl px-3.5 py-3 flex items-center justify-between gap-2 text-left group hover:bg-white/[0.1] transition-colors"
                        >
                          <span className="text-xs sm:text-sm font-medium text-[#E8FFF3] truncate">
                            {cat.title}
                          </span>
                          <ChevronRight
                            className="w-4 h-4 text-[#B3F7D1]/40 group-hover:text-[#19EE8A] shrink-0"
                            strokeWidth={1.75}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
