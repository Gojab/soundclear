import type { LocalAudioProfile } from '../types/music';
import {
  bassBoostLevelToDb,
  computeNormalizationGain,
  EQ_FREQUENCIES,
  estimateLoudnessFromRms,
  preampDbToLinear,
  stereoWidenerLevelToSideGain,
} from '../utils/audioMath';

export type TestToneMode = 'sweep' | 'pink';

export interface ActiveNodeInfo {
  id: string;
  label: string;
  status: 'active' | 'bypassed' | 'inactive';
  detail?: string;
}

export interface AudioDiagnosticsSnapshot {
  contextState: AudioContextState | 'unavailable';
  sampleRate: number | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  sinkIdSupported: boolean;
  sinkIdMethod: 'audioContext' | 'htmlAudio' | 'none';
  currentSinkId: string;
  testToneMode: TestToneMode | null;
  measuredLufs: number | null;
  effectiveNormGain: number;
  skipSilenceCount: number;
  activeNodes: ActiveNodeInfo[];
}

export interface SharedAudioGraph {
  ctx: AudioContext;
  decks: [HTMLAudioElement, HTMLAudioElement];
  deckSources: [MediaElementAudioSourceNode, MediaElementAudioSourceNode];
  deckGains: [GainNode, GainNode];
  inputBus: GainNode;
  dspPathGain: GainNode;
  directBypassGain: GainNode;
  preampNode: GainNode;
  eqNodes: BiquadFilterNode[];
  bassBoostNode: BiquadFilterNode;
  widenerSideGain: GainNode;
  normNode: GainNode;
  limiterNode: DynamicsCompressorNode;
  postRouter: GainNode;
  monoMergeNode: GainNode;
  pannerNode: StereoPannerNode;
  masterGain: GainNode;
  analyser: AnalyserNode;
  testToneGain: GainNode;
  objectUrls: [string | null, string | null];
  trackIds: [string | null, string | null];
  activeDeck: 0 | 1;
  crossfadeTargetId: string | null;
}

let sharedGraph: SharedAudioGraph | null = null;
let testToneMode: TestToneMode | null = null;
let testToneOsc: OscillatorNode | null = null;
let testToneSweepTimer: number | null = null;
let testToneNoiseSource: AudioBufferSourceNode | null = null;
let lastMeasuredLufs: number | null = null;
let lastEffectiveNormGain = 1;
let skipSilenceCount = 0;
let currentSinkId = '';
let lastAppliedProfile: LocalAudioProfile | null = null;
let gestureHooked = false;

const listeners = new Set<() => void>();

function notifyDiagnosticsListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function subscribeAudioDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSinkIdSupport(graph: SharedAudioGraph | null): {
  supported: boolean;
  method: 'audioContext' | 'htmlAudio' | 'none';
} {
  if (typeof window === 'undefined') return { supported: false, method: 'none' };
  const ctxAny = (graph?.ctx ?? null) as unknown as { setSinkId?: unknown } | null;
  if (ctxAny && typeof ctxAny.setSinkId === 'function') {
    return { supported: true, method: 'audioContext' };
  }
  const protoCtx = window.AudioContext?.prototype as unknown as { setSinkId?: unknown } | undefined;
  if (protoCtx && typeof protoCtx.setSinkId === 'function') {
    return { supported: true, method: 'audioContext' };
  }
  const protoMedia = window.HTMLMediaElement?.prototype as unknown as
    | { setSinkId?: unknown }
    | undefined;
  if (protoMedia && typeof protoMedia.setSinkId === 'function') {
    return { supported: true, method: 'htmlAudio' };
  }
  return { supported: false, method: 'none' };
}

function configureAudioElement(audio: HTMLAudioElement, useCors: boolean): void {
  audio.preload = 'auto';
  audio.crossOrigin = useCors ? 'anonymous' : null;
  const mediaWithPitch = audio as HTMLAudioElement & {
    preservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
    mozPreservesPitch?: boolean;
  };
  mediaWithPitch.preservesPitch = true;
  mediaWithPitch.webkitPreservesPitch = true;
  mediaWithPitch.mozPreservesPitch = true;
}

