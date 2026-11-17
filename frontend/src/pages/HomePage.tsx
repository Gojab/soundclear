import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronRight, Headphones, Heart, ListMusic, Play, Upload } from 'lucide-react';
import {
  fetchArtist,
  fetchCharts,
  fetchHome,
  fetchMoods,
  fetchSearch,
  fetchStreamAudioMeta,
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
import type { HomeSectionId, MediaItem } from '../types/music';
import { resolveTargetStreamQuality } from '../utils/audioMath';
import { buildDailyMixes } from '../utils/mixLogic';
import {
  diversifyIndonesianTracks,
  filterHomeMediaItems,
  formatArtists,
  getPlayableVideoId,
  getTrackUniqueId,
  isExcludedRegionalItem,
  isExcludedRegionalText,
} from '../utils/playerLogic';
import { getGreetingByHour } from '../utils/recapLogic';
import { prefetchStreamProbe } from '../utils/streamProbeCache';

interface HomePageProps {
  onAddToPlaylist: (track: MediaItem) => void;
  onOpenProfileDrawer?: () => void;
}

type HomeCategoryTab = 'all' | 'music' | 'podcast' | 'local';

interface QuickTile {
  id: string;
  title: string;
  thumbnail?: string | null;
  isLikedTile?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
}

export function HomePage({ onAddToPlaylist, onOpenProfileDrawer }: HomePageProps) {
  const [categoryTab, setCategoryTab] = useState<HomeCategoryTab>('all');

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const playHistory = useLibraryStore((s) => s.playHistory);
  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const playlists = useLibraryStore((s) => s.playlists);
  const localFiles = useLibraryStore((s) => s.localFiles);
  const savedPodcasts = useLibraryStore((s) => s.savedPodcasts);
  const followedArtists = useLibraryStore((s) => s.followedArtists);
  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const excludedTasteIds = useLibraryStore((s) => s.excludedTasteIds);
  const hideExplicit = useSettingsStore((s) => s.hideExplicit);
  const homeSectionOrder = useSettingsStore((s) => s.homeSectionOrder);
  const localProfile = useSettingsStore((s) => s.localProfile);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const streamQuality = resolveTargetStreamQuality(
    localProfile,
    typeof navigator === 'undefined' ? true : navigator.onLine,
    dataSaver,
  );

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

  const podcastDiscoverQuery = useQuery({
    queryKey: ['home-podcasts-discover'],
    queryFn: ({ signal }) => fetchSearch('podcast indonesia', 'podcasts', signal),
    enabled: categoryTab === 'podcast',
  });

  const filterList = (list: MediaItem[]) => {
    const blockedSet = new Set([...hiddenTrackIds, ...excludedTasteIds]);
    const safe = list.filter((item) => {
      const key = getTrackUniqueId(item) || getPlayableVideoId(item) || item.id;
      const vid = getPlayableVideoId(item);
      if (blockedSet.has(key) || (vid && blockedSet.has(vid))) return false;
      if (hideExplicit && item.isExplicit) return false;
      if (isExcludedRegionalItem(item)) return false;
      return true;
    });
    return filterHomeMediaItems(safe, categoryTab);
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
  }, [playHistory, currentTrack, hiddenTrackIds, excludedTasteIds, hideExplicit, categoryTab]);

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
  }, [playHistory, hiddenTrackIds, excludedTasteIds, hideExplicit, categoryTab]);

  const hasPersonalSeed = continueTracks.length > 0 || likedTracks.length > 0;
  const chartSongsRaw = filterList(chartsQuery.data?.songs ?? []);
  const chartSongs = useMemo(
    () => diversifyIndonesianTracks(chartSongsRaw, 1, 2),
    [chartSongsRaw],
  );
  const seedTrack = continueTracks[0] || likedTracks[0] || chartSongs[0] || null;
  const seedVideoId = seedTrack ? getPlayableVideoId(seedTrack) : null;

  const dailyMixQuery = useQuery({
    queryKey: ['daily-mix', seedVideoId],
    queryFn: ({ signal }) => fetchWatchPlaylist(seedVideoId!, true, null, signal),
    enabled: Boolean(seedVideoId),
  });

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

  const watchTracksBySeed = useMemo(() => {
    const map: Record<string, MediaItem[]> = {};
    if (seedVideoId && dailyMixQuery.data?.tracks) {
      map[seedVideoId] = dailyMixQuery.data.tracks;
    }
    mixSeedTracks.forEach((seed, idx) => {
      const tracks = forYouMixQueries[idx]?.data?.tracks;
      if (tracks && tracks.length > 0) {
        map[seed.videoId] = tracks;
      }
    });
    return map;
  }, [seedVideoId, dailyMixQuery.data?.tracks, mixSeedTracks, forYouMixQueries]);

  const spotifyStyleMixes = useMemo(
    () =>
      buildDailyMixes({
        chartSongs: chartsQuery.data?.songs ?? [],
        homeSections: homeQuery.data?.sections ?? [],
        likedTracks,
        playHistory,
        hiddenTrackIds,
        excludedTasteIds,
        hideExplicit,
        watchTracksBySeed,
      }),
    [
      chartsQuery.data?.songs,
      homeQuery.data?.sections,
      likedTracks,
      playHistory,
      hiddenTrackIds,
      excludedTasteIds,
      hideExplicit,
      watchTracksBySeed,
    ],
  );

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
    return filterList(items).slice(0, 10);
  }, [followedArtistQueries, hiddenTrackIds, hideExplicit, categoryTab]);

  const { greeting, moodLabel } = getGreetingByHour(new Date().getHours());
  const chartPlaylists = filterList(chartsQuery.data?.videos ?? []);
  const chartArtists = filterList(chartsQuery.data?.artists ?? []);
  const dailyMixTracks = useMemo(() => {
    const rawWatch = filterList(dailyMixQuery.data?.tracks ?? []);
    if (hasPersonalSeed) {
      return rawWatch.slice(0, 8);
    }
    // Keep default Home mix diverse across trending Indonesian artists & genres
    const interleaved: MediaItem[] = [];
    const maxLen = Math.max(chartSongs.length, rawWatch.length);
    for (let i = 0; i < maxLen; i += 1) {
      if (i < chartSongs.length) interleaved.push(chartSongs[i]);
      if (i < rawWatch.length) interleaved.push(rawWatch[i]);
    }
    return diversifyIndonesianTracks(interleaved, 1, 1).slice(0, 8);
  }, [dailyMixQuery.data, hasPersonalSeed, chartSongs, hiddenTrackIds, hideExplicit, categoryTab]);
  const moodCategories = useMemo(
    () => (moodsQuery.data?.groups ?? []).flatMap((g) => g.items).slice(0, 12),
    [moodsQuery.data],
  );

  // Zero-delay playback: pre-warm stream metadata probe cache for top visible home tracks
  useEffect(() => {
    const candidates = [
      ...continueTracks.slice(0, 3),
      ...dailyMixTracks.slice(0, 4),
      ...chartSongs.slice(0, 5),
    ];
    const seen = new Set<string>();
    let queued = 0;
    for (const item of candidates) {
      if (item.type === 'local' || item.localFileId) continue;
      const vid = getPlayableVideoId(item);
      if (!vid || seen.has(vid)) continue;
      seen.add(vid);
      prefetchStreamProbe(
        vid,
        {
          title: item.title,
          artist: formatArtists(item.artists),
          durationSeconds: item.durationSeconds,
          quality: streamQuality || 'high',
        },
        (id, meta) => fetchStreamAudioMeta(id, meta),
      );
      queued += 1;
      if (queued >= 6) break;
    }
  }, [continueTracks, dailyMixTracks, chartSongs, streamQuality]);

  // Build 8 Windows Quick-Access Tiles (2 cols x 4 rows)
  const quickTiles = useMemo<QuickTile[]>(() => {
    const tiles: QuickTile[] = [];
    const seenTitles = new Set<string>();

    tiles.push({
      id: 'liked-songs',
      title: 'Lagu yang Disukai',
      isLikedTile: true,
      onOpen: () => navigate({ name: 'liked' }),
      onPlay:
        likedTracks.length > 0
          ? () => playTrackList(likedTracks, 0, 'Lagu yang Disukai')
          : undefined,
    });
    seenTitles.add('lagu yang disukai');

    for (const pl of playlists) {
      if (tiles.length >= 8) break;
      const key = pl.name.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      tiles.push({
        id: `pl-${pl.id}`,
        title: pl.name,
        thumbnail: pl.coverUrl || pl.tracks[0]?.thumbnail || null,
        onOpen: () => navigate({ name: 'local-playlist', id: pl.id }),
        onPlay:
          pl.tracks.length > 0 ? () => playTrackList(pl.tracks, 0, pl.name) : undefined,
      });
    }

    for (const tr of continueTracks) {
      if (tiles.length >= 8) break;
      const key = tr.title.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      tiles.push({
        id: `hist-${tr.id}`,
        title: tr.title,
        thumbnail: tr.thumbnail,
        onOpen: () => playTrack(tr),
        onPlay: () => playTrack(tr),
      });
    }

    for (const song of chartSongs) {
      if (tiles.length >= 8) break;
      const key = song.title.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      tiles.push({
        id: `chart-${song.id}`,
        title: song.title,
        thumbnail: song.thumbnail,
        onOpen: () => playTrack(song),
        onPlay: () => playTrack(song),
      });
    }

    return tiles;
  }, [playlists, continueTracks, chartSongs, likedTracks, navigate, playTrack, playTrackList]);

  const localTrackItems: MediaItem[] = useMemo(
    () =>
      localFiles.map((f) => ({
        id: f.id,
        localFileId: f.id,
        title: f.title,
        artists: [{ id: null, name: f.artist }],
        album: { id: null, name: f.album },
        durationSeconds: Math.round(f.durationSeconds),
        thumbnail: f.coverDataUrl ?? null,
        type: 'local' as const,
      })),
    [localFiles],
  );

  const renderSection = (sectionId: HomeSectionId) => {
    switch (sectionId) {
      case 'continue':
        if (continueTracks.length === 0) return null;
        return (
          <section key="continue" aria-labelledby="continue-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="continue-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                Lanjutkan
              </h2>
              <button
                type="button"
                onClick={() => playTrackList(continueTracks, 0, 'Lanjutkan')}
                className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:underline whitespace-nowrap"
              >
                Putar semua
              </button>
            </div>
            <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
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
          <section key="daily_mix" aria-labelledby="daily-mix-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="daily-mix-heading"
                  className="text-xl font-bold text-[#E8FFF3] tracking-tight"
                >
                  {greeting} · {moodLabel}
                </h2>
                <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/60 mt-1">
                  {hasPersonalSeed
                    ? 'Mix hari ini disesuaikan dengan riwayat dengar Anda'
                    : 'Mix lagu Indonesia lintas genre yang sedang trending hari ini'}
                </p>
              </div>
              {dailyMixTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrackList(dailyMixTracks, 0, 'Mix Hari Ini')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                  Putar Mix
                </button>
              )}
            </div>

            {dailyMixQuery.isLoading ? (
              <TrackListSkeleton count={4} />
            ) : dailyMixTracks.length > 0 ? (
              <div className="grid grid-cols-1 @[700px]:grid-cols-2 gap-x-4 gap-y-2">
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
          <section key="frequent" aria-labelledby="frequent-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 id="frequent-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                  Sering Diputar & Putar Ulang
                </h2>
                <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/60 mt-1">
                  Lagu yang paling sering Anda putar ulang
                </p>
              </div>
              <button
                type="button"
                onClick={() => playTrackList(frequentTracks, 0, 'Putar Ulang')}
                className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:underline whitespace-nowrap shrink-0"
              >
                Putar semua
              </button>
            </div>
            <div className="grid grid-cols-1 @[700px]:grid-cols-2 gap-x-4 gap-y-2">
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
          <section key="artist_releases" aria-labelledby="releases-heading" className="space-y-4">
            <h2 id="releases-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
              Rilisan Baru Artis yang Diikuti
            </h2>
            <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
              {artistNewReleases.map((item) => (
                <MediaCard key={`rel-${item.id}`} item={item} />
              ))}
            </div>
          </section>
        );

      case 'for_you_mix':
        if (spotifyStyleMixes.length === 0) {
          if (chartsQuery.isLoading || homeQuery.isLoading) {
            return (
              <section key="for_you_mix" aria-labelledby="foryou-heading" className="space-y-4">
                <h2 id="foryou-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                  Dibuat Untukmu
                </h2>
                <CardGridSkeleton count={5} />
              </section>
            );
          }
          return null;
        }
        return (
          <section key="for_you_mix" aria-labelledby="foryou-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 id="foryou-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                  Dibuat Untukmu
                </h2>
                <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/60 mt-1">
                  Mix harian dan pilihan musik yang disusun sesuai selera dengarmu
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate({ name: 'create-mix' })}
                className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#19EE8A] hover:underline whitespace-nowrap shrink-0"
              >
                Buat Mix
              </button>
            </div>
            <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[162px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
              {spotifyStyleMixes.map((mix) => (
                <div
                  key={mix.id}
                  className="group relative rounded-xl p-3 sm:p-4 bg-white/[0.045] hover:bg-white/[0.09] border border-white/[0.09] transition-colors cursor-pointer"
                  onClick={() => navigate({ name: 'mix', id: mix.id })}
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-[#090F0C] border border-white/[0.08]">
                    <ArtworkImage
                      src={mix.coverArt}
                      alt={mix.title}
                      className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                      roundedClass="rounded-none"
                    />
                    {/* Left Spotify-style mix accent bar */}
                    <div
                      aria-hidden="true"
                      style={{ backgroundColor: mix.accentColor }}
                      className="absolute left-0 top-0 bottom-0 w-1.5 z-10"
                    />
                    {/* Bottom vignette + number badge */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent z-10"
                    />
                    <div className="absolute top-2 left-3 z-20 inline-flex items-center px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/15">
                      <span
                        style={{ color: mix.badgeTextColor }}
                        className="text-[10px] font-extrabold tracking-wider uppercase font-mono-num"
                      >
                        Mix {mix.numberLabel}
                      </span>
                    </div>
                    <div className="absolute bottom-2.5 left-3 right-12 z-20 flex items-baseline justify-between gap-1">
                      <span className="text-sm font-extrabold text-white tracking-tight truncate drop-shadow">
                        {mix.title}
                      </span>
                    </div>
                    {mix.tracks.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playTrackList(mix.tracks, 0, mix.title);
                        }}
                        aria-label={`Putar ${mix.title}`}
                        className="absolute bottom-1 right-1 z-20 w-11 h-11 rounded-full flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 focus-visible:opacity-100"
                      >
                        <span className="w-9 h-9 rounded-full bg-sc-gradient text-[#0F1F17] shadow-lg shadow-black/60 flex items-center justify-center">
                          <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2} />
                        </span>
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-[#E8FFF3] truncate">{mix.title}</p>
                  <p className="text-xs text-[#B3F7D1]/65 line-clamp-2 mt-1 leading-relaxed">
                    {mix.subtitle}
                  </p>
                </div>
              ))}
            </div>
          </section>
        );

      case 'charts':
        return (
          <section key="charts" aria-labelledby="charts-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 id="charts-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                  Tangga Lagu Indonesia
                </h2>
                <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/60 mt-1">
                  Lagu dan artis terpopuler di Indonesia saat ini
                </p>
              </div>
              {chartSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrackList(chartSongs, 0, 'Tangga Lagu Indonesia')}
                  className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:underline whitespace-nowrap shrink-0"
                >
                  Tampilkan semua
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
                  <div className="grid grid-cols-1 @[700px]:grid-cols-2 gap-x-4 gap-y-2">
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
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-[#E8FFF3]">Daftar Putar Tangga Lagu</h3>
                    <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
                      {chartPlaylists.map((item) => (
                        <MediaCard key={item.id} item={item} subtitle="Tangga Lagu" />
                      ))}
                    </div>
                  </div>
                )}

                {chartArtists.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-[#E8FFF3]">Artis Teratas Indonesia</h3>
                    <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
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
                <div className="h-6 w-48 rounded bg-white/[0.07] animate-pulse" />
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
                if (isExcludedRegionalText(section.title)) return null;
                const visibleItems = filterList(section.items);
                if (visibleItems.length === 0) return null;
                const playableItems = visibleItems.filter((i) => Boolean(getPlayableVideoId(i)));
                const mostlyPlayable =
                  playableItems.length >= Math.ceil(visibleItems.length * 0.7) &&
                  visibleItems.length > 4;

                return (
                  <div key={section.title} className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                        {section.title}
                      </h2>
                      {mostlyPlayable && playableItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => playTrackList(playableItems, 0, section.title)}
                          className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:underline whitespace-nowrap shrink-0"
                        >
                          Putar semua
                        </button>
                      )}
                    </div>

                    {mostlyPlayable ? (
                      <div className="grid grid-cols-1 @[700px]:grid-cols-2 gap-x-4 gap-y-2">
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
                      <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
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
          <section key="moods" aria-labelledby="home-moods-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="home-moods-heading" className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                Mood & Genre
              </h2>
              <button
                type="button"
                onClick={() => navigate({ name: 'moods' })}
                className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:underline whitespace-nowrap shrink-0"
              >
                Tampilkan semua
              </button>
            </div>
            <div className="grid grid-cols-2 @[540px]:grid-cols-3 @[760px]:grid-cols-4 gap-2 sm:gap-4">
              {moodCategories.map((cat) => (
                <button
                  key={cat.params}
                  type="button"
                  onClick={() =>
                    navigate({ name: 'mood-detail', params: cat.params, title: cat.title })
                  }
                  className="rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.1] border border-white/[0.11] min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left group transition-colors"
                >
                  <span className="text-xs sm:text-sm font-semibold text-[#E8FFF3] truncate">
                    {cat.title}
                  </span>
                  <ChevronRight
                    className="w-4 h-4 text-[#B3F7D1]/45 group-hover:text-[#19EE8A] shrink-0"
                    strokeWidth={1.9}
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

  const categoryButtons: Array<{ id: HomeCategoryTab; label: string }> = [
    { id: 'all', label: 'Semua' },
    { id: 'music', label: 'Musik' },
    { id: 'podcast', label: 'Podcast' },
    { id: 'local', label: 'Audio Lokal' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Row: Mobile Profile Avatar + Category Filter Pills (IMG_4280 layout) */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
        {onOpenProfileDrawer && (
          <button
            type="button"
            onClick={onOpenProfileDrawer}
            aria-label="Buka menu profil"
            className="md:hidden w-11 h-11 flex items-center justify-center shrink-0"
          >
            <span className="w-8 h-8 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-extrabold flex items-center justify-center shadow-md shadow-[#01BA53]/20">
              S
            </span>
          </button>
        )}
        {categoryButtons.map((tab) => {
          const active = categoryTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryTab(tab.id)}
              className={`min-h-[44px] px-4 py-2 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-sc-gradient text-[#0F1F17]'
                  : 'bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-[#B3F7D1]/85 hover:bg-white/[0.11] hover:text-[#E8FFF3]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Category Views */}
      {categoryTab === 'podcast' ? (
        <div className="space-y-6">
          {savedPodcasts.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-[#E8FFF3] tracking-tight">Podcast Tersimpan</h2>
              <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
                {savedPodcasts.map((entry) => (
                  <MediaCard key={entry.id} item={entry.item} subtitle="Podcast" />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-[#E8FFF3] tracking-tight">
                Podcast Populer Indonesia
              </h2>
              <button
                type="button"
                onClick={() =>
                  navigate({ name: 'search', query: 'podcast indonesia', filter: 'podcasts' })
                }
                className="inline-flex items-center min-h-[44px] px-2 text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:underline whitespace-nowrap shrink-0"
              >
                Tampilkan semua
              </button>
            </div>
            {podcastDiscoverQuery.isLoading ? (
              <CardGridSkeleton count={5} />
            ) : podcastDiscoverQuery.data && filterList(podcastDiscoverQuery.data.items).length > 0 ? (
              <div className="flex @[440px]:grid @[440px]:grid-cols-2 @[580px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4 overflow-x-auto @[440px]:overflow-visible pb-1 @[440px]:pb-0 snap-x scrollbar-none [&>*]:w-[154px] [&>*]:shrink-0 [&>*]:snap-start @[440px]:[&>*]:w-auto">
                {filterList(podcastDiscoverQuery.data.items).slice(0, 10).map((item) => (
                  <MediaCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed max-w-[65ch] text-[#B3F7D1]/60">
                Belum ada rekomendasi podcast.
              </p>
            )}
          </section>
        </div>
      ) : categoryTab === 'local' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[#E8FFF3] tracking-tight">Pustaka Audio Lokal</h2>
              <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/60 mt-1">
                File audio offline dengan Equalizer 10-band dan Normalisasi LUFS
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ name: 'library' })}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 shrink-0"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={2} />
              Kelola & Impor Audio
            </button>
          </div>
          {localTrackItems.length > 0 ? (
            <div className="space-y-2">
              {localTrackItems.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  onPlay={() => playTrackList(localTrackItems, idx, 'File Audio Lokal')}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-6 text-center space-y-4">
              <Headphones className="w-8 h-8 text-[#19EE8A] mx-auto" strokeWidth={1.75} />
              <p className="text-sm font-semibold text-[#E8FFF3]">Belum ada file audio lokal</p>
              <p className="text-xs leading-relaxed text-[#B3F7D1]/60 max-w-[65ch] mx-auto">
                Impor MP3, WAV, FLAC, atau M4A dari perangkat Windows Anda untuk diputar dengan EQ 10-band.
              </p>
              <button
                type="button"
                onClick={() => navigate({ name: 'library' })}
                className="min-h-[44px] px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
              >
                Buka Koleksi Lokal
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* 2-Column x 4-Row Windows Quick-Access Grid */}
          {quickTiles.length > 0 && (
            <section aria-label="Akses cepat" className="grid grid-cols-2 gap-2 sm:gap-4">
              {quickTiles.map((tile) => (
                <div
                  key={tile.id}
                  className="group relative flex items-center gap-2 sm:gap-3 h-12 sm:h-14 rounded-lg overflow-hidden bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.1] border border-white/[0.1] transition-colors pr-1 sm:pr-2"
                >
                  <button
                    type="button"
                    onClick={tile.onOpen}
                    className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 h-full text-left focus-visible:outline-2 focus-visible:outline-[#19EE8A]"
                  >
                    {tile.isLikedTile ? (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-[#19EE8A] via-[#0AD36C] to-[#01BA53] flex items-center justify-center shrink-0">
                        <Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-[#0F1F17] text-[#0F1F17]" strokeWidth={2} />
                      </div>
                    ) : tile.thumbnail ? (
                      <ArtworkImage
                        src={tile.thumbnail}
                        alt={tile.title}
                        className="w-12 h-12 sm:w-14 sm:h-14 shrink-0"
                        roundedClass="rounded-none"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/[0.08] flex items-center justify-center shrink-0 text-[#B3F7D1]/60">
                        <ListMusic className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.8} />
                      </div>
                    )}
                    <span className="text-xs sm:text-sm font-bold text-[#E8FFF3] truncate">
                      {tile.title}
                    </span>
                  </button>

                  {tile.onPlay && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        tile.onPlay?.();
                      }}
                      aria-label={`Putar ${tile.title}`}
                      className="hidden sm:flex w-11 h-11 items-center justify-center opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-150 shrink-0 focus-visible:opacity-100"
                    >
                      <span className="w-9 h-9 rounded-full bg-sc-gradient text-[#0F1F17] shadow-lg shadow-black/50 flex items-center justify-center">
                        <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2} />
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Ordered Home Sections */}
          <div className="space-y-8">
            {(homeSectionOrder as HomeSectionId[]).map((sectionId) => renderSection(sectionId))}
          </div>
        </>
      )}
    </div>
  );
}
