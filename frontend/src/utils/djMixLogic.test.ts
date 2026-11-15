import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampEffectiveTransitionSeconds,
  computeBeatMatchPlan,
  computeDjTransitionFrame,
  computePhaseAlignedCueOffset,
  DEFAULT_PLAYLIST_MIX_SETTINGS,
  DJ_TRANSITION_STYLES,
  DJ_VOLUME_CURVES,
  estimateBpmFromPcm,
  estimateFallbackBpm,
  normalizePlaylistMixSettings,
} from './djMixLogic';

function synthesizeClickPulsePcm(bpm: number, sampleRate = 22050, durationSec = 18): Float32Array {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(totalSamples);
  const beatInterval = 60 / bpm;
  const decaySamples = Math.floor(sampleRate * 0.08);

  for (let beat = 0; beat * beatInterval < durationSec; beat += 1) {
    const startIdx = Math.floor((beat * beatInterval + 0.08) * sampleRate);
    for (let i = 0; i < decaySamples && startIdx + i < totalSamples; i += 1) {
      const env = Math.exp(-i / (sampleRate * 0.018));
      const freq = 90 - 40 * (i / decaySamples);
      out[startIdx + i] += Math.sin((2 * Math.PI * freq * i) / sampleRate) * env * 0.9;
    }
  }
  return out;
}

test('estimateBpmFromPcm accurately detects synthetic 120 BPM and 128 BPM pulses', () => {
  const pcm120 = synthesizeClickPulsePcm(120);
  const res120 = estimateBpmFromPcm(pcm120, 22050);
  assert.ok(res120, 'should return BPM analysis for 120 BPM pulse');
  assert.ok(Math.abs(res120.bpm - 120) <= 2, `expected ~120 BPM, got ${res120.bpm}`);
  assert.equal(res120.source, 'decoded');
  assert.ok(res120.confidence >= 0.4, `expected reasonable confidence, got ${res120.confidence}`);

  const pcm128 = synthesizeClickPulsePcm(128);
  const res128 = estimateBpmFromPcm(pcm128, 22050);
  assert.ok(res128, 'should return BPM analysis for 128 BPM pulse');
  assert.ok(Math.abs(res128.bpm - 128) <= 2, `expected ~128 BPM, got ${res128.bpm}`);
});

test('estimateBpmFromPcm returns null on silence or too-short clips', () => {
  const silence = new Float32Array(22050 * 8);
  assert.equal(estimateBpmFromPcm(silence, 22050), null);

  const tooShort = synthesizeClickPulsePcm(120, 22050, 1.5);
  assert.equal(estimateBpmFromPcm(tooShort, 22050), null);
});

test('computeBeatMatchPlan handles direct sync, octave folding, and bounded clamping', () => {
  // 120 BPM <- 126 BPM: ratio 120/126 ~= 0.952
  const plan = computeBeatMatchPlan(120, 126, true, 0.08);
  assert.equal(plan.beatMatched, true);
  assert.equal(plan.octaveMultiplier, 1);
  assert.ok(Math.abs(plan.incomingStartRate - 120 / 126) < 0.002);

  // Octave fold: 130 BPM <- 65 BPM should pick 2x -> exact 1.0x rate
  const octPlan = computeBeatMatchPlan(130, 65, true, 0.08);
  assert.equal(octPlan.octaveMultiplier, 2);
  assert.equal(octPlan.incomingStartRate, 1);

  // Clamped safely within +-8% for extreme differences
  const extremePlan = computeBeatMatchPlan(140, 100, true, 0.08);
  assert.equal(extremePlan.incomingStartRate, 1.08);

  // Disabled returns 1.0
  const disabledPlan = computeBeatMatchPlan(120, 126, false);
  assert.equal(disabledPlan.beatMatched, false);
  assert.equal(disabledPlan.incomingStartRate, 1);
});

test('computeDjTransitionFrame shapes gains, bass-swap EQ, and filter sweeps cleanly', () => {
  const swapStart = computeDjTransitionFrame(0.05, {
    transitionStyle: 'bass-swap',
    eqBlend: true,
    volumeCurve: 'equal-power',
  });
  assert.ok(swapStart.inLowDb <= -15, 'incoming bass must be tucked at start of bass-swap');
  assert.equal(swapStart.outLowDb, 0);

  const swapEnd = computeDjTransitionFrame(0.95, {
    transitionStyle: 'bass-swap',
    eqBlend: true,
    volumeCurve: 'equal-power',
  });
  assert.ok(swapEnd.outLowDb <= -15, 'outgoing bass must swap down after midpoint');
  assert.equal(swapEnd.inLowDb, 0);

  const sweepStart = computeDjTransitionFrame(0, {
    transitionStyle: 'filter-sweep',
    eqBlend: false,
    volumeCurve: 's-curve',
  });
  const sweepEnd = computeDjTransitionFrame(1, {
    transitionStyle: 'filter-sweep',
    eqBlend: false,
    volumeCurve: 's-curve',
  });
  assert.equal(sweepStart.outHighpassHz, 20);
  assert.ok(sweepStart.inLowpassHz < 1000);
  assert.ok(sweepEnd.outHighpassHz > 1500);
  assert.ok(sweepEnd.inLowpassHz >= 19500);
});

test('clampEffectiveTransitionSeconds prevents broken transitions on short tracks', () => {
  assert.equal(clampEffectiveTransitionSeconds(8, 200, 180), 8);
  assert.ok(clampEffectiveTransitionSeconds(10, 8, 8) <= 3.5);
  assert.equal(clampEffectiveTransitionSeconds(6, 1.0, 10), 0);
  assert.equal(clampEffectiveTransitionSeconds(0, 180, 180), 0);
});

test('computePhaseAlignedCueOffset aligns firstBeat and avoids short track skips', () => {
  const outAnalysis = { bpm: 120, confidence: 0.9, source: 'decoded' as const, beatIntervalSec: 0.5, firstBeatSec: 0 };
  const inAnalysis = { bpm: 120, confidence: 0.9, source: 'decoded' as const, beatIntervalSec: 0.5, firstBeatSec: 0.1 };
  const offset = computePhaseAlignedCueOffset(10.25, outAnalysis, inAnalysis, 180);
  assert.ok(Math.abs(offset - 0.35) < 0.02, `expected ~0.35s, got ${offset}`);
  assert.equal(computePhaseAlignedCueOffset(10.25, outAnalysis, inAnalysis, 9), 0);
});

test('normalizePlaylistMixSettings sanitizes inputs and UI labels contain no restricted strings', () => {
  const norm = normalizePlaylistMixSettings({
    enabled: true,
    durationSeconds: 99,
    transitionStyle: 'invalid' as unknown as 'smooth',
  });
  assert.equal(norm.enabled, true);
  assert.equal(norm.durationSeconds, 12);
  assert.equal(norm.transitionStyle, DEFAULT_PLAYLIST_MIX_SETTINGS.transitionStyle);

  const fallback = estimateFallbackBpm({
    id: 'test-edm',
    title: 'Midnight House Club',
    genre: 'Electronic',
    artists: [{ name: 'DJ Test' }],
  });
  assert.equal(fallback.source, 'estimated');
  assert.ok(fallback.bpm >= 120 && fallback.bpm <= 134);

  const allLabels = [
    ...DJ_TRANSITION_STYLES.map((s) => `${s.label} ${s.description}`),
    ...DJ_VOLUME_CURVES.map((c) => c.label),
  ].join(' ');
  assert.equal(/premium|permium/i.test(allLabels), false);
});