export function ensureAudioGraph(): SharedAudioGraph | null {
  if (sharedGraph) return sharedGraph;
  if (typeof window === 'undefined') return null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  const decks: [HTMLAudioElement, HTMLAudioElement] = [new Audio(), new Audio()];
  decks.forEach((audio) => configureAudioElement(audio, true));

  const deckSources: [MediaElementAudioSourceNode, MediaElementAudioSourceNode] = [
    ctx.createMediaElementSource(decks[0]),
    ctx.createMediaElementSource(decks[1]),
  ];
  const deckGains: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
  deckGains[0].gain.value = 1;
  deckGains[1].gain.value = 0;

  const inputBus = ctx.createGain();
  const dspPathGain = ctx.createGain();
  dspPathGain.gain.value = 1;
  const directBypassGain = ctx.createGain();
  directBypassGain.gain.value = 0;

  const testToneGain = ctx.createGain();
  testToneGain.gain.value = 0.28;

  const preampNode = ctx.createGain();
  const eqNodes: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, idx) => {
    const filter = ctx.createBiquadFilter();
    filter.type =
      idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = idx === 0 || idx === EQ_FREQUENCIES.length - 1 ? 0.707 : 1.4;
    filter.gain.value = 0;
    return filter;
  });

  const bassBoostNode = ctx.createBiquadFilter();
  bassBoostNode.type = 'lowshelf';
  bassBoostNode.frequency.value = 80;
  bassBoostNode.Q.value = 0.707;
  bassBoostNode.gain.value = 0;

  // Stereo Widener M/S matrix: L_out = 0.5*(L+R) + S*0.5*(L-R), R_out = 0.5*(L+R) - S*0.5*(L-R)
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const midL = ctx.createGain();
  const midR = ctx.createGain();
  midL.gain.value = 0.5;
  midR.gain.value = 0.5;
  const midBus = ctx.createGain();

  const sideL = ctx.createGain();
  const sideR = ctx.createGain();
  sideL.gain.value = 0.5;
  sideR.gain.value = -0.5;
  const widenerSideGain = ctx.createGain();
  widenerSideGain.gain.value = 1;
  const sideInvert = ctx.createGain();
  sideInvert.gain.value = -1;

  const normNode = ctx.createGain();
  const limiterNode = ctx.createDynamicsCompressor();
  limiterNode.threshold.value = -1;
  limiterNode.knee.value = 2;
  limiterNode.ratio.value = 20;
  limiterNode.attack.value = 0.002;
  limiterNode.release.value = 0.08;

  const postRouter = ctx.createGain();
  const monoMergeNode = ctx.createGain();
  const pannerNode = ctx.createStereoPanner();
  const masterGain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.78;

  // Wire sources -> inputBus
  deckSources[0].connect(deckGains[0]);
  deckSources[1].connect(deckGains[1]);
  deckGains[0].connect(inputBus);
  deckGains[1].connect(inputBus);
  testToneGain.connect(inputBus);

  // Branch A: Direct bypass path
  inputBus.connect(directBypassGain);
  directBypassGain.connect(postRouter);

  // Branch B: Full DSP path (preamp -> EQ -> Bass Boost -> Stereo Widener -> Norm -> Limiter)
  inputBus.connect(dspPathGain);
  dspPathGain.connect(preampNode);

  let prev: AudioNode = preampNode;
  for (const filter of eqNodes) {
    prev.connect(filter);
    prev = filter;
  }
  prev.connect(bassBoostNode);
  bassBoostNode.connect(splitter);

  splitter.connect(midL, 0);
  splitter.connect(midR, 1);
  midL.connect(midBus);
  midR.connect(midBus);

  splitter.connect(sideL, 0);
  splitter.connect(sideR, 1);
  sideL.connect(widenerSideGain);
  sideR.connect(widenerSideGain);
  widenerSideGain.connect(sideInvert);

  midBus.connect(merger, 0, 0);
  midBus.connect(merger, 0, 1);
  widenerSideGain.connect(merger, 0, 0);
  sideInvert.connect(merger, 0, 1);

  merger.connect(normNode);
  normNode.connect(limiterNode);
  limiterNode.connect(postRouter);

  // Output stages
  postRouter.connect(monoMergeNode);
  monoMergeNode.connect(pannerNode);
  pannerNode.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(ctx.destination);

  sharedGraph = {
    ctx,
    decks,
    deckSources,
    deckGains,
    inputBus,
    dspPathGain,
    directBypassGain,
    preampNode,
    eqNodes,
    bassBoostNode,
    widenerSideGain,
    normNode,
    limiterNode,
    postRouter,
    monoMergeNode,
    pannerNode,
    masterGain,
    analyser,
    testToneGain,
    objectUrls: [null, null],
    trackIds: [null, null],
    activeDeck: 0,
    crossfadeTargetId: null,
  };

  ctx.addEventListener('statechange', notifyDiagnosticsListeners);
  installFirstGestureResume();
  notifyDiagnosticsListeners();
  return sharedGraph;
}

