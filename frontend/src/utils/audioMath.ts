import type {
  ConcreteQualityTier,
  EqPreset,
  LocalAudioProfile,
  NormalizationTarget,
  StreamQualityOption,
  StreamQualityTier,
} from '../types/music';

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

export const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const BUILTIN_EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', preampDb: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass_booster', name: 'Bass Booster', preampDb: -2, bands: [6, 5.5, 4.5, 3, 1, 0, 0, 0, 0, 0] },
  { id: 'bass_reducer', name: 'Bass Reducer', preampDb: 0, bands: [-6, -5, -4, -2.5, -1, 0, 0, 0, 0, 0] },
  { id: 'treble_booster', name: 'Treble Booster', preampDb: -2, bands: [0, 0, 0, 0, 0, 1, 2.5, 4, 5.5, 6] },
  { id: 'vocal_booster', name: 'Vocal Booster', preampDb: -1, bands: [-2, -1.5, -0.5, 1.5, 3.5, 4, 3.5, 2, 0.5, -1] },
  { id: 'acoustic', name: 'Acoustic', preampDb: -1, bands: [3, 2.5, 1.5, 0.5, 1.5, 2, 3, 3.5, 2.5, 1.5] },
  { id: 'classical', name: 'Classical', preampDb: -1, bands: [3.5, 2.5, 1.5, 0.5, -0.5, 0, 1.5, 2.5, 3, 3.5] },
  { id: 'dance', name: 'Dance', preampDb: -2, bands: [5, 4, 2, 0, 0.5, 2, 3.5, 4, 3.5, 2.5] },
  { id: 'electronic', name: 'Electronic', preampDb: -2, bands: [5, 4.5, 2, -1, -1.5, 0.5, 2.5, 4, 5, 4.5] },
  { id: 'hip_hop', name: 'Hip-Hop', preampDb: -2, bands: [5.5, 5, 3, 1, -1, -0.5, 1.5, 2, 3, 2.5] },
  { id: 'jazz', name: 'Jazz', preampDb: -1, bands: [3, 2, 1, 2, -1, -1, 0, 1.5, 2.5, 3] },
  { id: 'latin', name: 'Latin', preampDb: -1.5, bands: [4, 3, 0, 0, -1, -1, -1, 1.5, 3, 4] },
  { id: 'loudness', name: 'Loudness', preampDb: -2.5, bands: [5.5, 4, 0, 0, -1.5, 0, -0.5, -3, 4.5, 2] },
  { id: 'piano', name: 'Piano', preampDb: -1, bands: [2.5, 1.5, 0, 2, 2.5, 1, 2.5, 3.5, 2.5, 2] },
  { id: 'pop', name: 'Pop', preampDb: -1.5, bands: [-1.5, 1, 3.5, 4, 2.5, 0, -1, -1, 1.5, 2.5] },
  { id: 'rnb', name: 'R&B', preampDb: -2, bands: [4, 6, 3.5, 1, -1.5, -1, 1.5, 2.5, 3, 3.5] },
  { id: 'rock', name: 'Rock', preampDb: -2, bands: [4.5, 3.5, 2, -1, -2, 0.5, 3, 4.5, 5, 4.5] },
  { id: 'small_speakers', name: 'Small Speakers', preampDb: -2, bands: [-5, -3, 1, 3.5, 4, 3.5, 2.5, 1.5, 0.5, -1] },
  { id: 'spoken_word', name: 'Spoken Word', preampDb: -1, bands: [-4, -3, -1, 2, 4.5, 5, 4, 2, 0, -2.5] },
];

export const NORMALIZATION_TARGETS_LUFS: Record<Exclude<NormalizationTarget, 'off'>, number> = {
  quiet: -19,
  normal: -14,
  loud: -11,
};

export interface StreamQualityTierMeta {
  id: StreamQualityTier;
  label: string;
  shortLabel: string;
  description: string;
}

