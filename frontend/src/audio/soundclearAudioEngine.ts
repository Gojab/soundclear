import type { LocalAudioProfile, MediaItem, TrackBpmAnalysis } from '../types/music';
import {
  bassBoostLevelToDb,
  computeNormalizationGain,
  EQ_FREQUENCIES,
  estimateLoudnessFromRms,
  preampDbToLinear,
  stereoWidenerLevelToSideGain,
} from '../utils/audioMath';
import {
  estimateBpmFromPcm,
  estimateFallbackBpm,
  type DjTransitionFrame,
} from '../utils/djMixLogic';
import { clampSeekTarget } from '../utils/backgroundAudioLogic';

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

export interface DeckDjStage {
  lowEq: BiquadFilterNode;
  midEq: BiquadFilterNode;
  highEq: BiquadFilterNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
}

export interface SharedAudioGraph {
  ctx: AudioContext;
  decks: [HTMLAudioElement, HTMLAudioElement];
  directDeck: HTMLAudioElement;
  directDeckTrackId: string | null;
  directDeckObjectUrl: string | null;
  backgroundDirectActive: boolean;
  deckSources: [MediaElementAudioSourceNode, MediaElementAudioSourceNode];
  deckDjStages: [DeckDjStage, DeckDjStage];
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
let backgroundHandoffInProgress = false;
let foregroundRestoreInProgress = false;
let keepaliveAudio: HTMLAudioElement | null = null;
let keepaliveBlobUrl: string | null = null;
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

const unlockedAudioElements = new WeakSet<HTMLAudioElement>();
const programmaticPauseUntil = new WeakMap<HTMLAudioElement, number>();
let standaloneDirectDeck: HTMLAudioElement | null = null;
const contextInterruptedListeners = new Set<() => void>();
const listeners = new Set<() => void>();

export function markProgrammaticPause(el: HTMLAudioElement, windowMs = 300): void {
  programmaticPauseUntil.set(el, Date.now() + windowMs);
}

export function isProgrammaticPause(el: HTMLAudioElement): boolean {
  const until = programmaticPauseUntil.get(el);
  if (!until) return false;
  if (Date.now() <= until) {
    programmaticPauseUntil.delete(el);
    return true;
  }
  programmaticPauseUntil.delete(el);
  return false;
}

export function isBackgroundHandoffActive(): boolean {
  return backgroundHandoffInProgress || foregroundRestoreInProgress;
}

export function pauseAudioElementProgrammatically(el: HTMLAudioElement): void {
  markProgrammaticPause(el);
  if (!el.paused) {
    el.pause();
  }
}

export function ensureStandaloneDirectDeck(): HTMLAudioElement | null {
  if (sharedGraph) return sharedGraph.directDeck;
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!standaloneDirectDeck) {
    standaloneDirectDeck = new Audio();
    configureAudioElement(standaloneDirectDeck, false);
  }
  return standaloneDirectDeck;
}

export function ensurePlaybackAudioSession(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as Navigator & {
      audioSession?: { type?: string };
    };
    if (nav.audioSession && nav.audioSession.type !== 'playback') {
      nav.audioSession.type = 'playback';
    }
  } catch {
    // Ignore unsupported audioSession transitions
  }
}

export function subscribeAudioContextInterrupted(listener: () => void): () => void {
  contextInterruptedListeners.add(listener);
  return () => {
    contextInterruptedListeners.delete(listener);
  };
}

function notifyContextInterruptedListeners(): void {
  contextInterruptedListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber errors
    }
  });
}

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

function createSilentWavBlobUrl(): string {
  if (keepaliveBlobUrl) return keepaliveBlobUrl;
  const sampleRate = 8000;
  const numSamples = 4000; // 0.5s tiny valid PCM WAV
  const dataSize = numSamples;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i += 1) {
    view.setUint8(44 + i, 128);
  }
  const blob = new Blob([buffer], { type: 'audio/wav' });
  keepaliveBlobUrl = URL.createObjectURL(blob);
  return keepaliveBlobUrl;
}

function ensureKeepaliveAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (keepaliveAudio) return keepaliveAudio;
  const el = new Audio(createSilentWavBlobUrl());
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0.005;
  (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  keepaliveAudio = el;
  return el;
}

