import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Maximize2,
  Mic2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchLyrics } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import {
  findActiveLyricIndex,
  formatArtists,
  formatTime,
  getPlayableVideoId,
} from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mode karaoke lirik layar penuh"
      className="fixed inset-0 z-50 flex flex-col bg-[#0A0A0B]"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 25%, rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.48), rgba(10,10,11,0.98) 72%)`,
      }}
    >
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ArtworkImage
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-11 h-11"
            roundedClass="rounded-lg"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
            <p className="text-xs text-white/60 truncate">{formatArtists(currentTrack.artists)}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setKaraokeOpen(false)}
          aria-label="Keluar dari mode karaoke"
          className="w-10 h-10 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center text-white transition-colors"
        >
          <X className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 sm:px-12 py-12 flex flex-col items-center">
        {isLoading ? (
          <div className="my-auto space-y-4 w-full max-w-2xl animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-white/[0.08] mx-auto w-3/4" />
            ))}
          </div>
        ) : data?.hasTimestamps && data.lines.length > 0 ? (
          <div className="w-full max-w-3xl space-y-5 text-center py-8">
            {data.lines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = activeIndex >= 0 && idx < activeIndex;
              return (
                <button
                  key={`${line.startTimeMs}-${idx}`}
                  ref={isActive ? activeLineRef : undefined}
                  type="button"
                  onClick={() => requestSeek(line.startTimeMs / 1000)}
                  className={`block w-full text-center transition-all duration-200 leading-snug ${
                    isActive
                      ? 'text-2xl sm:text-4xl font-bold text-[#2EE6A6] scale-[1.02]'
                      : isPast
                        ? 'text-lg sm:text-2xl font-medium text-white/35 hover:text-white/70'
                        : 'text-lg sm:text-2xl font-medium text-white/60 hover:text-white'
                  }`}
                >
                  {line.text}
                </button>
              );
            })}
          </div>
        ) : data?.plainText ? (
          <div className="w-full max-w-2xl text-center py-6">
            <p className="text-lg sm:text-2xl font-medium text-white/85 whitespace-pre-line leading-relaxed">
              {data.plainText}
            </p>
          </div>
        ) : (
          <div className="my-auto text-center text-white/55">Lirik belum tersedia.</div>
        )}
      </div>

      <footer className="px-6 py-4 border-t border-white/[0.06] bg-black/30 backdrop-blur-xl shrink-0">
        <div className="max-w-xl mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 text-right text-xs text-white/50 tabular-nums">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              aria-label="Posisi lagu"
              min={0}
              max={safeDuration || 100}
              step={0.5}
              value={Math.min(currentTime, safeDuration || 100)}
              onChange={(e) => requestSeek(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #2EE6A6 ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%)`,
              }}
              className="sc-range flex-1 h-1 rounded-full"
            />
            <span className="w-10 text-xs text-white/50 tabular-nums">
              {formatTime(safeDuration)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={prevTrack}
              aria-label="Lagu sebelumnya"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white"
            >
              <SkipBack className="w-5 h-5 fill-current" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
              className="w-12 h-12 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" strokeWidth={2} />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={nextTrack}
              aria-label="Lagu berikutnya"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white"
            >
              <SkipForward className="w-5 h-5 fill-current" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function FullscreenNowPlayingModal() {
  const open = usePlayerStore((s) => s.fullscreenNowPlaying);
  const setOpen = usePlayerStore((s) => s.setFullscreenNowPlaying);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smartShuffle = usePlayerStore((s) => s.smartShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const webAudioWarning = usePlayerStore((s) => s.webAudioWarning);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleSmartShuffle = usePlayerStore((s) => s.toggleSmartShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open || !currentTrack) return null;

  const safeDuration = duration > 0 ? duration : currentTrack.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mode sedang diputar layar penuh"
      className="fixed inset-0 z-50 flex flex-col bg-[#0A0A0B] p-6 sm:p-10"
      style={{
        backgroundImage: `radial-gradient(circle at 30% 35%, rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.45), rgba(10,10,11,0.98) 72%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/60">Sedang diputar</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setKaraokeOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
          >
            <Mic2 className="w-3.5 h-3.5 text-[#2EE6A6]" strokeWidth={1.75} />
            Karaoke
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Keluar dari layar penuh"
            className="w-9 h-9 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-white"
          >
            <Minimize2 className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-xl w-full mx-auto">
        <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-2xl overflow-hidden border border-white/[0.1]">
          <ArtworkImage
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            type={currentTrack.type}
            className="w-full h-full"
            roundedClass="rounded-2xl"
          />
        </div>

        <div className="w-full text-center space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
            {currentTrack.title}
          </h2>
          <p className="text-sm text-white/65 truncate">{formatArtists(currentTrack.artists)}</p>
          {activeStreamMeta && (
            <p
              className={`text-xs font-medium pt-0.5 ${
                activeStreamMeta.hiRes
                  ? 'text-[#F5C451]'
                  : activeStreamMeta.lossless
                    ? 'text-[#2EE6A6]'
                    : 'text-white/55'
              }`}
            >
              {activeStreamMeta.badgeLabel}
            </p>
          )}
          {webAudioWarning && (
            <p className="text-[11px] text-[#2EE6A6]/85 pt-0.5">{webAudioWarning}</p>
          )}
        </div>

        <div className="w-full space-y-2">
          <input
            type="range"
            aria-label="Posisi lagu"
            min={0}
            max={safeDuration || 100}
            step={0.5}
            value={Math.min(currentTime, safeDuration || 100)}
            onChange={(e) => requestSeek(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #2EE6A6 ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%)`,
            }}
            className="sc-range w-full h-1 rounded-full"
          />
          <div className="flex justify-between text-xs text-white/50 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(safeDuration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Acak urutan"
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              shuffle ? 'text-[#2EE6A6]' : 'text-white/60 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={toggleSmartShuffle}
            aria-label="Acak pintar"
            title="Acak Pintar"
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              smartShuffle ? 'text-[#2EE6A6]' : 'text-white/60 hover:text-white'
            }`}
          >
            <Sparkles className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={prevTrack}
            aria-label="Lagu sebelumnya"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white"
          >
            <SkipBack className="w-6 h-6 fill-current" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
            className="w-16 h-16 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center"
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
            className="w-11 h-11 rounded-full flex items-center justify-center text-white"
          >
            <SkipForward className="w-6 h-6 fill-current" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Mode ulang: ${repeat}`}
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              repeat !== 'off' ? 'text-[#2EE6A6]' : 'text-white/60 hover:text-white'
            }`}
          >
            <RepeatIcon className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
