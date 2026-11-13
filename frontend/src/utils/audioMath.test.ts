import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_EQ_PRESETS,
  clampEqGainDb,
  clampYoutubeVolume,
  computeEqualPowerCrossfade,
  computeNonOverlappingFadeMultiplier,
  computeNormalizationGain,
  EQ_FREQUENCIES,
  estimateLoudnessFromRms,
  preampDbToLinear,
} from './audioMath.ts';

test('EQ has 10 standard frequencies and all 11 named presets', () => {
  assert.equal(EQ_FREQUENCIES.length, 10);
  assert.equal(EQ_FREQUENCIES[0], 31);
  assert.equal(EQ_FREQUENCIES[9], 16000);
  assert.equal(BUILTIN_EQ_PRESETS.length, 11);
  for (const preset of BUILTIN_EQ_PRESETS) {
    assert.equal(preset.bands.length, 10);
  }
});

test('clampEqGainDb clamps gains strictly within ±12 dB at 0.5 step', () => {
  assert.equal(clampEqGainDb(24), 12);
  assert.equal(clampEqGainDb(-18), -12);
  assert.equal(clampEqGainDb(3.4), 3.5);
});

test('clampYoutubeVolume respects maxVolumeLimit and mute state', () => {
  assert.equal(clampYoutubeVolume(90, 65, false), 65);
  assert.equal(clampYoutubeVolume(40, 65, false), 40);
  assert.equal(clampYoutubeVolume(80, 100, true), 0);
  assert.equal(clampYoutubeVolume(-10, 80, false), 0);
});

test('computeNonOverlappingFadeMultiplier fades in and out smoothly', () => {
  assert.equal(computeNonOverlappingFadeMultiplier(15, 60, 0), 1);
  assert.equal(computeNonOverlappingFadeMultiplier(30, 60, 6), 1);
  assert.ok(computeNonOverlappingFadeMultiplier(1, 60, 6) < 0.3);
  assert.ok(computeNonOverlappingFadeMultiplier(59, 60, 6) < 0.3);
});

test('computeEqualPowerCrossfade preserves constant power across transition', () => {
  const start = computeEqualPowerCrossfade(0);
  assert.ok(Math.abs(start.outGain - 1) < 1e-6);
  assert.ok(Math.abs(start.inGain - 0) < 1e-6);

  const mid = computeEqualPowerCrossfade(0.5);
  const power = mid.outGain ** 2 + mid.inGain ** 2;
  assert.ok(Math.abs(power - 1) < 1e-6);

  const end = computeEqualPowerCrossfade(1);
  assert.ok(Math.abs(end.outGain - 0) < 1e-6);
  assert.ok(Math.abs(end.inGain - 1) < 1e-6);
});

test('loudness estimation and normalization gain work cleanly without clipping', () => {
  const quietLufs = estimateLoudnessFromRms(0.05);
  const loudLufs = estimateLoudnessFromRms(0.5);
  assert.ok(quietLufs < loudLufs);

  assert.equal(computeNormalizationGain(-18, 'off'), 1);
  const quietGain = computeNormalizationGain(-18, 'quiet', 0.8);
  const normalGain = computeNormalizationGain(-18, 'normal', 0.5);
  const loudGain = computeNormalizationGain(-18, 'loud', 0.3);
  assert.ok(Math.abs(quietGain - 1) < 0.05);
  assert.ok(normalGain > quietGain);
  assert.ok(loudGain >= normalGain);
});

test('preampDbToLinear maps 0 dB to unity gain', () => {
  assert.equal(preampDbToLinear(0), 1);
  assert.ok(preampDbToLinear(6) > 1.9);
  assert.ok(preampDbToLinear(-6) < 0.55);
});
