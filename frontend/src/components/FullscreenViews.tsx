import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  Check,
  ChevronDown,
  ListMusic,
  Mic2,
  Minimize2,
  MonitorSpeaker,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Share,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  X,
} from 'lucide-react';
import { fetchLyrics } from '../api/client';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import {
  findActiveLyricIndex,
  formatArtists,
  formatNegativeRemaining,
  formatTime,
  getPlayableVideoId,
  getTrackUniqueId,
} from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsPreviewCard } from './LyricsPreviewCard';
import { QueueView } from './QueueView';
import { TrackActionSheet } from './TrackActionSheet';

function computeKaraokeCanvasBg(r: number, g: number, b: number): string {
  const maxC = Math.max(r, g, b, 1);
  const minC = Math.min(r, g, b);
  const isNearGray = maxC - minC < 18;
  const baseR = isNearGray ? 32 : r;
  const baseG = isNearGray ? 98 : g;
  const baseB = isNearGray ? 70 : b;
  const scale = Math.min(1.5, 118 / Math.max(baseR, baseG, baseB, 1));
  const outR = Math.round(Math.min(145, Math.max(20, baseR * scale)));
  const outG = Math.round(Math.min(145, Math.max(28, baseG * scale)));
  const outB = Math.round(Math.min(145, Math.max(24, baseB * scale)));
  return `rgb(${outR}, ${outG}, ${outB})`;
}

