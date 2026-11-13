import { Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchCharts, fetchHome } from '../api/client';
import { MediaCard } from '../components/MediaCard';
import { CardGridSkeleton, ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';

interface HomePageProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

export function HomePage({ onAddToPlaylist }: HomePageProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const chartsQuery = useQuery({
    queryKey: ['charts', 'ID'],
    queryFn: ({ signal }) => fetchCharts('ID', signal),
  });

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(signal),
  });

  const chartSongs = chartsQuery.data?.songs ?? [];
  const chartPlaylists = chartsQuery.data?.videos ?? [];
  const chartArtists = chartsQuery.data?.artists ?? [];

  return (
    <div className="space-y-8">
      {/* Tangga Lagu Indonesia */}
      <section aria-labelledby="charts-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 id="charts-heading" className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
              Tangga Lagu Indonesia
            </h1>
            <p className="text-xs text-white/55 mt-0.5">
              Lagu dan artis terpopuler di Indonesia saat ini
            </p>
          </div>
          {chartSongs.length > 0 && (
            <button
              type="button"
              onClick={() => playTrackList(chartSongs, 0)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
              Putar Semua
            </button>
          )}
        </div>

        {chartsQuery.isLoading ? (
          <TrackListSkeleton count={6} />
        ) : chartsQuery.isError ? (
          <ErrorBanner
            message={
              chartsQuery.error instanceof Error
                ? chartsQuery.error.message
                : 'Gagal memuat tangga lagu Indonesia.'
            }
            onRetry={() => void chartsQuery.refetch()}
          />
        ) : (
          <div className="space-y-6">
            {chartSongs.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                {chartSongs.slice(0, 10).map((song, idx) => (
                  <TrackRow
                    key={`${song.id}-${idx}`}
                    track={song}
                    index={idx}
                    showAlbum={false}
                    onPlay={() => playTrackList(chartSongs, idx)}
                    onAddToPlaylist={onAddToPlaylist}
                  />
                ))}
              </div>
            )}

            {chartPlaylists.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-white">Daftar Putar Tangga Lagu</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {chartPlaylists.map((item) => (
                    <MediaCard key={item.id} item={item} subtitle="Tangga Lagu" />
                  ))}
                </div>
              </div>
            )}

            {chartArtists.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-white">Artis Teratas Indonesia</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {chartArtists.slice(0, 10).map((artist) => (
                    <MediaCard
                      key={artist.id}
                      item={artist}
                      subtitle={artist.views || 'Artis Populer'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Beranda YouTube Music */}
      <section aria-label="Rekomendasi Beranda" className="space-y-8">
        {homeQuery.isLoading ? (
          <div className="space-y-4">
            <div className="h-6 w-48 rounded bg-white/[0.08] animate-pulse" />
            <CardGridSkeleton count={5} />
          </div>
        ) : homeQuery.isError ? (
          <ErrorBanner
            message={
              homeQuery.error instanceof Error
                ? homeQuery.error.message
                : 'Gagal memuat rekomendasi beranda.'
            }
            onRetry={() => void homeQuery.refetch()}
          />
        ) : (
          homeQuery.data?.sections.map((section) => {
            const playableItems = section.items.filter((i) => Boolean(getPlayableVideoId(i)));
            const mostlyPlayable =
              playableItems.length >= Math.ceil(section.items.length * 0.7) &&
              section.items.length > 4;

            return (
              <div key={section.title} className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-white tracking-tight">
                    {section.title}
                  </h2>
                  {mostlyPlayable && playableItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => playTrackList(playableItems, 0)}
                      className="text-xs font-medium text-[#2EE6A6] hover:underline whitespace-nowrap"
                    >
                      Putar semua
                    </button>
                  )}
                </div>

                {mostlyPlayable ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                    {section.items.slice(0, 12).map((item, idx) => (
                      <TrackRow
                        key={`${item.id}-${idx}`}
                        track={item}
                        showAlbum={false}
                        onPlay={() => {
                          const pIdx = playableItems.findIndex((p) => p.id === item.id);
                          if (pIdx >= 0) {
                            playTrackList(playableItems, pIdx);
                          } else {
                            playTrack(item);
                          }
                        }}
                        onAddToPlaylist={onAddToPlaylist}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {section.items.slice(0, 10).map((item, idx) => (
                      <MediaCard key={`${item.id}-${idx}`} item={item} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
