import { useEffect, useRef } from 'react';
import { db } from '../db/soundclearDb';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  computeEqualPowerCrossfade,
  computeNormalizationGain,
  EQ_FREQUENCIES,
  preampDbToLinear,
} from '../utils/audioMath';
import { getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';

interface AudioGraph {
  ctx: AudioContext;
  decks: [HTMLAudioElement, HTMLAudioElement];
  deckGains: [GainNode, GainNode];
  preampNode: GainNode;
  eqNodes: BiquadFilterNode[];
  normNode: GainNode;
  monoMergeNode: GainNode;
  pannerNode: StereoPannerNode;
  masterGain: GainNode;
  analyser: AnalyserNode;
  objectUrls: [string | null, string | null];
  trackIds: [string | null, string | null];
  activeDeck: 0 | 1;
  crossfadeTargetId: string | null;
}

let sharedGraph: AudioGraph | null = null;

export function getLocalAudioAnalyser(): AnalyserNode | null {
  return sharedGraph?.analyser ?? null;
}

function ensureAudioGraph(): AudioGraph | null {
  if (sharedGraph) return sharedGraph;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  const decks: [HTMLAudioElement, HTMLAudioElement] = [new Audio(), new Audio()];
  decks.forEach((audio) => {
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
  });

  const sources = [
    ctx.createMediaElementSource(decks[0]),
    ctx.createMediaElementSource(decks[1]),
  ] as const;
  const deckGains: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
  deckGains[0].gain.value = 1;
  deckGains[1].gain.value = 0;

  const preampNode = ctx.createGain();
  const eqNodes: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, idx) => {
    const filter = ctx.createBiquadFilter();
    filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.4;
    filter.gain.value = 0;
    return filter;
  });

  const normNode = ctx.createGain();
  const monoMergeNode = ctx.createGain();
  const pannerNode = ctx.createStereoPanner();
  const masterGain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.78;

  sources[0].connect(deckGains[0]);
  sources[1].connect(deckGains[1]);
  deckGains[0].connect(preampNode);
  deckGains[1].connect(preampNode);

  let prev: AudioNode = preampNode;
  for (const filter of eqNodes) {
    prev.connect(filter);
    prev = filter;
  }
  prev.connect(normNode);
  normNode.connect(monoMergeNode);
  monoMergeNode.connect(pannerNode);
  pannerNode.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(ctx.destination);

  sharedGraph = {
    ctx,
    decks,
    deckGains,
    preampNode,
    eqNodes,
    normNode,
    monoMergeNode,
    pannerNode,
    masterGain,
    analyser,
    objectUrls: [null, null],
    trackIds: [null, null],
    activeDeck: 0,
    crossfadeTargetId: null,
  };

  return sharedGraph;
}

function revokeDeckUrl(graph: AudioGraph, deckIdx: 0 | 1): void {
  const prevUrl = graph.objectUrls[deckIdx];
  if (prevUrl) {
    URL.revokeObjectURL(prevUrl);
    graph.objectUrls[deckIdx] = null;
  }
}