export async function resumeAudioContext(): Promise<AudioContextState | 'unavailable'> {
  const graph = ensureAudioGraph();
  if (!graph) return 'unavailable';
  if (graph.ctx.state === 'suspended') {
    try {
      await graph.ctx.resume();
    } catch {
      // May remain suspended until direct user interaction
    }
  }
  notifyDiagnosticsListeners();
  return graph.ctx.state;
}

function installFirstGestureResume(): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const onGesture = () => {
    const graph = sharedGraph;
    if (graph && graph.ctx.state === 'suspended') {
      void graph.ctx.resume().then(notifyDiagnosticsListeners).catch(() => {});
    }
  };
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((evt) => {
    window.addEventListener(evt, onGesture, { passive: true, capture: true });
  });
}

export function getSharedAudioAnalyser(): AnalyserNode | null {
  return sharedGraph?.analyser ?? null;
}

export function applyAudioProfileToGraph(params: {
  profile: LocalAudioProfile;
  volume0to100: number;
  isMuted: boolean;
  trackLufs?: number | null;
  trackPeak?: number | null;
  replayGainDb?: number | null;
}): void {
  const graph = ensureAudioGraph();
  if (!graph) return;
  const { profile, volume0to100, isMuted, trackLufs, trackPeak, replayGainDb } = params;
  lastAppliedProfile = profile;

  const now = graph.ctx.currentTime;
  const direct = Boolean(profile.directMode);

  // Switch cleanly between DSP chain and Direct bypass path
  graph.dspPathGain.gain.setTargetAtTime(direct ? 0 : 1, now, 0.015);
  graph.directBypassGain.gain.setTargetAtTime(direct ? 1 : 0, now, 0.015);

  // Preamp & 10-band EQ
  const preampLin = !direct && profile.eqEnabled ? preampDbToLinear(profile.preampDb) : 1;
  graph.preampNode.gain.setTargetAtTime(preampLin, now, 0.015);

  graph.eqNodes.forEach((node, idx) => {
    const dbGain = !direct && profile.eqEnabled ? (profile.bands[idx] ?? 0) : 0;
    node.gain.setTargetAtTime(dbGain, now, 0.015);
  });

  // Bass boost
  const bassDb = direct ? 0 : bassBoostLevelToDb(profile.bassBoostEnabled, profile.bassBoostLevel);
  graph.bassBoostNode.gain.setTargetAtTime(bassDb, now, 0.02);

  // Stereo Widener M/S side gain
  const sideGain = direct
    ? 1
    : stereoWidenerLevelToSideGain(profile.stereoWidenerEnabled, profile.stereoWidenerLevel);
  graph.widenerSideGain.gain.setTargetAtTime(sideGain, now, 0.02);

  // Normalization (ReplayGain preferred if enabled, otherwise dynamic/estimated LUFS)
  let normGain = 1;
  if (!direct && profile.normalizationTarget !== 'off') {
    const rg = profile.useReplayGain ? replayGainDb : null;
    const effectiveLufs =
      typeof trackLufs === 'number' && Number.isFinite(trackLufs)
        ? trackLufs
        : lastMeasuredLufs ?? -14;
    normGain = computeNormalizationGain(
      effectiveLufs,
      profile.normalizationTarget,
      trackPeak ?? 0.92,
      rg,
    );
  }
  lastEffectiveNormGain = normGain;
  graph.normNode.gain.setTargetAtTime(normGain, now, 0.03);

  // Anti-clipping limiter
  if (!direct && profile.limiterEnabled) {
    graph.limiterNode.threshold.setTargetAtTime(-1, now, 0.02);
    graph.limiterNode.ratio.setTargetAtTime(20, now, 0.02);
  } else {
    graph.limiterNode.threshold.setTargetAtTime(0, now, 0.02);
    graph.limiterNode.ratio.setTargetAtTime(1, now, 0.02);
  }

  // Mono Audio & L/R Balance & Master Gain still operate at output stage cleanly
  if (profile.monoAudio) {
    graph.monoMergeNode.channelCount = 1;
    graph.monoMergeNode.channelCountMode = 'explicit';
  } else {
    graph.monoMergeNode.channelCount = 2;
    graph.monoMergeNode.channelCountMode = 'max';
  }

  graph.pannerNode.pan.setTargetAtTime(
    Math.max(-1, Math.min(1, profile.balance)),
    now,
    0.015,
  );

  const linearVol = isMuted ? 0 : Math.max(0, Math.min(1, volume0to100 / 100));
  graph.masterGain.gain.setTargetAtTime(linearVol, now, 0.02);

  notifyDiagnosticsListeners();
}