export const STREAM_QUALITY_TIERS: StreamQualityTierMeta[] = [
  {
    id: 'auto',
    label: 'Otomatis',
    shortLabel: 'Otomatis',
    description: 'Menyesuaikan bitrate sesuai kondisi jaringan secara otomatis',
  },
  {
    id: 'low',
    label: 'Rendah',
    shortLabel: 'Rendah (~96 kbps)',
    description: 'Hemat kuota hingga ~96 kbps',
  },
  {
    id: 'normal',
    label: 'Normal',
    shortLabel: 'Normal (~160 kbps)',
    description: 'Kualitas standar seimbang (128–160 kbps)',
  },
  {
    id: 'high',
    label: 'Tinggi',
    shortLabel: 'Tinggi (~256 kbps)',
    description: 'Detail audio jernih hingga ~256 kbps',
  },
  {
    id: 'very_high',
    label: 'Sangat Tinggi',
    shortLabel: 'Sangat Tinggi (320 kbps)',
    description: 'Kualitas terkompresi maksimal 320 kbps',
  },
  {
    id: 'lossless',
    label: 'Lossless',
    shortLabel: 'Lossless (16-bit / 44,1 kHz)',
    description: 'Audio tanpa kompresi lossy (FLAC / WAV 16-bit / 44,1 kHz)',
  },
  {
    id: 'hi_res',
    label: 'Hi-Res Lossless',
    shortLabel: 'Hi-Res (>16-bit / >44,1 kHz)',
    description: 'Resolusi tinggi di atas 16-bit atau 44,1 kHz (hingga 24-bit/192 kHz)',
  },
];

export const CONCRETE_QUALITY_ORDER: ConcreteQualityTier[] = [
  'low',
  'normal',
  'high',
  'very_high',
  'lossless',
  'hi_res',
];

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampPlaybackRate(rate: number): number {
  return Math.round(clampNumber(rate, 0.5, 2.0) * 100) / 100;
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

export function getNextPlaybackRate(currentRate: number): number {
  const idx = PLAYBACK_RATE_OPTIONS.findIndex((r) => Math.abs(r - currentRate) < 0.01);
  if (idx >= 0) {
    return PLAYBACK_RATE_OPTIONS[(idx + 1) % PLAYBACK_RATE_OPTIONS.length];
  }
  const nextHigher = PLAYBACK_RATE_OPTIONS.find((r) => r > currentRate + 0.01);
  return nextHigher ?? PLAYBACK_RATE_OPTIONS[0];
}

export function computeUnmutedVolume(
  currentVolume: number,
  lastNonZeroVolume: number,
  maxVolumeCap = 100,
): number {
  const safeCap = clampNumber(Math.round(maxVolumeCap), 10, 100);
  if (Number.isFinite(currentVolume) && currentVolume > 0) {
    return Math.round(clampNumber(currentVolume, 1, safeCap));
  }
  const fallback =
    Number.isFinite(lastNonZeroVolume) && lastNonZeroVolume > 0 ? lastNonZeroVolume : 50;
  return Math.round(clampNumber(fallback, 1, safeCap));
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

export const DEFAULT_CROSSFADE_SECONDS = 3;
export const MAX_CROSSFADE_SECONDS = 12;

export function clampCrossfadeSeconds(seconds: number): number {
  return Math.round(clampNumber(seconds, 0, MAX_CROSSFADE_SECONDS));
}

export function resolveEffectiveCrossfadeSeconds(profile: {
  crossfadeEnabled?: boolean;
  crossfadeSeconds: number;
  directMode?: boolean;
}): number {
  if (profile.directMode) return 0;
  if (profile.crossfadeEnabled === false) return 0;
  return clampCrossfadeSeconds(profile.crossfadeSeconds);
}

export function computeNextCrossfadeState(
  current: { crossfadeEnabled?: boolean; crossfadeSeconds: number },
  action:
    | { type: 'toggle'; enabled?: boolean }
    | { type: 'set-duration'; seconds: number },
): { crossfadeEnabled: boolean; crossfadeSeconds: number; effectiveSeconds: number } {
  const curSecs = clampCrossfadeSeconds(current.crossfadeSeconds);
  const curEnabled =
    current.crossfadeEnabled !== undefined ? current.crossfadeEnabled : curSecs > 0;

  if (action.type === 'toggle') {
    const nextEnabled = action.enabled !== undefined ? action.enabled : !curEnabled;
    if (!nextEnabled) {
      return {
        crossfadeEnabled: false,
        crossfadeSeconds: curSecs,
        effectiveSeconds: 0,
      };
    }
    const restoredSecs = curSecs > 0 ? curSecs : DEFAULT_CROSSFADE_SECONDS;
    return {
      crossfadeEnabled: true,
      crossfadeSeconds: restoredSecs,
      effectiveSeconds: restoredSecs,
    };
  }

  const nextSecs = clampCrossfadeSeconds(action.seconds);
  if (nextSecs <= 0) {
    return {
      crossfadeEnabled: false,
      crossfadeSeconds: 0,
      effectiveSeconds: 0,
    };
  }
  return {
    crossfadeEnabled: true,
    crossfadeSeconds: nextSecs,
    effectiveSeconds: nextSecs,
  };
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
  const dbfs = 20 * Math.log10(rmsLinear);
  return Math.round(clampNumber(dbfs - 0.7, -36, -3) * 10) / 10;
}

export function computeNormalizationGain(
  trackLufs: number,
  target: NormalizationTarget,
  peakLinear = 0.95,
  replayGainDb?: number | null,
): number {
  if (target === 'off') return 1;
  const targetLufs = NORMALIZATION_TARGETS_LUFS[target];

  let diffDb: number;
  if (typeof replayGainDb === 'number' && Number.isFinite(replayGainDb)) {
    // Standard ReplayGain references -18 LUFS; shift smoothly toward requested LUFS target
    diffDb = clampNumber(replayGainDb + (targetLufs - -18), -14, 14);
  } else {
    const safeTrackLufs = clampNumber(Number.isFinite(trackLufs) ? trackLufs : -14, -36, -3);
    diffDb = clampNumber(targetLufs - safeTrackLufs, -14, 14);
  }

  const linearGain = Math.pow(10, diffDb / 20);
  const safePeak = clampNumber(peakLinear > 0.01 ? peakLinear : 0.95, 0.05, 1);
  // Limiter ceiling guard
  const maxSafeGain = 0.98 / safePeak;
  return Math.min(linearGain, Math.max(1, maxSafeGain * 1.15), 3.2);
}

export function preampDbToLinear(preampDb: number): number {
  const clamped = clampEqGainDb(preampDb);
  return Math.pow(10, clamped / 20);
}

export function bassBoostLevelToDb(enabled: boolean, level0to100: number): number {
  if (!enabled) return 0;
  return Math.round((clampNumber(level0to100, 0, 100) / 100) * 9 * 10) / 10;
}

export function stereoWidenerLevelToSideGain(enabled: boolean, level0to100: number): number {
  if (!enabled) return 1;
  return 1 + (clampNumber(level0to100, 0, 100) / 100) * 0.85;
}

/**
 * Evaluate exact Web Audio BiquadFilter magnitude in dB at frequency f (Hz)
 * following the W3C Audio EQ Cookbook formulas used by BiquadFilterNode.
 */
function biquadMagnitudeDb(
  type: 'lowshelf' | 'peaking' | 'highshelf',
  f0: number,
  gainDb: number,
  q: number,
  freq: number,
  sampleRate = 48000,
): number {
  if (Math.abs(gainDb) < 1e-4) return 0;
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const w = (2 * Math.PI * freq) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);
  const A = Math.pow(10, gainDb / 40);

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cosW0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW0;
    a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha);
    b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    b2 = A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha);
    a0 = A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha;
    a1 = -2 * (A - 1 + (A + 1) * cosW0);
    a2 = A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha;
  } else {
    // highshelf
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha);
    b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    b2 = A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha);
    a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
    a1 = 2 * (A - 1 - (A + 1) * cosW0);
    a2 = A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha;
  }

  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  const numRe = b0 + b1 * cosW + b2 * cos2W;
  const numIm = -(b1 * sinW + b2 * sin2W);
  const denRe = a0 + a1 * cosW + a2 * cos2W;
  const denIm = -(a1 * sinW + a2 * sin2W);

  const magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-12, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-8, magSq));
}