export function clearElementPrimingFlag(el: HTMLAudioElement): void {
  delete el.dataset.scPriming;
  el.muted = false;
}

function primeAudioElementOnGesture(el: HTMLAudioElement): void {
  if (unlockedAudioElements.has(el)) return;
  if (!el.paused || el.getAttribute('src') || el.dataset.scPriming === '1') {
    if (!el.paused) unlockedAudioElements.add(el);
    return;
  }

  const silentUrl = createSilentWavBlobUrl();
  el.dataset.scPriming = '1';
  el.muted = true;
  el.src = silentUrl;
  try {
    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          unlockedAudioElements.add(el);
          if (el.dataset.scPriming === '1') {
            pauseAudioElementProgrammatically(el);
            el.muted = false;
            el.removeAttribute('src');
            delete el.dataset.scPriming;
          }
        })
        .catch(() => {
          if (el.dataset.scPriming === '1') {
            el.muted = false;
            el.removeAttribute('src');
            delete el.dataset.scPriming;
          }
        });
    } else {
      unlockedAudioElements.add(el);
    }
  } catch {
    if (el.dataset.scPriming === '1') {
      el.muted = false;
      el.removeAttribute('src');
      delete el.dataset.scPriming;
    }
  }
}

export function startSilentKeepaliveAudio(): void {
  ensurePlaybackAudioSession();
  const el = ensureKeepaliveAudioElement();
  if (!el) return;
  if (el.paused) {
    void el.play().catch(() => {});
  }
}

export function stopSilentKeepaliveAudio(): void {
  if (!keepaliveAudio) return;
  if (!keepaliveAudio.paused) {
    keepaliveAudio.pause();
  }
}

export function unlockPlaybackOnUserGesture(): void {
  if (typeof window === 'undefined') return;
  ensurePlaybackAudioSession();
  const graph = ensureAudioGraph();
  if (graph) {
    if (graph.ctx.state !== 'running') {
      void graph.ctx.resume().catch(() => {});
    }
    primeAudioElementOnGesture(graph.decks[0]);
    primeAudioElementOnGesture(graph.decks[1]);
    primeAudioElementOnGesture(graph.directDeck);
    const hasPlayingHtmlAudio =
      (!graph.decks[0].paused && Boolean(graph.decks[0].src) && graph.decks[0].dataset.scPriming !== '1') ||
      (!graph.decks[1].paused && Boolean(graph.decks[1].src) && graph.decks[1].dataset.scPriming !== '1') ||
      (!graph.directDeck.paused && Boolean(graph.directDeck.src) && graph.directDeck.dataset.scPriming !== '1');
    if (!hasPlayingHtmlAudio) {
      startSilentKeepaliveAudio();
    }
  } else {
    startSilentKeepaliveAudio();
  }
}

function configureAudioElement(audio: HTMLAudioElement, useCors: boolean): void {
  audio.preload = 'auto';
  audio.crossOrigin = useCors ? 'anonymous' : null;
  const mediaWithPitch = audio as HTMLAudioElement & {
    preservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    playsInline?: boolean;
  };
  mediaWithPitch.preservesPitch = true;
  mediaWithPitch.webkitPreservesPitch = true;
  mediaWithPitch.mozPreservesPitch = true;
  mediaWithPitch.playsInline = true;
}

