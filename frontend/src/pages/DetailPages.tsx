import { Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAlbum, fetchArtist, fetchPlaylist } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { MediaCard } from '../components/MediaCard';
import { ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';

interface DetailProps {
  id: string;
  onAddToPlaylist: (track: MediaItem) => void;
}

export function ArtistDetailPage({ id, onAddToPlaylist }: DetailProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const query = useQuery({
    queryKey: ['artist', id],
    queryFn: ({ signal }) => fetchArtist(id, signal),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-5 animate-pulse">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-white/[0.08] shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-48 rounded bg-white/[0.08]" />
            <div className="h-4 w-32 rounded bg-white/[0.06]" />
          </div>
        </div>
        <TrackListSkeleton count={5} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={
          query.error instanceof Error ? query.error.message : 'Gagal memuat profil artis.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const artist = query.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <ArtworkImage
          src={artist.thumbnail}
          alt={artist.name}
          type="artist"
          className="w-28 h-28 sm:w-36 sm:h-36"
          roundedClass="rounded-full"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-white/55">Artis</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {artist.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            {artist.subscribers && <span>{artist.subscribers} pelanggan</span>}
            {artist.subscribers && artist.views && <span aria-hidden="true">·</span>}
            {artist.views && <span>{artist.views}</span>}
          </div>
          {artist.songs.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => playTrackList(artist.songs, 0)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Lagu Populer
              </button>
            </div>
          )}
        </div>
      </header>

      {artist.songs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Lagu Populer</h2>
          <div className="space-y-1">
            {artist.songs.map((song, idx) => (
              <TrackRow
                key={`${song.id}-${idx}`}
                track={song}
                index={idx}
                onPlay={() => playTrackList(artist.songs, idx)}
                onAddToPlaylist={onAddToPlaylist}
              />
            ))}
          </div>
        </section>
      )}

      {artist.albums.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Album</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {artist.albums.map((alb) => (
              <MediaCard key={alb.id} item={alb} subtitle={alb.year || 'Album'} />
            ))}
          </div>
        </section>
      )}

      {artist.singles.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Singel & EP</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {artist.singles.map((s) => (
              <MediaCard key={s.id} item={s} subtitle={s.year || 'Singel'} />
            ))}
          </div>
        </section>
      )}

      {artist.related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Artis Terkait</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {artist.related.map((rel) => (
              <MediaCard key={rel.id} item={rel} subtitle={rel.views || 'Artis'} />
            ))}
          </div>
        </section>
      )}

      {artist.description && (
        <section className="glass-card rounded-2xl p-4 space-y-1.5">
          <h2 className="text-sm font-semibold text-white">Tentang {artist.name}</h2>
          <p className="text-xs text-white/60 leading-relaxed whitespace-pre-line max-w-3xl">
            {artist.description}
          </p>
        </section>
      )}
    </div>
  );
}

export function AlbumDetailPage({ id, onAddToPlaylist }: DetailProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const query = useQuery({
    queryKey: ['album', id],
    queryFn: ({ signal }) => fetchAlbum(id, signal),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-5 animate-pulse">
          <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-2xl bg-white/[0.08] shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-56 rounded bg-white/[0.08]" />
            <div className="h-4 w-40 rounded bg-white/[0.06]" />
          </div>
        </div>
        <TrackListSkeleton count={8} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat detail album.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const album = query.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <ArtworkImage
          src={album.thumbnail}
          alt={album.title}
          type="album"
          className="w-32 h-32 sm:w-44 sm:h-44"
          roundedClass="rounded-2xl"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-white/55">Album</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {album.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/65">
            {album.artists.map((artist, idx) => (
              <span key={`${artist.name}-${idx}`}>
                {idx > 0 && ', '}
                {artist.id ? (
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'artist', id: artist.id! })}
                    className="font-medium text-white hover:underline"
                  >
                    {artist.name}
                  </button>
                ) : (
                  <span className="font-medium text-white">{artist.name}</span>
                )}
              </span>
            ))}
            {album.year && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{album.year}</span>
              </>
            )}
            {album.trackCount && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{album.trackCount} lagu</span>
              </>
            )}
            {album.duration && (
              <>
                <span aria-hidden="true">·</span>
                <span>{album.duration}</span>
              </>
            )}
          </div>
          {album.tracks.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => playTrackList(album.tracks, 0)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Album
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="space-y-1">
        {album.tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx}
            showAlbum={false}
            onPlay={() => playTrackList(album.tracks, idx)}
            onAddToPlaylist={onAddToPlaylist}
          />
        ))}
      </div>
    </div>
  );
}

export function PlaylistDetailPage({ id, onAddToPlaylist }: DetailProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const query = useQuery({
    queryKey: ['playlist', id],
    queryFn: ({ signal }) => fetchPlaylist(id, signal),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-5 animate-pulse">
          <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-2xl bg-white/[0.08] shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-56 rounded bg-white/[0.08]" />
            <div className="h-4 w-40 rounded bg-white/[0.06]" />
          </div>
        </div>
        <TrackListSkeleton count={8} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={
          query.error instanceof Error ? query.error.message : 'Gagal memuat detail playlist.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const pl = query.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <ArtworkImage
          src={pl.thumbnail}
          alt={pl.title}
          type="playlist"
          className="w-32 h-32 sm:w-44 sm:h-44"
          roundedClass="rounded-2xl"
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-white/55">Playlist</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{pl.title}</h1>
          {pl.description && (
            <p className="text-xs text-white/60 max-w-2xl line-clamp-2">{pl.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            {pl.author && <span>{pl.author}</span>}
            {pl.author && pl.trackCount && <span aria-hidden="true">·</span>}
            {pl.trackCount && <span className="tabular-nums">{pl.trackCount} lagu</span>}
            {pl.duration && (
              <>
                <span aria-hidden="true">·</span>
                <span>{pl.duration}</span>
              </>
            )}
          </div>
          {pl.tracks.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => playTrackList(pl.tracks, 0)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Playlist
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="space-y-1">
        {pl.tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx}
            onPlay={() => playTrackList(pl.tracks, idx)}
            onAddToPlaylist={onAddToPlaylist}
          />
        ))}
      </div>
    </div>
  );
}
