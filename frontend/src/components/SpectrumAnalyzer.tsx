import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { isLocalTrack } from '../utils/playerLogic';
import { getLocalAudioAnalyser } from './LocalAudioEngine';

export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const localActive = isLocalTrack(currentTrack);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const barCount = 32;
    let bins: Uint8Array<ArrayBuffer> | null = null;

    const renderFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = localActive ? getLocalAudioAnalyser() : null;
      if (analyser) {
        if (!bins || bins.length !== analyser.frequencyBinCount) {
          bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        analyser.getByteFrequencyData(bins);
      }

      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);

      for (let i = 0; i < barCount; i += 1) {
        let magnitude = 0.06;
        if (bins && localActive && isPlaying) {
          const binIdx = Math.min(
            bins.length - 1,
            Math.floor((i / barCount) * Math.min(bins.length, 48)),
          );
          magnitude = Math.max(0.06, bins[binIdx] / 255);
        }

        const barHeight = Math.max(3, Math.round(magnitude * (height - 8)));
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        ctx.fillStyle =
          localActive && isPlaying
            ? `rgba(46, 230, 166, ${(0.35 + magnitude * 0.65).toFixed(2)})`
            : 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [localActive, isPlaying]);

  return (
    <div className="rounded-xl bg-black/40 border border-white/[0.08] p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span>Analyzer Spektrum (File Lokal)</span>
        <span className="text-white/40">
          {localActive && isPlaying ? 'Aktif' : localActive ? 'Dijeda' : 'Siaga'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={560}
        height={72}
        className="w-full h-[72px] block"
        aria-label="Analyzer spektrum audio file lokal"
      />
    </div>
  );
}
