import { useQuery } from '@tanstack/react-query';
import { Headphones, Heart, Info, ListMusic, ListPlus, Mic2, MoreHorizontal, Sliders, X } from 'lucide-react';
import { fetchSongCredits, fetchSongRelated } from '../api/client';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { formatArtists, getPlayableVideoId, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';

interface RightPanelProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

function LocalFileDetails({ track }: { track: MediaItem }) {
  const localFiles = useLibraryStore((s) => s.localFiles);
  const navigate = useNavigationStore((s) => s.navigate);
  const localId = getTrackUniqueId(track);
  const record = localFiles.find((f) => f.id === localId);

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5 space-y-2">
        <p className="font-semibold text-white/80">Informasi File Lokal</p>
        <div className="space-y-1 text-white/60">
          <p>Judul: <span className="text-white/90">{track.title}</span></p>
          <p>Artis: <span className="text-white/90">{formatArtists(track.artists)}</span></p>
          {track.album?.name && (
            <p>Album: <span className="text-white/90">{track.album.name}</span></p>
          )}
          {record && (
            <>
              <p className="tabular-nums">
                Perkiraan Loudness: <span className="text-[#2EE6A6]">{record.estimatedLufs.toFixed(1)} LUFS</span>
              </p>
              <p className="tabular-nums">
                Ukuran: <span className="text-white/85">{(record.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
              </p>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: true })}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 text-[#2EE6A6] font-medium hover:bg-[#2EE6A6]/20 transition-colors"
      >
        <Sliders className="w-3.5 h-3.5" strokeWidth={1.75} />
        Buka Equalizer & Efek Lokal
      </button>
    </div>
  );
}

function SongDetailsAndRelated({
  track,
  onAddToPlaylist,
}: {
  track: MediaItem;
  onAddToPlaylist: (track: MediaItem) => void;
}) {
  const videoId = getPlayableVideoId(track) || '';
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const creditsQuery = useQuery({
    queryKey: ['song-credits', videoId, track.album?.id, track.creditsBrowseId],
    queryFn: ({ signal }) =>
      fetchSongCredits(videoId, track.album?.id, track.creditsBrowseId, signal),
    enabled: Boolean(videoId),
  });

  const relatedQuery = useQuery({
    queryKey: ['song-related', videoId],
    queryFn: ({ signal }) => fetchSongRelated(videoId, signal),
    enabled: Boolean(videoId),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-white/55">Kredit Lagu</h4>
        {creditsQuery.isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-10 rounded-xl bg-white/[0.06]" />
            <div className="h-10 rounded-xl bg-white/[0.06]" />
          </div>
        ) : creditsQuery.data && creditsQuery.data.credits.length > 0 ? (
          <div className="space-y-1.5">
            {creditsQuery.data.credits.map((credit) => (
              <div
                key={credit.role}
                className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2"
              >
                <p className="text-[11px] text-white/45">{credit.role}</p>
                <p className="text-xs text-white mt-0.5">{credit.names.join(', ')}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/45">
            {formatArtists(track.artists)}
            {track.album?.name ? ` · ${track.album.name}` : ''}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-white/55">Lagu Terkait</h4>
        {relatedQuery.isLoading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-11 rounded-xl bg-white/[0.06]" />
            ))}
          </div>
        ) : relatedQuery.data && relatedQuery.data.tracks.length > 0 ? (
          <div className="space-y-1">
            {relatedQuery.data.tracks.slice(0, 8).map((rel, idx) => (
              <button
                key={`${rel.id}-${idx}`}
                type="button"
                onClick={() => playTrackList(relatedQuery.data.tracks, idx, 'Lagu Terkait')}
                className="w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <ArtworkImage
                  src={rel.thumbnail}
                  alt={rel.title}
                  className="w-9 h-9"
                  roundedClass="rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white truncate">{rel.title}</p>
                  <p className="text-[11px] text-white/50 truncate">
                    {formatArtists(rel.artists)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/45">Belum ada lagu terkait untuk lagu ini.</p>
        )}
      </div>

      {relatedQuery.data && relatedQuery.data.artists.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-white/55">Artis Serupa</h4>
          <div className="space-y-1">
            {relatedQuery.data.artists.slice(0, 5).map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => navigate({ name: 'artist', id: art.browseId || art.id })}
                className="w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <ArtworkImage
                  src={art.thumbnail}
                  alt={art.title}
                  type="artist"
                  className="w-9 h-9"
                  roundedClass="rounded-full"
                />
                <span className="text-xs font-medium text-white truncate">{art.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onAddToPlaylist(track)}
        className="w-full py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-white/80 transition-colors"
      >
        Simpan ke Playlist
      </button>
    </div>
  );
}

export function RightPanel({ onAddToPlaylist }: RightPanelProps) {
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playerError = usePlayerStore((s) => s.playerError);

  const navigate = useNavigationStore((s) => s.navigate);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const trackKey = getTrackUniqueId(currentTrack);
  const localPlaying = isLocalTrack(currentTrack);
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  if (!rightPanelOpen) return null;

  return (
    <aside
      aria-label="Panel sedang diputar"
      className="hidden lg:flex flex-col w-[320px] xl:w-[348px] shrink-0 glass-panel rounded-2xl overflow-hidden transition-all duration-200"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.08]">
        <h2 className="text-sm font-semibold text-white">Sedang diputar</h2>
        <button
          type="button"
          onClick={() => setRightPanelOpen(false)}
          aria-label="Tutup panel sedang diputar"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentTrack ? (
          <div className="space-y-3">
            {localPlaying ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/[0.04] border border-white/[0.08]">
                {currentTrack.thumbnail ? (
                  <ArtworkImage
                    src={currentTrack.thumbnail}
                    alt={currentTrack.title}
                    type="local"
                    className="w-full h-full"
                    roundedClass="rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/45">
                    <Headphones className="w-10 h-10 text-[#2EE6A6]/75" strokeWidth={1.6} />
                    <span className="text-xs">Audio File Lokal</span>
                  </div>
                )}
              </div>
            ) : (
              <div
                data-yt-visible-slot="true"
                className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-white/[0.08]"
              >
                <ArtworkImage
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  type={currentTrack.type}
                  className="w-full h-full opacity-35"
                  roundedClass="rounded-xl"
                />
              </div>
            )}

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white truncate">
                  {currentTrack.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-1 text-xs text-white/60 mt-0.5">
                  {currentTrack.artists.map((artist, idx) => (
                    <span key={`${artist.name}-${idx}`} className="inline-flex items-center">
                      {idx > 0 && <span className="mr-1">,</span>}
                      {artist.id ? (
                        <button
                          type="button"
                          onClick={() => navigate({ name: 'artist', id: artist.id! })}
                          className="hover:text-white hover:underline text-left"
                        >
                          {artist.name}
                        </button>
                      ) : (
                        <span>{artist.name}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleLike(currentTrack)}
                  aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu ini'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    liked ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-[#2EE6A6]' : ''}`} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => onAddToPlaylist(currentTrack)}
                  aria-label="Simpan lagu ke playlist"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors"
                >
                  <ListPlus className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    openMenu(rect.right - 220, rect.bottom + 6, currentTrack, { onAddToPlaylist });
                  }}
                  aria-label="Opsi lagu sedang diputar"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {playerError && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
                {playerError}
              </p>
            )}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-5 text-center space-y-2">
            <p className="text-sm font-medium text-white/80">Belum ada lagu diputar</p>
            <p className="text-xs text-white/45">
              Pilih lagu dari Beranda atau Cari untuk mulai memutar musik.
            </p>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Tab panel sedang diputar"
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/[0.06]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'queue'}
            onClick={() => setRightPanelTab('queue')}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              rightPanelTab === 'queue'
                ? 'bg-white/[0.1] text-[#2EE6A6]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" strokeWidth={1.75} />
            Antrean
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'lyrics'}
            onClick={() => setRightPanelTab('lyrics')}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              rightPanelTab === 'lyrics'
                ? 'bg-white/[0.1] text-[#2EE6A6]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            Lirik
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'details'}
            onClick={() => setRightPanelTab('details')}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              rightPanelTab === 'details'
                ? 'bg-white/[0.1] text-[#2EE6A6]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.75} />
            {localPlaying ? 'Info' : 'Kredit'}
          </button>
        </div>

        <div>
          {rightPanelTab === 'queue' ? (
            <QueueView />
          ) : rightPanelTab === 'lyrics' ? (
            <LyricsView />
          ) : currentTrack ? (
            localPlaying ? (
              <LocalFileDetails track={currentTrack} />
            ) : (
              <SongDetailsAndRelated track={currentTrack} onAddToPlaylist={onAddToPlaylist} />
            )
          ) : (
            <p className="text-xs text-white/45 py-8 text-center">
              Putar lagu untuk melihat kredit dan lagu terkait.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
