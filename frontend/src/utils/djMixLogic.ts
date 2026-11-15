import type {
  DjTransitionStyle,
  DjVolumeCurve,
  MediaItem,
  PlaylistMixSettings,
  TrackBpmAnalysis,
} from '../types/music';
import { clampNumber, computeEqualPowerCrossfade } from './audioMath';

export const MIN_DJ_TRANSITION_SECONDS = 1;
export const MAX_DJ_TRANSITION_SECONDS = 12;
export const DEFAULT_DJ_TRANSITION_SECONDS = 6;

export const DEFAULT_PLAYLIST_MIX_SETTINGS: PlaylistMixSettings = {
  enabled: false,
  durationSeconds: DEFAULT_DJ_TRANSITION_SECONDS,
  transitionStyle: 'bass-swap',
  beatMatch: true,
  eqBlend: true,
  volumeCurve: 'equal-power',
};

export interface DjTransitionStyleMeta {
  id: DjTransitionStyle;
  label: string;
  description: string;
}

export const DJ_TRANSITION_STYLES: DjTransitionStyleMeta[] = [
  {
    id: 'bass-swap',
    label: 'Tukar Bass',
    description: 'Mid/high masuk halus lalu bass bertukar bersih di titik tengah transisi',
  },
  {
    id: 'smooth',
    label: 'Halus',
    description: 'Crossfade bertahap dengan pengurangan bass ringan untuk transisi mulus',
  },
  {
    id: 'filter-sweep',
    label: 'Filter Sweep',
    description: 'Lagu lama naik high-pass, lagu baru membuka low-pass secara progresif',
  },
  {
    id: 'cut',
    label: 'Potong Cepat',
    description: 'Perpindahan ritmis cepat antar lagu tepat pada ketukan',
  },
];

export interface DjVolumeCurveMeta {
  id: DjVolumeCurve;
  label: string;
}

export const DJ_VOLUME_CURVES: DjVolumeCurveMeta[] = [
  { id: 'equal-power', label: 'Equal-Power' },
  { id: 's-curve', label: 'S-Curve' },
  { id: 'linear', label: 'Linear' },
];

export interface DjTransitionFrame {
  outGain: number;
  inGain: number;
  outLowDb: number;
  outMidDb: number;
  outHighDb: number;
  inLowDb: number;
  inMidDb: number;
  inHighDb: number;
  outHighpassHz: number;
  inLowpassHz: number;
}

export interface BeatMatchPlan {
  beatMatched: boolean;
  effectiveOutBpm: number;
  effectiveInBpm: number;
  octaveMultiplier: 0.5 | 1 | 2;
  incomingStartRate: number;
  tempoDeltaPct: number;
}

export function normalizePlaylistMixSettings(
  raw?: Partial<PlaylistMixSettings> | null,
): PlaylistMixSettings {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const durationSeconds = Math.round(
    clampNumber(
      typeof safe.durationSeconds === 'number'
        ? safe.durationSeconds
        : DEFAULT_DJ_TRANSITION_SECONDS,
      MIN_DJ_TRANSITION_SECONDS,
      MAX_DJ_TRANSITION_SECONDS,
    ),
  );

  const validStyles: DjTransitionStyle[] = ['smooth', 'bass-swap', 'filter-sweep', 'cut'];
  const transitionStyle: DjTransitionStyle = validStyles.includes(
    safe.transitionStyle as DjTransitionStyle,
  )
    ? (safe.transitionStyle as DjTransitionStyle)
    : DEFAULT_PLAYLIST_MIX_SETTINGS.transitionStyle;

  const validCurves: DjVolumeCurve[] = ['equal-power', 's-curve', 'linear'];
  const volumeCurve: DjVolumeCurve = validCurves.includes(safe.volumeCurve as DjVolumeCurve)
    ? (safe.volumeCurve as DjVolumeCurve)
    : DEFAULT_PLAYLIST_MIX_SETTINGS.volumeCurve;

  return {
    enabled: Boolean(safe.enabled),
    durationSeconds,
    transitionStyle,
    beatMatch: typeof safe.beatMatch === 'boolean' ? safe.beatMatch : true,
    eqBlend: typeof safe.eqBlend === 'boolean' ? safe.eqBlend : true,
    volumeCurve,
  };
}

