import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, Mic2 } from 'lucide-react';
import { fetchLyrics } from '../api/client';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { findActiveLyricIndex, formatArtists, getPlayableVideoId } from '../utils/playerLogic';

interface LyricsPreviewCardProps {
  onOpenKaraoke: () => void;
}

export function computeCardTintColor(r: number, g: number, b: number): string {
  // Produce a rich, legible mid-dark saturated card tint regardless of cover brightness
  const maxC = Math.max(r, g, b, 1);
  const minC = Math.min(r, g, b);
  const isNearGray = maxC - minC < 18;
  const baseR = isNearGray ? 54 : r;
  const baseG = isNearGray ? 96 : g;
  const baseB = isNearGray ? 78 : b;

  const targetPeak = 138;
  const scale = Math.min(1.6, targetPeak / Math.max(baseR, baseG, baseB, 1));
  const outR = Math.round(Math.min(165, Math.max(36, baseR * scale)));
  const outG = Math.round(Math.min(165, Math.max(46, baseG * scale)));
  const outB = Math.round(Math.min(165, Math.max(42, baseB * scale)));
  return `rgb(${outR}, ${outG}, ${outB})`;
}

export function LyricsPreviewCard({ onOpenKaraoke }: LyricsPreviewCardProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lyricsBrowseId = usePlayerStore((s) => s.lyricsBrowseId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const lyricsPreviewEnabled = useSettingsStore((s) => s.lyricsPreviewEnabled);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

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
    enabled: Boolean(lyricsPreviewEnabled && (currentTrack?.title || lyricsBrowseId)),
  });

  const activeIndex = data?.hasTimestamps
    ? findActiveLyricIndex(data.lines, currentTime * 1000)
    : -1;

  const previewLines = useMemo(() => {
    if (data?.hasTimestamps && data.lines.length > 0) {
      const start = Math.max(0, activeIndex >= 0 ? activeIndex : 0);
      return data.lines.slice(start, start + 4).map((line, i) => ({
        text: line.text,
        active: activeIndex >= 0 ? i === 0 : i === 0,
      }));
    }
    if (data?.plainText) {
      return data.plainText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4)
        .map((text, i) => ({ text, active: i === 0 }));
    }
    return [];
  }, [data, activeIndex]);

  if (!currentTrack) return null;

  if (!lyricsPreviewEnabled) {
    return (
      <div className="w-full rounded-2xl bg-white/[0.06] border border-white/[0.1] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#B3F7D1]/70">
          <Mic2 className="w-4 h-4 text-[#B3F7D1]/60" strokeWidth={1.85} />
          <span>Pratinjau lirik dinonaktifkan</span>
        </div>
        <button
          type="button"
          onClick={() => updateSetting('lyricsPreviewEnabled', true)}
          className="text-xs font-semibold text-[#19EE8A] hover:underline"
        >
          Aktifkan
        </button>
      </div>
    );
  }

  const cardBg = computeCardTintColor(ambientColor.r, ambientColor.g, ambientColor.b);

  return (
    <div
      style={{ backgroundColor: cardBg }}
      className="w-full rounded-2xl p-4 sm:p-5 border border-white/[0.12] shadow-lg transition-colors duration-300"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-bold text-white tracking-tight">Pratinjau lirik</span>
        <button
          type="button"
          onClick={onOpenKaraoke}
          aria-label="Perluas lirik layar penuh"
          className="w-8 h-8 rounded-full bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition-colors"
        >
          <Maximize2 className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenKaraoke}
        className="w-full text-left focus-visible:outline-2 focus-visible:outline-white rounded-lg"
      >
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-4/5 rounded bg-white/20" />
            <div className="h-5 w-3/5 rounded bg-white/15" />
            <div className="h-5 w-2/3 rounded bg-white/10" />
          </div>
        ) : previewLines.length > 0 ? (
          <div className="space-y-1.5">
            {previewLines.map((line, idx) => (
              <p
                key={`${idx}-${line.text.slice(0, 16)}`}
                className={`text-base sm:text-lg leading-snug font-bold transition-colors ${
                  line.active ? 'text-white' : 'text-white/70'
                }`}
              >
                {line.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-white/75">
            Lirik belum tersedia untuk lagu ini. Ketuk untuk membuka layar lirik.
          </p>
        )}
      </button>
    </div>
  );
}
