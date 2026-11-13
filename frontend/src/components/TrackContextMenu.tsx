import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Disc3,
  Download,
  EyeOff,
  FileText,
  Heart,
  ListEnd,
  ListPlus,
  ListStart,
  Radio,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { fetchSongCredits, fetchWatchPlaylist, postAccountRate } from '../api/client';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatArtists, getPlayableVideoId, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';

export function GlobalTrackContextMenu({
  onAddToPlaylist,
}: {
  onAddToPlaylist: (track: import('../types/music').MediaItem) => void;
}) {
  const { open, x, y, track, options, creditsTrack, toastMessage } = useContextMenuStore();
  const closeMenu = useContextMenuStore((s) => s.closeMenu);
  const openCredits = useContextMenuStore((s) => s.openCredits);
  const closeCredits = useContextMenuStore((s) => s.closeCredits);
  const showToast = useContextMenuStore((s) => s.showToast);

  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const isLiked = useLibraryStore((s) => s.isLiked);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const hideTrack = useLibraryStore((s) => s.hideTrack);
  const unhideTrack = useLibraryStore((s) => s.unhideTrack);
  const isTrackHidden = useLibraryStore((s) => s.isTrackHidden);
  const isTrackDownloadedOffline = useLibraryStore((s) => s.isTrackDownloadedOffline);
  const downloadTrackOffline = useLibraryStore((s) => s.downloadTrackOffline);
  const deleteOfflineDownload = useLibraryStore((s) => s.deleteOfflineDownload);
  const downloadQuality = useSettingsStore((s) => s.localProfile.downloadQuality);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeMenu]);

  const trackKey = getTrackUniqueId(track);
  const localFile = isLocalTrack(track);
  const liked = isLiked(trackKey);
  const hidden = isTrackHidden(trackKey);
  const downloadedOffline = isTrackDownloadedOffline(trackKey);
  const primaryArtist = track?.artists.find((a) => Boolean(a.id));
  const primaryAlbum = track?.album?.id ? track.album : null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const menuLeft = Math.max(12, Math.min(x, vw - 248));
  const menuTop = Math.max(12, Math.min(y, vh - 390));

  const handleCopyLink = async () => {
    if (!track) return;
    const vid = getPlayableVideoId(track);
    const origin = window.location.origin;
    const link = vid
      ? `${origin}/?play=${encodeURIComponent(vid)}`
      : `${origin}/?open=${encodeURIComponent(track.type)}:${encodeURIComponent(track.id)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Tautan disalin ke papan klip');
    } catch {
      showToast('Gagal menyalin tautan');
    }
    closeMenu();
  };

  const handleStartRadio = async () => {
    if (!track) return;
    const vid = getPlayableVideoId(track);
    closeMenu();
    if (!vid) return;
    try {
      const watch = await fetchWatchPlaylist(vid, true, track.playlistId);
      if (watch.tracks.length > 0) {
        playTrackList(watch.tracks, 0, `Radio: ${track.title}`);
      } else {
        showToast('Radio tidak tersedia untuk lagu ini');
      }
    } catch {
      showToast('Gagal memuat radio lagu');
    }
  };

  return (
    <>
      {open && track && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Menu untuk ${track.title}`}
          style={{ left: menuLeft, top: menuTop }}
          className="fixed z-50 w-56 glass-panel rounded-xl p-1.5 bg-[#131317]/95 shadow-2xl border border-white/[0.12] text-xs"
        >
          <div className="px-2.5 py-2 border-b border-white/[0.08] mb-1">
            <p className="font-semibold text-white truncate">{track.title}</p>
            <p className="text-[11px] text-white/50 truncate">{formatArtists(track.artists)}</p>
          </div>

          {trackKey && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  playNextInQueue(track);
                  showToast('Ditambahkan ke putar berikutnya');
                  closeMenu();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
              >
                <ListStart className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                <span>Putar berikutnya</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  addToQueue(track);
                  showToast('Ditambahkan ke antrean');
                  closeMenu();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
              >
                <ListEnd className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                <span>Tambah ke antrean</span>
              </button>
            </>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (options.onAddToPlaylist) {
                options.onAddToPlaylist(track);
              } else {
                onAddToPlaylist(track);
              }
              closeMenu();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
          >
            <ListPlus className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
            <span>Tambah ke playlist</span>
          </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleLike(track);
                  if (trackKey && !localFile) {
                    void postAccountRate(trackKey, liked ? 'INDIFFERENT' : 'LIKE').catch(() => {});
                  }
                  showToast(liked ? 'Dihapus dari Lagu Disukai' : 'Ditambahkan ke Lagu Disukai');
                  closeMenu();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
              >
                <Heart
                  className={`w-3.5 h-3.5 ${liked ? 'text-[#2EE6A6] fill-[#2EE6A6]' : 'text-white/60'}`}
                  strokeWidth={1.75}
                />
                <span>{liked ? 'Batal sukai' : 'Sukai lagu'}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (downloadedOffline && trackKey) {
                    void deleteOfflineDownload(trackKey);
                    showToast(`"${track.title}" dihapus dari Unduhan Offline`);
                  } else {
                    void downloadTrackOffline(track, downloadQuality)
                      .then((res) => {
                        if (res.ok) {
                          showToast(`"${track.title}" tersimpan untuk akses offline`);
                        } else {
                          showToast(res.reason || 'Gagal mengunduh lagu untuk offline');
                        }
                      })
                      .catch(() => {
                        showToast('Gagal mengunduh lagu untuk offline');
                      });
                  }
                  closeMenu();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
              >
                {downloadedOffline ? (
                  <Check className="w-3.5 h-3.5 text-[#2EE6A6]" strokeWidth={2} />
                ) : (
                  <Download className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                )}
                <span>{downloadedOffline ? 'Hapus dari offline' : 'Unduh offline'}</span>
              </button>

              {!localFile && <div className="my-1 border-t border-white/[0.08]" />}

              {primaryArtist?.id && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigate({
                      name: 'artist',
                      id: primaryArtist.id!,
                      fallbackQuery: primaryArtist.name,
                    });
                    closeMenu();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                  <span>Ke Artis</span>
                </button>
              )}

              {primaryAlbum?.id && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigate({
                      name: 'album',
                      id: primaryAlbum.id!,
                      fallbackQuery: primaryAlbum.name,
                    });
                    closeMenu();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
                >
                  <Disc3 className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                  <span>Ke Album</span>
                </button>
              )}

              {getPlayableVideoId(track) && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleStartRadio()}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
                  >
                    <Radio className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                    <span>Radio lagu</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openCredits(track)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                    <span>Kredit lagu</span>
                  </button>
                </>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const artistPart = track.artists[0]?.name || '';
                  const q = `${track.title} ${artistPart}`.trim();
                  navigate({ name: 'search', query: q, filter: 'songs' });
                  closeMenu();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
              >
                <Search className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                <span>Cari lagu serupa</span>
              </button>

              {!localFile && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleCopyLink()}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
                  <span>Salin tautan</span>
                </button>
              )}

          {trackKey && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (hidden) {
                  unhideTrack(trackKey);
                  showToast('Lagu ditampilkan kembali');
                } else {
                  hideTrack(trackKey);
                  showToast('Lagu disembunyikan');
                }
                closeMenu();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5 text-white/60" strokeWidth={1.75} />
              <span>{hidden ? 'Tampilkan lagu ini' : 'Sembunyikan lagu'}</span>
            </button>
          )}

          {options.onRemoveFromList && (
            <>
              <div className="my-1 border-t border-white/[0.08]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  options.onRemoveFromList?.();
                  closeMenu();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-red-300 hover:bg-red-500/15 text-left transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>{options.removeLabel || 'Hapus dari daftar'}</span>
              </button>
            </>
          )}
        </div>
      )}

      {creditsTrack && (
        <SongCreditsModal track={creditsTrack} onClose={closeCredits} />
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 md:bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#16181D]/95 border border-[#2EE6A6]/30 text-xs font-medium text-white shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </>
  );
}

