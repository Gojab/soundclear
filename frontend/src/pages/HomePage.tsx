import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronRight, Play } from 'lucide-react';
import {
  fetchArtist,
  fetchCharts,
  fetchHome,
  fetchMoods,
  fetchWatchPlaylist,
} from '../api/client';
import { MediaCard } from '../components/MediaCard';
import { CardGridSkeleton, ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { HomeSectionId, MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';
import { getGreetingByHour } from '../utils/recapLogic';

interface HomePageProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

export function HomePage({ onAddToPlaylist }: HomePageProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const playHistory = useLibraryStore((s) => s.playHistory);
  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const followedArtists = useLibraryStore((s) => s.followedArtists);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const hideExplicit = useSettingsStore((s) => s.hideExplicit);
  const homeSectionOrder = useSettingsStore((s) => s.homeSectionOrder);

  const navigate = useNavigationStore((s) => s.navigate);

  const chartsQuery = useQuery({
    queryKey: ['charts', 'ID'],
    queryFn: ({ signal }) => fetchCharts('ID', signal),
  });

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(signal),
  });

  const moodsQuery = useQuery({
    queryKey: ['moods'],
    queryFn: ({ signal }) => fetchMoods(signal),
  });

  const filterList = (list: MediaItem[]) => {
    const hiddenSet = new Set(hiddenTrackIds);
    return list.filter((item) => {
      const key = getPlayableVideoId(item) || item.id;
      if (hiddenSet.has(key)) return false;
      if (hideExplicit && item.isExplicit) return false;
      return true;
    });
  };

  // Lanjutkan (recently played unique tracks)
  const continueTracks = useMemo(() => {
    const seen = new Set<string>();
    const out: MediaItem[] = [];
    if (currentTrack) {
      const k = getPlayableVideoId(currentTrack) || currentTrack.id;
      seen.add(k);
      out.push(currentTrack);
    }
    for (const entry of playHistory) {
      const k = getPlayableVideoId(entry.track) || entry.trackId;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(entry.track);
      }
      if (out.length >= 10) break;
    }
    return filterList(out);
  }, [playHistory, currentTrack, hiddenTrackIds, hideExplicit]);

  // Sering diputar & Putar ulang
  const frequentTracks = useMemo(() => {
    const counts = new Map<string, { count: number; track: MediaItem }>();
    for (const entry of playHistory) {
      const key = entry.trackId;
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(key, { count: 1, track: entry.track });
      }
    }
    const sorted = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((x) => x.track);
    return filterList(sorted).slice(0, 10);
  }, [playHistory, hiddenTrackIds, hideExplicit]);

  // Seeds for Daily Mix & Mix Untukmu
  const seedTrack = continueTracks[0] || likedTracks[0] || chartsQuery.data?.songs[0] || null;
  const seedVideoId = seedTrack ? getPlayableVideoId(seedTrack) : null;

  const dailyMixQuery = useQuery({
    queryKey: ['daily-mix', seedVideoId],
    queryFn: ({ signal }) => fetchWatchPlaylist(seedVideoId!, true, null, signal),
    enabled: Boolean(seedVideoId),
  });

  // Top 3 distinct artists for "Mix Untukmu"
  const mixSeedTracks = useMemo(() => {
    const pool = [...frequentTracks, ...likedTracks, ...continueTracks];
    const seenArtists = new Set<string>();
    const seeds: Array<{ label: string; videoId: string }> = [];
    for (const t of pool) {
      const vid = getPlayableVideoId(t);
      const art = t.artists[0]?.name;
      if (!vid || !art || seenArtists.has(art.toLowerCase())) continue;
      seenArtists.add(art.toLowerCase());
      seeds.push({ label: `Mix ${art}`, videoId: vid });
      if (seeds.length >= 3) break;
    }
    return seeds;
  }, [frequentTracks, likedTracks, continueTracks]);

  const forYouMixQueries = useQueries({
    queries: mixSeedTracks.map((seed) => ({
      queryKey: ['mix-for-you', seed.videoId],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchWatchPlaylist(seed.videoId, true, null, signal),
      staleTime: 1000 * 60 * 10,
    })),
  });

  // Followed Artists New Releases
  const followedToFetch = followedArtists.slice(0, 4);
  const followedArtistQueries = useQueries({
    queries: followedToFetch.map((entry) => ({
      queryKey: ['artist', entry.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchArtist(entry.id, signal),
      staleTime: 1000 * 60 * 10,
    })),
  });

  const artistNewReleases = useMemo(() => {
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    for (const q of followedArtistQueries) {
      if (!q.data) continue;
      for (const rel of [...q.data.singles.slice(0, 2), ...q.data.albums.slice(0, 2)]) {
        if (!seen.has(rel.id)) {
          seen.add(rel.id);
          items.push({
            ...rel,
            artists: rel.artists.length > 0 ? rel.artists : [{ id: q.data.id, name: q.data.name }],
          });
        }
      }
    }
    return items.slice(0, 10);
  }, [followedArtistQueries]);

  const { greeting, moodLabel } = getGreetingByHour(new Date().getHours());
  const chartSongs = filterList(chartsQuery.data?.songs ?? []);
  const chartPlaylists = chartsQuery.data?.videos ?? [];
  const chartArtists = chartsQuery.data?.artists ?? [];
  const dailyMixTracks = filterList(dailyMixQuery.data?.tracks ?? []).slice(0, 8);
  const moodCategories = useMemo(
    () => (moodsQuery.data?.groups ?? []).flatMap((g) => g.items).slice(0, 12),
    [moodsQuery.data],
  );

  const renderSection = (sectionId: HomeSectionId) => {
    switch (sectionId) {
      case 'continue':
        if (continueTracks.length === 0) return null;
        return (
          <section key="continue" aria-labelledby="continue-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 id="continue-heading" className="text-lg font-semibold text-white tracking-tight">
                Lanjutkan
              </h2>
              <button
                type="button"
                onClick={() => playTrackList(continueTracks, 0, 'Lanjutkan')}
                className="text-xs font-medium text-[#2EE6A6] hover:underline whitespace-nowrap"
              >
                Putar semua
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {continueTracks.slice(0, 5).map((item, idx) => (
                <MediaCard
                  key={`cont-${item.id}-${idx}`}
                  item={item}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          </section>
        );

      case 'daily_mix':
        return (
          <section key="daily_mix" aria-labelledby="daily-mix-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1
                  id="daily-mix-heading"
                  className="text-xl sm:text-2xl font-semibold text-white tracking-tight"
                >
                  {greeting} · {moodLabel}
                </h1>
                <p className="text-xs text-white/55 mt-0.5">
                  Mix hari ini disesuaikan dengan riwayat dengar Anda
                </p>
              </div>
              {dailyMixTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrackList(dailyMixTracks, 0, 'Mix Hari Ini')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                  Putar Mix
                </button>
              )}
            </div>

            {dailyMixQuery.isLoading ? (
              <TrackListSkeleton count={4} />
            ) : dailyMixTracks.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                {dailyMixTracks.slice(0, 6).map((track, idx) => (
                  <TrackRow
                    key={`dmix-${track.id}-${idx}`}
                    track={track}
                    showAlbum={false}
                    onPlay={() => playTrackList(dailyMixTracks, idx, 'Mix Hari Ini')}
                    onAddToPlaylist={onAddToPlaylist}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );

      case 'frequent':
        if (frequentTracks.length === 0) return null;
        return (
          <section key="frequent" aria-labelledby="frequent-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="frequent-heading" className="text-lg font-semibold text-white tracking-tight">
                  Sering Diputar & Putar Ulang
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Lagu yang paling sering Anda putar ulang
                </p>
              </div>
              <button
                type="button"
                onClick={() => playTrackList(frequentTracks, 0, 'Putar Ulang')}
                className="text-xs font-medium text-[#2EE6A6] hover:underline whitespace-nowrap"
              >
                Putar semua
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
              {frequentTracks.slice(0, 6).map((track, idx) => (
                <TrackRow
                  key={`freq-${track.id}-${idx}`}
                  track={track}
                  index={idx}
                  showAlbum={false}
                  onPlay={() => playTrackList(frequentTracks, idx, 'Putar Ulang')}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          </section>
        );

      case 'artist_releases':
        if (artistNewReleases.length === 0) return null;
        return (
          <section key="artist_releases" aria-labelledby="releases-heading" className="space-y-3">
            <h2 id="releases-heading" className="text-lg font-semibold text-white tracking-tight">
              Rilisan Baru Artis yang Diikuti
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {artistNewReleases.map((item) => (
                <MediaCard key={`rel-${item.id}`} item={item} />
              ))}
            </div>
          </section>
        );

      case 'for_you_mix':
        if (mixSeedTracks.length === 0) return null;
        return (
          <section key="for_you_mix" aria-labelledby="foryou-heading" className="space-y-4">
            <h2 id="foryou-heading" className="text-lg font-semibold text-white tracking-tight">
              Mix Untukmu
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mixSeedTracks.map((seed, idx) => {
                const q = forYouMixQueries[idx];
                const tracks = filterList(q?.data?.tracks ?? []).slice(0, 5);
                const cover = tracks[0]?.thumbnail;
                return (
                  <div
                    key={seed.videoId}
                    className="glass-card rounded-2xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{seed.label}</p>
                        <p className="text-xs text-white/50 truncate mt-0.5">
                          {tracks.length > 0
                            ? tracks
                                .slice(0, 3)
                                .map((t) => t.title)
                                .join(' · ')
                            : 'Memuat mix...'}
                        </p>
                      </div>
                      {tracks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => playTrackList(tracks, 0, seed.label)}
                          aria-label={`Putar ${seed.label}`}
                          className="w-10 h-10 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center shrink-0 hover:brightness-105"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    {cover && tracks.length > 0 && (
                      <div className="space-y-1">
                        {tracks.slice(0, 3).map((t, tIdx) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => playTrackList(tracks, tIdx, seed.label)}
                            className="w-full text-left text-xs text-white/70 hover:text-white truncate py-0.5"
                          >
                            <span className="text-white/40 tabular-nums mr-2">{tIdx + 1}.</span>
                            {t.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );

      case 'charts':
        return (
          <section key="charts" aria-labelledby="charts-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="charts-heading" className="text-lg font-semibold text-white tracking-tight">
                  Tangga Lagu Indonesia
                </h2>
                <p className="text-xs text-white/55 mt-0.5">
                  Lagu dan artis terpopuler di Indonesia saat ini
                </p>
              </div>
              {chartSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrackList(chartSongs, 0, 'Tangga Lagu Indonesia')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold transition-all whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-[#2EE6A6]" strokeWidth={2} />
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
                        onPlay={() => playTrackList(chartSongs, idx, 'Tangga Lagu Indonesia')}
                        onAddToPlaylist={onAddToPlaylist}
                      />
                    ))}
                  </div>
                )}

                {chartPlaylists.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-white">Daftar Putar Tangga Lagu</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {chartPlaylists.map((item) => (
                        <MediaCard key={item.id} item={item} subtitle="Tangga Lagu" />
                      ))}
                    </div>
                  </div>
                )}

                {chartArtists.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-white">Artis Teratas Indonesia</h3>
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
        );

      case 'home_feed':
        return (
          <section key="home_feed" aria-label="Rekomendasi Beranda" className="space-y-8">
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
                const visibleItems = filterList(section.items);
                if (visibleItems.length === 0) return null;
                const playableItems = visibleItems.filter((i) => Boolean(getPlayableVideoId(i)));
                const mostlyPlayable =
                  playableItems.length >= Math.ceil(visibleItems.length * 0.7) &&
                  visibleItems.length > 4;

                return (
                  <div key={section.title} className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-semibold text-white tracking-tight">
                        {section.title}
                      </h2>
                      {mostlyPlayable && playableItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => playTrackList(playableItems, 0, section.title)}
                          className="text-xs font-medium text-[#2EE6A6] hover:underline whitespace-nowrap"
                        >
                          Putar semua
                        </button>
                      )}
                    </div>

                    {mostlyPlayable ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                        {visibleItems.slice(0, 12).map((item, idx) => (
                          <TrackRow
                            key={`${item.id}-${idx}`}
                            track={item}
                            showAlbum={false}
                            onPlay={() => {
                              const pIdx = playableItems.findIndex((p) => p.id === item.id);
                              if (pIdx >= 0) {
                                playTrackList(playableItems, pIdx, section.title);
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
                        {visibleItems.slice(0, 10).map((item, idx) => (
                          <MediaCard
                            key={`${item.id}-${idx}`}
                            item={item}
                            onAddToPlaylist={onAddToPlaylist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        );

      case 'moods':
        if (moodCategories.length === 0) return null;
        return (
          <section key="moods" aria-labelledby="home-moods-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 id="home-moods-heading" className="text-lg font-semibold text-white tracking-tight">
                Mood & Genre
              </h2>
              <button
                type="button"
                onClick={() => navigate({ name: 'moods' })}
                className="text-xs font-medium text-[#2EE6A6] hover:underline"
              >
                Lihat semua
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {moodCategories.map((cat) => (
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
                    className="w-4 h-4 text-white/40 group-hover:text-[#2EE6A6] shrink-0"
                    strokeWidth={1.75}
                  />
                </button>
              ))}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {(homeSectionOrder as HomeSectionId[]).map((sectionId) => renderSection(sectionId))}
    </div>
  );
}