export interface EqCurvePoint {
  freq: number;
  db: number;
}

export function computeEqFrequencyResponseCurve(params: {
  eqEnabled: boolean;
  directMode?: boolean;
  preampDb: number;
  bands: number[];
  bassBoostEnabled?: boolean;
  bassBoostLevel?: number;
  sampleRate?: number;
  pointCount?: number;
}): EqCurvePoint[] {
  const sampleRate = params.sampleRate ?? 48000;
  const count = Math.max(16, params.pointCount ?? 64);
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const points: EqCurvePoint[] = [];

  const bypassed = Boolean(params.directMode);
  const preampOffset = !bypassed && params.eqEnabled ? clampEqGainDb(params.preampDb) : 0;
  const bassDb = bypassed
    ? 0
    : bassBoostLevelToDb(Boolean(params.bassBoostEnabled), params.bassBoostLevel ?? 0);

  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const freq = Math.pow(10, minLog + t * (maxLog - minLog));
    let totalDb = preampOffset;

    if (!bypassed && params.eqEnabled) {
      for (let b = 0; b < EQ_FREQUENCIES.length; b += 1) {
        const gain = clampEqGainDb(params.bands[b] ?? 0);
        const type = b === 0 ? 'lowshelf' : b === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        const q = type === 'peaking' ? 1.4 : 0.707;
        totalDb += biquadMagnitudeDb(type, EQ_FREQUENCIES[b], gain, q, freq, sampleRate);
      }
    }

    if (bassDb > 0) {
      totalDb += biquadMagnitudeDb('lowshelf', 80, bassDb, 0.707, freq, sampleRate);
    }

    points.push({
      freq: Math.round(freq * 10) / 10,
      db: Math.round(clampNumber(totalDb, -24, 24) * 100) / 100,
    });
  }

  return points;
}