export function FullscreenKaraokeModal() {
  const karaokeOpen = usePlayerStore((s) => s.karaokeOpen);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lyricsBrowseId = usePlayerStore((s) => s.lyricsBrowseId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const ambientColor = usePlayerStore((s) => s.ambientColor);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);

  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const videoId = getPlayableVideoId(currentTrack);
  const artistName = currentTrack ? formatArtists(currentTrack.artists) : '';

  const { data, isLoading } = useQuery({
    queryKey: ['lyrics', currentTrack?.id, lyricsBrowseId, currentTrack?.title, artistName],
    queryFn: ({ signal }) =>
      fetchLyrics(
        {
          browseId: lyricsBrowseId,
          videoId,
          title: currentTrack!.title,
          artist: artistName,
          album: currentTrack!.album?.name,
          durationSeconds: currentTrack!.durationSeconds,
        },
        signal,
      ),
    enabled: karaokeOpen && Boolean(currentTrack?.title || lyricsBrowseId),
  });

  const activeIndex = data?.hasTimestamps
    ? findActiveLyricIndex(data.lines, currentTime * 1000)
    : -1;

  useEffect(() => {
    if (karaokeOpen && activeIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [karaokeOpen, activeIndex]);

  useEffect(() => {
    if (!karaokeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKaraokeOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [karaokeOpen, setKaraokeOpen]);

  if (!karaokeOpen || !currentTrack) return null;

  const safeDuration = duration > 0 ? duration : currentTrack.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;
  const canvasBg = computeKaraokeCanvasBg(ambientColor.r, ambientColor.g, ambientColor.b);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mode lirik layar penuh"
      className="fixed inset-0 z-[60] flex flex-col transition-colors duration-500"
      style={{
        backgroundColor: canvasBg,
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.42) 100%)`,
      }}
    >
      <header className="px-5 sm:px-8 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ArtworkImage
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            type={currentTrack.type}
            className="w-11 h-11 shadow-md"
            roundedClass="rounded-lg"
          />
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-bold text-white truncate">
              {currentTrack.title}
            </p>
            <p className="text-xs sm:text-sm text-white/75 truncate">
              {formatArtists(currentTrack.artists)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {data?.source && (
            <span className="hidden sm:inline text-xs font-semibold text-white/60">
              Lirik · {data.source}
            </span>
          )}
          <button
            type="button"
            onClick={() => setKaraokeOpen(false)}
            aria-label="Keluar dari mode lirik"
            className="w-10 h-10 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center text-white transition-colors"
          >
            <Minimize2 className="w-4.5 h-4.5" strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 sm:px-14 md:px-20 py-6">
        {isLoading ? (
          <div className="max-w-3xl mx-auto space-y-5 py-12 animate-pulse">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-lg bg-white/20"
                style={{ width: `${55 + ((i * 19) % 38)}%` }}
              />
            ))}
          </div>
        ) : data?.hasTimestamps && data.lines.length > 0 ? (
          <div className="w-full max-w-3xl mx-auto space-y-5 sm:space-y-6 text-left py-8 sm:py-12">
            {data.lines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = activeIndex >= 0 && idx < activeIndex;
              return (
                <button
                  key={`${line.startTimeMs}-${idx}`}
                  ref={isActive ? activeLineRef : undefined}
                  type="button"
                  onClick={() => requestSeek(line.startTimeMs / 1000)}
                  className={`block w-full text-left transition-all duration-200 leading-tight tracking-tight ${
                    isActive
                      ? 'text-2xl sm:text-4xl font-extrabold text-white'
                      : isPast
                        ? 'text-xl sm:text-3xl font-bold text-white/40 hover:text-white/80'
                        : 'text-xl sm:text-3xl font-bold text-white/75 hover:text-white'
                  }`}
                >
                  {line.text}
                </button>
              );
            })}
            <p className="pt-8 text-xs font-medium text-white/50">
              Sumber lirik: LRCLIB
            </p>
          </div>
        ) : data?.plainText ? (
          <div className="w-full max-w-3xl mx-auto text-left py-8 sm:py-12 space-y-6">
            <p className="text-xl sm:text-3xl font-bold text-white/95 whitespace-pre-line leading-relaxed">
              {data.plainText}
            </p>
            <p className="text-xs font-medium text-white/50">
              Sumber lirik: LRCLIB (lirik statis)
            </p>
          </div>
        ) : (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 text-white/75">
            <Mic2 className="w-9 h-9 text-white/60" strokeWidth={1.75} />
            <p className="text-base font-bold text-white">Lirik belum tersedia untuk lagu ini.</p>
          </div>
        )}
      </div>

      <footer className="px-6 py-4 bg-black/25 backdrop-blur-md shrink-0">
        <div className="max-w-xl mx-auto space-y-3">
          <div className="space-y-1.5">
            <input
              type="range"
              aria-label="Posisi lagu"
              min={0}
              max={safeDuration || 100}
              step={0.5}
              value={Math.min(currentTime, safeDuration || 100)}
              disabled={!currentTrack || safeDuration <= 0}
              onChange={(e) => requestSeek(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #FFFFFF ${progressPct}%, rgba(255,255,255,0.28) ${progressPct}%)`,
              }}
              className="sc-range w-full h-1 rounded-full disabled:opacity-40"
            />
            <div className="flex justify-between text-[11px] text-white/75 tabular-nums font-medium">
              <span>{formatTime(currentTime)}</span>
              <span>{formatNegativeRemaining(currentTime, safeDuration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-7">
            <button
              type="button"
              onClick={prevTrack}
              aria-label="Lagu sebelumnya"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/85 hover:text-white"
            >
              <SkipBack className="w-6 h-6 fill-current" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
              className="w-14 h-14 rounded-full bg-white text-[#0F1F17] flex items-center justify-center hover:scale-105 transition"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" strokeWidth={2} />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={nextTrack}
              aria-label="Lagu berikutnya"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/85 hover:text-white"
            >
              <SkipForward className="w-6 h-6 fill-current" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface FullscreenNowPlayingModalProps {
  onAddToPlaylist?: (track: MediaItem) => void;
}

export function FullscreenNowPlayingModal({ onAddToPlaylist }: FullscreenNowPlayingModalProps) {
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetSubView, setActionSheetSubView] = useState<'main' | 'sleep' | 'code'>('main');
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);

  const open = usePlayerStore((s) => s.fullscreenNowPlaying);
  const setOpen = usePlayerStore((s) => s.setFullscreenNowPlaying);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const ambientColor = usePlayerStore((s) => s.ambientColor);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const trackKey = getTrackUniqueId(currentTrack);
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const excludeFromTaste = useLibraryStore((s) => s.excludeFromTaste);

  const navigate = useNavigationStore((s) => s.navigate);
  const showToast = useContextMenuStore((s) => s.showToast);

  useEffect(() => {
    if (!open) {
      setActionSheetOpen(false);
      setQueueDrawerOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionSheetOpen && !queueDrawerOpen) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen, actionSheetOpen, queueDrawerOpen]);

  if (!open || !currentTrack) return null;

  const safeDuration = duration > 0 ? duration : currentTrack.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  const handleShareCurrent = async () => {
    const vid = getPlayableVideoId(currentTrack);
    const url = vid
      ? `${window.location.origin}/?play=${encodeURIComponent(vid)}`
      : `${window.location.origin}/?open=${encodeURIComponent(currentTrack.type)}:${encodeURIComponent(currentTrack.id)}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: currentTrack.title,
          text: `${currentTrack.title} — ${formatArtists(currentTrack.artists)}`,
          url,
        });
        return;
      }
    } catch {
      // Fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Tautan lagu disalin ke papan klip');
    } catch {
      showToast('Gagal menyalin tautan');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mode sedang diputar layar penuh"
      className="fixed inset-0 z-50 flex flex-col bg-[#080B09] overflow-y-auto"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.55) 0%, rgba(10, 14, 12, 0.96) 62%, #070A08 100%)`,
      }}
    >
      {/* Top Bar matching IMG_4317 */}
      <header className="w-full max-w-2xl mx-auto px-5 pt-4 pb-2 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Tutup sedang diputar layar penuh"
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors"
        >
          <ChevronDown className="w-6 h-6" strokeWidth={2} />
        </button>

        <span className="text-xs sm:text-sm font-semibold text-white/90 truncate text-center">
          {sourceLabel || `Radio ${currentTrack.title}`}
        </span>

        <button
          type="button"
          onClick={() => {
            setActionSheetSubView('main');
            setActionSheetOpen(true);
          }}
          aria-label="Opsi lagu lainnya"
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
        </button>
      </header>

      <div className="flex-1 w-full max-w-md mx-auto px-6 py-2 pb-6 flex flex-col justify-center gap-4">
        {/* Square Artwork */}
        <div className="w-full aspect-square max-w-[330px] mx-auto shadow-2xl shadow-black/60 rounded-2xl overflow-hidden">
          <ArtworkImage
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            type={currentTrack.type}
            className="w-full h-full"
            roundedClass="rounded-2xl"
          />
        </div>

        <div className="space-y-4">
          {/* Title + Artist on left, X (exclude from taste) + Circular Add/Check on right */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white truncate tracking-tight">
                {currentTrack.title}
              </h2>
              <p className="text-sm text-white/70 truncate mt-0.5">
                {formatArtists(currentTrack.artists)}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (trackKey) excludeFromTaste(trackKey);
                  showToast('Lagu dikecualikan dari profil selera');
                  nextTrack();
                }}
                aria-label="Kecualikan lagu ini"
                title="Kecualikan dari selera & lewati"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Ban className="w-5 h-5" strokeWidth={1.85} />
              </button>

              <button
                type="button"
                onClick={() => toggleLike(currentTrack)}
                aria-label={liked ? 'Hapus dari Lagu yang Disukai' : 'Tambahkan ke Lagu yang Disukai'}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  liked
                    ? 'bg-[#19EE8A] text-[#0F1F17]'
                    : 'border-2 border-white/85 text-white hover:border-[#19EE8A] hover:text-[#19EE8A]'
                }`}
              >
                {liked ? (
                  <Check className="w-4 h-4" strokeWidth={2.75} />
                ) : (
                  <Plus className="w-4.5 h-4.5" strokeWidth={2.4} />
                )}
              </button>
            </div>
          </div>

          {/* Scrubber with elapsed left and -remaining right */}
          <div className="space-y-1.5">
            <input
              type="range"
              aria-label="Posisi lagu"
              min={0}
              max={safeDuration || 100}
              step={0.5}
              value={Math.min(currentTime, safeDuration || 100)}
              disabled={!currentTrack || safeDuration <= 0}
              onChange={(e) => requestSeek(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #FFFFFF ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%)`,
              }}
              className="sc-range w-full h-1 rounded-full disabled:opacity-40"
            />
            <div className="flex justify-between text-xs text-white/65 tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>{formatNegativeRemaining(currentTime, safeDuration)}</span>
            </div>
          </div>

          {/* 5-Button Transport matching IMG_4317 */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label="Acak urutan"
              aria-pressed={shuffle}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                shuffle ? 'text-[#19EE8A]' : 'text-white/75 hover:text-white'
              }`}
            >
              <Shuffle className="w-5 h-5" strokeWidth={2} />
              {shuffle && (
                <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#19EE8A]" />
              )}
            </button>

            <button
              type="button"
              onClick={prevTrack}
              aria-label="Lagu sebelumnya"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:scale-105 transition-transform"
            >
              <SkipBack className="w-7 h-7 fill-current" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
              className="w-16 h-16 rounded-full bg-white text-[#0F1F17] flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" strokeWidth={2} />
              ) : (
                <Play className="w-7 h-7 fill-current ml-0.5" strokeWidth={2} />
              )}
            </button>

            <button
              type="button"
              onClick={nextTrack}
              aria-label="Lagu berikutnya"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:scale-105 transition-transform"
            >
              <SkipForward className="w-7 h-7 fill-current" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={() => {
                setActionSheetSubView('sleep');
                setActionSheetOpen(true);
              }}
              aria-label="Pengatur waktu tidur"
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                sleepTimerMode !== 'off' ? 'text-[#19EE8A]' : 'text-white/75 hover:text-white'
              }`}
            >
              <Timer className="w-5 h-5" strokeWidth={2} />
              {sleepTimerMode !== 'off' && (
                <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#19EE8A]" />
              )}
            </button>
          </div>

          {/* Utility Row: Audio/Device left, Share + Queue right */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate({ name: 'settings', tab: 'sound', focusEq: false });
              }}
              aria-label="Pengaturan Audio & Perangkat"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 transition-colors"
            >
              <MonitorSpeaker className="w-5 h-5" strokeWidth={1.85} />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleShareCurrent()}
                aria-label="Bagikan lagu"
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Share className="w-5 h-5" strokeWidth={1.85} />
              </button>
              <button
                type="button"
                onClick={() => setQueueDrawerOpen(true)}
                aria-label="Buka antrean"
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ListMusic className="w-5 h-5" strokeWidth={1.85} />
              </button>
            </div>
          </div>

          {/* Pratinjau Lirik Card */}
          <LyricsPreviewCard
            onOpenKaraoke={() => {
              setOpen(false);
              setKaraokeOpen(true);
            }}
          />
        </div>
      </div>

      {/* Queue Drawer */}
      {queueDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Antrean lagu"
          className="fixed inset-0 z-[65] flex items-end md:items-center justify-center"
        >
          <button
            type="button"
            aria-label="Tutup antrean"
            onClick={() => setQueueDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full md:max-w-lg max-h-[78vh] rounded-t-3xl md:rounded-2xl bg-[#101513] border-t md:border border-white/[0.12] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#E8FFF3]">Antrean Pemutaran</h3>
              <button
                type="button"
                onClick={() => setQueueDrawerOpen(false)}
                aria-label="Tutup antrean"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <QueueView />
            </div>
          </div>
        </div>
      )}

      {/* Three-dots Track Action Sheet */}
      <TrackActionSheet
        open={actionSheetOpen}
        track={currentTrack}
        initialSubView={actionSheetSubView}
        onClose={() => setActionSheetOpen(false)}
        onAddToPlaylist={(tr) => onAddToPlaylist?.(tr)}
      />
    </div>
  );
}
