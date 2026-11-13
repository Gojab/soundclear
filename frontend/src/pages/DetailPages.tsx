import { useQuery } from '@tanstack/react-query';
import { Bookmark, Check, Download, Play, UserCheck, UserPlus } from 'lucide-react';
import { fetchAlbum, fetchArtist, fetchPlaylist, postAccountSubscribe } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { MediaCard } from '../components/MediaCard';
import { ErrorBanner, TrackListSkeleton } from '../components/Skeletons';
import { TrackRow } from '../components/TrackRow';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { normalizeRouteId } from '../utils/playerLogic';

interface DetailProps {
  id: string;
  fallbackQuery?: string;
  onAddToPlaylist: (track: MediaItem) => void;
}

export function ArtistDetailPage({ id, fallbackQuery, onAddToPlaylist }: DetailProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);
  const cleanId = normalizeRouteId(id);
  const followed = useLibraryStore((s) => s.isArtistFollowed(cleanId || id));
  const toggleFollowArtist = useLibraryStore((s) => s.toggleFollowArtist);
  const libraryArtistHint = useLibraryStore((s) => {
    const saved = s.followedArtists.find((a) => a.id === (cleanId || id));
    if (saved?.item.title) return saved.item.title;
    for (const track of s.likedTracks) {
      const match = track.artists?.find((art) => art.id === (cleanId || id));
      if (match?.name) return match.name;
    }
    for (const rec of s.playHistory) {
      const match = rec.track.artists?.find((art) => art.id === (cleanId || id));
      if (match?.name) return match.name;
    }
    return undefined;
  });
  const resolvedFallback = fallbackQuery?.trim() || libraryArtistHint;

  const query = useQuery({
    queryKey: ['artist', cleanId || '', resolvedFallback || ''],
    queryFn: ({ signal }) => fetchArtist(cleanId || '', signal, resolvedFallback),
    enabled: Boolean(cleanId),
  });

  if (!cleanId) {
    return (
      <ErrorBanner
        message="ID artis tidak valid atau tidak tersedia."
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

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
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  const artist = query.data;

  const handleToggleFollow = () => {
    toggleFollowArtist({
      id: artist.id,
      title: artist.name,
      artists: [],
      thumbnail: artist.thumbnail,
      type: 'artist',
      views: artist.views,
    });
    void postAccountSubscribe([artist.id], !followed).catch(() => {});
  };

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
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            {artist.songs.length > 0 && (
              <button
                type="button"
                onClick={() => playTrackList(artist.songs, 0, artist.name)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Lagu Populer
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
                  Ikuti
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {artist.songs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Populer</h2>
          <div className="space-y-1">
            {artist.songs.map((song, idx) => (
              <TrackRow
                key={`${song.id}-${idx}`}
                track={song}
                index={idx}
                onPlay={() => playTrackList(artist.songs, idx, artist.name)}
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

      {artist.compilations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Kompilasi</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {artist.compilations.map((c) => (
              <MediaCard key={c.id} item={c} subtitle={c.year || 'Kompilasi'} />
            ))}
          </div>
        </section>
      )}

      {artist.appearsOn.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Muncul di</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {artist.appearsOn.map((ap) => (
              <MediaCard key={ap.id} item={ap} />
            ))}
          </div>
        </section>
      )}

      {artist.videos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Video Musik</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {artist.videos.slice(0, 10).map((v) => (
              <MediaCard key={v.id} item={v} onAddToPlaylist={onAddToPlaylist} />
            ))}
          </div>
        </section>
      )}

      {artist.related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Artis Serupa</h2>
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

export function AlbumDetailPage({ id, fallbackQuery, onAddToPlaylist }: DetailProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);
  const cleanId = normalizeRouteId(id);
  const saved = useLibraryStore((s) => s.isAlbumSaved(cleanId || id));
  const toggleSaveAlbum = useLibraryStore((s) => s.toggleSaveAlbum);
  const downloadTracksOffline = useLibraryStore((s) => s.downloadTracksOffline);
  const downloadQuality = useSettingsStore((s) => s.localProfile.downloadQuality);
  const showToast = useContextMenuStore((s) => s.showToast);
  const libraryAlbumHint = useLibraryStore((s) => {
    const entry = s.savedAlbums.find((a) => a.id === (cleanId || id));
    if (entry?.item.title) return entry.item.title;
    for (const track of s.likedTracks) {
      if (track.album?.id === (cleanId || id) && track.album.name) return track.album.name;
    }
    for (const rec of s.playHistory) {
      if (rec.track.album?.id === (cleanId || id) && rec.track.album.name) {
        return rec.track.album.name;
      }
    }
    return undefined;
  });
  const resolvedFallback = fallbackQuery?.trim() || libraryAlbumHint;

  const query = useQuery({
    queryKey: ['album', cleanId || '', resolvedFallback || ''],
    queryFn: ({ signal }) => fetchAlbum(cleanId || '', signal, resolvedFallback),
    enabled: Boolean(cleanId),
  });

  if (!cleanId) {
    return (
      <ErrorBanner
        message="ID album tidak valid atau tidak tersedia."
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

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
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

  const album = query.data;

  const handleToggleSave = () => {
    toggleSaveAlbum({
      id: album.id,
      title: album.title,
      artists: album.artists,
      thumbnail: album.thumbnail,
      type: 'album',
      year: album.year,
    });
  };

  return (
    <div className="space-y-8">
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
                    onClick={() =>
                      navigate({
                        name: 'artist',
                        id: artist.id!,
                        fallbackQuery: artist.name,
                      })
                    }
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
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            {album.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrackList(album.tracks, 0, album.title)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Album
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleSave}
              aria-pressed={saved}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                saved
                  ? 'bg-white/[0.12] text-[#2EE6A6] border border-[#2EE6A6]/35'
                  : 'bg-white/[0.07] hover:bg-white/[0.12] text-white'
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" strokeWidth={1.75} />
                  Tersimpan di Koleksi
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4" strokeWidth={1.75} />
                  Simpan ke Koleksi
                </>
              )}
            </button>
            {album.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  void downloadTracksOffline(album.tracks, downloadQuality).then(
                    ({ savedCount }) => {
                      showToast(`${savedCount} lagu dari "${album.title}" tersimpan offline`);
                    },
                  );
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                <Download className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />
                Unduh Offline
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-1">
        {album.tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx}
            showAlbum={false}
            onPlay={() => playTrackList(album.tracks, idx, album.title)}
            onAddToPlaylist={onAddToPlaylist}
          />
        ))}
      </div>

      {album.credits.length > 0 && (
        <section className="glass-card rounded-2xl p-4 space-y-2.5">
          <h2 className="text-sm font-semibold text-white">Kredit Album</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {album.credits.map((c) => (
              <div key={c.role}>
                <p className="text-white/45">{c.role}</p>
                <p className="text-white/85 mt-0.5">{c.names.join(', ')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {album.moreFromArtist.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Lainnya dari Artis Ini</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {album.moreFromArtist.map((item) => (
              <MediaCard key={item.id} item={item} subtitle={item.year || 'Album'} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function PlaylistDetailPage({ id, fallbackQuery, onAddToPlaylist }: DetailProps) {
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);
  const cleanId = normalizeRouteId(id);
  const resolvedFallback = fallbackQuery?.trim() || undefined;
  const downloadTracksOffline = useLibraryStore((s) => s.downloadTracksOffline);
  const downloadQuality = useSettingsStore((s) => s.localProfile.downloadQuality);
  const showToast = useContextMenuStore((s) => s.showToast);

  const query = useQuery({
    queryKey: ['playlist', cleanId || '', resolvedFallback || ''],
    queryFn: ({ signal }) => fetchPlaylist(cleanId || '', signal, resolvedFallback),
    enabled: Boolean(cleanId),
  });

  if (!cleanId) {
    return (
      <ErrorBanner
        message="ID playlist tidak valid atau tidak tersedia."
        onGoHome={() => navigate({ name: 'home' })}
      />
    );
  }

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
        onGoHome={() => navigate({ name: 'home' })}
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
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => playTrackList(pl.tracks, 0, pl.title)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Playlist
              </button>
              <button
                type="button"
                onClick={() => {
                  void downloadTracksOffline(pl.tracks, downloadQuality).then(({ savedCount }) => {
                    showToast(`${savedCount} lagu dari "${pl.title}" tersimpan offline`);
                  });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                <Download className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />
                Unduh Offline
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
            onPlay={() => playTrackList(pl.tracks, idx, pl.title)}
            onAddToPlaylist={onAddToPlaylist}
          />
        ))}
      </div>
    </div>
  );
}
