import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Play, Podcast, UserCheck, UserPlus } from 'lucide-react';
import { fetchEpisode, fetchPodcast } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem, PodcastEpisode } from '../types/music';
import { formatTime } from '../utils/playerLogic';

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

export function PodcastDetailPage({ id }: { id: string }) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigate = useNavigationStore((s) => s.navigate);

  const followed = useLibraryStore((s) => s.isPodcastFollowed(id));
  const toggleFollowPodcast = useLibraryStore((s) => s.toggleFollowPodcast);
  const episodeProgress = useLibraryStore((s) => s.episodeProgress);
  const markEpisodeCompleted = useLibraryStore((s) => s.markEpisodeCompleted);

  const query = useQuery({
    queryKey: ['podcast', id],
    queryFn: ({ signal }) => fetchPodcast(id, signal),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-5 animate-pulse">
          <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-white/[0.08] shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-56 rounded bg-white/[0.08]" />
            <div className="h-4 w-40 rounded bg-white/[0.06]" />
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
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <ArtworkImage
          src={podcast.thumbnail}
          alt={podcast.title}
          type="podcast"
          className="w-32 h-32 sm:w-44 sm:h-44"
          roundedClass="rounded-2xl"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-white/55 inline-flex items-center gap-1.5">
            <Podcast className="w-3.5 h-3.5 text-[#2EE6A6]" strokeWidth={1.75} />
            Podcast
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {podcast.title}
          </h1>
          {podcast.author && <p className="text-xs text-white/65">{podcast.author}</p>}
          {podcast.description && (
            <p className="text-xs text-white/55 max-w-2xl line-clamp-3">{podcast.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Episode Terbaru
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleFollow}
              aria-pressed={followed}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                followed
                  ? 'bg-white/[0.12] text-[#2EE6A6] border border-[#2EE6A6]/35'
                  : 'bg-white/[0.07] hover:bg-white/[0.12] text-white'
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Daftar Episode <span className="text-sm text-white/45 tabular-nums">({podcast.episodes.length})</span>
        </h2>

        {podcast.episodes.length === 0 ? (
          <p className="text-xs text-white/50">Belum ada episode tersedia.</p>
        ) : (
          <div className="space-y-2.5">
            {podcast.episodes.map((ep) => {
              const prog = episodeProgress[ep.videoId];
              const pct =
                prog && prog.durationSeconds > 0
                  ? Math.min(100, Math.round((prog.positionSeconds / prog.durationSeconds) * 100))
                  : 0;

              return (
                <div
                  key={ep.id}
                  className="glass-card rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3.5"
                >
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'episode', id: ep.videoId })}
                    className="flex items-start gap-3.5 min-w-0 flex-1 text-left"
                  >
                    <ArtworkImage
                      src={ep.thumbnail}
                      alt={ep.title}
                      type="episode"
                      className="w-16 h-16"
                      roundedClass="rounded-xl"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold text-white line-clamp-1">{ep.title}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                        {ep.published && <span>{ep.published}</span>}
                        {ep.published && ep.duration && <span aria-hidden="true">·</span>}
                        {ep.duration && <span className="tabular-nums">{ep.duration}</span>}
                        {prog?.completed && (
                          <span className="text-[#2EE6A6] font-medium">· Selesai</span>
                        )}
                      </div>
                      {ep.description && (
                        <p className="text-xs text-white/55 line-clamp-2">{ep.description}</p>
                      )}
                      {prog && !prog.completed && prog.positionSeconds > 5 && (
                        <div className="pt-1 max-w-xs flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                            <div
                              className="h-full bg-[#2EE6A6]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-white/50 tabular-nums">
                            {formatTime(prog.positionSeconds)}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        markEpisodeCompleted(ep.videoId, podcast.id, !prog?.completed)
                      }
                      aria-label={prog?.completed ? 'Tandai belum selesai' : 'Tandai selesai'}
                      title={prog?.completed ? 'Sudah selesai' : 'Tandai selesai'}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        prog?.completed
                          ? 'text-[#2EE6A6] bg-[#2EE6A6]/10'
                          : 'text-white/50 hover:text-white bg-white/[0.06]'
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
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

export function EpisodeDetailPage({ id }: { id: string }) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigate = useNavigationStore((s) => s.navigate);
  const prog = useLibraryStore((s) => s.episodeProgress[id]);
  const markEpisodeCompleted = useLibraryStore((s) => s.markEpisodeCompleted);

  const query = useQuery({
    queryKey: ['episode', id],
    queryFn: ({ signal }) => fetchEpisode(id, signal),
  });

  if (query.isLoading) {
    return <TrackListSkeleton count={4} />;
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat detail episode.'}
        onRetry={() => void query.refetch()}
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
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <ArtworkImage
          src={ep.thumbnail}
          alt={ep.title}
          type="episode"
          className="w-32 h-32 sm:w-44 sm:h-44"
          roundedClass="rounded-2xl"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-white/55">Episode Podcast</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{ep.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
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

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() =>
                playTrack(mediaItem, {
                  autoRadio: false,
                  startAtSeconds: prog && !prog.completed ? prog.positionSeconds : 0,
                  sourceLabel: ep.podcastTitle || 'Podcast',
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
            >
              <Play className="w-4 h-4 fill-current" strokeWidth={2} />
              {prog && !prog.completed && prog.positionSeconds > 5 ? 'Lanjutkan Putar' : 'Putar Episode'}
            </button>

            <button
              type="button"
              onClick={() => markEpisodeCompleted(ep.videoId, ep.podcastId, !prog?.completed)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium ${
                prog?.completed
                  ? 'bg-[#2EE6A6]/15 text-[#2EE6A6] border border-[#2EE6A6]/30'
                  : 'bg-white/[0.07] text-white/80 hover:text-white'
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

            {ep.podcastId && (
              <button
                type="button"
                onClick={() => navigate({ name: 'podcast', id: ep.podcastId! })}
                className="px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white"
              >
                Lihat Semua Episode
              </button>
            )}
          </div>
        </div>
      </header>

      {ep.description && (
        <section className="glass-card rounded-2xl p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">Deskripsi Episode</h2>
          <p className="text-xs text-white/65 leading-relaxed whitespace-pre-line">
            {ep.description}
          </p>
        </section>
      )}
    </div>
  );
}
