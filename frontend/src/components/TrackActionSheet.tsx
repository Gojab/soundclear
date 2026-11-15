import { useEffect, useState } from 'react';
import {
  AudioLines,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Disc3,
  FileText,
  Heart,
  ListPlus,
  MessageSquareText,
  PlusCircle,
  Radio,
  Share,
  Timer,
  UserCheck,
  X,
} from 'lucide-react';
import { fetchWatchPlaylist, postAccountRate } from '../api/client';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import {
  formatArtists,
  getPlayableVideoId,
  getTrackUniqueId,
  isLocalTrack,
} from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface TrackActionSheetProps {
  open: boolean;
  track: MediaItem | null;
  onClose: () => void;
  onAddToPlaylist: (track: MediaItem) => void;
  initialSubView?: 'main' | 'sleep' | 'code';
}

function buildSoundClearCodeBars(seed: string): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < 23; i += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const h = 24 + (Math.abs(hash) % 72);
    bars.push(h);
  }
  bars[0] = 38;
  bars[11] = 92;
  bars[22] = 38;
  return bars;
}

export function TrackActionSheet({
  open,
  track,
  onClose,
  onAddToPlaylist,
  initialSubView = 'main',
}: TrackActionSheetProps) {
  const [subView, setSubView] = useState<'main' | 'sleep' | 'code'>(initialSubView);

  const navigate = useNavigationStore((s) => s.navigate);
  const showToast = useContextMenuStore((s) => s.showToast);
  const openCredits = useContextMenuStore((s) => s.openCredits);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const setMobileExpanded = usePlayerStore((s) => s.setMobileExpanded);
  const setFullscreenNowPlaying = usePlayerStore((s) => s.setFullscreenNowPlaying);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerMinutes = usePlayerStore((s) => s.sleepTimerMinutes);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);

  const isLiked = useLibraryStore((s) => s.isLiked);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isTrackHidden = useLibraryStore((s) => s.isTrackHidden);
  const hideTrack = useLibraryStore((s) => s.hideTrack);
  const unhideTrack = useLibraryStore((s) => s.unhideTrack);
  const isExcludedFromTaste = useLibraryStore((s) => s.isExcludedFromTaste);
  const excludeFromTaste = useLibraryStore((s) => s.excludeFromTaste);
  const includeInTaste = useLibraryStore((s) => s.includeInTaste);

  const lyricsPreviewEnabled = useSettingsStore((s) => s.lyricsPreviewEnabled);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  useEffect(() => {
    if (open) {
      setSubView(initialSubView);
    }
  }, [open, initialSubView]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !track) return null;

  const trackKey = getTrackUniqueId(track);
  const videoId = getPlayableVideoId(track);
  const localFile = isLocalTrack(track);
  const liked = isLiked(trackKey);
  const hidden = isTrackHidden(trackKey);
  const excludedTaste = isExcludedFromTaste(trackKey);
  const primaryArtist = track.artists.find((a) => Boolean(a.id)) || track.artists[0] || null;
  const primaryAlbum = track.album?.id ? track.album : null;

  const shareUrl =
    typeof window !== 'undefined'
      ? videoId
        ? `${window.location.origin}/?play=${encodeURIComponent(videoId)}`
        : `${window.location.origin}/?open=${encodeURIComponent(track.type)}:${encodeURIComponent(track.id)}`
      : '';

  const handleShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && shareUrl) {
        await navigator.share({
          title: track.title,
          text: `${track.title} — ${formatArtists(track.artists)}`,
          url: shareUrl,
        });
        onClose();
        return;
      }
    } catch {
      // Fallback to clipboard below
    }
    try {
      if (shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Tautan lagu disalin ke papan klip');
      }
    } catch {
      showToast('Gagal menyalin tautan lagu');
    }
    onClose();
  };

  const handleOpenRadio = async () => {
    onClose();
    if (!videoId) {
      showToast('Radio tidak tersedia untuk lagu lokal');
      return;
    }
    try {
      const watch = await fetchWatchPlaylist(videoId, true, track.playlistId);
      if (watch.tracks.length > 0) {
        playTrackList(watch.tracks, 0, `Radio ${track.title}`);
      } else {
        showToast('Radio belum tersedia untuk lagu ini');
      }
    } catch {
      showToast('Gagal memuat radio lagu');
    }
  };

  const navigateAndCollapse = (route: Parameters<typeof navigate>[0]) => {
    onClose();
    setMobileExpanded(false);
    setFullscreenNowPlaying(false);
    navigate(route);
  };

  const bars = buildSoundClearCodeBars(trackKey || track.title);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Opsi lagu ${track.title}`}
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center"
    >
      <button
        type="button"
        aria-label="Tutup menu opsi lagu"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full md:max-w-md max-h-[88vh] flex flex-col rounded-t-3xl md:rounded-2xl bg-[#121614] border-t md:border border-white/[0.12] shadow-2xl overflow-hidden">
        {/* Drag handle */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>

        {/* Track header */}
        <div className="px-5 py-3 flex items-center gap-3.5 border-b border-white/[0.09] shrink-0">
          <ArtworkImage
            src={track.thumbnail}
            alt={track.title}
            type={track.type}
            className="w-11 h-11"
            roundedClass="rounded-md"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#E8FFF3] truncate">{track.title}</p>
            <p className="text-xs text-[#B3F7D1]/65 truncate mt-0.5">
              {formatArtists(track.artists)}
              {track.album?.name ? ` • ${track.album.name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {subView === 'sleep' ? (
          <div className="p-4 space-y-3 overflow-y-auto">
            <button
              type="button"
              onClick={() => setSubView('main')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#19EE8A] hover:underline"
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali ke opsi lagu
            </button>
            <h3 className="text-base font-bold text-[#E8FFF3]">Pengatur waktu tidur</h3>
            <div className="space-y-1">
              {[
                { label: 'Matikan pengatur waktu', mode: 'off' as const, min: undefined },
                { label: '15 menit', mode: 'minutes' as const, min: 15 },
                { label: '30 menit', mode: 'minutes' as const, min: 30 },
                { label: '45 menit', mode: 'minutes' as const, min: 45 },
                { label: '60 menit', mode: 'minutes' as const, min: 60 },
                { label: 'Akhir lagu ini', mode: 'end_of_track' as const, min: undefined },
              ].map((opt) => {
                const active =
                  opt.mode === 'off'
                    ? sleepTimerMode === 'off'
                    : opt.mode === 'end_of_track'
                      ? sleepTimerMode === 'end_of_track'
                      : sleepTimerMode === 'minutes' && sleepTimerMinutes === opt.min;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setSleepTimer(opt.mode, opt.min);
                      showToast(
                        opt.mode === 'off'
                          ? 'Pengatur waktu tidur dimatikan'
                          : opt.mode === 'end_of_track'
                            ? 'Pemutaran berhenti di akhir lagu'
                            : `Pengatur waktu tidur disetel ${opt.min} menit`,
                      );
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#19EE8A]/15 text-[#19EE8A]'
                        : 'text-[#E8FFF3]/90 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <Check className="w-4 h-4 text-[#19EE8A]" strokeWidth={2.4} />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : subView === 'code' ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            <button
              type="button"
              onClick={() => setSubView('main')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#19EE8A] hover:underline"
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali ke opsi lagu
            </button>

            <div className="rounded-2xl bg-[#0A0E0C] border border-white/[0.12] p-5 flex flex-col items-center text-center gap-4">
              <ArtworkImage
                src={track.thumbnail}
                alt={track.title}
                type={track.type}
                className="w-44 h-44 shadow-xl"
                roundedClass="rounded-xl"
              />
              <div>
                <p className="text-base font-bold text-[#E8FFF3]">{track.title}</p>
                <p className="text-xs text-[#B3F7D1]/70 mt-0.5">{formatArtists(track.artists)}</p>
              </div>
              <div
                aria-label="Kode gelombang SoundClear"
                className="w-full max-w-[260px] h-14 px-4 rounded-xl bg-[#19EE8A] flex items-center justify-center gap-[4px]"
              >
                <span className="w-3 h-3 rounded-full bg-[#0F1F17] shrink-0 mr-1" />
                {bars.map((pct, i) => (
                  <span
                    key={i}
                    style={{ height: `${pct}%` }}
                    className="w-[3px] rounded-full bg-[#0F1F17]"
                  />
                ))}
              </div>
              {shareUrl && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(shareUrl)
                      .then(() => showToast('Tautan Kode SoundClear disalin'));
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-[#E8FFF3]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin Tautan Lagu
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-2 px-2 overflow-y-auto space-y-0.5 pb-6">
            {/* 1. Bagikan */}
            <button
              type="button"
              onClick={() => void handleShare()}
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
            >
              <Share className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
              <span className="text-sm font-medium text-[#E8FFF3]">Bagikan</span>
            </button>

            {/* 2. Lirik • Aktif / Nonaktif */}
            <button
              type="button"
              onClick={() => {
                const next = !lyricsPreviewEnabled;
                updateSetting('lyricsPreviewEnabled', next);
                showToast(next ? 'Pratinjau lirik diaktifkan' : 'Pratinjau lirik dinonaktifkan');
              }}
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
            >
              <MessageSquareText className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
              <span className="text-sm font-medium text-[#E8FFF3]">
                Lirik •{' '}
                <span className={lyricsPreviewEnabled ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/60'}>
                  {lyricsPreviewEnabled ? 'Aktif' : 'Nonaktif'}
                </span>
              </span>
            </button>

            {/* 3. Tambahkan ke Lagu yang Disukai */}
            <button
              type="button"
              onClick={() => {
                toggleLike(track);
                if (trackKey && !localFile) {
                  void postAccountRate(trackKey, liked ? 'INDIFFERENT' : 'LIKE').catch(() => {});
                }
                showToast(liked ? 'Dihapus dari Lagu yang Disukai' : 'Ditambahkan ke Lagu yang Disukai');
                onClose();
              }}
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
            >
              <span
                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  liked
                    ? 'bg-[#19EE8A] text-[#0F1F17]'
                    : 'bg-gradient-to-br from-[#19EE8A] to-[#01BA53] text-[#0F1F17]'
                }`}
              >
                <Heart className="w-3 h-3 fill-current" strokeWidth={2.2} />
              </span>
              <span className="text-sm font-medium text-[#E8FFF3]">
                {liked ? 'Hapus dari Lagu yang Disukai' : 'Tambahkan ke Lagu yang Disukai'}
              </span>
            </button>

            {/* 4. Tambahkan ke playlist */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onAddToPlaylist(track);
              }}
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
            >
              <PlusCircle className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
              <span className="text-sm font-medium text-[#E8FFF3]">Tambahkan ke playlist</span>
            </button>

            {/* 5. Sembunyikan lagu */}
            {trackKey && (
              <button
                type="button"
                onClick={() => {
                  if (hidden) {
                    unhideTrack(trackKey);
                    showToast('Lagu ditampilkan kembali');
                  } else {
                    hideTrack(trackKey);
                    showToast('Lagu disembunyikan');
                    if (getTrackUniqueId(currentTrack) === trackKey) {
                      nextTrack();
                    }
                  }
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <X className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">
                  {hidden ? 'Tampilkan lagu ini' : 'Sembunyikan lagu'}
                </span>
              </button>
            )}

            {/* 6. Kecualikan lagu dari profil selera */}
            {trackKey && (
              <button
                type="button"
                onClick={() => {
                  if (excludedTaste) {
                    includeInTaste(trackKey);
                    showToast('Lagu dikembalikan ke profil selera');
                  } else {
                    excludeFromTaste(trackKey);
                    showToast('Lagu dikecualikan dari profil selera');
                    if (getTrackUniqueId(currentTrack) === trackKey) {
                      nextTrack();
                    }
                  }
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <Ban
                  className={`w-5 h-5 shrink-0 ${
                    excludedTaste ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/80'
                  }`}
                  strokeWidth={1.85}
                />
                <span className="text-sm font-medium text-[#E8FFF3]">
                  {excludedTaste
                    ? 'Sertakan kembali di profil selera'
                    : 'Kecualikan lagu dari profil selera'}
                </span>
              </button>
            )}

            {/* 7. Muat ke Antrean */}
            {trackKey && (
              <button
                type="button"
                onClick={() => {
                  playNextInQueue(track);
                  showToast('Dimuat ke Antrean');
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <ListPlus className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">Muat ke Antrean</span>
              </button>
            )}

            {/* 8. Buka radio & Buat Mix */}
            {videoId && (
              <>
                <button
                  type="button"
                  onClick={() => void handleOpenRadio()}
                  className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
                >
                  <Radio className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                  <span className="text-sm font-medium text-[#E8FFF3]">Buka radio</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateAndCollapse({ name: 'create-mix', seedTrack: track })}
                  className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
                >
                  <Disc3 className="w-5 h-5 text-[#19EE8A] shrink-0" strokeWidth={1.85} />
                  <span className="text-sm font-medium text-[#E8FFF3]">Buat Mix dari lagu ini</span>
                </button>
              </>
            )}

            {/* 9. Buka album */}
            {(primaryAlbum || track.album?.name) && (
              <button
                type="button"
                onClick={() => {
                  if (primaryAlbum?.id) {
                    navigateAndCollapse({
                      name: 'album',
                      id: primaryAlbum.id,
                      fallbackQuery: primaryAlbum.name,
                    });
                  } else if (track.album?.name) {
                    navigateAndCollapse({
                      name: 'search',
                      query: `${track.album.name} ${primaryArtist?.name || ''}`.trim(),
                      filter: 'albums',
                    });
                  }
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <Disc3 className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">Buka album</span>
              </button>
            )}

            {/* 10. Buka artis */}
            {primaryArtist && (
              <button
                type="button"
                onClick={() => {
                  if (primaryArtist.id) {
                    navigateAndCollapse({
                      name: 'artist',
                      id: primaryArtist.id,
                      fallbackQuery: primaryArtist.name,
                    });
                  } else {
                    navigateAndCollapse({
                      name: 'search',
                      query: primaryArtist.name,
                      filter: 'artists',
                    });
                  }
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <UserCheck className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">Buka artis</span>
              </button>
            )}

            {/* 11. Lihat kredit lagu */}
            {videoId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openCredits(track);
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
              >
                <FileText className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">Lihat kredit lagu</span>
              </button>
            )}

            {/* 12. Pengatur waktu tidur */}
            <button
              type="button"
              onClick={() => setSubView('sleep')}
              className="w-full flex items-center justify-between gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
            >
              <span className="flex items-center gap-3.5">
                <Timer className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">Pengatur waktu tidur</span>
              </span>
              {sleepTimerMode !== 'off' && (
                <span className="text-xs font-semibold text-[#19EE8A]">
                  {sleepTimerMode === 'end_of_track' ? 'Akhir lagu' : `${sleepTimerMinutes} mnt`}
                </span>
              )}
            </button>

            {/* 13. Tampilkan Kode SoundClear */}
            <button
              type="button"
              onClick={() => setSubView('code')}
              className="w-full flex items-center justify-between gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
            >
              <span className="flex items-center gap-3.5">
                <AudioLines className="w-5 h-5 text-[#B3F7D1]/80 shrink-0" strokeWidth={1.85} />
                <span className="text-sm font-medium text-[#E8FFF3]">Tampilkan Kode SoundClear</span>
              </span>
              <ChevronRight className="w-4 h-4 text-[#B3F7D1]/50 shrink-0" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
