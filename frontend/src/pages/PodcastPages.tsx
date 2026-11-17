import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Play, Podcast, UserCheck, UserPlus } from 'lucide-react';
import { fetchEpisode, fetchPodcast } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem, PodcastEpisode } from '../types/music';
import { PLAYBACK_RATE_OPTIONS } from '../utils/audioMath';
import { formatTime, normalizeRouteId } from '../utils/playerLogic';

function episodeToMediaItem(ep: PodcastEpisode, fallbackAuthor?: string | null): MediaItem {
  return {
    id: ep.videoId,
    videoId: ep.videoId,
    title: ep.title,
    artists: [{ id: null, name: ep.podcastTitle || fallbackAuthor || 'Podcast' }],
    duration: ep.duration,
    durationSeconds: ep.durationSeconds,
    thumbnail: ep.thumbnail,
    type: 'episode',
    published: ep.published,
    podcastId: ep.podcastId,
    description: ep.description,
  };
}

export function PodcastDetailPage({
  id,
  fallbackQuery,
}: {
  id: string;
  fallbackQuery?: string;
}) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigate = useNavigationStore((s) => s.navigate);
  const cleanId = normalizeRouteId(id);

  const followed = useLibraryStore((s) => s.isPodcastFollowed(cleanId || id));
  const toggleFollowPodcast = useLibraryStore((s) => s.toggleFollowPodcast);
  const libraryPodcastHint = useLibraryStore(
    (s) => s.savedPodcasts.find((p) => p.id === (cleanId || id))?.item.title,
  );
  const resolvedFallback = fallbackQuery?.trim() || libraryPodcastHint;
  const episodeProgress = useLibraryStore((s) => s.episodeProgress);
  const markEpisodeCompleted = useLibraryStore((s) => s.markEpisodeCompleted);
  const episodePlaybackRates = useSettingsStore((s) => s.episodePlaybackRates);
  const setEpisodePlaybackRate = useSettingsStore((s) => s.setEpisodePlaybackRate);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const defaultRate = useSettingsStore((s) => s.youtubeSound.defaultPlaybackRate);

  const query = useQuery({
    queryKey: ['podcast', cleanId || '', resolvedFallback || ''],
    queryFn: ({ signal }) => fetchPodcast(cleanId || '', signal, resolvedFallback),
    enabled: Boolean(cleanId),
  });

  if (!cleanId) {
    return (
      <ErrorBanner
        message="ID podcast tidak valid atau tidak tersedia."
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-5 animate-pulse">
          <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-white/[0.06] shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-56 rounded bg-white/[0.06]" />
            <div className="h-4 w-40 rounded bg-white/[0.05]" />
          </div>
        </div>
        <TrackListSkeleton count={6} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat podcast.'}
        onRetry={() => void query.refetch()}
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  const podcast = query.data;

  const handleToggleFollow = () => {
    toggleFollowPodcast({
      id: podcast.id,
      browseId: podcast.id,
      title: podcast.title,
      artists: podcast.author ? [{ id: podcast.authorId, name: podcast.author }] : [],
      thumbnail: podcast.thumbnail,
      type: 'podcast',
    });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
        <ArtworkImage
          src={podcast.thumbnail}
          alt={podcast.title}
          type="podcast"
          className="w-32 h-32 sm:w-44 sm:h-44"
          roundedClass="rounded-2xl"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-[#B3F7D1]/60 inline-flex items-center gap-2">
            <Podcast className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.75} />
            Podcast
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#E8FFF3] tracking-tight">
            {podcast.title}
          </h1>
          {podcast.author && <p className="text-xs text-[#B3F7D1]/70">{podcast.author}</p>}
          {podcast.description && (
            <p className="text-xs leading-relaxed text-[#B3F7D1]/60 max-w-[65ch] line-clamp-3">
              {podcast.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {podcast.episodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const first = podcast.episodes[0];
                  const prog = episodeProgress[first.videoId];
                  playTrack(episodeToMediaItem(first, podcast.author), {
                    autoRadio: false,
                    startAtSeconds: prog && !prog.completed ? prog.positionSeconds : 0,
                    sourceLabel: podcast.title,
                  });
                }}
                className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Episode Terbaru
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleFollow}
              aria-pressed={followed}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                followed
                  ? 'bg-white/[0.1] backdrop-blur-xl text-[#19EE8A] border border-[#19EE8A]/35'
                  : 'bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.1] text-[#E8FFF3] border border-white/[0.11]'
              }`}
            >
              {followed ? (
                <>
                  <UserCheck className="w-4 h-4" strokeWidth={1.75} />
                  Mengikuti
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" strokeWidth={1.75} />
                  Ikuti Podcast
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#E8FFF3]">
          Daftar Episode <span className="text-sm text-[#B3F7D1]/50 tabular-nums">({podcast.episodes.length})</span>
        </h2>

        {podcast.episodes.length === 0 ? (
          <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/55">
            Belum ada episode tersedia.
          </p>
        ) : (
          <div className="space-y-4">
            {podcast.episodes.map((ep) => {
              const prog = episodeProgress[ep.videoId];
              const pct =
                prog && prog.durationSeconds > 0
                  ? Math.min(100, Math.round((prog.positionSeconds / prog.durationSeconds) * 100))
                  : 0;

              return (
                <div
                  key={ep.id}
                  className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ name: 'episode', id: ep.videoId, fallbackQuery: ep.title })
                    }
                    className="flex items-start gap-4 min-w-0 min-h-[44px] flex-1 text-left"
                  >
                    <ArtworkImage
                      src={ep.thumbnail}
                      alt={ep.title}
                      type="episode"
                      className="w-16 h-16"
                      roundedClass="rounded-xl"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold text-[#E8FFF3] line-clamp-1">{ep.title}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#B3F7D1]/55">
                        {ep.published && <span>{ep.published}</span>}
                        {ep.published && ep.duration && <span aria-hidden="true">·</span>}
                        {ep.duration && <span className="tabular-nums">{ep.duration}</span>}
                        {prog?.completed && (
                          <span className="text-[#19EE8A] font-medium">· Selesai</span>
                        )}
                      </div>
                      {ep.description && (
                        <p className="text-xs leading-relaxed max-w-[65ch] text-[#B3F7D1]/60 line-clamp-2">
                          {ep.description}
                        </p>
                      )}
                      {prog && !prog.completed && prog.positionSeconds > 5 && (
                        <div className="pt-1 max-w-xs flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-white/[0.12] overflow-hidden">
                            <div
                              className="h-full bg-sc-gradient"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#B3F7D1]/55 tabular-nums">
                            {formatTime(prog.positionSeconds)}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Kecepatan putar episode ${ep.title}`}
                      value={
                        typeof episodePlaybackRates[ep.videoId] === 'number'
                          ? String(episodePlaybackRates[ep.videoId])
                          : 'default'
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        const nextRate = raw === 'default' ? null : Number(raw);
                        setEpisodePlaybackRate(ep.videoId, nextRate);
                        if (currentTrack && (currentTrack.videoId || currentTrack.id) === ep.videoId) {
                          setPlaybackRate(nextRate ?? defaultRate);
                        }
                      }}
                      className="h-11 px-3 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] text-[11px] text-[#E8FFF3] tabular-nums focus:outline-none focus:border-[#19EE8A]"
                    >
                      <option value="default" className="bg-[#0B0F0D] text-[#E8FFF3]">Default ({defaultRate}x)</option>
                      {PLAYBACK_RATE_OPTIONS.map((r) => (
                        <option key={r} value={String(r)} className="bg-[#0B0F0D] text-[#E8FFF3]">
                          {r}x
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        markEpisodeCompleted(ep.videoId, podcast.id, !prog?.completed)
                      }
                      aria-label={prog?.completed ? 'Tandai belum selesai' : 'Tandai selesai'}
                      title={prog?.completed ? 'Sudah selesai' : 'Tandai selesai'}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                        prog?.completed
                          ? 'text-[#19EE8A] bg-[#19EE8A]/12'
                          : 'text-[#B3F7D1]/55 hover:text-[#E8FFF3] bg-white/[0.055] hover:bg-white/[0.1] border border-white/[0.1]'
                      }`}
                    >
                      {prog?.completed ? (
                        <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                      ) : (
                        <Circle className="w-4 h-4" strokeWidth={1.75} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        playTrack(episodeToMediaItem(ep, podcast.author), {
                          autoRadio: false,
                          startAtSeconds: prog && !prog.completed ? prog.positionSeconds : 0,
                          sourceLabel: podcast.title,
                        })
                      }
                      className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                      {prog && !prog.completed && prog.positionSeconds > 5 ? 'Lanjutkan' : 'Putar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function EpisodeDetailPage({
  id,
  fallbackQuery,
}: {
  id: string;
  fallbackQuery?: string;
}) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigate = useNavigationStore((s) => s.navigate);
  const cleanId = normalizeRouteId(id);
  const resolvedFallback = fallbackQuery?.trim() || undefined;
  const prog = useLibraryStore((s) => s.episodeProgress[cleanId || id]);
  const markEpisodeCompleted = useLibraryStore((s) => s.markEpisodeCompleted);
  const customEpisodeRate = useSettingsStore((s) => s.episodePlaybackRates[cleanId || id]);
  const setEpisodePlaybackRate = useSettingsStore((s) => s.setEpisodePlaybackRate);
  const defaultRate = useSettingsStore((s) => s.youtubeSound.defaultPlaybackRate);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);

  const query = useQuery({
    queryKey: ['episode', cleanId || '', resolvedFallback || ''],
    queryFn: ({ signal }) => fetchEpisode(cleanId || '', signal, resolvedFallback),
    enabled: Boolean(cleanId),
  });

  if (!cleanId) {
    return (
      <ErrorBanner
        message="ID episode tidak valid atau tidak tersedia."
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  if (query.isLoading) {
    return <TrackListSkeleton count={4} />;
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat detail episode.'}
        onRetry={() => void query.refetch()}
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  const ep = query.data;

  const mediaItem: MediaItem = {
    id: ep.videoId,
    videoId: ep.videoId,
    title: ep.title,
    artists: [{ id: ep.authorId, name: ep.author || ep.podcastTitle || 'Podcast' }],
    duration: ep.duration,
    durationSeconds: ep.durationSeconds,
    thumbnail: ep.thumbnail,
    type: 'episode',
    published: ep.published,
    podcastId: ep.podcastId,
    description: ep.description,
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
        <ArtworkImage
          src={ep.thumbnail}
          alt={ep.title}
          type="episode"
          className="w-32 h-32 sm:w-44 sm:h-44"
          roundedClass="rounded-2xl"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-[#B3F7D1]/60">Episode Podcast</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#E8FFF3] tracking-tight">{ep.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#B3F7D1]/65">
            {ep.author && <span>{ep.author}</span>}
            {ep.published && (
              <>
                <span aria-hidden="true">·</span>
                <span>{ep.published}</span>
              </>
            )}
            {ep.duration && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{ep.duration}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() =>
                playTrack(mediaItem, {
                  autoRadio: false,
                  startAtSeconds: prog && !prog.completed ? prog.positionSeconds : 0,
                  sourceLabel: ep.podcastTitle || 'Podcast',
                })
              }
              className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
            >
              <Play className="w-4 h-4 fill-current" strokeWidth={2} />
              {prog && !prog.completed && prog.positionSeconds > 5 ? 'Lanjutkan Putar' : 'Putar Episode'}
            </button>

            <button
              type="button"
              onClick={() => markEpisodeCompleted(ep.videoId, ep.podcastId, !prog?.completed)}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium ${
                prog?.completed
                  ? 'bg-[#19EE8A]/15 text-[#19EE8A] border border-[#19EE8A]/35'
                  : 'bg-white/[0.055] backdrop-blur-xl text-[#E8FFF3]/85 hover:bg-white/[0.1] border border-white/[0.11]'
              }`}
            >
              {prog?.completed ? (
                <>
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                  Sudah Selesai
                </>
              ) : (
                <>
                  <Circle className="w-4 h-4" strokeWidth={1.75} />
                  Tandai Selesai
                </>
              )}
            </button>

            <select
              aria-label="Kecepatan putar episode ini"
              value={typeof customEpisodeRate === 'number' ? String(customEpisodeRate) : 'default'}
              onChange={(e) => {
                const raw = e.target.value;
                const nextRate = raw === 'default' ? null : Number(raw);
                setEpisodePlaybackRate(ep.videoId, nextRate);
                if (currentTrack && (currentTrack.videoId || currentTrack.id) === ep.videoId) {
                  setPlaybackRate(nextRate ?? defaultRate);
                }
              }}
              className="h-11 px-3 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] text-xs text-[#E8FFF3] tabular-nums focus:outline-none focus:border-[#19EE8A]"
            >
              <option value="default" className="bg-[#0B0F0D] text-[#E8FFF3]">Kecepatan: Default ({defaultRate}x)</option>
              {PLAYBACK_RATE_OPTIONS.map((r) => (
                <option key={r} value={String(r)} className="bg-[#0B0F0D] text-[#E8FFF3]">
                  Kecepatan: {r}x
                </option>
              ))}
            </select>

            {ep.podcastId && (
              <button
                type="button"
                onClick={() =>
                  navigate({
                    name: 'podcast',
                    id: ep.podcastId!,
                    fallbackQuery: ep.podcastTitle || undefined,
                  })
                }
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.1] border border-white/[0.11] text-xs font-medium text-[#E8FFF3]"
              >
                Lihat Semua Episode
              </button>
            )}
          </div>
        </div>
      </header>

      {ep.description && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-2">
          <h2 className="text-sm font-semibold text-[#E8FFF3]">Deskripsi Episode</h2>
          <p className="text-xs text-[#B3F7D1]/70 leading-relaxed whitespace-pre-line max-w-[65ch]">
            {ep.description}
          </p>
        </section>
      )}
    </div>
  );
}