export function setDynamicMeasuredLufs(lufs: number | null): void {
  lastMeasuredLufs = lufs;
}

export function incrementSkipSilenceCount(): void {
  skipSilenceCount += 1;
  notifyDiagnosticsListeners();
}

export function resetSkipSilenceCount(): void {
  skipSilenceCount = 0;
  notifyDiagnosticsListeners();
}

export function computeLiveAnalyserRms(): number {
  const analyser = sharedGraph?.analyser;
  if (!analyser) return 0;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sumSq = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const v = buf[i];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / buf.length);
}

export function measureAndEstimateLufs(): number | null {
  const rms = computeLiveAnalyserRms();
  if (rms <= 0.0005) return null;
  return estimateLoudnessFromRms(rms);
}

export async function startTestTone(mode: TestToneMode): Promise<void> {
  const graph = ensureAudioGraph();
  if (!graph) return;
  stopTestTone();
  await resumeAudioContext();

  const ctx = graph.ctx;
  testToneMode = mode;

  if (mode === 'sweep') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const scheduleSweep = () => {
      const t0 = ctx.currentTime;
      osc.frequency.cancelScheduledValues(t0);
      osc.frequency.setValueAtTime(20, t0);
      osc.frequency.exponentialRampToValueAtTime(20000, t0 + 3.5);
    };
    scheduleSweep();
    osc.connect(graph.testToneGain);
    osc.start();
    testToneOsc = osc;
    testToneSweepTimer = window.setInterval(scheduleSweep, 3600);
  } else {
    // Stereo Voss-McCartney pink noise so stereo widener, balance, mono, and EQ are clearly audible
    const durationSec = 4;
    const length = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const out = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        out[i] = pink * 0.08;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(graph.testToneGain);
    src.start();
    testToneNoiseSource = src;
  }

  notifyDiagnosticsListeners();
}

export function stopTestTone(): void {
  if (testToneSweepTimer !== null) {
    window.clearInterval(testToneSweepTimer);
    testToneSweepTimer = null;
  }
  if (testToneOsc) {
    try {
      testToneOsc.stop();
      testToneOsc.disconnect();
    } catch {
      // Ignore
    }
    testToneOsc = null;
  }
  if (testToneNoiseSource) {
    try {
      testToneNoiseSource.stop();
      testToneNoiseSource.disconnect();
    } catch {
      // Ignore
    }
    testToneNoiseSource = null;
  }
  if (testToneMode !== null) {
    testToneMode = null;
    notifyDiagnosticsListeners();
  }
}

export async function setAudioOutputDevice(deviceId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const graph = ensureAudioGraph();
  if (!graph) {
    return { ok: false, reason: 'AudioContext tidak tersedia di browser ini.' };
  }
  const support = getSinkIdSupport(graph);
  if (!support.supported) {
    return {
      ok: false,
      reason: 'Browser ini belum mendukung pemilihan perangkat output (setSinkId).',
    };
  }
  try {
    const ctxWithSink = graph.ctx as unknown as { setSinkId?: (id: string) => Promise<void> };
    if (typeof ctxWithSink.setSinkId === 'function') {
      await ctxWithSink.setSinkId(deviceId);
    } else {
      for (const deck of graph.decks) {
        const elWithSink = deck as unknown as { setSinkId?: (id: string) => Promise<void> };
        if (typeof elWithSink.setSinkId === 'function') {
          await elWithSink.setSinkId(deviceId);
        }
      }
    }
    currentSinkId = deviceId;
    notifyDiagnosticsListeners();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error
          ? err.message
          : 'Gagal mengganti perangkat output audio.',
    };
  }
}