export function ensureAudioGraph(): SharedAudioGraph | null {
  if (sharedGraph) return sharedGraph;
  if (typeof window === 'undefined') return null;

  ensurePlaybackAudioSession();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return null;
  }
  const decks: [HTMLAudioElement, HTMLAudioElement] = [new Audio(), new Audio()];
  decks.forEach((audio) => configureAudioElement(audio, true));

  const directDeck = standaloneDirectDeck ?? new Audio();
  standaloneDirectDeck = null;
  configureAudioElement(directDeck, false);

  let deckSources: [MediaElementAudioSourceNode, MediaElementAudioSourceNode];
  try {
    deckSources = [
      ctx.createMediaElementSource(decks[0]),
      ctx.createMediaElementSource(decks[1]),
    ];
  } catch {
    try {
      void ctx.close();
    } catch {
      // Ignore
    }
    return null;
  }

  const createDeckDjStage = (): DeckDjStage => {
    const lowEq = ctx.createBiquadFilter();
    lowEq.type = 'lowshelf';
    lowEq.frequency.value = 220;
    lowEq.Q.value = 0.707;
    lowEq.gain.value = 0;
    lowEq.channelCount = 2;
    lowEq.channelCountMode = 'explicit';

    const midEq = ctx.createBiquadFilter();
    midEq.type = 'peaking';
    midEq.frequency.value = 1000;
    midEq.Q.value = 0.85;
    midEq.gain.value = 0;
    midEq.channelCount = 2;
    midEq.channelCountMode = 'explicit';

    const highEq = ctx.createBiquadFilter();
    highEq.type = 'highshelf';
    highEq.frequency.value = 4200;
    highEq.Q.value = 0.707;
    highEq.gain.value = 0;
    highEq.channelCount = 2;
    highEq.channelCountMode = 'explicit';

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 20;
    highpass.Q.value = 0.707;
    highpass.channelCount = 2;
    highpass.channelCountMode = 'explicit';

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 20000;
    lowpass.Q.value = 0.707;
    lowpass.channelCount = 2;
    lowpass.channelCountMode = 'explicit';

    return { lowEq, midEq, highEq, highpass, lowpass };
  };

  const deckDjStages: [DeckDjStage, DeckDjStage] = [createDeckDjStage(), createDeckDjStage()];

  const deckGains: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
  deckGains[0].gain.value = 1;
  deckGains[1].gain.value = 0;

  const inputBus = ctx.createGain();
  inputBus.channelCount = 2;
  inputBus.channelCountMode = 'explicit';
  const dspPathGain = ctx.createGain();
  dspPathGain.channelCount = 2;
  dspPathGain.channelCountMode = 'explicit';
  dspPathGain.gain.value = 1;
  const directBypassGain = ctx.createGain();
  directBypassGain.gain.value = 0;

  const testToneGain = ctx.createGain();
  testToneGain.channelCount = 2;
  testToneGain.channelCountMode = 'explicit';
  testToneGain.gain.value = 0.28;

  const preampNode = ctx.createGain();
  preampNode.channelCount = 2;
  preampNode.channelCountMode = 'explicit';
  const eqNodes: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, idx) => {
    const filter = ctx.createBiquadFilter();
    filter.type =
      idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = idx === 0 || idx === EQ_FREQUENCIES.length - 1 ? 0.707 : 1.4;
    filter.gain.value = 0;
    filter.channelCount = 2;
    filter.channelCountMode = 'explicit';
    return filter;
  });

  const bassBoostNode = ctx.createBiquadFilter();
  bassBoostNode.type = 'lowshelf';
  bassBoostNode.frequency.value = 80;
  bassBoostNode.Q.value = 0.707;
  bassBoostNode.gain.value = 0;
  bassBoostNode.channelCount = 2;
  bassBoostNode.channelCountMode = 'explicit';

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

  // Wire sources -> per-deck DJ stage -> deckGains -> inputBus
  for (let i = 0; i < 2; i += 1) {
    const stage = deckDjStages[i];
    deckSources[i].connect(stage.lowEq);
    stage.lowEq.connect(stage.midEq);
    stage.midEq.connect(stage.highEq);
    stage.highEq.connect(stage.highpass);
    stage.highpass.connect(stage.lowpass);
    stage.lowpass.connect(deckGains[i]);
    deckGains[i].connect(inputBus);
  }
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
    directDeck,
    directDeckTrackId: null,
    directDeckObjectUrl: null,
    backgroundDirectActive: false,
    deckSources,
    deckDjStages,
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

  ctx.addEventListener('statechange', () => {
    const g = sharedGraph;
    if (
      g &&
      (g.ctx.state === 'suspended' || (g.ctx.state as string) === 'interrupted')
    ) {
      const hasDeckActivity =
        g.decks.some((d) => !d.paused && d.dataset.scPriming !== '1') ||
        g.backgroundDirectActive ||
        testToneMode !== null;
      if (hasDeckActivity) {
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden' &&
          !g.backgroundDirectActive &&
          !backgroundHandoffInProgress
        ) {
          notifyContextInterruptedListeners();
        } else if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void g.ctx.resume().catch(() => {});
        }
      }
    }
    notifyDiagnosticsListeners();
  });
  installFirstGestureResume();
  notifyDiagnosticsListeners();
  return sharedGraph;
}

