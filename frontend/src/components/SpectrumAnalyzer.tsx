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
    activeStreamMeta &&
      (activeStreamMeta.sourceMode === 'webaudio' || activeStreamMeta.sourceMode === 'direct') &&
      isPlaying,
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
  }, [signalLive]);

  const statusText = testToneActive
    ? 'Aktif (Tes Nada)'
    : webAudioStreamActive
      ? 'Aktif (Web Audio DSP)'
      : activeStreamMeta?.sourceMode === 'fallback-no-fx'
        ? 'Terbatas (Tanpa DSP)'
        : 'Siaga';

  return (
    <div className="rounded-xl bg-black/40 border border-white/[0.08] p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span>Analyzer Spektrum Real-Time</span>
        <span className={signalLive ? 'text-[#2EE6A6] font-medium' : 'text-white/40'}>
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
