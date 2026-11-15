import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Shuffle } from 'lucide-react';
import { fetchCharts, fetchHome } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { buildDailyMixes } from '../utils/mixLogic';

interface MixDetailPageProps {
  id: string;
  onAddToPlaylist: (track: MediaItem) => void;
}

export function MixDetailPage({ id, onAddToPlaylist }: MixDetailPageProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const playHistory = useLibraryStore((s) => s.playHistory);
  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const excludedTasteIds = useLibraryStore((s) => s.excludedTasteIds);
  const hideExplicit = useSettingsStore((s) => s.hideExplicit);

  const chartsQuery = useQuery({
    queryKey: ['charts', 'ID'],
    queryFn: ({ signal }) => fetchCharts('ID', signal),
  });

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(signal),
  });

  const mixes = useMemo(
    () =>
      buildDailyMixes({
        chartSongs: chartsQuery.data?.songs ?? [],
        homeSections: homeQuery.data?.sections ?? [],
        likedTracks,
        playHistory,
        hiddenTrackIds,
        excludedTasteIds,
        hideExplicit,
      }),
    [
      chartsQuery.data?.songs,
      homeQuery.data?.sections,
      likedTracks,
      playHistory,
      hiddenTrackIds,
      excludedTasteIds,
      hideExplicit,
    ],
  );

  const mix = mixes.find((m) => m.id === id) || mixes[0] || null;

  if ((chartsQuery.isLoading || homeQuery.isLoading) && !mix) {
    return (
      <div className="space-y-6">
        <div className="h-44 rounded-2xl bg-white/[0.06] animate-pulse" />
        <TrackListSkeleton count={6} />
      </div>
    );
  }

  if (!mix) {
    return (
      <ErrorBanner
        message="Mix belum tersedia saat ini."
        onRetry={() => {
          void chartsQuery.refetch();
          void homeQuery.refetch();
        }}
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  const handleShufflePlay = () => {
    if (mix.tracks.length === 0) return;
    const shuffled = [...mix.tracks];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrackList(shuffled, 0, mix.title);
  };

  return (
    <div className="space-y-6">
      <header
        className={`rounded-2xl p-5 sm:p-7 bg-gradient-to-br ${mix.accentGradient} border border-white/[0.1] flex flex-col sm:flex-row sm:items-end gap-5`}
      >
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-xl overflow-hidden shadow-2xl shrink-0 border border-white/[0.15]">
          <ArtworkImage
            src={mix.coverArt}
            alt={mix.title}
            className="w-full h-full"
            roundedClass="rounded-none"
          />
          <div
            style={{ backgroundColor: mix.accentColor }}
            className="absolute left-0 top-0 bottom-0 w-1.5"
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="absolute bottom-2.5 left-3 right-3 flex items-baseline justify-between">
            <span className="text-xs font-extrabold tracking-tight text-white drop-shadow">
              {mix.title}
            </span>
            <span
              style={{ color: mix.badgeTextColor }}
              className="text-xs font-black font-mono-num"
            >
              {mix.numberLabel}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#B3F7D1]/75">
            Mix Untukmu · SoundClear
          </p>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#E8FFF3] tracking-tight">
            {mix.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#B3F7D1]/80">{mix.subtitle}</p>
          <p className="text-xs text-[#B3F7D1]/60">{mix.tracks.length} lagu pilihan</p>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => playTrackList(mix.tracks, 0, mix.title)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-bold hover:brightness-105 transition"
            >
              <Play className="w-4 h-4 fill-current" strokeWidth={2} />
              Putar Mix
            </button>
            <button
              type="button"
              onClick={handleShufflePlay}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-[#E8FFF3] transition"
            >
              <Shuffle className="w-4 h-4" strokeWidth={1.85} />
              Acak
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-1">
        {mix.tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx}
            onPlay={() => playTrackList(mix.tracks, idx, mix.title)}
            onAddToPlaylist={onAddToPlaylist}
          />
        ))}
      </div>
    </div>
  );
}
