import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  Disc3,
  FolderOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { fetchCharts, fetchMoods, fetchSearch } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import {
  CURATED_MIX_GENRES,
  formatMixDurationSummary,
  type MixBuilderMode,
} from '../utils/createMixLogic';
import {
  generateCuratedMix,
  type GeneratedMixResult,
} from '../utils/createMixService';
import {
  formatArtists,
  getPlayableVideoId,
  getTrackUniqueId,
  isExcludedRegionalItem,
  isExcludedRegionalText,
} from '../utils/playerLogic';

interface CreateMixPageProps {
  seedTrack?: MediaItem;
  seedGenre?: string;
  onAddToPlaylist: (track: MediaItem) => void;
}

const MIX_LENGTH_OPTIONS = [15, 25, 40] as const;

export function CreateMixPage({ seedTrack, seedGenre, onAddToPlaylist }: CreateMixPageProps) {
  const initialMode: MixBuilderMode =
    seedTrack && seedGenre ? 'blend' : seedGenre ? 'genre' : 'track';

  const [mode, setMode] = useState<MixBuilderMode>(initialMode);
  const [selectedSeeds, setSelectedSeeds] = useState<MediaItem[]>(seedTrack ? [seedTrack] : []);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    seedGenre ? [seedGenre] : initialMode === 'genre' ? ['Pop Indonesia'] : [],
  );
  const [customTitle, setCustomTitle] = useState('');
  const [targetCount, setTargetCount] = useState<number>(25);

  const [trackSearchInput, setTrackSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedMix, setGeneratedMix] = useState<GeneratedMixResult | null>(null);
  const [savedPlaylistId, setSavedPlaylistId] = useState<string | null>(null);
  const [shuffleNonce, setShuffleNonce] = useState(0);

  const activeAbortRef = useRef<AbortController | null>(null);
  const autoTriggeredRef = useRef(false);

  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const canGoBack = useNavigationStore((s) => s.canGoBack());
  const showToast = useContextMenuStore((s) => s.showToast);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const playHistory = useLibraryStore((s) => s.playHistory);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const excludedTasteIds = useLibraryStore((s) => s.excludedTasteIds);
  const createPlaylistWithTracks = useLibraryStore((s) => s.createPlaylistWithTracks);
  const hideExplicit = useSettingsStore((s) => s.hideExplicit);

  const chartsQuery = useQuery({
    queryKey: ['charts', 'ID'],
    queryFn: ({ signal }) => fetchCharts('ID', signal),
    staleTime: 1000 * 60 * 10,
  });

  const moodsQuery = useQuery({
    queryKey: ['moods'],
    queryFn: ({ signal }) => fetchMoods(signal),
    staleTime: 1000 * 60 * 15,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(trackSearchInput.trim());
    }, 260);
    return () => window.clearTimeout(timer);
  }, [trackSearchInput]);

  const songSearchQuery = useQuery({
    queryKey: ['create-mix-song-search', debouncedQuery],
    queryFn: ({ signal }) => fetchSearch(debouncedQuery, 'songs', signal),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const moodItems = useMemo(
    () =>
      (moodsQuery.data?.groups ?? [])
        .flatMap((g) => g.items)
        .filter((m) => !isExcludedRegionalText(m.title)),
    [moodsQuery.data],
  );

  const genreOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ label: string; color: string }> = [];
    for (const g of CURATED_MIX_GENRES) {
      const k = g.label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ label: g.label, color: g.accentColor });
    }
    for (const m of moodItems) {
      const k = m.title.toLowerCase();
      if (seen.has(k)) continue;
      if (list.length >= 12) break;
      seen.add(k);
      list.push({ label: m.title, color: '#19EE8A' });
    }
    return list;
  }, [moodItems]);

  const quickSeedSuggestions = useMemo(() => {
    const pool: MediaItem[] = [];
    const seen = new Set<string>();
    const candidates = [
      ...(currentTrack ? [currentTrack] : []),
      ...likedTracks.slice(0, 6),
      ...playHistory.slice(0, 6).map((h) => h.track),
      ...(chartsQuery.data?.songs ?? []).slice(0, 8),
    ];
    for (const item of candidates) {
      if (item.type !== 'song' && item.type !== 'video') continue;
      const vid = getPlayableVideoId(item);
      const key = getTrackUniqueId(item) || item.id;
      if (!vid || !key || seen.has(key)) continue;
      if (isExcludedRegionalItem(item)) continue;
      seen.add(key);
      pool.push(item);
      if (pool.length >= 8) break;
    }
    return pool;
  }, [currentTrack, likedTracks, playHistory, chartsQuery.data?.songs]);

  const searchResults = useMemo(() => {
    const items = songSearchQuery.data?.items ?? [];
    return items.filter(
      (item) =>
        (item.type === 'song' || item.type === 'video') &&
        Boolean(getPlayableVideoId(item)) &&
        !isExcludedRegionalItem(item),
    );
  }, [songSearchQuery.data?.items]);

  const fallbackPool = useMemo(
    () => [
      ...likedTracks,
      ...playHistory.map((h) => h.track),
      ...(chartsQuery.data?.songs ?? []),
    ],
    [likedTracks, playHistory, chartsQuery.data?.songs],
  );

  const toggleSeedTrack = (track: MediaItem) => {
    const key = getTrackUniqueId(track) || track.id;
    setSelectedSeeds((prev) => {
      const exists = prev.some((t) => (getTrackUniqueId(t) || t.id) === key);
      if (exists) {
        return prev.filter((t) => (getTrackUniqueId(t) || t.id) !== key);
      }
      if (prev.length >= 3) {
        showToast('Maksimal 3 lagu pemicu per Mix');
        return prev;
      }
      return [...prev, track];
    });
  };

  const toggleGenre = (label: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(label)) {
        return prev.filter((g) => g !== label);
      }
      if (prev.length >= 2) {
        return [prev[1], label];
      }
      return [...prev, label];
    });
  };

  const canGenerate =
    mode === 'track'
      ? selectedSeeds.length > 0
      : mode === 'genre'
        ? selectedGenres.length > 0
        : selectedSeeds.length > 0 || selectedGenres.length > 0;

  const runGenerateMix = useCallback(
    async (nextOffset?: number) => {
      const needsSeeds = mode === 'track' || mode === 'blend';
      const needsGenres = mode === 'genre' || mode === 'blend';
      if (
        (mode === 'track' && selectedSeeds.length === 0) ||
        (mode === 'genre' && selectedGenres.length === 0) ||
        (mode === 'blend' && selectedSeeds.length === 0 && selectedGenres.length === 0)
      ) {
        setGenerateError('Pilih minimal satu lagu atau genre untuk meracik Mix.');
        return;
      }

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;

      setIsGenerating(true);
      setGenerateError(null);
      setSavedPlaylistId(null);

      try {
        const result = await generateCuratedMix({
          mode,
          seedTracks: needsSeeds ? selectedSeeds : [],
          selectedGenres: needsGenres ? selectedGenres : [],
          moodCategories: moodItems,
          targetCount,
          customTitle,
          fallbackPool,
          hiddenTrackIds,
          excludedTasteIds,
          hideExplicit,
          shuffleOffset: nextOffset ?? shuffleNonce,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.tracks.length === 0) {
          setGenerateError('Belum ada lagu cocok yang ditemukan. Coba pilih lagu atau genre lain.');
          return;
        }
        setGeneratedMix(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        setGenerateError(
          err instanceof Error ? err.message : 'Gagal membuat Mix. Silakan coba lagi.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsGenerating(false);
        }
      }
    },
    [
      mode,
      selectedSeeds,
      selectedGenres,
      moodItems,
      targetCount,
      customTitle,
      fallbackPool,
      hiddenTrackIds,
      excludedTasteIds,
      hideExplicit,
      shuffleNonce,
    ],
  );

  useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (seedTrack || seedGenre) {
      autoTriggeredRef.current = true;
      void runGenerateMix(0);
    }
  }, [seedTrack, seedGenre, runGenerateMix]);

  const handleRegenerate = () => {
    const nextOffset = shuffleNonce + 3;
    setShuffleNonce(nextOffset);
    void runGenerateMix(nextOffset);
  };

  const handleSaveToLibrary = () => {
    if (!generatedMix || generatedMix.tracks.length === 0) return;
    const saved = createPlaylistWithTracks(generatedMix.title, generatedMix.tracks, {
      description: generatedMix.description,
      coverUrl: generatedMix.coverArt,
    });
    setSavedPlaylistId(saved.id);
    showToast(`"${saved.name}" (${saved.tracks.length} lagu) disimpan ke Koleksi`);
  };

  const handleShufflePlay = () => {
    if (!generatedMix || generatedMix.tracks.length === 0) return;
    const shuffled = [...generatedMix.tracks];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrackList(shuffled, 0, generatedMix.title);
  };

  const handleRemoveGeneratedTrack = (indexToRemove: number) => {
    setGeneratedMix((prev) => {
      if (!prev) return prev;
      const nextTracks = prev.tracks.filter((_, idx) => idx !== indexToRemove);
      return {
        ...prev,
        tracks: nextTracks,
      };
    });
    setSavedPlaylistId(null);
  };

  const collageArt = generatedMix?.secondaryArt ?? [];

  return (
    <div className="@container space-y-6 pb-8">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Kembali"
                className="hidden md:inline-flex w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] items-center justify-center text-[#E8FFF3] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#E8FFF3] tracking-tight">
              Buat Mix
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#B3F7D1]/65">
            Racik daftar putar terkurasi dari lagu favorit atau genre pilihanmu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate({ name: 'moods' })}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-white/[0.055] hover:bg-white/[0.1] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] transition-colors whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={2} />
          Jelajahi Mood &amp; Genre
        </button>
      </header>

      {/* Main Responsive Workbench (stacks cleanly in narrow center pane; 2-col when container >= 880px) */}
      <div className="grid grid-cols-1 @[880px]:grid-cols-12 gap-6 items-start">
        {/* Builder Controls */}
        <section
          aria-label="Pengaturan Mix"
          className="@[880px]:col-span-5 rounded-2xl p-4 sm:p-5 bg-white/[0.04] border border-white/[0.09] space-y-5"
        >
          {/* Mode Switcher */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#B3F7D1]/75">Sumber Kurasi</p>
            <div
              role="tablist"
              aria-label="Mode pembuatan mix"
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.08]"
            >
              {(
                [
                  { id: 'track', label: 'Dari Lagu' },
                  { id: 'genre', label: 'Genre' },
                  { id: 'blend', label: 'Blend' },
                ] as const
              ).map((tab) => {
                const active = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setMode(tab.id);
                      setGenerateError(null);
                      if (tab.id === 'genre' && selectedGenres.length === 0) {
                        setSelectedGenres(['Pop Indonesia']);
                      }
                    }}
                    className={`min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#19EE8A] text-[#0F1F17] shadow-sm'
                        : 'text-[#B3F7D1]/75 hover:text-[#E8FFF3]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seed Tracks Section */}
          {(mode === 'track' || mode === 'blend') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="mix-seed-search"
                  className="text-xs font-semibold text-[#B3F7D1]/75"
                >
                  Lagu Pemicu ({selectedSeeds.length}/3)
                </label>
                {selectedSeeds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSeeds([])}
                    className="text-[11px] font-medium text-[#B3F7D1]/60 hover:text-[#E8FFF3]"
                  >
                    Bersihkan
                  </button>
                )}
              </div>

              {/* Selected Seed Tracks */}
              {selectedSeeds.length > 0 && (
                <div className="space-y-1.5">
                  {selectedSeeds.map((seed) => {
                    const key = getTrackUniqueId(seed) || seed.id;
                    return (
                      <div
                        key={`selected-${key}`}
                        className="flex items-center gap-3 p-2 rounded-xl bg-[#19EE8A]/10 border border-[#19EE8A]/30"
                      >
                        <ArtworkImage
                          src={seed.thumbnail}
                          alt={seed.title}
                          type={seed.type}
                          className="w-10 h-10 shrink-0"
                          roundedClass="rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#E8FFF3] truncate">
                            {seed.title}
                          </p>
                          <p className="text-[11px] text-[#B3F7D1]/70 truncate">
                            {formatArtists(seed.artists)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSeedTrack(seed)}
                          aria-label={`Hapus pemicu ${seed.title}`}
                          className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#B3F7D1]/70 hover:text-white hover:bg-white/[0.08]"
                        >
                          <X className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Search Input for Seed Tracks */}
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[#B3F7D1]/55 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  strokeWidth={2}
                />
                <input
                  id="mix-seed-search"
                  type="text"
                  value={trackSearchInput}
                  onChange={(e) => setTrackSearchInput(e.target.value)}
                  placeholder="Cari judul lagu atau artis pemicu..."
                  className="w-full h-11 pl-9 pr-9 rounded-xl bg-black/35 border border-white/[0.12] text-sm text-[#E8FFF3] placeholder:text-[#B3F7D1]/45 focus:outline-none focus:border-[#19EE8A]"
                />
                {trackSearchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackSearchInput('');
                      setDebouncedQuery('');
                    }}
                    aria-label="Hapus pencarian lagu pemicu"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[#B3F7D1]/60 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search Results */}
              {debouncedQuery.length >= 2 && (
                <div className="rounded-xl bg-black/45 border border-white/[0.1] max-h-56 overflow-y-auto divide-y divide-white/[0.06]">
                  {songSearchQuery.isLoading ? (
                    <p className="p-3 text-xs text-[#B3F7D1]/60">Mencari lagu...</p>
                  ) : searchResults.length === 0 ? (
                    <p className="p-3 text-xs text-[#B3F7D1]/60">
                      Tidak ada lagu cocok untuk &ldquo;{debouncedQuery}&rdquo;.
                    </p>
                  ) : (
                    searchResults.slice(0, 8).map((item, idx) => {
                      const key = getTrackUniqueId(item) || item.id;
                      const picked = selectedSeeds.some(
                        (s) => (getTrackUniqueId(s) || s.id) === key,
                      );
                      return (
                        <button
                          key={`sr-${key}-${idx}`}
                          type="button"
                          onClick={() => toggleSeedTrack(item)}
                          className="w-full flex items-center gap-3 p-2.5 min-h-[52px] hover:bg-white/[0.06] text-left transition-colors"
                        >
                          <ArtworkImage
                            src={item.thumbnail}
                            alt={item.title}
                            type={item.type}
                            className="w-9 h-9 shrink-0"
                            roundedClass="rounded-md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#E8FFF3] truncate">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-[#B3F7D1]/60 truncate">
                              {formatArtists(item.artists)}
                            </p>
                          </div>
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                              picked
                                ? 'bg-[#19EE8A] text-[#0F1F17]'
                                : 'bg-white/[0.08] text-[#E8FFF3]'
                            }`}
                          >
                            {picked ? (
                              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                            ) : (
                              <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Quick Suggestions from History / Likes / Charts */}
              {debouncedQuery.length < 2 && quickSeedSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-[#B3F7D1]/55">Saran cepat dari daftar kamu</p>
                  <div className="grid grid-cols-1 @[520px]:grid-cols-2 @[880px]:grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {quickSeedSuggestions.slice(0, 5).map((item) => {
                      const key = getTrackUniqueId(item) || item.id;
                      const picked = selectedSeeds.some(
                        (s) => (getTrackUniqueId(s) || s.id) === key,
                      );
                      return (
                        <button
                          key={`quick-${key}`}
                          type="button"
                          onClick={() => toggleSeedTrack(item)}
                          className={`w-full flex items-center gap-2.5 p-2 min-h-[46px] rounded-xl border text-left transition-colors ${
                            picked
                              ? 'bg-[#19EE8A]/15 border-[#19EE8A]/40'
                              : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.08]'
                          }`}
                        >
                          <ArtworkImage
                            src={item.thumbnail}
                            alt={item.title}
                            type={item.type}
                            className="w-8 h-8 shrink-0"
                            roundedClass="rounded-md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[#E8FFF3] truncate">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-[#B3F7D1]/55 truncate">
                              {formatArtists(item.artists)}
                            </p>
                          </div>
                          {picked ? (
                            <Check className="w-4 h-4 text-[#19EE8A] shrink-0" strokeWidth={2.4} />
                          ) : (
                            <Plus className="w-4 h-4 text-[#B3F7D1]/60 shrink-0" strokeWidth={2} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Genre / Mood Selector */}
          {(mode === 'genre' || mode === 'blend') && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#B3F7D1]/75">
                  Pilih Genre atau Suasana ({selectedGenres.length}/2)
                </p>
                {selectedGenres.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedGenres([])}
                    className="text-[11px] font-medium text-[#B3F7D1]/60 hover:text-[#E8FFF3]"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {genreOptions.map((g) => {
                  const active = selectedGenres.includes(g.label);
                  return (
                    <button
                      key={g.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleGenre(g.label)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#19EE8A] text-[#0F1F17] border-[#19EE8A] font-semibold'
                          : 'bg-white/[0.045] text-[#E8FFF3]/85 border-white/[0.1] hover:bg-white/[0.1]'
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mix Title & Track Count */}
          <div className="space-y-3 pt-1 border-t border-white/[0.08]">
            <div>
              <label
                htmlFor="custom-mix-name"
                className="block text-xs font-semibold text-[#B3F7D1]/75 mb-1.5"
              >
                Nama Mix (opsional)
              </label>
              <input
                id="custom-mix-name"
                type="text"
                maxLength={60}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Otomatis sesuai lagu & genre pilihan"
                className="w-full h-10 px-3.5 rounded-xl bg-black/35 border border-white/[0.12] text-sm text-[#E8FFF3] placeholder:text-[#B3F7D1]/40 focus:outline-none focus:border-[#19EE8A]"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#B3F7D1]/75">Jumlah Lagu</p>
              <div className="grid grid-cols-3 gap-2">
                {MIX_LENGTH_OPTIONS.map((count) => {
                  const active = targetCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTargetCount(count)}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold border transition-colors tabular-nums ${
                        active
                          ? 'bg-white/[0.15] border-[#19EE8A] text-[#19EE8A]'
                          : 'bg-white/[0.03] border-white/[0.09] text-[#B3F7D1]/75 hover:bg-white/[0.08]'
                      }`}
                    >
                      {count} lagu
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {generateError && (
            <p
              role="alert"
              className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3.5 py-2.5"
            >
              {generateError}
            </p>
          )}

          {/* Primary Generate CTA */}
          <button
            type="button"
            disabled={!canGenerate || isGenerating}
            onClick={() => void runGenerateMix()}
            className="w-full min-h-[46px] px-5 py-3 rounded-xl bg-sc-gradient text-[#0F1F17] text-sm font-bold hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            <Disc3
              className={`w-4.5 h-4.5 ${isGenerating ? 'animate-spin' : ''}`}
              strokeWidth={2.2}
            />
            {isGenerating
              ? 'Meracik Mix...'
              : generatedMix
                ? 'Perbarui Mix'
                : 'Buat Mix Sekarang'}
          </button>
        </section>

        {/* Curated Mix Result Preview */}
        <section aria-label="Pratinjau Mix" className="@[880px]:col-span-7 space-y-5">
          {isGenerating && !generatedMix ? (
            <div className="rounded-2xl p-5 bg-white/[0.035] border border-white/[0.08] space-y-5">
              <div className="flex flex-col sm:flex-row gap-4 animate-pulse">
                <div className="w-36 h-36 rounded-2xl bg-white/[0.07] shrink-0" />
                <div className="flex-1 space-y-3 py-2">
                  <div className="h-4 w-32 rounded bg-white/[0.06]" />
                  <div className="h-7 w-64 rounded bg-white/[0.08]" />
                  <div className="h-4 w-48 rounded bg-white/[0.05]" />
                </div>
              </div>
              <TrackListSkeleton count={6} />
            </div>
          ) : generatedMix ? (
            <div className="space-y-5">
              {/* Hero Mix Summary Card */}
              <div
                className={`rounded-2xl p-5 sm:p-6 bg-gradient-to-br ${generatedMix.accentGradient} border border-white/[0.11] space-y-5`}
              >
                <div className="flex flex-col sm:flex-row sm:items-end gap-5">
                  {/* 2x2 Artwork Collage or Single Cover */}
                  <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-xl overflow-hidden shadow-2xl border border-white/[0.15] shrink-0 bg-[#0A0E0C]">
                    {collageArt.length >= 4 ? (
                      <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                        {collageArt.slice(0, 4).map((url, idx) => (
                          <ArtworkImage
                            key={`col-${idx}`}
                            src={url}
                            alt={`${generatedMix.title} cover ${idx + 1}`}
                            className="w-full h-full"
                            roundedClass="rounded-none"
                          />
                        ))}
                      </div>
                    ) : (
                      <ArtworkImage
                        src={generatedMix.coverArt}
                        alt={generatedMix.title}
                        className="w-full h-full"
                        roundedClass="rounded-none"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[#B3F7D1]/75">
                      <span>Mix Pilihan</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {formatMixDurationSummary(generatedMix.tracks)}
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-[#E8FFF3] tracking-tight break-words">
                      {generatedMix.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#B3F7D1]/80 line-clamp-2">
                      {generatedMix.subtitle}
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 line-clamp-2">
                      {generatedMix.description}
                    </p>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={generatedMix.tracks.length === 0}
                    onClick={() =>
                      playTrackList(generatedMix.tracks, 0, generatedMix.title)
                    }
                    className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-bold hover:brightness-105 disabled:opacity-40 transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                    Putar Mix
                  </button>

                  <button
                    type="button"
                    disabled={generatedMix.tracks.length === 0}
                    onClick={handleShufflePlay}
                    className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-[#E8FFF3] disabled:opacity-40 transition-colors"
                  >
                    <Shuffle className="w-4 h-4" strokeWidth={1.85} />
                    Acak
                  </button>

                  {savedPlaylistId ? (
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'local-playlist', id: savedPlaylistId })}
                      className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#19EE8A]/18 border border-[#19EE8A]/45 text-xs font-semibold text-[#19EE8A] hover:bg-[#19EE8A]/25 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4" strokeWidth={1.9} />
                      Buka di Koleksi
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={generatedMix.tracks.length === 0}
                      onClick={handleSaveToLibrary}
                      className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-[#E8FFF3] disabled:opacity-40 transition-colors"
                    >
                      <BookmarkPlus className="w-4 h-4 text-[#19EE8A]" strokeWidth={1.9} />
                      Simpan ke Koleksi
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleRegenerate}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-[#B3F7D1]/85 transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`}
                      strokeWidth={1.9}
                    />
                    Racik Ulang
                  </button>
                </div>
              </div>

              {/* Generated Tracks List */}
              <div className="space-y-1">
                {generatedMix.tracks.map((track, idx) => (
                  <div
                    key={`gen-${getTrackUniqueId(track) || track.id}-${idx}`}
                    className="flex items-center gap-1"
                  >
                    <div className="min-w-0 flex-1">
                      <TrackRow
                        track={track}
                        index={idx}
                        onPlay={() =>
                          playTrackList(generatedMix.tracks, idx, generatedMix.title)
                        }
                        onAddToPlaylist={onAddToPlaylist}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveGeneratedTrack(idx)}
                      aria-label={`Keluarkan ${track.title} dari mix`}
                      title="Keluarkan dari mix"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-[#B3F7D1]/45 hover:text-[#E8FFF3] hover:bg-white/[0.08] shrink-0 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-8 sm:p-10 bg-white/[0.03] border border-white/[0.08] flex flex-col items-center justify-center text-center gap-4 min-h-[340px]">
              <div className="w-16 h-16 rounded-2xl bg-[#19EE8A]/12 border border-[#19EE8A]/25 flex items-center justify-center text-[#19EE8A]">
                <Disc3 className="w-8 h-8" strokeWidth={1.75} />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h2 className="text-lg font-bold text-[#E8FFF3]">
                  Mulai Racik Mix Sendiri
                </h2>
                <p className="text-xs sm:text-sm text-[#B3F7D1]/65 leading-relaxed">
                  Pilih hingga 3 lagu favorit untuk membuat Blend, atau pilih 1–2 genre di sebelah
                  untuk menghasilkan daftar putar otomatis yang siap diputar dan disimpan.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