export function getActivePlaybackElement(graph: SharedAudioGraph): HTMLAudioElement {
  return graph.backgroundDirectActive ? graph.directDeck : graph.decks[graph.activeDeck];
}

export function revokeDirectDeckUrl(graph: SharedAudioGraph): void {
  if (graph.directDeckObjectUrl) {
    URL.revokeObjectURL(graph.directDeckObjectUrl);
    graph.directDeckObjectUrl = null;
  }
}

export function resetDirectDeck(): void {
  const graph = sharedGraph;
  if (!graph) {
    if (standaloneDirectDeck) {
      clearElementPrimingFlag(standaloneDirectDeck);
      pauseAudioElementProgrammatically(standaloneDirectDeck);
      standaloneDirectDeck.removeAttribute('src');
    }
    return;
  }
  graph.backgroundDirectActive = false;
  graph.directDeckTrackId = null;
  clearElementPrimingFlag(graph.directDeck);
  pauseAudioElementProgrammatically(graph.directDeck);
  graph.directDeck.removeAttribute('src');
  revokeDirectDeckUrl(graph);
}

export async function engageBackgroundDirectDeck(
  volume0to100: number,
  isMuted: boolean,
): Promise<boolean> {
  const graph = sharedGraph;
  if (!graph || graph.backgroundDirectActive || backgroundHandoffInProgress) {
    return Boolean(graph?.backgroundDirectActive);
  }
  const activeDeck = graph.decks[graph.activeDeck];
  if (!activeDeck.src || activeDeck.ended || activeDeck.dataset.scPriming === '1') {
    return false;
  }

  ensurePlaybackAudioSession();
  backgroundHandoffInProgress = true;
  const targetSrc = activeDeck.src;
  const resumeAt = Number.isFinite(activeDeck.currentTime) ? activeDeck.currentTime : 0;
  const targetRate = activeDeck.playbackRate || 1;
  const directVol = isMuted ? 0 : Math.max(0, Math.min(1, volume0to100 / 100));

  clearElementPrimingFlag(graph.directDeck);
  revokeDirectDeckUrl(graph);
  graph.directDeckTrackId = graph.trackIds[graph.activeDeck];

  const applyResumeSeek = () => {
    if (resumeAt <= 0.2) return;
    const clamped = clampSeekTarget(
      resumeAt,
      Number.isFinite(graph.directDeck.duration) ? graph.directDeck.duration : null,
    );
    if (clamped > 0 && Math.abs(graph.directDeck.currentTime - clamped) > 0.4) {
      try {
        graph.directDeck.currentTime = clamped;
      } catch {
        // Ignore seek error while metadata settles
      }
    }
  };

  let detachMetaSeek: (() => void) | null = null;
  const onMetaReady = () => {
    applyResumeSeek();
  };

  try {
    const otherDeck = graph.decks[graph.activeDeck === 0 ? 1 : 0];
    pauseAudioElementProgrammatically(otherDeck);
    // Protect activeDeck from emitting an unguarded external pause if OS suspends AudioContext during handoff
    markProgrammaticPause(activeDeck, 3000);
    graph.directDeck.crossOrigin = null;
    graph.directDeck.volume = directVol;
    graph.directDeck.muted = false;
    graph.directDeck.playbackRate = targetRate;
    graph.directDeck.src = targetSrc;
    graph.directDeck.addEventListener('loadedmetadata', onMetaReady, { once: true });
    detachMetaSeek = () => {
      graph.directDeck.removeEventListener('loadedmetadata', onMetaReady);
    };
    graph.directDeck.load();
    if (graph.directDeck.readyState >= 1) {
      applyResumeSeek();
    }

    // Call .play() synchronously inside the visibility/hide tick before awaiting
    const playPromise = graph.directDeck.play();
    await playPromise;
    graph.backgroundDirectActive = true;
    graph.deckGains[graph.activeDeck].gain.setValueAtTime(0, graph.ctx.currentTime);
    pauseAudioElementProgrammatically(activeDeck);
    applyResumeSeek();
    unlockedAudioElements.add(graph.directDeck);
    stopSilentKeepaliveAudio();
    notifyDiagnosticsListeners();
    return true;
  } catch {
    graph.backgroundDirectActive = false;
    graph.directDeckTrackId = null;
    pauseAudioElementProgrammatically(graph.directDeck);
    graph.directDeck.removeAttribute('src');
    return false;
  } finally {
    detachMetaSeek?.();
    backgroundHandoffInProgress = false;
  }
}

