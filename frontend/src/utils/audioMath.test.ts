import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bassBoostLevelToDb,
  BUILTIN_EQ_PRESETS,
  clampCrossfadeSeconds,
  clampEqGainDb,
  clampPlaybackRate,
  clampYoutubeVolume,
  classifyStreamQualityBadge,
  computeEqFrequencyResponseCurve,
  computeEqualPowerCrossfade,
  computeNextCrossfadeState,
  computeNonOverlappingFadeMultiplier,
  computeNormalizationGain,
  computeUnmutedVolume,
  EQ_FREQUENCIES,
  estimateLoudnessFromRms,
  getNextPlaybackRate,
  NORMALIZATION_TARGETS_LUFS,
  preampDbToLinear,
  resolveEffectiveCrossfadeSeconds,
  resolveTargetStreamQuality,
  selectEffectiveStreamOption,
  stereoWidenerLevelToSideGain,
} from './audioMath.ts';
import type { StreamQualityOption } from '../types/music';

test('EQ has 10 standard frequencies and all 19 named presets', () => {
  assert.equal(EQ_FREQUENCIES.length, 10);
  assert.equal(EQ_FREQUENCIES[0], 31);
  assert.equal(EQ_FREQUENCIES[9], 16000);
  assert.equal(BUILTIN_EQ_PRESETS.length, 19);
  for (const preset of BUILTIN_EQ_PRESETS) {
    assert.equal(preset.bands.length, 10);
  }
  const names = new Set(BUILTIN_EQ_PRESETS.map((p) => p.name));
  for (const required of [
    'Flat',
    'Bass Booster',
    'Bass Reducer',
    'Treble Booster',
    'Vocal Booster',
    'Acoustic',
    'Classical',
    'Dance',
    'Electronic',
    'Hip-Hop',
    'Jazz',
    'Latin',
    'Loudness',
    'Piano',
    'Pop',
    'R&B',
    'Rock',
    'Small Speakers',
    'Spoken Word',
  ]) {
    assert.ok(names.has(required), `Missing preset: ${required}`);
  }
});

test('clampEqGainDb and clampPlaybackRate enforce strict audio ranges', () => {
  assert.equal(clampEqGainDb(24), 12);
  assert.equal(clampEqGainDb(-18), -12);
  assert.equal(clampEqGainDb(3.4), 3.5);
  assert.equal(clampPlaybackRate(0.2), 0.5);
  assert.equal(clampPlaybackRate(3.0), 2.0);
  assert.equal(clampPlaybackRate(1.25), 1.25);
});

test('clampYoutubeVolume respects maxVolumeLimit and mute state', () => {
  assert.equal(clampYoutubeVolume(90, 65, false), 65);
  assert.equal(clampYoutubeVolume(40, 65, false), 40);
  assert.equal(clampYoutubeVolume(80, 100, true), 0);
  assert.equal(clampYoutubeVolume(-10, 80, false), 0);
});

test('getNextPlaybackRate cycles across all PLAYBACK_RATE_OPTIONS without losing presets', () => {
  assert.equal(getNextPlaybackRate(1), 1.25);
  assert.equal(getNextPlaybackRate(1.5), 1.75);
  assert.equal(getNextPlaybackRate(1.75), 2);
  assert.equal(getNextPlaybackRate(2), 0.5);
  assert.equal(getNextPlaybackRate(0.5), 0.75);
  assert.equal(getNextPlaybackRate(1.1), 1.25);
});

