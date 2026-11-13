import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { fetchSearch, fetchSuggest } from '../api/client';
import { MediaCard } from '../components/MediaCard';
import { CardGridSkeleton, ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem, SearchFilter } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';

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

  const runSearch = (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setInputValue(clean);
    setSubmittedQuery(clean);
    setShowSuggestions(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(inputValue);
  };

  const items = searchQuery.data?.items ?? [];
  const playableTracks = items.filter((item) => Boolean(getPlayableVideoId(item)));
  const collectionItems = items.filter((item) => !getPlayableVideoId(item));

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Cari Musik</h1>

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
              placeholder="Cari lagu, artis, album, atau playlist..."
              aria-label="Cari lagu, artis, album, atau playlist"
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

        {/* Filter Tabs */}
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

      {/* Results area */}
      {!submittedQuery ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-2 max-w-xl">
          <p className="text-sm font-medium text-white/85">Temukan lagu favorit Anda</p>
          <p className="text-xs text-white/50">
            Ketik kata kunci di atas untuk melihat saran otomatis dan hasil dari YouTube Music.
          </p>
        </div>
      ) : searchQuery.isLoading ? (
        filter === 'albums' || filter === 'artists' || filter === 'playlists' ? (
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
          {playableTracks.length > 0 && (
            <section className="space-y-2">
              {filter === 'all' && collectionItems.length > 0 && (
                <h2 className="text-base font-semibold text-white">Lagu & Video</h2>
              )}
              <div className="space-y-1">
                {playableTracks.map((track, idx) => (
                  <TrackRow
                    key={`${track.id}-${idx}`}
                    track={track}
                    onPlay={() => {
                      if (playableTracks.length > 1) {
                        playTrackList(playableTracks, idx);
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
                <h2 className="text-base font-semibold text-white">Artis, Album & Playlist</h2>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {collectionItems.map((item, idx) => (
                  <MediaCard key={`${item.id}-${idx}`} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