export function formatEqBandShortLabel(freqHz: number): string {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return '0';
  if (freqHz >= 1000) {
    const khz = freqHz / 1000;
    return Number.isInteger(khz) ? `${khz}K` : `${khz.toFixed(1)}K`;
  }
  return `${Math.round(freqHz)}`;
}

export function formatEqDb(db: number): string {
  const rounded = Math.round(clampEqGainDb(db) * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function buildSmoothSvgCurvePath(
  points: Array<{ x: number; y: number }>,
  baselineY: number,
): { strokePath: string; fillPath: string } {
  if (points.length === 0) {
    return { strokePath: '', fillPath: '' };
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  if (points.length === 1) {
    const p = points[0];
    const strokePath = `M${round1(p.x)} ${round1(p.y)}`;
    const fillPath = `${strokePath} L${round1(p.x)} ${round1(baselineY)} Z`;
    return { strokePath, fillPath };
  }
  if (points.length === 2) {
    const [p0, p1] = points;
    const strokePath = `M${round1(p0.x)} ${round1(p0.y)} L${round1(p1.x)} ${round1(p1.y)}`;
    const fillPath = `${strokePath} L${round1(p1.x)} ${round1(baselineY)} L${round1(p0.x)} ${round1(baselineY)} Z`;
    return { strokePath, fillPath };
  }

  const segments: string[] = [`M${round1(points[0].x)} ${round1(points[0].y)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    segments.push(
      `C${round1(cp1x)} ${round1(cp1y)} ${round1(cp2x)} ${round1(cp2y)} ${round1(p2.x)} ${round1(p2.y)}`,
    );
  }

  const strokePath = segments.join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const fillPath = `${strokePath} L${round1(last.x)} ${round1(baselineY)} L${round1(first.x)} ${round1(baselineY)} Z`;
  return { strokePath, fillPath };
}

/**
 * Honest stream quality badge classification from actually loaded metadata only.
 * Never claims Lossless for lossy codecs, and never claims Hi-Res unless lossless AND (>16-bit or >44.1 kHz).
 */
export function classifyStreamQualityBadge(meta: {
  codec?: string | null;
  bitrateKbps?: number | null;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  lossless?: boolean;
}): { lossless: boolean; hiRes: boolean; badgeLabel: string } {
  const codecUpper = (meta.codec || '').toUpperCase();
  const isLosslessContainer =
    Boolean(meta.lossless) &&
    !codecUpper.includes('MP3') &&
    !codecUpper.includes('AAC') &&
    !codecUpper.includes('OPUS') &&
    !codecUpper.includes('VORBIS') &&
    !codecUpper.includes('M4A');

  const sr = meta.sampleRateHz ?? null;
  const bd = meta.bitDepth ?? null;
  const isHiRes =
    isLosslessContainer && ((bd !== null && bd > 16) || (sr !== null && sr > 44100));

  if (isHiRes) {
    const srText = sr ? `${(sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1)} kHz` : '';
    const bdText = bd ? `${bd}-bit` : '';
    const spec = [bdText, srText].filter(Boolean).join('/');
    return {
      lossless: true,
      hiRes: true,
      badgeLabel: spec ? `Hi-Res Lossless · ${spec}` : 'Hi-Res Lossless',
    };
  }

  if (isLosslessContainer) {
    const srText = sr ? `${(sr / 1000).toFixed(1)} kHz` : '';
    const bdText = bd ? `${bd}-bit` : '';
    const spec = [bdText, srText].filter(Boolean).join('/');
    return {
      lossless: true,
      hiRes: false,
      badgeLabel: spec ? `Lossless · ${spec}` : 'Lossless',
    };
  }

  const codecLabel = meta.codec || 'Audio';
  const brLabel = meta.bitrateKbps ? `${Math.round(meta.bitrateKbps)} kbps` : '';
  return {
    lossless: false,
    hiRes: false,
    badgeLabel: [codecLabel, brLabel].filter(Boolean).join(' · ') || 'Audio Standar',
  };
}

export function selectEffectiveStreamOption(
  options: StreamQualityOption[],
  context: {
    requestedTier: StreamQualityTier;
    dataSaver: boolean;
    autoAdjustQuality: boolean;
    effectiveType?: string | null;
    downlinkMbps?: number | null;
    bufferingStalls?: number;
  },
): {
  effectiveTargetTier: ConcreteQualityTier;
  selectedOption: StreamQualityOption | null;
  downgradedByNetwork: boolean;
} {
  const available = options.filter((o) => o.available);
  if (available.length === 0) {
    return { effectiveTargetTier: 'normal', selectedOption: null, downgradedByNetwork: false };
  }

  let target: ConcreteQualityTier =
    context.requestedTier === 'auto' ? 'very_high' : context.requestedTier;
  let downgradedByNetwork = false;

  if (context.dataSaver) {
    const idx = CONCRETE_QUALITY_ORDER.indexOf(target);
    if (idx > CONCRETE_QUALITY_ORDER.indexOf('low')) {
      target = 'low';
      downgradedByNetwork = true;
    }
  } else if (context.requestedTier === 'auto' || context.autoAdjustQuality) {
    const et = (context.effectiveType || '').toLowerCase();
    const dl = context.downlinkMbps ?? null;
    const stalls = context.bufferingStalls ?? 0;

    let maxAllowed: ConcreteQualityTier = target;
    if (et === 'slow-2g' || et === '2g' || (dl !== null && dl < 0.6) || stalls >= 3) {
      maxAllowed = 'low';
    } else if (et === '3g' || (dl !== null && dl < 2.0) || stalls >= 2) {
      maxAllowed = 'normal';
    } else if (stalls >= 1 || (dl !== null && dl < 5.0)) {
      maxAllowed = 'high';
    }

    if (CONCRETE_QUALITY_ORDER.indexOf(maxAllowed) < CONCRETE_QUALITY_ORDER.indexOf(target)) {
      target = maxAllowed;
      downgradedByNetwork = true;
    }
  }

  const exact = available.find((o) => o.tier === target);
  if (exact) {
    return { effectiveTargetTier: target, selectedOption: exact, downgradedByNetwork };
  }

  // Pick nearest available tier without ever claiming an unavailable higher tier
  const targetIdx = CONCRETE_QUALITY_ORDER.indexOf(target);
  const lowerCandidates = available
    .filter((o) => CONCRETE_QUALITY_ORDER.indexOf(o.tier) <= targetIdx)
    .sort((a, b) => CONCRETE_QUALITY_ORDER.indexOf(b.tier) - CONCRETE_QUALITY_ORDER.indexOf(a.tier));
  if (lowerCandidates.length > 0) {
    return {
      effectiveTargetTier: lowerCandidates[0].tier,
      selectedOption: lowerCandidates[0],
      downgradedByNetwork,
    };
  }

  const lowestHigher = [...available].sort(
    (a, b) => CONCRETE_QUALITY_ORDER.indexOf(a.tier) - CONCRETE_QUALITY_ORDER.indexOf(b.tier),
  )[0];
  return {
    effectiveTargetTier: lowestHigher.tier,
    selectedOption: lowestHigher,
    downgradedByNetwork,
  };
}

export function resolveTargetStreamQuality(
  profile: Pick<LocalAudioProfile, 'wifiQuality' | 'cellularQuality' | 'autoAdjustQuality'>,
  _isOnline: boolean,
  dataSaver: boolean,
  effectiveType?: string | null,
  bufferingStalls = 0,
): ConcreteQualityTier {
  if (dataSaver) return 'low';
  const et = (effectiveType || '').toLowerCase();
  const isCellularLike = et === 'slow-2g' || et === '2g' || et === '3g';
  const requested = isCellularLike ? profile.cellularQuality : profile.wifiQuality;

  let target: ConcreteQualityTier = requested === 'auto' ? 'high' : requested;
  if (requested === 'auto' || profile.autoAdjustQuality) {
    let maxAllowed: ConcreteQualityTier = target;
    if (et === 'slow-2g' || et === '2g' || bufferingStalls >= 3) {
      maxAllowed = 'low';
    } else if (et === '3g' || bufferingStalls >= 2) {
      maxAllowed = 'normal';
    } else if (bufferingStalls >= 1) {
      maxAllowed = 'high';
    }
    if (CONCRETE_QUALITY_ORDER.indexOf(maxAllowed) < CONCRETE_QUALITY_ORDER.indexOf(target)) {
      target = maxAllowed;
    }
  }
  return target;
}