test('computeUnmutedVolume restores non-zero volume and respects maxVolumeCap', () => {
  assert.equal(computeUnmutedVolume(0, 72, 100), 72);
  assert.equal(computeUnmutedVolume(0, 0, 100), 50);
  assert.equal(computeUnmutedVolume(0, 90, 65), 65);
  assert.equal(computeUnmutedVolume(45, 80, 100), 45);
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

test('crossfade state helpers clamp duration, preserve duration across toggle, and respect directMode', () => {
  assert.equal(clampCrossfadeSeconds(-3), 0);
  assert.equal(clampCrossfadeSeconds(5.6), 6);
  assert.equal(clampCrossfadeSeconds(20), 12);

  assert.equal(
    resolveEffectiveCrossfadeSeconds({ crossfadeEnabled: true, crossfadeSeconds: 6, directMode: false }),
    6,
  );
  assert.equal(
    resolveEffectiveCrossfadeSeconds({ crossfadeEnabled: false, crossfadeSeconds: 6, directMode: false }),
    0,
  );
  assert.equal(
    resolveEffectiveCrossfadeSeconds({ crossfadeEnabled: true, crossfadeSeconds: 6, directMode: true }),
    0,
  );

  // Toggling off remembers previous duration and toggling back on restores it
  const turnedOff = computeNextCrossfadeState(
    { crossfadeEnabled: true, crossfadeSeconds: 7 },
    { type: 'toggle', enabled: false },
  );
  assert.deepEqual(turnedOff, { crossfadeEnabled: false, crossfadeSeconds: 7, effectiveSeconds: 0 });

  const turnedOn = computeNextCrossfadeState(turnedOff, { type: 'toggle', enabled: true });
  assert.deepEqual(turnedOn, { crossfadeEnabled: true, crossfadeSeconds: 7, effectiveSeconds: 7 });

  // Setting duration to 0 disables crossfade; toggling on restores default 3s
  const draggedZero = computeNextCrossfadeState(
    { crossfadeEnabled: true, crossfadeSeconds: 7 },
    { type: 'set-duration', seconds: 0 },
  );
  assert.deepEqual(draggedZero, { crossfadeEnabled: false, crossfadeSeconds: 0, effectiveSeconds: 0 });

  const restoredDefault = computeNextCrossfadeState(draggedZero, { type: 'toggle', enabled: true });
  assert.deepEqual(restoredDefault, { crossfadeEnabled: true, crossfadeSeconds: 3, effectiveSeconds: 3 });
});

test('loudness estimation, LUFS targets (-19/-14/-11), and ReplayGain work without clipping', () => {
  assert.equal(NORMALIZATION_TARGETS_LUFS.quiet, -19);
  assert.equal(NORMALIZATION_TARGETS_LUFS.normal, -14);
  assert.equal(NORMALIZATION_TARGETS_LUFS.loud, -11);

  const quietLufs = estimateLoudnessFromRms(0.05);
  const loudLufs = estimateLoudnessFromRms(0.5);
  assert.ok(quietLufs < loudLufs);

  assert.equal(computeNormalizationGain(-19, 'off'), 1);
  const quietGain = computeNormalizationGain(-19, 'quiet', 0.8);
  const normalGain = computeNormalizationGain(-19, 'normal', 0.5);
  const loudGain = computeNormalizationGain(-19, 'loud', 0.3);
  assert.ok(Math.abs(quietGain - 1) < 0.05);
  assert.ok(normalGain > quietGain);
  assert.ok(loudGain >= normalGain);

  // ReplayGain takes precedence over estimated LUFS (-18 LUFS reference)
  const rgNormalGain = computeNormalizationGain(-30, 'normal', 0.5, 0);
  // +4 dB shift from -18 to -14 LUFS -> ~1.585 linear gain
  assert.ok(rgNormalGain > 1.5 && rgNormalGain < 1.65);
});

test('preampDbToLinear, bassBoost, stereoWidener, and EQ curve behave accurately', () => {
  assert.equal(preampDbToLinear(0), 1);
  assert.ok(preampDbToLinear(6) > 1.9);
  assert.ok(preampDbToLinear(-6) < 0.55);

  assert.equal(bassBoostLevelToDb(false, 80), 0);
  assert.equal(bassBoostLevelToDb(true, 100), 9);
  assert.equal(stereoWidenerLevelToSideGain(false, 100), 1);
  assert.ok(stereoWidenerLevelToSideGain(true, 100) > 1.8);

  const flatCurve = computeEqFrequencyResponseCurve({
    eqEnabled: true,
    preampDb: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pointCount: 32,
  });
  assert.equal(flatCurve.length, 32);
  assert.ok(flatCurve.every((p) => Math.abs(p.db) < 0.01));

  const boostedCurve = computeEqFrequencyResponseCurve({
    eqEnabled: true,
    directMode: false,
    preampDb: 0,
    bands: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bassBoostEnabled: true,
    bassBoostLevel: 50,
    pointCount: 32,
  });
  assert.ok(boostedCurve[0].db > boostedCurve[boostedCurve.length - 1].db + 5);

  const bypassedCurve = computeEqFrequencyResponseCurve({
    eqEnabled: true,
    directMode: true,
    preampDb: 5,
    bands: [6, 6, 0, 0, 0, 0, 0, 0, 0, 0],
    bassBoostEnabled: true,
    bassBoostLevel: 100,
    pointCount: 32,
  });
  assert.ok(bypassedCurve.every((p) => p.db === 0));
});

test('classifyStreamQualityBadge never fakes Lossless or Hi-Res via upsampling', () => {
  const mp3FakeLossless = classifyStreamQualityBadge({
    codec: 'MP3',
    bitrateKbps: 320,
    sampleRateHz: 96000,
    bitDepth: 24,
    lossless: true,
  });
  assert.equal(mp3FakeLossless.lossless, false);
  assert.equal(mp3FakeLossless.hiRes, false);

  const cdFlac = classifyStreamQualityBadge({
    codec: 'FLAC',
    sampleRateHz: 44100,
    bitDepth: 16,
    lossless: true,
  });
  assert.equal(cdFlac.lossless, true);
  assert.equal(cdFlac.hiRes, false);
  assert.match(cdFlac.badgeLabel, /Lossless/);

  const hiResFlac = classifyStreamQualityBadge({
    codec: 'FLAC',
    sampleRateHz: 96000,
    bitDepth: 24,
    lossless: true,
  });
  assert.equal(hiResFlac.lossless, true);
  assert.equal(hiResFlac.hiRes, true);
  assert.match(hiResFlac.badgeLabel, /Hi-Res Lossless/);
});

test('selectEffectiveStreamOption downgrades gracefully on slow networks and Data Saver', () => {
  const options: StreamQualityOption[] = [
    {
      tier: 'low',
      label: 'Rendah',
      available: true,
      codec: 'MP3',
      bitrateKbps: 96,
      lossless: false,
      hiRes: false,
      corsSupported: true,
    },
    {
      tier: 'high',
      label: 'Tinggi',
      available: true,
      codec: 'AAC',
      bitrateKbps: 256,
      lossless: false,
      hiRes: false,
      corsSupported: true,
    },
    {
      tier: 'hi_res',
      label: 'Hi-Res Lossless',
      available: false,
      unavailableReason: 'Tidak tersedia untuk lagu ini',
      lossless: false,
      hiRes: false,
      corsSupported: false,
    },
  ];

  const saverPick = selectEffectiveStreamOption(options, {
    requestedTier: 'high',
    dataSaver: true,
    autoAdjustQuality: true,
  });
  assert.equal(saverPick.selectedOption?.tier, 'low');
  assert.equal(saverPick.downgradedByNetwork, true);

  const slowNetPick = selectEffectiveStreamOption(options, {
    requestedTier: 'high',
    dataSaver: false,
    autoAdjustQuality: true,
    effectiveType: '2g',
  });
  assert.equal(slowNetPick.selectedOption?.tier, 'low');
  assert.equal(slowNetPick.downgradedByNetwork, true);

  // Requesting unavailable hi_res picks nearest available lower tier honestly
  const unavailablePick = selectEffectiveStreamOption(options, {
    requestedTier: 'hi_res',
    dataSaver: false,
    autoAdjustQuality: false,
  });
  assert.equal(unavailablePick.selectedOption?.tier, 'high');
});

test('resolveTargetStreamQuality adapts to Data Saver and slow network stalls', () => {
  const baseProfile = {
    wifiQuality: 'very_high' as const,
    cellularQuality: 'high' as const,
    autoAdjustQuality: true,
  };
  assert.equal(resolveTargetStreamQuality(baseProfile, true, false, '4g', 0), 'very_high');
  assert.equal(resolveTargetStreamQuality(baseProfile, true, true, '4g', 0), 'low');
  assert.equal(resolveTargetStreamQuality(baseProfile, true, false, '2g', 0), 'low');
  assert.equal(resolveTargetStreamQuality(baseProfile, true, false, '3g', 0), 'normal');
  assert.equal(resolveTargetStreamQuality(baseProfile, true, false, '4g', 1), 'high');
});

