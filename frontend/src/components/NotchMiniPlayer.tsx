import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SkipForward, Square } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { fetchLyrics } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  publishDesktopNotchState,
  subscribeDesktopNotchCommands,
} from '../utils/notchDesktopBridge';
import { resolveNotchDisplayLines } from '../utils/notchPlayer';
import { formatArtists, getPlayableVideoId } from '../utils/playerLogic';
import { useNotchVisibility } from '../utils/useNotchVisibility';

const COMPACT_WIDTH = 320;
const EXPANDED_WIDTH = 380;

export function NotchMiniPlayer() {
  const shouldReduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [marqueeShiftPx, setMarqueeShiftPx] = useState(0);

  const notchRef = useRef<HTMLDivElement | null>(null);
  const titleViewportRef = useRef<HTMLDivElement | null>(null);
  const titleMeasureRef = useRef<HTMLSpanElement | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lyricsBrowseId = usePlayerStore((s) => s.lyricsBrowseId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const stopPlayback = usePlayerStore((s) => s.stopPlayback);

  const notchDisplayMode = useSettingsStore((s) => s.notchDisplayMode);
  const notchMonitor = useSettingsStore((s) => s.notchMonitor);

  const { notchVisible } = useNotchVisibility();

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
    enabled: Boolean(currentTrack && (currentTrack.title || lyricsBrowseId)),
  });

  const displayLines = resolveNotchDisplayLines(currentTrack, lyricsData, currentTime);
  const trackTitle = currentTrack?.title || '';

  // Reset expanded state when notch hides
  useEffect(() => {
    if (!notchVisible) {
      setExpanded(false);
    }
  }, [notchVisible]);

  // Measure title overflow for smooth marquee only when longer than container
  useLayoutEffect(() => {
    if (!notchVisible) {
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
  }, [notchVisible, trackTitle, expanded]);

  // Collapse on Escape or outside pointer tap when expanded
  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpanded(false);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (notchRef.current && !notchRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [expanded]);

  // Desktop Electron / Tauri IPC bridge subscription for skip/stop
  useEffect(() => {
    return subscribeDesktopNotchCommands((cmd) => {
      if (cmd === 'skip') {
        usePlayerStore.getState().nextTrack();
      } else if (cmd === 'stop') {
        usePlayerStore.getState().stopPlayback();
      }
    });
  }, []);

  // Broadcast live notch payload to optional Electron/Tauri secondary notch window
  useEffect(() => {
    const targetWidth = expanded ? EXPANDED_WIDTH : COMPACT_WIDTH;
    const targetHeight = expanded ? 86 : 48;
    publishDesktopNotchState({
      visible: notchVisible,
      expanded,
      width: targetWidth,
      height: targetHeight,
      title: trackTitle,
      artist: artistName,
      prevLine: displayLines.prev,
      activeLine: displayLines.active,
      nextLine: displayLines.next,
      hasSyncedLyrics: displayLines.mode === 'synced' || displayLines.mode === 'synced-intro',
      displayMode: notchDisplayMode,
      monitorId: notchMonitor,
      clickThroughTransparent: true,
    });
  }, [
    notchVisible,
    expanded,
    trackTitle,
    artistName,
    displayLines.prev,
    displayLines.active,
    displayLines.next,
    displayLines.mode,
    notchDisplayMode,
    notchMonitor,
  ]);

  const springTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 450, damping: 34, mass: 0.78 };

  const lyricFadeTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { duration: 0.16, ease: 'easeOut' as const };

  const targetWidth = expanded ? EXPANDED_WIDTH : COMPACT_WIDTH;
  const marqueeActive = marqueeShiftPx > 0 && !shouldReduceMotion;
  const marqueeDurationSec = Math.max(6, Math.min(18, Math.round(marqueeShiftPx / 16) + 4));

  return (
    <div
      className="fixed inset-x-0 z-[100] flex justify-center pointer-events-none"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <AnimatePresence initial={false}>
        {notchVisible && currentTrack && (
          <motion.div
            key="soundclear-notch-mini-player"
            ref={notchRef}
            role="region"
            aria-label="Pemutar mini notch"
            data-notch-expanded={expanded ? 'true' : 'false'}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, width: COMPACT_WIDTH }}
            animate={{
              opacity: 1,
              y: 0,
              width: targetWidth,
            }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
            transition={springTransition}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'touch') {
                setExpanded(true);
              }
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'touch') {
                setExpanded(false);
              }
            }}
            className="pointer-events-auto relative bg-[#000000] rounded-b-[18px] max-w-[calc(100vw-32px)] select-none"
          >
            {/* Inverted concave top-left corner fillet merging seamlessly into top screen edge */}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              className="pointer-events-none absolute top-0 -left-[14px] w-[14px] h-[14px] block"
            >
              <path d="M14 0 L14 14 A14 14 0 0 0 0 0 Z" fill="#000000" />
            </svg>

            {/* Inverted concave top-right corner fillet merging seamlessly into top screen edge */}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              className="pointer-events-none absolute top-0 -right-[14px] w-[14px] h-[14px] block"
            >
              <path d="M0 0 L0 14 A14 14 0 0 1 14 0 Z" fill="#000000" />
            </svg>

            <div
              className={`flex items-center gap-2.5 px-3.5 ${
                expanded ? 'py-2.5 min-h-[78px]' : 'h-[48px]'
              }`}
            >
              {/* Left: Track Title (11px gray, marquee if overflowing) + Synced Lyric / Artist (13px white) */}
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? 'Perkecil pemutar mini notch'
                    : 'Perluas pemutar mini notch untuk melihat lirik'
                }
                className="flex-1 min-w-0 text-left focus-visible:outline-2 focus-visible:outline-white/70 rounded-md"
              >
                {/* Track Title Line */}
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
                    className={`block whitespace-nowrap text-[11px] leading-[14px] text-[#9CA3AF] font-normal ${
                      marqueeActive ? 'sc-notch-marquee inline-block' : 'truncate'
                    }`}
                  >
                    {trackTitle}
                  </span>
                </div>

                {/* Lyric / Artist Line(s) */}
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
                        className="text-[13px] leading-[17px] text-[#FFFFFF] font-medium truncate"
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
                        className="text-[13px] leading-[17px] text-[#FFFFFF] font-medium truncate"
                      >
                        {displayLines.active}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                )}
              </button>

              {/* Right: ONLY two Lucide controls — Skip and Stop (stroke 1.75, 28px tap area) */}
              <div className="shrink-0 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    nextTrack();
                  }}
                  aria-label="Lompat ke lagu berikutnya"
                  title="Lagu berikutnya"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/80 transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    stopPlayback();
                  }}
                  aria-label="Hentikan pemutaran dan sembunyikan notch"
                  title="Hentikan"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/80 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