export async function restoreDspDeckFromBackground(): Promise<void> {
  const graph = sharedGraph;
  if (!graph || !graph.backgroundDirectActive || foregroundRestoreInProgress) return;

  foregroundRestoreInProgress = true;
  const activeDeckIdx = graph.activeDeck;
  const activeDeck = graph.decks[activeDeckIdx];
  const directSrc = graph.directDeck.src;
  const resumeAt = Number.isFinite(graph.directDeck.currentTime)
    ? graph.directDeck.currentTime
    : activeDeck.currentTime;
  const targetRate = graph.directDeck.playbackRate || activeDeck.playbackRate || 1;
  const wasPlaying = !graph.directDeck.paused;

  try {
    ensurePlaybackAudioSession();
    if (graph.ctx.state !== 'running') {
      await graph.ctx.resume().catch(() => {});
    }

    const srcDiffers = Boolean(directSrc && activeDeck.src !== directSrc);
    if (srcDiffers) {
      clearElementPrimingFlag(activeDeck);
      if (graph.objectUrls[activeDeckIdx] && graph.objectUrls[activeDeckIdx] !== directSrc) {
        URL.revokeObjectURL(graph.objectUrls[activeDeckIdx]!);
      }
      graph.objectUrls[activeDeckIdx] = graph.directDeckObjectUrl;
      graph.directDeckObjectUrl = null;
      graph.trackIds[activeDeckIdx] = graph.directDeckTrackId;

      activeDeck.crossOrigin = directSrc.startsWith('blob:') ? null : 'anonymous';
      activeDeck.playbackRate = targetRate;
      activeDeck.src = directSrc;

      await new Promise<void>((resolve) => {
        if (activeDeck.readyState >= 1) {
          resolve();
          return;
        }
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          activeDeck.removeEventListener('loadedmetadata', finish);
          activeDeck.removeEventListener('error', finish);
          resolve();
        };
        const timer = window.setTimeout(finish, 2500);
        activeDeck.addEventListener('loadedmetadata', finish, { once: true });
        activeDeck.addEventListener('error', finish, { once: true });
        activeDeck.load();
      });
    }

    const liveResumeAt = Number.isFinite(graph.directDeck.currentTime)
      ? graph.directDeck.currentTime
      : resumeAt;

    if (activeDeck.src && Number.isFinite(liveResumeAt)) {
      try {
        activeDeck.currentTime = clampSeekTarget(
          liveResumeAt,
          Number.isFinite(activeDeck.duration) ? activeDeck.duration : null,
        );
      } catch {
        // Ignore seek error
      }
    }

    resetDeckDjStage(graph, activeDeckIdx, true);
    graph.deckGains[activeDeckIdx].gain.setValueAtTime(1, graph.ctx.currentTime);

    if (wasPlaying && activeDeck.src) {
      // Mute directDeck right before starting activeDeck to prevent dual-audio echo overlap
      graph.directDeck.muted = true;
      await activeDeck.play();
      unlockedAudioElements.add(activeDeck);
    }

    graph.backgroundDirectActive = false;
    graph.directDeckTrackId = null;
    pauseAudioElementProgrammatically(graph.directDeck);
    graph.directDeck.muted = false;
    graph.directDeck.removeAttribute('src');
    revokeDirectDeckUrl(graph);
    notifyDiagnosticsListeners();
  } catch {
    // Keep directDeck playing seamlessly if foreground DSP restore fails
    graph.directDeck.muted = false;
  } finally {
    foregroundRestoreInProgress = false;
  }
}

