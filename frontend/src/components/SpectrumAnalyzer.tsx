import { useEffect, useRef, useState } from 'react';
import {
  getAudioDiagnosticsSnapshot,
  getSharedAudioAnalyser,
  subscribeAudioDiagnostics,
} from '../audio/soundclearAudioEngine';
import { usePlayerStore } from '../store/playerStore';

export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const [testToneActive, setTestToneActive] = useState(
    () => getAudioDiagnosticsSnapshot(activeStreamMeta?.sourceMode).testToneMode !== null,
  );

  useEffect(() => {
    return subscribeAudioDiagnostics(() => {
      const snap = getAudioDiagnosticsSnapshot(
        usePlayerStore.getState().activeStreamMeta?.sourceMode,
      );
      setTestToneActive(snap.testToneMode !== null);
    });
  }, []);

  const webAudioStreamActive = Boolean(
    activeStreamMeta && activeStreamMeta.sourceMode === 'webaudio' && isPlaying,
  );
  const directHtmlAudioActive = Boolean(
    activeStreamMeta && activeStreamMeta.sourceMode === 'direct' && isPlaying,
  );
  const signalLive = testToneActive || webAudioStreamActive;

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

      const analyser = signalLive ? getSharedAudioAnalyser() : null;
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
        if (bins && signalLive) {
          const binIdx = Math.min(
            bins.length - 1,
            Math.floor((i / barCount) * Math.min(bins.length, 64)),
          );
          magnitude = Math.max(0.06, bins[binIdx] / 255);
        }

        const barHeight = Math.max(3, Math.round(magnitude * (height - 8)));
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        ctx.fillStyle = signalLive
          ? `rgba(25, 238, 138, ${(0.38 + magnitude * 0.62).toFixed(2)})`
          : 'rgba(179, 247, 209, 0.16)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [signalLive]);

  const statusText = testToneActive
    ? 'Aktif (Tes Nada)'
    : webAudioStreamActive
      ? 'Aktif (Web Audio DSP)'
      : directHtmlAudioActive
        ? 'HTML5 Langsung (DSP Bypass)'
        : activeStreamMeta?.sourceMode === 'youtube-iframe'
          ? 'Cloud Audio (DSP Bypass)'
          : activeStreamMeta?.sourceMode === 'fallback-no-fx'
            ? 'Terbatas (Tanpa DSP)'
            : 'Siaga';

  return (
    <div className="rounded-xl bg-white/[0.045] backdrop-blur-xl border border-white/[0.11] p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-[#B3F7D1]/65">
        <span>Analyzer Spektrum Real-Time</span>
        <span className={signalLive ? 'text-[#19EE8A] font-medium' : 'text-[#B3F7D1]/45'}>
          {statusText}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={560}
        height={72}
        className="w-full h-[72px] block"
        aria-label="Analyzer spektrum audio real-time"
      />
    </div>
  );
}
