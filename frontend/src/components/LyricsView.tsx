import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, Mic2 } from 'lucide-react';
import { fetchLyrics } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { findActiveLyricIndex, formatArtists, getPlayableVideoId } from '../utils/playerLogic';

export function LyricsView() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lyricsBrowseId = usePlayerStore((s) => s.lyricsBrowseId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);

  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const videoId = getPlayableVideoId(currentTrack);
  const artistName = currentTrack ? formatArtists(currentTrack.artists) : '';

  const { data, isLoading, isError, error } = useQuery({
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
    enabled: Boolean(currentTrack?.title || lyricsBrowseId),
  });

  const activeIndex = data?.hasTimestamps
    ? findActiveLyricIndex(data.lines, currentTime * 1000)
    : -1;

  useEffect(() => {
    if (activeIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  if (!currentTrack) {
    return (
      <div className="py-12 text-center text-xs text-[#B3F7D1]/50">
        Putar lagu untuk menampilkan lirik.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-4 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded bg-white/[0.08]"
            style={{ width: `${55 + ((i * 17) % 40)}%` }}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-8 px-3 text-xs text-[#B3F7D1]/65">
        {error instanceof Error ? error.message : 'Gagal memuat lirik.'}
      </div>
    );
  }

  if (data?.hasTimestamps && data.lines.length > 0) {
    return (
      <div className="space-y-2 py-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-semibold text-[#B3F7D1]/60">Lirik Tersinkron</span>
          <button
            type="button"
            onClick={() => setKaraokeOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#19EE8A] hover:underline"
          >
            <Maximize2 className="w-3 h-3" strokeWidth={2} />
            Layar Penuh
          </button>
        </div>
        {data.lines.map((line, idx) => {
          const isActive = idx === activeIndex;
          const isPast = activeIndex >= 0 && idx < activeIndex;
          return (
            <button
              key={`${line.startTimeMs}-${idx}`}
              ref={isActive ? activeLineRef : undefined}
              type="button"
              onClick={() => requestSeek(line.startTimeMs / 1000)}
              className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-sm leading-relaxed transition-colors duration-150 ${
                isActive
                  ? 'text-[#19EE8A] font-semibold bg-white/[0.09] backdrop-blur-md border border-[#19EE8A]/20'
                  : isPast
                    ? 'text-[#B3F7D1]/40 hover:text-[#B3F7D1]/75'
                    : 'text-[#E8FFF3]/75 hover:text-[#E8FFF3]'
              }`}
            >
              {line.text}
            </button>
          );
        })}
        <p className="pt-4 px-2.5 text-[11px] text-[#B3F7D1]/40">
          {data.source || 'Sumber lirik: LRCLIB'}
        </p>
      </div>
    );
  }

  if (data?.plainText) {
    return (
      <div className="py-2 px-1 space-y-3">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[11px] font-semibold text-[#B3F7D1]/60">Lirik</span>
          <button
            type="button"
            onClick={() => setKaraokeOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#19EE8A] hover:underline"
          >
            <Maximize2 className="w-3 h-3" strokeWidth={2} />
            Layar Penuh
          </button>
        </div>
        <p className="text-sm text-[#E8FFF3]/85 whitespace-pre-line leading-relaxed">
          {data.plainText}
        </p>
        <p className="text-[11px] text-[#B3F7D1]/40">{data.source || 'Sumber lirik: LRCLIB'}</p>
      </div>
    );
  }

  return (
    <div className="py-12 px-4 text-center space-y-2">
      <Mic2 className="w-6 h-6 text-[#B3F7D1]/40 mx-auto" strokeWidth={1.75} />
      <p className="text-xs text-[#B3F7D1]/60">Lirik belum tersedia.</p>
    </div>
  );
}
