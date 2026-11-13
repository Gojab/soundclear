import type { EqPreset, NormalizationTarget } from '../types/music';

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_FREQUENCY_LABELS = [
  '31 Hz',
  '62 Hz',
  '125 Hz',
  '250 Hz',
  '500 Hz',
  '1 kHz',
  '2 kHz',
  '4 kHz',
  '8 kHz',
  '16 kHz',
] as const;

export const PLAYBACK_RATE_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const BUILTIN_EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Datar', preampDb: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass_booster', name: 'Bass Booster', preampDb: -2, bands: [6, 5.5, 4.5, 3, 1, 0, 0, 0, 0, 0] },
  { id: 'treble_booster', name: 'Treble Booster', preampDb: -2, bands: [0, 0, 0, 0, 0, 1, 2.5, 4, 5.5, 6] },
  { id: 'vocal', name: 'Vokal', preampDb: -1, bands: [-2, -1.5, -0.5, 1.5, 3.5, 4, 3.5, 2, 0.5, -1] },
  { id: 'acoustic', name: 'Akustik', preampDb: -1, bands: [3, 2.5, 1.5, 0.5, 1.5, 2, 3, 3.5, 2.5, 1.5] },
  { id: 'electronic', name: 'Elektronik', preampDb: -2, bands: [5, 4.5, 2, -1, -1.5, 0.5, 2.5, 4, 5, 4.5] },
  { id: 'hip_hop', name: 'Hip-hop', preampDb: -2, bands: [5.5, 5, 3, 1, -1, -0.5, 1.5, 2, 3, 2.5] },
  { id: 'classical', name: 'Klasik', preampDb: -1, bands: [3.5, 2.5, 1.5, 0.5, -0.5, 0, 1.5, 2.5, 3, 3.5] },
  { id: 'pop', name: 'Pop', preampDb: -1.5, bands: [-1.5, 1, 3.5, 4, 2.5, 0, -1, -1, 1.5, 2.5] },
  { id: 'rock', name: 'Rock', preampDb: -2, bands: [4.5, 3.5, 2, -1, -2, 0.5, 3, 4.5, 5, 4.5] },
  { id: 'night', name: 'Malam Hari', preampDb: -3, bands: [-4, -3, -1, 1.5, 2.5, 2, 0.5, -1, -2.5, -4] },
];

export const NORMALIZATION_TARGETS_LUFS: Record<Exclude<NormalizationTarget, 'off'>, number> = {
  quiet: -18,
  normal: -14,
  loud: -11,
};

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampEqGainDb(db: number): number {
  return Math.round(clampNumber(db, -12, 12) * 2) / 2;
}

export function clampYoutubeVolume(
  rawVolume: number,
  maxVolumeLimit: number,
  isMuted: boolean,
): number {
  if (isMuted) return 0;
  const safeMax = clampNumber(Math.round(maxVolumeLimit), 10, 100);
  return Math.round(clampNumber(rawVolume, 0, safeMax));
}

export function computeNonOverlappingFadeMultiplier(
  currentSec: number,
  durationSec: number,
  fadeSeconds: number,
): number {
  if (!Number.isFinite(fadeSeconds) || fadeSeconds <= 0) return 1;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;

  const effectiveFade = Math.min(fadeSeconds, durationSec * 0.4);
  if (effectiveFade <= 0.1) return 1;

  if (currentSec < effectiveFade) {
    return clampNumber(currentSec / effectiveFade, 0.05, 1);
  }
  const remaining = durationSec - currentSec;
  if (remaining < effectiveFade) {
    return clampNumber(remaining / effectiveFade, 0.02, 1);
  }
  return 1;
}

export function computeEqualPowerCrossfade(progress01: number): {
  outGain: number;
  inGain: number;
} {
  const t = clampNumber(progress01, 0, 1);
  const angle = t * (Math.PI / 2);
  return {
    outGain: Math.cos(angle),
    inGain: Math.sin(angle),
  };
}

export function estimateLoudnessFromRms(rmsLinear: number): number {
  if (!Number.isFinite(rmsLinear) || rmsLinear <= 1e-6) return -32;
  // Approximate integrated LUFS from broadband RMS with slight perceptual offset
  const dbfs = 20 * Math.log10(rmsLinear);
  return Math.round(clampNumber(dbfs - 0.7, -36, -3) * 10) / 10;
}

export function computeNormalizationGain(
  trackLufs: number,
  target: NormalizationTarget,
  peakLinear = 0.95,
): number {
  if (target === 'off') return 1;
  const targetLufs = NORMALIZATION_TARGETS_LUFS[target];
  const safeTrackLufs = clampNumber(Number.isFinite(trackLufs) ? trackLufs : -14, -36, -3);
  const diffDb = clampNumber(targetLufs - safeTrackLufs, -14, 14);
  const linearGain = Math.pow(10, diffDb / 20);
  const safePeak = clampNumber(peakLinear > 0.01 ? peakLinear : 0.95, 0.05, 1);
  // Prevent digital clipping while allowing loudness lift
  const maxSafeGain = 0.98 / safePeak;
  return Math.min(linearGain, Math.max(1, maxSafeGain * 1.15), 3.2);
}

export function preampDbToLinear(preampDb: number): number {
  const clamped = clampEqGainDb(preampDb);
  return Math.pow(10, clamped / 20);
}