export async function resumeAudioContext(): Promise<AudioContextState | 'unavailable'> {
  ensurePlaybackAudioSession();
  const graph = ensureAudioGraph();
  if (!graph) return 'unavailable';
  if (graph.ctx.state === 'suspended' || (graph.ctx.state as string) === 'interrupted') {
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
    ensurePlaybackAudioSession();
    const graph = sharedGraph;
    if (!graph) return;
    if (graph.ctx.state === 'suspended' || (graph.ctx.state as string) === 'interrupted') {
      void graph.ctx.resume().then(notifyDiagnosticsListeners).catch(() => {});
    }
    primeAudioElementOnGesture(graph.decks[0]);
    primeAudioElementOnGesture(graph.decks[1]);
    primeAudioElementOnGesture(graph.directDeck);
  };
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((evt) => {
    window.addEventListener(evt, onGesture, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', () => {
    const graph = sharedGraph;
    if (
      graph &&
      (graph.ctx.state === 'suspended' || (graph.ctx.state as string) === 'interrupted') &&
      (graph.decks.some((d) => !d.paused && d.dataset.scPriming !== '1') ||
        graph.backgroundDirectActive ||
        testToneMode !== null)
    ) {
      if (document.visibilityState === 'visible') {
        void graph.ctx.resume().then(notifyDiagnosticsListeners).catch(() => {});
      } else if (!graph.backgroundDirectActive && !backgroundHandoffInProgress) {
        notifyContextInterruptedListeners();
      }
    }
  });
}

export function getSharedAudioAnalyser(): AnalyserNode | null {
  return sharedGraph?.analyser ?? null;
}

export function getLiveEqNodeSnapshot(): {
  contextState: AudioContextState | 'unavailable';
  bandGainsDb: number[];
  preampGainLinear: number;
  bassBoostGainDb: number;
  widenerSideGain: number;
} {
  const g = sharedGraph;
  if (!g) {
    return {
      contextState: 'unavailable',
      bandGainsDb: [],
      preampGainLinear: 1,
      bassBoostGainDb: 0,
      widenerSideGain: 1,
    };
  }
  return {
    contextState: g.ctx.state,
    bandGainsDb: g.eqNodes.map((n) => Math.round(n.gain.value * 100) / 100),
    preampGainLinear: Math.round(g.preampNode.gain.value * 1000) / 1000,
    bassBoostGainDb: Math.round(g.bassBoostNode.gain.value * 100) / 100,
    widenerSideGain: Math.round(g.widenerSideGain.gain.value * 1000) / 1000,
  };
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

const bpmAnalysisCache = new Map<string, TrackBpmAnalysis>();
const bpmInflightMap = new Map<string, Promise<TrackBpmAnalysis | null>>();

export function getCachedTrackBpm(trackId: string): TrackBpmAnalysis | null {
  return bpmAnalysisCache.get(trackId) ?? null;
}

export function cacheFallbackTrackBpm(trackId: string, track: MediaItem): TrackBpmAnalysis {
  const existing = bpmAnalysisCache.get(trackId);
  if (existing) return existing;
  const est = estimateFallbackBpm(track);
  bpmAnalysisCache.set(trackId, est);
  return est;
}

export async function analyzeAudioBlobBpm(
  trackId: string,
  blob: Blob,
): Promise<TrackBpmAnalysis | null> {
  if (!trackId || !blob || blob.size < 2048) return null;
  const cached = bpmAnalysisCache.get(trackId);
  if (cached && cached.source === 'decoded') return cached;

  const inflight = bpmInflightMap.get(trackId);
  if (inflight) return inflight;

  const task = (async (): Promise<TrackBpmAnalysis | null> => {
    const graph = ensureAudioGraph();
    if (!graph) return null;
    try {
      // Bound decode payload for extreme huge uncompressed WAVs while preserving container headers
      const maxDirectBytes = 18 * 1024 * 1024;
      const sourceBlob =
        blob.size > maxDirectBytes && blob.type.includes('wav')
          ? blob.slice(0, maxDirectBytes)
          : blob;
      const buf = await sourceBlob.arrayBuffer();
      const decoded = await graph.ctx.decodeAudioData(buf.slice(0));
      const sr = decoded.sampleRate;
      const maxSeconds = 36;
      const sampleCount = Math.min(decoded.length, Math.floor(sr * maxSeconds));
      if (sampleCount < sr * 3) return null;

      // Downmix first channels into compact ~11025 Hz mono buffer for fast, low-RAM autocorrelation
      const targetRate = 11025;
      const decim = Math.max(1, Math.round(sr / targetRate));
      const effectiveSr = sr / decim;
      const outLen = Math.floor(sampleCount / decim);
      const mono = new Float32Array(outLen);
      const ch0 = decoded.getChannelData(0);
      const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : null;

      for (let i = 0; i < outLen; i += 1) {
        const srcIdx = i * decim;
        mono[i] = ch1 ? 0.5 * (ch0[srcIdx] + ch1[srcIdx]) : ch0[srcIdx];
      }

      const analysis = estimateBpmFromPcm(mono, effectiveSr);
      if (analysis) {
        bpmAnalysisCache.set(trackId, analysis);
        return analysis;
      }
      return null;
    } catch {
      return null;
    } finally {
      bpmInflightMap.delete(trackId);
    }
  })();

  bpmInflightMap.set(trackId, task);
  return task;
}

export function resetDeckDjStage(
  graph: SharedAudioGraph,
  deckIdx: 0 | 1,
  immediate = false,
): void {
  const stage = graph.deckDjStages[deckIdx];
  const now = graph.ctx.currentTime;
  if (immediate) {
    stage.lowEq.gain.setValueAtTime(0, now);
    stage.midEq.gain.setValueAtTime(0, now);
    stage.highEq.gain.setValueAtTime(0, now);
    stage.highpass.frequency.setValueAtTime(20, now);
    stage.lowpass.frequency.setValueAtTime(20000, now);
  } else {
    stage.lowEq.gain.setTargetAtTime(0, now, 0.03);
    stage.midEq.gain.setTargetAtTime(0, now, 0.03);
    stage.highEq.gain.setTargetAtTime(0, now, 0.03);
    stage.highpass.frequency.setTargetAtTime(20, now, 0.03);
    stage.lowpass.frequency.setTargetAtTime(20000, now, 0.03);
  }
}

export function applyDeckDjMixFrame(
  graph: SharedAudioGraph,
  outgoingIdx: 0 | 1,
  incomingIdx: 0 | 1,
  frame: DjTransitionFrame,
  timeConstant = 0.035,
  immediate = false,
): void {
  const now = graph.ctx.currentTime;
  const outStage = graph.deckDjStages[outgoingIdx];
  const inStage = graph.deckDjStages[incomingIdx];

  const applyParam = (param: AudioParam, value: number) => {
    if (immediate) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    } else {
      param.setTargetAtTime(value, now, timeConstant);
    }
  };

  applyParam(graph.deckGains[outgoingIdx].gain, frame.outGain);
  applyParam(graph.deckGains[incomingIdx].gain, frame.inGain);

  applyParam(outStage.lowEq.gain, frame.outLowDb);
  applyParam(outStage.midEq.gain, frame.outMidDb);
  applyParam(outStage.highEq.gain, frame.outHighDb);
  applyParam(outStage.highpass.frequency, frame.outHighpassHz);
  applyParam(outStage.lowpass.frequency, 20000);

  applyParam(inStage.lowEq.gain, frame.inLowDb);
  applyParam(inStage.midEq.gain, frame.inMidDb);
  applyParam(inStage.highEq.gain, frame.inHighDb);
  applyParam(inStage.highpass.frequency, 20);
  applyParam(inStage.lowpass.frequency, frame.inLowpassHz);
}

export function getLiveDjEngineSnapshot(): {
  activeDeck: 0 | 1;
  deckGains: [number, number];
  deckRates: [number, number];
  deckHighpassHz: [number, number];
  deckLowpassHz: [number, number];
  deckLowEqDb: [number, number];
} | null {
  const g = sharedGraph;
  if (!g) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    activeDeck: g.activeDeck,
    deckGains: [round2(g.deckGains[0].gain.value), round2(g.deckGains[1].gain.value)],
    deckRates: [round2(g.decks[0].playbackRate), round2(g.decks[1].playbackRate)],
    deckHighpassHz: [
      Math.round(g.deckDjStages[0].highpass.frequency.value),
      Math.round(g.deckDjStages[1].highpass.frequency.value),
    ],
    deckLowpassHz: [
      Math.round(g.deckDjStages[0].lowpass.frequency.value),
      Math.round(g.deckDjStages[1].lowpass.frequency.value),
    ],
    deckLowEqDb: [
      round2(g.deckDjStages[0].lowEq.gain.value),
      round2(g.deckDjStages[1].lowEq.gain.value),
    ],
  };
}