function SongCreditsModal({
  track,
  onClose,
}: {
  track: import('../types/music').MediaItem;
  onClose: () => void;
}) {
  const videoId = getPlayableVideoId(track) || track.id;
  const query = useQuery({
    queryKey: ['song-credits', videoId, track.album?.id, track.creditsBrowseId],
    queryFn: ({ signal }) =>
      fetchSongCredits(videoId, track.album?.id, track.creditsBrowseId, signal),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kredit lagu"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md glass-panel rounded-2xl p-5 bg-[#121215]/95 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-white/50">Kredit Lagu</p>
            <h2 className="text-base font-semibold text-white truncate mt-0.5">{track.title}</h2>
            <p className="text-xs text-white/55 truncate">{formatArtists(track.artists)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kredit lagu"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2.5 animate-pulse py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-white/[0.06]" />
            ))}
          </div>
        ) : query.data && query.data.credits.length > 0 ? (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {query.data.credits.map((credit) => (
              <div
                key={credit.role}
                className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3.5 py-2.5"
              >
                <p className="text-[11px] font-medium text-white/50">{credit.role}</p>
                <p className="text-sm text-white mt-0.5">{credit.names.join(', ')}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 space-y-2 text-xs text-white/65">
            <p>Kredit terperinci tidak disediakan oleh sumber untuk lagu ini.</p>
            <p className="text-white/85">Artis: {formatArtists(track.artists)}</p>
            {track.album?.name && <p className="text-white/85">Album: {track.album.name}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
