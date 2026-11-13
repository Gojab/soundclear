import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { fetchLyrics } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  isDesktopNotchHost,
  publishDesktopNotchState,
  subscribeDesktopNotchCommands,
} from '../utils/notchDesktopBridge';
import {
  closeWindowsExternalNotch,
  renderVideoPiPFrame,
  resizeWindowsExternalNotch,
  syncVideoPiPPlayback,
  updateWindowsExternalNotchTitle,
  useExternalPiPState,
} from '../utils/notchExternalPiP';
import { isWindowsPlatform, resolveNotchDisplayLines } from '../utils/notchPlayer';
import { formatArtists, formatTime, getPlayableVideoId } from '../utils/playerLogic';
import { useNotchVisibility } from '../utils/useNotchVisibility';
import { ArtworkImage } from './ArtworkImage';

const COMPACT_WIDTH = 360;
const COMPACT_HEIGHT = 116;
const EXPANDED_WIDTH = 396;
const EXPANDED_HEIGHT = 160;

export function NotchMiniPlayer() {
  const shouldReduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [marqueeShiftPx, setMarqueeShiftPx] = useState(0);

  const notchRef = useRef<HTMLDivElement | null>(null);
  const titleViewportRef = useRef<HTMLDivElement | null>(null);
  const titleMeasureRef = useRef<HTMLSpanElement | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const lyricsBrowseId = usePlayerStore((s) => s.lyricsBrowseId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const notchManuallyHidden = usePlayerStore((s) => s.notchManuallyHidden);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const stopPlayback = usePlayerStore((s) => s.stopPlayback);

  const notchDisplayMode = useSettingsStore((s) => s.notchDisplayMode);
  const notchMonitor = useSettingsStore((s) => s.notchMonitor);

  const { desktopNotchVisible } = useNotchVisibility();
  const pipState = useExternalPiPState();
  const pipWindow = pipState.mode === 'document-pip' ? pipState.window : null;
  const isWindows = isWindowsPlatform();
  const documentPipOpen = Boolean(
    isWindows && pipState.open && pipWindow && !pipWindow.closed && currentTrack,
  );
  const videoPipOpen = Boolean(
    isWindows && pipState.open && pipState.mode === 'video-pip' && currentTrack,
  );
  const externalPipOpen = documentPipOpen || videoPipOpen;

  const videoId = getPlayableVideoId(currentTrack);
  const artistName = currentTrack ? formatArtists(currentTrack.artists) : '';

  const { data: lyricsData } = useQuery({
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
    enabled: Boolean(
      currentTrack &&
        (externalPipOpen || desktopNotchVisible) &&
        (currentTrack.title || lyricsBrowseId),
    ),
  });

  const displayLines = resolveNotchDisplayLines(currentTrack, lyricsData, currentTime);
  const trackTitle = currentTrack?.title || '';

  // Close external Windows PiP automatically if track clears, stopped, or non-Windows
  useEffect(() => {
    if (pipState.open && (!isWindows || !currentTrack || notchManuallyHidden)) {
      closeWindowsExternalNotch();
    }
  }, [pipState.open, isWindows, currentTrack, notchManuallyHidden]);

  // Keep Video PiP canvas card updated in real time (used inside iframes or fallback)
  useEffect(() => {
    if (!videoPipOpen || !currentTrack) return;
    renderVideoPiPFrame({
      title: trackTitle,
      artist: artistName,
      prevLine: displayLines.prev,
      activeLine: displayLines.active,
      nextLine: displayLines.next,
      hasSyncedLyrics: displayLines.mode === 'synced' || displayLines.mode === 'synced-intro',
      currentTime,
      duration: duration > 0 ? duration : currentTrack.durationSeconds || 0,
      isPlaying,
      thumbnail: currentTrack.thumbnail ?? null,
    });
  }, [
    videoPipOpen,
    currentTrack,
    trackTitle,
    artistName,
    displayLines.prev,
    displayLines.active,
    displayLines.next,
    displayLines.mode,
    currentTime,
    duration,
    isPlaying,
  ]);

  // Keep Video PiP native Play/Pause overlay icon aligned with player state
  useEffect(() => {
    if (!videoPipOpen) return;
    syncVideoPiPPlayback(isPlaying);
  }, [videoPipOpen, isPlaying]);

  // Sync external Windows Document PiP window document title
  useEffect(() => {
    if (!documentPipOpen || !currentTrack) return;
    updateWindowsExternalNotchTitle(
      artistName ? `${trackTitle} — ${artistName} | SoundClear` : `${trackTitle} | SoundClear`,
    );
  }, [documentPipOpen, currentTrack, trackTitle, artistName]);

  // Resize external Windows Document PiP window when compact/expanded changes
  useEffect(() => {
    if (!documentPipOpen) return;
    resizeWindowsExternalNotch(
      expanded ? EXPANDED_WIDTH : COMPACT_WIDTH,
      expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT,
    );
  }, [documentPipOpen, expanded]);

  // Reset expanded state when external window closes
  useEffect(() => {
    if (!documentPipOpen) {
      setExpanded(false);
    }
  }, [documentPipOpen]);

  // Measure title overflow for smooth marquee only when longer than container
  useLayoutEffect(() => {
    if (!documentPipOpen) {
      setMarqueeShiftPx(0);
      return;
    }

    const measure = () => {
      const box = titleViewportRef.current;
      const span = titleMeasureRef.current;
      if (!box || !span) {
        setMarqueeShiftPx(0);
        return;
      }
      const overflow = Math.ceil(span.scrollWidth - box.clientWidth);
      setMarqueeShiftPx(overflow > 3 ? overflow + 8 : 0);
    };

    measure();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (ro && titleViewportRef.current) {
      ro.observe(titleViewportRef.current);
    }
    return () => ro?.disconnect();
  }, [documentPipOpen, trackTitle, expanded]);

  // Collapse on Escape inside external Document PiP window
  useEffect(() => {
    if (!expanded || !documentPipOpen || !pipWindow) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpanded(false);
      }
    };

    pipWindow.addEventListener('keydown', handleKeyDown);
    return () => {
      pipWindow.removeEventListener('keydown', handleKeyDown);
    };
  }, [expanded, documentPipOpen, pipWindow]);

  // Desktop Electron / Tauri IPC bridge subscription (Windows only)
  useEffect(() => {
    if (!isWindows) return;
    return subscribeDesktopNotchCommands((cmd) => {
      if (cmd === 'prev') {
        usePlayerStore.getState().prevTrack();
      } else if (cmd === 'toggle') {
        usePlayerStore.getState().togglePlayPause();
      } else if (cmd === 'skip') {
        usePlayerStore.getState().nextTrack();
      } else if (cmd === 'stop') {
        usePlayerStore.getState().stopPlayback();
      }
    });
  }, [isWindows]);

  // Broadcast live notch payload exclusively to Windows Desktop secondary window
  useEffect(() => {
    if (!isWindows || !isDesktopNotchHost()) return;
    publishDesktopNotchState({
      visible: desktopNotchVisible,
      expanded,
      width: expanded ? 380 : 320,
      height: expanded ? 86 : 48,
      title: trackTitle,
      artist: artistName,
      isPlaying,
      thumbnail: currentTrack?.thumbnail ?? null,
      prevLine: displayLines.prev,
      activeLine: displayLines.active,
      nextLine: displayLines.next,
      hasSyncedLyrics: displayLines.mode === 'synced' || displayLines.mode === 'synced-intro',
      displayMode: notchDisplayMode,
      monitorId: notchMonitor,
      clickThroughTransparent: true,
    });
  }, [
    isWindows,
    desktopNotchVisible,
    expanded,
    trackTitle,
    artistName,
    isPlaying,
    currentTrack?.thumbnail,
    displayLines.prev,
    displayLines.active,
    displayLines.next,
    displayLines.mode,
    notchDisplayMode,
    notchMonitor,
  ]);

  if (!documentPipOpen || !pipWindow || !currentTrack) {
    return null;
  }

  const lyricFadeTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { duration: 0.16, ease: 'easeOut' as const };

  const marqueeActive = marqueeShiftPx > 0 && !shouldReduceMotion;
  const marqueeDurationSec = Math.max(6, Math.min(18, Math.round(marqueeShiftPx / 16) + 4));
  const safeDuration = duration > 0 ? duration : currentTrack.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  return createPortal(
    <div
      ref={notchRef}
      role="region"
      aria-label="Pemutar mini eksternal Windows"
      data-notch-expanded={expanded ? 'true' : 'false'}
      className="relative w-full h-full bg-[#090B0E] text-white select-none flex flex-col justify-between overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(46,230,166,0.12),transparent_55%)]"
      />

      {/* Top strip: Windows Mini badge + lyric expand + close back to web */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.07] bg-white/[0.02]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#2EE6A6] shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-semibold tracking-wide uppercase text-white/70 truncate">
            SoundClear Mini • Windows
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono-num text-white/50 mr-1">
            {formatTime(currentTime)}
            {safeDuration > 0 ? ` / ${formatTime(safeDuration)}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Perkecil tampilan lirik' : 'Perluas tampilan lirik'}
            title={expanded ? 'Perkecil' : 'Lihat Lirik'}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white/65 hover:text-white hover:bg-white/10 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" strokeWidth={2} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
            )}
          </button>
          <button
            type="button"
            onClick={() => closeWindowsExternalNotch()}
            aria-label="Tutup jendela mini dan kembali ke web"
            title="Tutup jendela mini"
            className="w-6 h-6 rounded-full flex items-center justify-center text-white/65 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Main row: Artwork + Title & Synced Lyrics + Transport Controls */}
      <div className="relative z-10 flex-1 flex items-center gap-3 px-3.5 py-2.5 min-h-0">
        <ArtworkImage
          src={currentTrack.thumbnail}
          alt={trackTitle}
          type={currentTrack.type}
          className="w-12 h-12 shrink-0 shadow-md"
          roundedClass="rounded-lg"
        />

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Perkecil lirik pemutar mini' : 'Perluas lirik pemutar mini'}
          className="flex-1 min-w-0 text-left focus-visible:outline-2 focus-visible:outline-[#2EE6A6] rounded-md"
        >
          <div ref={titleViewportRef} className="w-full overflow-hidden">
            <span
              ref={titleMeasureRef}
              style={
                marqueeActive
                  ? ({
                      '--sc-marquee-shift': `-${marqueeShiftPx}px`,
                      animationDuration: `${marqueeDurationSec}s`,
                    } as CSSProperties)
                  : undefined
              }
              className={`block whitespace-nowrap text-xs leading-4 text-white font-semibold ${
                marqueeActive ? 'sc-notch-marquee inline-block' : 'truncate'
              }`}
            >
              {trackTitle}
            </span>
          </div>

          {expanded &&
          (displayLines.mode === 'synced' || displayLines.mode === 'synced-intro') ? (
            <div className="mt-1 space-y-0.5">
              {displayLines.prev && (
                <p className="text-[11px] leading-[15px] text-white/45 truncate">
                  {displayLines.prev}
                </p>
              )}
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={displayLines.lineKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={lyricFadeTransition}
                  className="text-xs leading-4 text-[#2EE6A6] font-medium truncate"
                >
                  {displayLines.active}
                </motion.p>
              </AnimatePresence>
              {displayLines.next && (
                <p className="text-[11px] leading-[15px] text-white/45 truncate">
                  {displayLines.next}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-0.5 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={displayLines.lineKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={lyricFadeTransition}
                  className={`text-[11px] leading-4 truncate ${
                    displayLines.mode === 'synced' ? 'text-[#2EE6A6] font-medium' : 'text-white/65'
                  }`}
                >
                  {displayLines.active}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </button>

        {/* Transport Controls */}
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prevTrack();
            }}
            aria-label="Lagu sebelumnya"
            title="Sebelumnya"
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            aria-label={isPlaying ? 'Jeda lagu' : 'Putar lagu'}
            title={isPlaying ? 'Jeda' : 'Putar'}
            className="w-8 h-8 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center hover:brightness-105 active:scale-95 transition-transform"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" strokeWidth={2} />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2} />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nextTrack();
            }}
            aria-label="Lagu berikutnya"
            title="Berikutnya"
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopPlayback();
              closeWindowsExternalNotch();
            }}
            aria-label="Hentikan pemutaran"
            title="Hentikan"
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Square className="w-3 h-3" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="h-[3px] w-full bg-white/10 shrink-0">
        <div
          className="h-full bg-[#2EE6A6] transition-[width] duration-200"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>,
    pipWindow.document.body,
  );
}
