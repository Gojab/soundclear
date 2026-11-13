import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, Play, Search, Trash2, X } from 'lucide-react';
import { fetchMoods, fetchSearch, fetchSuggest } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { MediaCard } from '../components/MediaCard';
import { CardGridSkeleton, ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem, SearchFilter } from '../types/music';
import { formatArtists, getPlayableVideoId } from '../utils/playerLogic';

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

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigate = useNavigationStore((s) => s.navigate);
  const navigateToItem = useNavigationStore((s) => s.navigateToItem);

  const recentSearches = useLibraryStore((s) => s.recentSearches);
  const addRecentSearch = useLibraryStore((s) => s.addRecentSearch);
  const removeRecentSearch = useLibraryStore((s) => s.removeRecentSearch);
  const clearRecentSearches = useLibraryStore((s) => s.clearRecentSearches);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const hideExplicit = useSettingsStore((s) => s.hideExplicit);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedInput(inputValue.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [inputValue]);

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

  const moodsQuery = useQuery({
    queryKey: ['moods'],
    queryFn: ({ signal }) => fetchMoods(signal),
    enabled: !submittedQuery,
  });

  const runSearch = (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setInputValue(clean);
    setSubmittedQuery(clean);
    setShowSuggestions(false);
    addRecentSearch(clean);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(inputValue);
  };

  const hiddenSet = new Set(hiddenTrackIds);
  const items = (searchQuery.data?.items ?? []).filter((item) => {
    const k = getPlayableVideoId(item) || item.id;
    if (hiddenSet.has(k)) return false;
    if (hideExplicit && item.isExplicit) return false;
    return true;
  });

  const topResult = filter === 'all' && items.length > 0 ? items[0] : null;
  const remainingItems = topResult ? items.slice(1) : items;
  const playableTracks = remainingItems.filter(
    (item) => Boolean(getPlayableVideoId(item)) && item.type !== 'podcast',
  );
  const collectionItems = remainingItems.filter(
    (item) => !getPlayableVideoId(item) || item.type === 'podcast',
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Cari Musik & Podcast</h1>

        <div className="relative max-w-2xl">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <Search
              className="w-4 h-4 text-white/45 absolute left-3.5 pointer-events-none"
              strokeWidth={1.75}
            />
            <input
              type="search"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Cari lagu, artis, album, playlist, atau podcast..."
              aria-label="Cari lagu, artis, album, playlist, atau podcast"
              className="w-full h-11 pl-10 pr-24 rounded-xl bg-white/[0.07] border border-white/[0.1] text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#2EE6A6]"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setInputValue('');
                  setSubmittedQuery('');
                  setShowSuggestions(false);
                }}
                aria-label="Bersihkan pencarian"
                className="absolute right-16 w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
            >
              Cari
            </button>
          </form>

          {showSuggestions &&
            debouncedInput.length >= 2 &&
            suggestQuery.data &&
            suggestQuery.data.suggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Saran pencarian"
                className="absolute left-0 right-0 top-12 z-20 glass-panel rounded-xl p-1.5 bg-[#121216]/95 shadow-2xl"
              >
                {suggestQuery.data.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => runSearch(suggestion)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-white/85 hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    <Search className="w-3.5 h-3.5 text-white/40 shrink-0" strokeWidth={1.75} />
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
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                    : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.1]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {!submittedQuery ? (
        <div className="space-y-8">
          {/* Pencarian Terakhir */}
          {recentSearches.length > 0 && (
            <section aria-labelledby="recent-searches-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 id="recent-searches-heading" className="text-base font-semibold text-white">
                  Pencarian Terakhir
                </h2>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
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
                      <Clock className="w-3.5 h-3.5 text-white/45 shrink-0" strokeWidth={1.75} />
                      <span className="text-sm text-white/85 truncate">{entry.query}</span>
                    </button>
                    {entry.uid !== undefined && (
                      <button
                        type="button"
                        onClick={() => removeRecentSearch(entry.uid!)}
                        aria-label={`Hapus pencarian ${entry.query}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08] shrink-0"
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
            <h2 id="browse-categories-heading" className="text-base font-semibold text-white">
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
                    <h3 className="text-xs font-semibold text-white/55">{group.title}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {group.items.map((cat) => (
                        <button
                          key={cat.params}
                          type="button"
                          onClick={() =>
                            navigate({ name: 'mood-detail', params: cat.params, title: cat.title })
                          }
                          className="glass-card rounded-xl px-3.5 py-3 flex items-center justify-between gap-2 text-left group"
                        >
                          <span className="text-xs sm:text-sm font-medium text-white truncate">
                            {cat.title}
                          </span>
                          <ChevronRight
                            className="w-4 h-4 text-white/35 group-hover:text-[#2EE6A6] shrink-0"
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
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-sm font-medium text-white/80">
            Tidak ada hasil untuk &ldquo;{submittedQuery}&rdquo;
          </p>
          <p className="text-xs text-white/45 mt-1">
            Coba kata kunci lain atau ubah tab filter di atas.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hasil Teratas */}
          {topResult && (
            <section aria-labelledby="top-result-heading" className="space-y-2.5">
              <h2 id="top-result-heading" className="text-base font-semibold text-white">
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
                    <p className="text-[11px] text-[#2EE6A6] font-medium capitalize">
                      {topResult.type}
                    </p>
                    <p className="text-lg font-bold text-white truncate mt-0.5">{topResult.title}</p>
                    <p className="text-xs text-white/60 truncate mt-0.5">
                      {topResult.artists.length > 0
                        ? formatArtists(topResult.artists)
                        : topResult.year || topResult.views || 'YouTube Music'}
                    </p>
                  </div>
                </button>

                {getPlayableVideoId(topResult) && topResult.type !== 'podcast' ? (
                  <button
                    type="button"
                    onClick={() => playTrack(topResult)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold shrink-0 hover:brightness-105"
                  >
                    <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                    Putar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigateToItem(topResult)}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white shrink-0"
                  >
                    Buka
                  </button>
                )}
              </div>
            </section>
          )}

          {playableTracks.length > 0 && (
            <section className="space-y-2">
              {filter === 'all' && collectionItems.length > 0 && (
                <h2 className="text-base font-semibold text-white">Lagu, Video & Episode</h2>
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
                <h2 className="text-base font-semibold text-white">
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
        </div>
      )}
    </div>
  );
}