export function LocalAudioEngine() {
  const hydrated = usePlayerStore((s) => s.hydrated);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const seekVersion = usePlayerStore((s) => s.seekVersion);
  const pendingSeekSeconds = usePlayerStore((s) => s.pendingSeekSeconds);
  const manualQueue = usePlayerStore((s) => s.manualQueue);
  const sourceQueue = usePlayerStore((s) => s.sourceQueue);

  const localProfile = useSettingsStore((s) => s.localProfile);
  const localFiles = useLibraryStore((s) => s.localFiles);

  const localTrackId = isLocalTrack(currentTrack) ? getTrackUniqueId(currentTrack) : null;
  const loadedTrackIdRef = useRef<string | null>(null);
  const transitionInProgressRef = useRef(false);

  // Apply Web Audio EQ, Preamp, Mono, Stereo Balance, Master Volume & Normalization
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph) return;
    const now = graph.ctx.currentTime;

    graph.preampNode.gain.setTargetAtTime(
      localProfile.eqEnabled ? preampDbToLinear(localProfile.preampDb) : 1,
      now,
      0.015,
    );

    graph.eqNodes.forEach((node, idx) => {
      const dbGain = localProfile.eqEnabled ? localProfile.bands[idx] ?? 0 : 0;
      node.gain.setTargetAtTime(dbGain, now, 0.015);
    });

    // Mono downmix vs stereo preservation
    if (localProfile.monoAudio) {
      graph.monoMergeNode.channelCount = 1;
      graph.monoMergeNode.channelCountMode = 'explicit';
    } else {
      graph.monoMergeNode.channelCount = 2;
      graph.monoMergeNode.channelCountMode = 'max';
    }

    graph.pannerNode.pan.setTargetAtTime(
      Math.max(-1, Math.min(1, localProfile.balance)),
      now,
      0.015,
    );

    const activeRecord = localTrackId
      ? localFiles.find((f) => f.id === localTrackId) ?? null
      : null;
    const normGain = activeRecord
      ? computeNormalizationGain(
          activeRecord.estimatedLufs,
          localProfile.normalizationTarget,
          activeRecord.peakLinear,
        )
      : 1;
    graph.normNode.gain.setTargetAtTime(normGain, now, 0.03);

    const linearVol = isMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
    graph.masterGain.gain.setTargetAtTime(linearVol, now, 0.02);
  }, [localProfile, volume, isMuted, localTrackId, localFiles]);

  // Apply playbackRate to both decks
  useEffect(() => {
    const graph = sharedGraph;
    if (!graph) return;
    graph.decks.forEach((deck) => {
      deck.playbackRate = playbackRate;
    });
  }, [playbackRate]);

  // Load track when active local track changes
  useEffect(() => {
    if (!hydrated) return;
    const graph = ensureAudioGraph();
    if (!graph) return;

    if (!localTrackId) {
      // Switching away from local track -> pause both local decks cleanly
      loadedTrackIdRef.current = null;
      graph.decks.forEach((d) => d.pause());
      return;
    }

    // If alternate deck already pre-started this track via crossfade or gapless preload:
    if (graph.crossfadeTargetId === localTrackId) {
      graph.crossfadeTargetId = null;
      loadedTrackIdRef.current = localTrackId;
      transitionInProgressRef.current = false;
      return;
    }

    if (loadedTrackIdRef.current === localTrackId) return;
    loadedTrackIdRef.current = localTrackId;

    let cancelled = false;
    const loadFromDb = async () => {
      const record =
        useLibraryStore.getState().localFiles.find((f) => f.id === localTrackId) ||
        (await db.localFiles.get(localTrackId));
      if (cancelled || !record) {
        if (!cancelled && !record) {
          usePlayerStore
            .getState()
            .setPlayerError('File audio lokal tidak ditemukan di penyimpanan browser.');
          usePlayerStore.getState().setIsPlaying(false);
        }
        return;
      }

      const nextDeckIdx: 0 | 1 = graph.activeDeck;
      const otherDeckIdx: 0 | 1 = nextDeckIdx === 0 ? 1 : 0;

      graph.decks[otherDeckIdx].pause();
      graph.deckGains[otherDeckIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
      graph.deckGains[nextDeckIdx].gain.setValueAtTime(1, graph.ctx.currentTime);

      revokeDeckUrl(graph, nextDeckIdx);
      const url = URL.createObjectURL(record.blob);
      graph.objectUrls[nextDeckIdx] = url;
      graph.trackIds[nextDeckIdx] = record.id;

      const audio = graph.decks[nextDeckIdx];
      audio.src = url;
      audio.playbackRate = usePlayerStore.getState().playbackRate;

      const state = usePlayerStore.getState();
      const startSec = state.pendingSeekSeconds ?? state.currentTime ?? 0;
      const onLoadedMeta = () => {
        if (startSec > 0 && Number.isFinite(audio.duration) && startSec < audio.duration) {
          audio.currentTime = startSec;
        }
        usePlayerStore.getState().clearPendingSeek();
        if (usePlayerStore.getState().isPlaying) {
          if (graph.ctx.state === 'suspended') {
            void graph.ctx.resume().catch(() => {});
          }
          void audio.play().catch(() => {});
        }
      };

      audio.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
      audio.load();
    };

    void loadFromDb();

    return () => {
      cancelled = true;
    };
  }, [hydrated, localTrackId]);

  // Sync Play / Pause
  useEffect(() => {
    const graph = sharedGraph;
    if (!graph || !localTrackId) return;
    const activeAudio = graph.decks[graph.activeDeck];

    if (isPlaying) {
      if (graph.ctx.state === 'suspended') {
        void graph.ctx.resume().catch(() => {});
      }
      if (activeAudio.src && activeAudio.paused) {
        void activeAudio.play().catch(() => {});
      }
    } else if (!activeAudio.paused) {
      activeAudio.pause();
    }
  }, [isPlaying, localTrackId]);

  // Explicit Seek
  useEffect(() => {
    const graph = sharedGraph;
    if (!graph || !localTrackId || pendingSeekSeconds === null) return;
    const activeAudio = graph.decks[graph.activeDeck];
    if (Number.isFinite(activeAudio.duration) && activeAudio.duration > 0) {
      activeAudio.currentTime = Math.max(0, Math.min(pendingSeekSeconds, activeAudio.duration));
      usePlayerStore.getState().clearPendingSeek();
    }
  }, [seekVersion, pendingSeekSeconds, localTrackId]);

  // Progress polling, overlapping crossfade (0-12s), gapless preloading & sleep timer fade-out
  useEffect(() => {
    if (!localTrackId || !isPlaying) return;
    const graph = sharedGraph;
    if (!graph) return;

    const preloadStandbyTrack = async (nextId: string) => {
      const standbyIdx: 0 | 1 = graph.activeDeck === 0 ? 1 : 0;
      if (graph.trackIds[standbyIdx] === nextId) return;
      const record =
        useLibraryStore.getState().localFiles.find((f) => f.id === nextId) ||
        (await db.localFiles.get(nextId));
      if (!record) return;
      revokeDeckUrl(graph, standbyIdx);
      const url = URL.createObjectURL(record.blob);
      graph.objectUrls[standbyIdx] = url;
      graph.trackIds[standbyIdx] = record.id;
      const standby = graph.decks[standbyIdx];
      standby.src = url;
      standby.playbackRate = usePlayerStore.getState().playbackRate;
      standby.load();
    };

    const interval = window.setInterval(() => {
      const activeIdx = graph.activeDeck;
      const standbyIdx: 0 | 1 = activeIdx === 0 ? 1 : 0;
      const audio = graph.decks[activeIdx];
      if (!audio.src) return;

      const cur = audio.currentTime;
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const store = usePlayerStore.getState();
      const profile = useSettingsStore.getState().localProfile;

      if (Number.isFinite(cur)) {
        store.setProgress(cur, dur > 0 ? dur : undefined);
      }

      // Check upcoming local track for gapless or overlapping crossfade
      const upcoming = store.manualQueue[0] ?? store.sourceQueue[0] ?? null;
      const nextLocalId =
        upcoming && isLocalTrack(upcoming) && store.repeat !== 'one'
          ? getTrackUniqueId(upcoming)
          : null;

      if (nextLocalId && dur > 0 && dur - cur <= Math.max(8, profile.crossfadeSeconds + 3)) {
        void preloadStandbyTrack(nextLocalId);
      }

      // Overlapping crossfade (0-12s) between alternating decks
      if (
        nextLocalId &&
        profile.crossfadeSeconds > 0 &&
        dur > profile.crossfadeSeconds * 1.5 &&
        dur - cur <= profile.crossfadeSeconds &&
        dur - cur > 0.05
      ) {
        const standbyAudio = graph.decks[standbyIdx];
        if (graph.trackIds[standbyIdx] === nextLocalId) {
          if (!transitionInProgressRef.current && standbyAudio.readyState >= 2) {
            transitionInProgressRef.current = true;
            graph.deckGains[standbyIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
            standbyAudio.currentTime = 0;
            void standbyAudio.play().catch(() => {});
          }
          if (transitionInProgressRef.current) {
            const progress = 1 - Math.max(0, (dur - cur) / profile.crossfadeSeconds);
            const { outGain, inGain } = computeEqualPowerCrossfade(progress);
            graph.deckGains[activeIdx].gain.setTargetAtTime(outGain, graph.ctx.currentTime, 0.04);
            graph.deckGains[standbyIdx].gain.setTargetAtTime(inGain, graph.ctx.currentTime, 0.04);
          }
        }
      }

      // Sleep timer gentle fade-out in final 1.5 seconds
      if (store.sleepTimerMode === 'minutes' && store.sleepTimerEndsAt) {
        const remainingMs = store.sleepTimerEndsAt - Date.now();
        if (remainingMs > 0 && remainingMs <= 1500) {
          const fadeFactor = Math.max(0.02, remainingMs / 1500);
          const baseVol = store.isMuted ? 0 : store.volume / 100;
          graph.masterGain.gain.setTargetAtTime(baseVol * fadeFactor, graph.ctx.currentTime, 0.05);
        }
      }

      // Handle gapless / crossfade completion or normal end
      if (dur > 0 && (audio.ended || dur - cur <= 0.06)) {
        if (transitionInProgressRef.current && nextLocalId && graph.trackIds[standbyIdx] === nextLocalId) {
          audio.pause();
          graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
          graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
          graph.activeDeck = standbyIdx;
          graph.crossfadeTargetId = nextLocalId;
          transitionInProgressRef.current = false;
          store.handleTrackEnded();
        } else if (
          profile.gaplessPlayback &&
          nextLocalId &&
          graph.trackIds[standbyIdx] === nextLocalId &&
          graph.decks[standbyIdx].readyState >= 2
        ) {
          audio.pause();
          graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
          graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
          graph.decks[standbyIdx].currentTime = 0;
          void graph.decks[standbyIdx].play().catch(() => {});
          graph.activeDeck = standbyIdx;
          graph.crossfadeTargetId = nextLocalId;
          store.handleTrackEnded();
        } else {
          transitionInProgressRef.current = false;
          store.handleTrackEnded();
        }
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [localTrackId, isPlaying, manualQueue, sourceQueue]);

  return null;
}
