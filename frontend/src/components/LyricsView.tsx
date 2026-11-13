import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mic2 } from 'lucide-react';
import { fetchLyrics } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { findActiveLyricIndex } from '../utils/playerLogic';

export function LyricsView() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lyricsBrowseId = usePlayerStore((s) => s.lyricsBrowseId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const requestSeek = usePlayerStore((s) => s.requestSeek);

  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['lyrics', lyricsBrowseId],
    queryFn: ({ signal }) => fetchLyrics(lyricsBrowseId!, signal),
    enabled: Boolean(lyricsBrowseId),
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
      <div className="py-12 text-center text-xs text-white/45">
        Putar lagu untuk menampilkan lirik.
      </div>
    );
  }

  if (!lyricsBrowseId) {
    return (
      <div className="py-12 px-4 text-center space-y-2">
        <Mic2 className="w-6 h-6 text-white/35 mx-auto" strokeWidth={1.75} />
        <p className="text-xs text-white/55">Lirik tidak tersedia untuk lagu ini.</p>
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
      <div className="py-8 px-3 text-xs text-white/60">
        {error instanceof Error ? error.message : 'Gagal memuat lirik.'}
      </div>
    );
  }

  if (data?.hasTimestamps && data.lines.length > 0) {
    return (
      <div className="space-y-2 py-2">
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
                  ? 'text-[#2EE6A6] font-semibold bg-white/[0.07]'
                  : isPast
                    ? 'text-white/40 hover:text-white/75'
                    : 'text-white/70 hover:text-white'
              }`}
            >
              {line.text}
            </button>
          );
        })}
        {data.source && (
          <p className="pt-4 px-2.5 text-[11px] text-white/35">{data.source}</p>
        )}
      </div>
    );
  }

  if (data?.plainText) {
    return (
      <div className="py-2 px-1 space-y-3">
        <p className="text-sm text-white/80 whitespace-pre-line leading-relaxed">
          {data.plainText}
        </p>
        {data.source && <p className="text-[11px] text-white/35">{data.source}</p>}
      </div>
    );
  }

  return (
    <div className="py-12 px-4 text-center space-y-2">
      <Mic2 className="w-6 h-6 text-white/35 mx-auto" strokeWidth={1.75} />
      <p className="text-xs text-white/55">Lirik belum tersedia.</p>
    </div>
  );
}