/**
 * Clamp DJ transition length safely for short tracks or sound bites so playback
 * never transitions prematurely before a track establishes itself.
 */
export function clampEffectiveTransitionSeconds(
  requestedSeconds: number,
  outDurationSeconds: number,
  inDurationSeconds?: number | null,
): number {
  const requested = clampNumber(
    Number.isFinite(requestedSeconds) ? requestedSeconds : DEFAULT_DJ_TRANSITION_SECONDS,
    0,
    MAX_DJ_TRANSITION_SECONDS,
  );
  if (requested <= 0) return 0;

  if (!Number.isFinite(outDurationSeconds) || outDurationSeconds <= 1.2) {
    return 0;
  }

  let cap = outDurationSeconds * 0.42;
  if (typeof inDurationSeconds === 'number' && Number.isFinite(inDurationSeconds) && inDurationSeconds > 1.2) {
    cap = Math.min(cap, inDurationSeconds * 0.48);
  }
  const effective = Math.min(requested, cap);
  return effective >= 0.4 ? Math.round(effective * 10) / 10 : 0;
}

/**
 * Compute per-deck volume + 3-band DJ EQ + sweep filters for transition progress [0..1].
 */
export function computeDjTransitionFrame(
  progress01: number,
  settings: Pick<PlaylistMixSettings, 'transitionStyle' | 'eqBlend' | 'volumeCurve'>,
): DjTransitionFrame {
  const t = clampNumber(progress01, 0, 1);

  // Volume envelope according to curve & style
  const effectiveCurveT =
    settings.transitionStyle === 'cut'
      ? clampNumber((t - 0.34) / 0.32, 0, 1)
      : t;

  let outGain: number;
  let inGain: number;

  if (settings.volumeCurve === 'linear') {
    outGain = 1 - effectiveCurveT;
    inGain = effectiveCurveT;
  } else if (settings.volumeCurve === 's-curve') {
    const smooth = effectiveCurveT * effectiveCurveT * (3 - 2 * effectiveCurveT);
    outGain = Math.sqrt(clampNumber(1 - smooth, 0, 1));
    inGain = Math.sqrt(clampNumber(smooth, 0, 1));
  } else {
    const eqp = computeEqualPowerCrossfade(effectiveCurveT);
    outGain = eqp.outGain;
    inGain = eqp.inGain;
  }

  let outLowDb = 0;
  let outMidDb = 0;
  let outHighDb = 0;
  let inLowDb = 0;
  let inMidDb = 0;
  let inHighDb = 0;
  let outHighpassHz = 20;
  let inLowpassHz = 20000;

  if (settings.transitionStyle === 'bass-swap') {
    // Incoming mid/high enters early, low stays tucked at -18 dB until t=0.48..0.54
    const swapT = clampNumber((t - 0.46) / 0.08, 0, 1);
    inLowDb = settings.eqBlend ? -18 * (1 - swapT) : 0;
    outLowDb = settings.eqBlend ? -18 * swapT : 0;
    inMidDb = settings.eqBlend ? -4 * clampNumber(1 - t / 0.42, 0, 1) : 0;
    outMidDb = settings.eqBlend ? -5 * clampNumber((t - 0.58) / 0.42, 0, 1) : 0;
    inHighDb = settings.eqBlend ? -3 * clampNumber(1 - t / 0.3, 0, 1) : 0;
    outHighDb = settings.eqBlend ? -4 * clampNumber((t - 0.7) / 0.3, 0, 1) : 0;
  } else if (settings.transitionStyle === 'filter-sweep') {
    // Smooth logarithmic frequency sweep
    outHighpassHz = Math.round(20 * Math.pow(110, Math.pow(t, 1.35))); // 20 Hz -> 2200 Hz
    inLowpassHz = Math.round(620 * Math.pow(32.25, Math.pow(t, 0.9))); // 620 Hz -> ~20000 Hz
    if (settings.eqBlend) {
      const lowFadeOut = clampNumber((t - 0.35) / 0.4, 0, 1);
      const lowFadeIn = clampNumber((t - 0.25) / 0.45, 0, 1);
      outLowDb = -10 * lowFadeOut;
      inLowDb = -12 * (1 - lowFadeIn);
    }
  } else if (settings.transitionStyle === 'cut') {
    if (settings.eqBlend) {
      const cutSwap = t >= 0.48 ? 1 : 0;
      outLowDb = cutSwap ? -14 : 0;
      inLowDb = cutSwap ? 0 : -14;
    }
  } else {
    // 'smooth'
    if (settings.eqBlend) {
      const late = clampNumber((t - 0.4) / 0.6, 0, 1);
      const early = clampNumber(t / 0.55, 0, 1);
      outLowDb = -8 * late;
      inLowDb = -10 * (1 - early);
      outHighDb = -2.5 * late;
      inHighDb = -2.5 * (1 - early);
    }
  }

  const cleanGain = (n: number) => Math.round(clampNumber(n, 0, 1) * 1000) / 1000 || 0;
  const cleanDb = (n: number) => Math.round(clampNumber(n, -24, 6) * 10) / 10 || 0;

  return {
    outGain: cleanGain(outGain),
    inGain: cleanGain(inGain),
    outLowDb: cleanDb(outLowDb),
    outMidDb: cleanDb(outMidDb),
    outHighDb: cleanDb(outHighDb),
    inLowDb: cleanDb(inLowDb),
    inMidDb: cleanDb(inMidDb),
    inHighDb: cleanDb(inHighDb),
    outHighpassHz: clampNumber(outHighpassHz, 20, 4000),
    inLowpassHz: clampNumber(inLowpassHz, 400, 20000),
  };
}