export async function listAudioOutputDevices(): Promise<{
  supported: boolean;
  devices: MediaDeviceInfo[];
  reason?: string;
}> {
  const support = getSinkIdSupport(sharedGraph);
  if (!support.supported) {
    return {
      supported: false,
      devices: [],
      reason: 'Browser ini tidak mendukung pemilihan perangkat output via setSinkId (umum pada Safari/Firefox tertentu).',
    };
  }
  if (!navigator.mediaDevices?.enumerateDevices) {
    return {
      supported: false,
      devices: [],
      reason: 'API enumerateDevices tidak tersedia (memerlukan konteks HTTPS atau localhost).',
    };
  }
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const outputs = all.filter((d) => d.kind === 'audiooutput');
    return { supported: true, devices: outputs };
  } catch {
    return {
      supported: true,
      devices: [],
      reason: 'Izin akses daftar perangkat belum diberikan browser.',
    };
  }
}

export function getAudioDiagnosticsSnapshot(
  sourceMode?: string | null,
): AudioDiagnosticsSnapshot {
  const graph = sharedGraph;
  const sink = getSinkIdSupport(graph);
  const profile = lastAppliedProfile;
  const direct = Boolean(profile?.directMode);
  const bypassedAll = sourceMode === 'youtube-iframe' || sourceMode === 'fallback-no-fx';

  const activeNodes: ActiveNodeInfo[] = [
    {
      id: 'source',
      label: testToneMode
        ? `Sumber: Tes Nada (${testToneMode === 'sweep' ? 'Sweep' : 'Pink Noise'})`
        : bypassedAll
          ? 'Sumber: Audio Tanpa DSP (Direct)'
          : 'Sumber: MediaElementAudioSource',
      status: bypassedAll && !testToneMode ? 'bypassed' : 'active',
    },
    {
      id: 'preamp',
      label: 'Preamp',
      status:
        bypassedAll && !testToneMode
          ? 'inactive'
          : direct
            ? 'bypassed'
            : profile?.eqEnabled
              ? 'active'
              : 'bypassed',
      detail: profile ? `${profile.preampDb > 0 ? '+' : ''}${profile.preampDb} dB` : undefined,
    },
    {
      id: 'eq',
      label: 'EQ 10-Band',
      status:
        bypassedAll && !testToneMode
          ? 'inactive'
          : direct
            ? 'bypassed'
            : profile?.eqEnabled
              ? 'active'
              : 'bypassed',
    },
    {
      id: 'bass_widener',
      label: 'Bass Boost & Widener',
      status:
        bypassedAll && !testToneMode
          ? 'inactive'
          : direct
            ? 'bypassed'
            : profile?.bassBoostEnabled || profile?.stereoWidenerEnabled
              ? 'active'
              : 'bypassed',
    },
    {
      id: 'norm_limiter',
      label: 'Normalisasi & Limiter',
      status:
        bypassedAll && !testToneMode
          ? 'inactive'
          : direct
            ? 'bypassed'
            : profile?.normalizationTarget !== 'off' || profile?.limiterEnabled
              ? 'active'
              : 'bypassed',
      detail:
        profile?.normalizationTarget && profile.normalizationTarget !== 'off'
          ? `${lastEffectiveNormGain.toFixed(2)}x`
          : undefined,
    },
    {
      id: 'panner_mono',
      label: profile?.monoAudio ? 'Mono + Balance' : 'Stereo + Balance',
      status: bypassedAll && !testToneMode ? 'inactive' : 'active',
    },
    {
      id: 'master',
      label: 'Master Gain + Analyser',
      status: bypassedAll && !testToneMode ? 'inactive' : 'active',
    },
  ];

  const ctxAny = graph?.ctx as (AudioContext & { outputLatency?: number }) | undefined;
  return {
    contextState: graph ? graph.ctx.state : 'unavailable',
    sampleRate: graph ? graph.ctx.sampleRate : null,
    baseLatencyMs:
      graph && typeof graph.ctx.baseLatency === 'number'
        ? Math.round(graph.ctx.baseLatency * 10000) / 10
        : null,
    outputLatencyMs:
      ctxAny && typeof ctxAny.outputLatency === 'number'
        ? Math.round(ctxAny.outputLatency * 10000) / 10
        : null,
    sinkIdSupported: sink.supported,
    sinkIdMethod: sink.method,
    currentSinkId,
    testToneMode,
    measuredLufs: lastMeasuredLufs,
    effectiveNormGain: lastEffectiveNormGain,
    skipSilenceCount,
    activeNodes,
  };
}