/**
 * Lightweight, low-CPU time-domain energy-flux + autocorrelation BPM detector.
 * Processes mono/downmixed PCM audio (typically first ~25-40 seconds) in ~10ms hops.
 */
export function estimateBpmFromPcm(
  samples: Float32Array,
  sampleRate: number,
): TrackBpmAnalysis | null {
  if (!samples || samples.length < sampleRate * 3 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }

  const hopSize = Math.max(64, Math.round(sampleRate * 0.01)); // 100 Hz onset envelope
  const envRate = sampleRate / hopSize;
  const frameCount = Math.floor(samples.length / hopSize);
  if (frameCount < 250) return null;

  // Low-pass + onset flux per 10ms frame so kicks/bass transients dominate
  const energy = new Float32Array(frameCount);
  let lp = 0;
  let prevSample = 0;
  const alpha = 0.14;
  let totalRms = 0;

  for (let f = 0; f < frameCount; f += 1) {
    const start = f * hopSize;
    let lowSum = 0;
    let hiTransientSum = 0;
    for (let i = 0; i < hopSize; i += 1) {
      const x = samples[start + i];
      lp += alpha * (x - lp);
      const hi = x - prevSample;
      prevSample = x;
      lowSum += lp * lp;
      hiTransientSum += hi * hi * 0.25;
    }
    const rms = Math.sqrt((lowSum + hiTransientSum) / hopSize);
    energy[f] = rms;
    totalRms += rms;
  }

  const avgRms = totalRms / frameCount;
  if (avgRms < 1e-4) {
    return null;
  }

  // Half-wave rectified spectral-flux-style difference minus local moving average
  const rawFlux = new Float32Array(frameCount);
  for (let f = 1; f < frameCount; f += 1) {
    const diff = energy[f] - energy[f - 1];
    rawFlux[f] = diff > 0 ? diff : 0;
  }

  const onset = new Float32Array(frameCount);
  const winRadius = Math.max(4, Math.round(envRate * 0.18));
  let peakOnset = 0;
  for (let f = 0; f < frameCount; f += 1) {
    const lo = Math.max(0, f - winRadius);
    const hi = Math.min(frameCount - 1, f + winRadius);
    let localSum = 0;
    for (let j = lo; j <= hi; j += 1) {
      localSum += rawFlux[j];
    }
    const localMean = localSum / (hi - lo + 1);
    const val = Math.max(0, rawFlux[f] - localMean * 1.05);
    onset[f] = val;
    if (val > peakOnset) peakOnset = val;
  }

  if (peakOnset < 1e-5) {
    return null;
  }

  // Search 65..175 BPM via lag autocorrelation
  const minBpm = 65;
  const maxBpm = 175;
  const minLag = Math.max(10, Math.floor((60 * envRate) / maxBpm));
  const maxLag = Math.min(frameCount - 20, Math.ceil((60 * envRate) / minBpm));

  if (maxLag <= minLag) return null;

  const scores = new Float64Array(maxLag + 1);
  let scoreSum = 0;
  let scoreCount = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    const n = frameCount - lag;
    for (let i = 0; i < n; i += 1) {
      corr += onset[i] * onset[i + lag];
    }
    const normalized = corr / n;
    // Slight perceptual weight favoring natural dance/pop tempo zone (92-144 BPM)
    const candidateBpm = (60 * envRate) / lag;
    const tempoPrior =
      candidateBpm >= 90 && candidateBpm <= 148
        ? 1.08
        : candidateBpm >= 75 && candidateBpm <= 162
          ? 1.0
          : 0.92;
    const weighted = normalized * tempoPrior;
    scores[lag] = weighted;
    scoreSum += weighted;
    scoreCount += 1;
  }

  let bestLag = minLag;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (scores[lag] > bestScore) {
      bestScore = scores[lag];
      bestLag = lag;
    }
  }

  const meanScore = scoreCount > 0 ? scoreSum / scoreCount : 0;
  if (bestScore <= 0 || meanScore <= 0) return null;

  // Parabolic interpolation around bestLag for sub-frame precision
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const s0 = scores[bestLag - 1];
    const s1 = scores[bestLag];
    const s2 = scores[bestLag + 1];
    const denom = s0 - 2 * s1 + s2;
    if (Math.abs(denom) > 1e-12) {
      const shift = 0.5 * (s0 - s2) / denom;
      refinedLag += clampNumber(shift, -0.5, 0.5);
    }
  }

  let detectedBpm = (60 * envRate) / refinedLag;
  if (detectedBpm < 72 && detectedBpm * 2 <= 168) {
    // Check if half-lag (double BPM) has strong support
    const halfLag = Math.round(refinedLag / 2);
    if (halfLag >= minLag && scores[halfLag] >= bestScore * 0.72) {
      detectedBpm *= 2;
    }
  }
  detectedBpm = Math.round(clampNumber(detectedBpm, minBpm, maxBpm));
  const beatIntervalSec = 60 / detectedBpm;

  // Fold onset curve modulo beat period into 16 phase bins to locate first downbeat phase
  const bins = 16;
  const binEnergy = new Float64Array(bins);
  const periodFrames = beatIntervalSec * envRate;
  for (let f = 0; f < frameCount; f += 1) {
    const phase = ((f % periodFrames) / periodFrames) * bins;
    const idx = Math.min(bins - 1, Math.floor(phase));
    binEnergy[idx] += onset[f];
  }
  let bestBin = 0;
  for (let b = 1; b < bins; b += 1) {
    if (binEnergy[b] > binEnergy[bestBin]) bestBin = b;
  }
  const firstBeatSec = Math.round(((bestBin / bins) * beatIntervalSec) * 1000) / 1000;

  const peakToMean = bestScore / Math.max(1e-12, meanScore);
  const confidence = Math.round(clampNumber((peakToMean - 1.15) / 2.2, 0.15, 0.99) * 100) / 100;

  return {
    bpm: detectedBpm,
    confidence,
    source: 'decoded',
    beatIntervalSec: Math.round(beatIntervalSec * 1000) / 1000,
    firstBeatSec,
  };
}

function hashTextDeterministic(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Honest metadata-based BPM heuristic used ONLY when remote stream PCM cannot
 * be decoded directly (e.g. YouTube IFrame / CORS-restricted proxy streams).
 */
export function estimateFallbackBpm(track: Pick<MediaItem, 'id' | 'title' | 'genre' | 'artists'>): TrackBpmAnalysis {
  const hint = `${track.genre || ''} ${track.title || ''}`.toLowerCase();
  let min = 98;
  let max = 124;

  if (/lofi|lo-fi|chill|ambient|ballad|acoustic|jazz|sleep|piano/.test(hint)) {
    min = 78;
    max = 98;
  } else if (/hip[- ]?hop|rap|trap|r&b|rnb/.test(hint)) {
    min = 86;
    max = 104;
  } else if (/edm|dance|house|techno|club|remix|dj|party|electronic/.test(hint)) {
    min = 120;
    max = 134;
  } else if (/drum|dnb|workout|gym|run|rock|punk|metal/.test(hint)) {
    min = 126;
    max = 148;
  }

  const seed = hashTextDeterministic(
    `${track.id}:${track.title}:${track.artists?.[0]?.name || ''}`,
  );
  const bpm = min + (seed % (max - min + 1));
  const beatIntervalSec = Math.round((60 / bpm) * 1000) / 1000;
  return {
    bpm,
    confidence: 0.35,
    source: 'estimated',
    beatIntervalSec,
    firstBeatSec: 0,
  };
}

/**
 * Match incoming track playbackRate cleanly to outgoing BPM within a natural,
 * non-chipmunk pitch-preserved stretch range (default +-8%).
 */
export function computeBeatMatchPlan(
  outgoingBpm: number,
  incomingBpm: number,
  beatMatchEnabled: boolean,
  maxRateDelta = 0.08,
): BeatMatchPlan {
  const safeOut = clampNumber(Number.isFinite(outgoingBpm) ? outgoingBpm : 120, 50, 210);
  const safeIn = clampNumber(Number.isFinite(incomingBpm) ? incomingBpm : safeOut, 50, 210);

  if (!beatMatchEnabled) {
    return {
      beatMatched: false,
      effectiveOutBpm: Math.round(safeOut),
      effectiveInBpm: Math.round(safeIn),
      octaveMultiplier: 1,
      incomingStartRate: 1,
      tempoDeltaPct: 0,
    };
  }

  const multipliers: Array<0.5 | 1 | 2> = [0.5, 1, 2];
  let bestMult: 0.5 | 1 | 2 = 1;
  let bestRatioDiff = Number.POSITIVE_INFINITY;
  for (const mult of multipliers) {
    const candidate = safeIn * mult;
    const diff = Math.abs(Math.log2(safeOut / candidate));
    if (diff < bestRatioDiff) {
      bestRatioDiff = diff;
      bestMult = mult;
    }
  }

  const matchedInBpm = safeIn * bestMult;
  const rawRate = safeOut / matchedInBpm;
  const minRate = 1 - maxRateDelta;
  const maxRate = 1 + maxRateDelta;
  const clampedRate = Math.round(clampNumber(rawRate, minRate, maxRate) * 1000) / 1000;

  return {
    beatMatched: Math.abs(clampedRate - 1) <= maxRateDelta + 0.001,
    effectiveOutBpm: Math.round(safeOut),
    effectiveInBpm: Math.round(matchedInBpm),
    octaveMultiplier: bestMult,
    incomingStartRate: clampedRate,
    tempoDeltaPct: Math.round((clampedRate - 1) * 1000) / 10,
  };
}

/**
 * Compute phase-aligned start cue (in seconds) for incoming deck so its first beat
 * lands synchronously on the outgoing deck's current beat phase.
 */
export function computePhaseAlignedCueOffset(
  outgoingCurrentSec: number,
  outgoingAnalysis: TrackBpmAnalysis | null | undefined,
  incomingAnalysis: TrackBpmAnalysis | null | undefined,
  incomingDurationSec?: number | null,
): number {
  if (!outgoingAnalysis || !incomingAnalysis) return 0;
  if (
    typeof incomingDurationSec === 'number' &&
    Number.isFinite(incomingDurationSec) &&
    incomingDurationSec > 0 &&
    incomingDurationSec < 15
  ) {
    return 0;
  }

  const outPeriod = outgoingAnalysis.beatIntervalSec;
  const inPeriod = incomingAnalysis.beatIntervalSec;
  if (!Number.isFinite(outPeriod) || outPeriod <= 0.2 || !Number.isFinite(inPeriod) || inPeriod <= 0.2) {
    return 0;
  }

  const elapsedBeats = Math.max(0, outgoingCurrentSec - outgoingAnalysis.firstBeatSec) / outPeriod;
  const outBeatFraction = elapsedBeats - Math.floor(elapsedBeats); // 0..1 inside current beat

  // Align incoming firstBeatSec + outBeatFraction * inPeriod so beats overlap tightly
  const alignedSec = incomingAnalysis.firstBeatSec + outBeatFraction * inPeriod;
  const maxAllowed =
    typeof incomingDurationSec === 'number' && Number.isFinite(incomingDurationSec) && incomingDurationSec > 4
      ? Math.min(2.5, incomingDurationSec * 0.15)
      : 1.5;

  return Math.round(clampNumber(alignedSec, 0, maxAllowed) * 1000) / 1000;
}
