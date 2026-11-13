import { useEffect, useRef } from 'react';
import {
  applyAudioProfileToGraph,
  computeLiveAnalyserRms,
  ensureAudioGraph,
  incrementSkipSilenceCount,
  measureAndEstimateLufs,
  resumeAudioContext,
  setAudioOutputDevice,
  setDynamicMeasuredLufs,
} from '../audio/soundclearAudioEngine';
import { db } from '../db/soundclearDb';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { ActiveStreamMeta } from '../types/music';
import {
  classifyStreamQualityBadge,
  computeEqualPowerCrossfade,
} from '../utils/audioMath';
import {
  getPlayableVideoId,
  getTrackUniqueId,
  hasPlayableOfflineAudio,
  isLocalTrack,
} from '../utils/playerLogic';

function revokeDeckUrl(
  objectUrls: [string | null, string | null],
  deckIdx: 0 | 1,
): void {
  const prevUrl = objectUrls[deckIdx];
  if (prevUrl) {
    URL.revokeObjectURL(prevUrl);
    objectUrls[deckIdx] = null;
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
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);

  const localProfile = useSettingsStore((s) => s.localProfile);
  const localFiles = useLibraryStore((s) => s.localFiles);
  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);

  const trackUniqueId = getTrackUniqueId(currentTrack);
  const localActive = isLocalTrack(currentTrack);
  const offlineRec =
    !localActive && trackUniqueId
      ? offlineDownloads.find((d) => d.id === trackUniqueId) ?? null
      : null;

  // Engine takes over `<audio>` Web Audio playback strictly for:
  // 1. Local imported files
  // 2. Existing playable offline audio blobs when offline OR played from Offline collection
  const useOfflineBlob =
    hasPlayableOfflineAudio(offlineRec) &&
    (sourceLabel === 'Unduhan Offline' ||
      (typeof navigator !== 'undefined' && navigator.onLine === false));

  const htmlAudioTrackKey = localActive
    ? trackUniqueId
    : useOfflineBlob && offlineRec
      ? `offline:${offlineRec.id}`
      : null;

  const loadedKeyRef = useRef<string | null>(null);
  const transitionInProgressRef = useRef(false);
  const pauseTimerRef = useRef<number | null>(null);
  const silenceAccumMsRef = useRef(0);
  const lastSilentSeekAtRef = useRef(0);
  const dynamicLufsDoneRef = useRef(false);

  // Sync output device (setSinkId) when configured
  useEffect(() => {
    if (localProfile.outputDeviceId) {
      void setAudioOutputDevice(localProfile.outputDeviceId);
    }
  }, [localProfile.outputDeviceId]);

  // Apply Web Audio DSP graph parameters live without reloading audio
  useEffect(() => {
    const activeLocal =
      localActive && trackUniqueId
        ? localFiles.find((f) => f.id === trackUniqueId) ?? null
        : null;
    const activeOffline = useOfflineBlob ? offlineRec : null;

    applyAudioProfileToGraph({
      profile: localProfile,
      volume0to100: volume,
      isMuted,
      trackLufs: activeLocal?.estimatedLufs ?? activeOffline?.estimatedLufs ?? null,
      trackPeak: activeLocal?.peakLinear ?? activeOffline?.peakLinear ?? null,
      replayGainDb:
        activeLocal?.replayGainDb ??
        activeOffline?.replayGainDb ??
        null,
    });

    const currentMeta = usePlayerStore.getState().activeStreamMeta;
    if (
      currentMeta &&
      (currentMeta.sourceMode === 'webaudio' || currentMeta.sourceMode === 'direct')
    ) {
      const nextMode = localProfile.directMode ? 'direct' : 'webaudio';
      if (currentMeta.sourceMode !== nextMode) {
        usePlayerStore.getState().setActiveStreamMeta({
          ...currentMeta,
          sourceMode: nextMode,
        });
      }
    }
  }, [
    localProfile,
    volume,
    isMuted,
    localActive,
    trackUniqueId,
    localFiles,
    useOfflineBlob,
    offlineRec,
  ]);

  // Apply playbackRate with pitch preservation
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (graph) {
      graph.decks.forEach((deck) => {
        deck.playbackRate = playbackRate;
        const m = deck as HTMLAudioElement & {
          preservesPitch?: boolean;
          webkitPreservesPitch?: boolean;
        };
        m.preservesPitch = true;
        m.webkitPreservesPitch = true;
      });
    }
  }, [playbackRate]);

  // Load local/offline source when track changes
  useEffect(() => {
    if (!hydrated) return;
    const graph = ensureAudioGraph();
    if (!graph) return;

    if (!htmlAudioTrackKey) {
      loadedKeyRef.current = null;
      graph.decks.forEach((d) => d.pause());
      return;
    }

    // Handle pre-started crossfade / gapless standby deck
    if (localActive && trackUniqueId && graph.crossfadeTargetId === trackUniqueId) {
      graph.crossfadeTargetId = null;
      loadedKeyRef.current = htmlAudioTrackKey;
      transitionInProgressRef.current = false;
      dynamicLufsDoneRef.current = false;
      setDynamicMeasuredLufs(null);
      return;
    }

    if (loadedKeyRef.current === htmlAudioTrackKey) return;

    loadedKeyRef.current = htmlAudioTrackKey;
    dynamicLufsDoneRef.current = false;
    setDynamicMeasuredLufs(null);
    silenceAccumMsRef.current = 0;

    let cancelled = false;

    const loadSource = async () => {
      const nextDeckIdx: 0 | 1 = graph.activeDeck;
      const otherDeckIdx: 0 | 1 = nextDeckIdx === 0 ? 1 : 0;
      graph.decks[otherDeckIdx].pause();
      graph.deckGains[otherDeckIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
      graph.deckGains[nextDeckIdx].gain.setValueAtTime(1, graph.ctx.currentTime);

      const audio = graph.decks[nextDeckIdx];
      let urlToLoad: string | null = null;
      let metaToReport: ActiveStreamMeta | null = null;

      if (localActive && trackUniqueId) {
        const record =
          useLibraryStore.getState().localFiles.find((f) => f.id === trackUniqueId) ||
          (await db.localFiles.get(trackUniqueId));
        if (cancelled) return;
        if (!record) {
          usePlayerStore
            .getState()
            .setPlayerError('File audio lokal tidak ditemukan di penyimpanan browser.');
          usePlayerStore.getState().setIsPlaying(false);
          return;
        }
        revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        urlToLoad = URL.createObjectURL(record.blob);
        graph.objectUrls[nextDeckIdx] = urlToLoad;
        graph.trackIds[nextDeckIdx] = record.id;

        const badge = classifyStreamQualityBadge({
          codec: record.codec || record.mimeType,
          bitrateKbps: record.bitrateKbps,
          sampleRateHz: record.sampleRateHz,
          bitDepth: record.bitDepth,
          lossless: record.lossless,
        });
        metaToReport = {
          trackId: record.id,
          requestedTier: localProfile.directMode ? 'lossless' : 'auto',
          actualTier: 'local',
          codec: record.codec || record.mimeType || 'Lokal',
          bitrateKbps: record.bitrateKbps ?? null,
          sampleRateHz: record.sampleRateHz ?? null,
          bitDepth: record.bitDepth ?? null,
          lossless: badge.lossless,
          hiRes: badge.hiRes,
          badgeLabel: badge.badgeLabel,
          sourceMode: localProfile.directMode ? 'direct' : 'webaudio',
          proxiedViaBackend: false,
          audiodownloadAllowed: true,
          replayGainDb: record.replayGainDb ?? null,
        };
      } else if (useOfflineBlob && offlineRec) {
        revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        urlToLoad = URL.createObjectURL(offlineRec.blob);
        graph.objectUrls[nextDeckIdx] = urlToLoad;
        graph.trackIds[nextDeckIdx] = offlineRec.id;

        const badge = classifyStreamQualityBadge({
          codec: offlineRec.codec,
          bitrateKbps: offlineRec.bitrateKbps,
          sampleRateHz: offlineRec.sampleRateHz,
          bitDepth: offlineRec.bitDepth,
          lossless: offlineRec.lossless,
        });
        metaToReport = {
          trackId: offlineRec.id,
          requestedTier: offlineRec.qualityTier,
          actualTier: 'offline',
          codec: offlineRec.codec,
          bitrateKbps: offlineRec.bitrateKbps ?? null,
          sampleRateHz: offlineRec.sampleRateHz ?? null,
          bitDepth: offlineRec.bitDepth ?? null,
          lossless: badge.lossless,
          hiRes: badge.hiRes,
          badgeLabel: `${badge.badgeLabel} (Offline)`,
          sourceMode: localProfile.directMode ? 'direct' : 'webaudio',
          proxiedViaBackend: false,
          audiodownloadAllowed: true,
          replayGainDb: offlineRec.replayGainDb ?? null,
        };
      }

      if (!urlToLoad || cancelled) return;

      audio.crossOrigin = null;
      audio.src = urlToLoad;
      audio.playbackRate = usePlayerStore.getState().playbackRate;

      const storeState = usePlayerStore.getState();
      const targetSeek = storeState.pendingSeekSeconds ?? storeState.currentTime ?? 0;

      const handleLoadedMeta = () => {
        if (cancelled) return;
        if (targetSeek > 0 && Number.isFinite(audio.duration) && targetSeek < audio.duration) {
          audio.currentTime = targetSeek;
        }
        const st = usePlayerStore.getState();
        st.clearPendingSeek();
        st.setIsBuffering(false);
        st.setPlayerError(null);
        st.setWebAudioWarning(null);
        if (metaToReport) {
          st.setActiveStreamMeta(metaToReport);
        }
        if (st.isPlaying) {
          void resumeAudioContext();
          void audio.play().catch(() => {});
        }
      };

      const handleMediaError = () => {
        if (cancelled) return;
        usePlayerStore.getState().setIsBuffering(false);
        usePlayerStore.getState().setPlayerError('File audio lokal gagal diputar.');
      };

      audio.addEventListener('loadedmetadata', handleLoadedMeta, { once: true });
      audio.addEventListener('error', handleMediaError, { once: true });
      audio.load();
    };

    void loadSource();

    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    htmlAudioTrackKey,
    localActive,
    useOfflineBlob,
    offlineRec,
    trackUniqueId,
    localProfile.directMode,
  ]);

  // Sync Play / Pause with smooth fade in/out when fadeOnPlayPause is enabled
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph || !htmlAudioTrackKey) return;

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    const activeAudio = graph.decks[graph.activeDeck];
    const activeGain = graph.deckGains[graph.activeDeck].gain;
    const profile = useSettingsStore.getState().localProfile;
    const useFade = profile.fadeOnPlayPause && !profile.directMode;
    const now = graph.ctx.currentTime;

    if (isPlaying) {
      void resumeAudioContext();
      if (activeAudio.src) {
        activeGain.cancelScheduledValues(now);
        if (useFade) {
          activeGain.setValueAtTime(0.02, now);
          activeGain.linearRampToValueAtTime(1, now + 0.18);
        } else {
          activeGain.setValueAtTime(1, now);
        }
        if (activeAudio.paused) {
          void activeAudio.play().catch(() => {});
        }
      }
    } else if (!activeAudio.paused) {
      if (useFade) {
        activeGain.cancelScheduledValues(now);
        activeGain.setValueAtTime(activeGain.value, now);
        activeGain.linearRampToValueAtTime(0.01, now + 0.14);
        pauseTimerRef.current = window.setTimeout(() => {
          pauseTimerRef.current = null;
          if (!usePlayerStore.getState().isPlaying) {
            activeAudio.pause();
            activeGain.setValueAtTime(1, graph.ctx.currentTime);
          }
        }, 150);
      } else {
        activeAudio.pause();
      }
    }
  }, [isPlaying, htmlAudioTrackKey]);

  // Explicit Seek
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!htmlAudioTrackKey || pendingSeekSeconds === null || !graph) return;

    const activeAudio = graph.decks[graph.activeDeck];
    if (Number.isFinite(activeAudio.duration) && activeAudio.duration > 0) {
      activeAudio.currentTime = Math.max(0, Math.min(pendingSeekSeconds, activeAudio.duration));
      usePlayerStore.getState().clearPendingSeek();
    }
  }, [seekVersion, pendingSeekSeconds, htmlAudioTrackKey]);

  // Progress polling, crossfade (0-12s), gapless preloading, dynamic LUFS, skip silence, sleep timer fade
  useEffect(() => {
    if (!htmlAudioTrackKey || !isPlaying) return;
    const graph = ensureAudioGraph();
    if (!graph) return;

    const preloadStandbyTrack = async (nextId: string) => {
      const standbyIdx: 0 | 1 = graph.activeDeck === 0 ? 1 : 0;
      if (graph.trackIds[standbyIdx] === nextId) return;
      const record =
        useLibraryStore.getState().localFiles.find((f) => f.id === nextId) ||
        (await db.localFiles.get(nextId));
      if (!record) return;
      revokeDeckUrl(graph.objectUrls, standbyIdx);
      const url = URL.createObjectURL(record.blob);
      graph.objectUrls[standbyIdx] = url;
      graph.trackIds[standbyIdx] = record.id;
      const standby = graph.decks[standbyIdx];
      standby.crossOrigin = null;
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

      if (
        !profile.directMode &&
        profile.normalizationTarget !== 'off' &&
        !dynamicLufsDoneRef.current &&
        cur >= 1.5
      ) {
        const measured = measureAndEstimateLufs();
        if (measured !== null) {
          setDynamicMeasuredLufs(measured);
          applyAudioProfileToGraph({
            profile,
            volume0to100: store.volume,
            isMuted: store.isMuted,
            trackLufs: measured,
          });
        }
        if (cur >= 3.5) {
          dynamicLufsDoneRef.current = true;
        }
      }

      if (
        !profile.directMode &&
        profile.skipSilence &&
        dur > 3 &&
        cur > 0.3 &&
        cur < dur - 1.5 &&
        !transitionInProgressRef.current
      ) {
        const rms = computeLiveAnalyserRms();
        if (rms < 0.0032) {
          silenceAccumMsRef.current += 100;
          const nowMs = Date.now();
          if (silenceAccumMsRef.current >= 450 && nowMs - lastSilentSeekAtRef.current >= 450) {
            lastSilentSeekAtRef.current = nowMs;
            silenceAccumMsRef.current = 0;
            audio.currentTime = Math.min(dur - 0.3, cur + 0.5);
            incrementSkipSilenceCount();
          }
        } else {
          silenceAccumMsRef.current = 0;
        }
      } else {
        silenceAccumMsRef.current = 0;
      }

      const upcoming = store.manualQueue[0] ?? store.sourceQueue[0] ?? null;
      const nextLocalId =
        upcoming && isLocalTrack(upcoming) && store.repeat !== 'one'
          ? getTrackUniqueId(upcoming)
          : null;

      if (
        nextLocalId &&
        !profile.directMode &&
        dur > 0 &&
        dur - cur <= Math.max(8, profile.crossfadeSeconds + 3)
      ) {
        void preloadStandbyTrack(nextLocalId);
      }

      if (
        !profile.directMode &&
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

      if (store.sleepTimerMode === 'minutes' && store.sleepTimerEndsAt) {
        const remainingMs = store.sleepTimerEndsAt - Date.now();
        if (remainingMs > 0 && remainingMs <= 1500) {
          const fadeFactor = Math.max(0.02, remainingMs / 1500);
          const baseVol = store.isMuted ? 0 : store.volume / 100;
          graph.masterGain.gain.setTargetAtTime(baseVol * fadeFactor, graph.ctx.currentTime, 0.05);
        }
      }

      if (dur > 0 && (audio.ended || dur - cur <= 0.06)) {
        if (
          !profile.directMode &&
          transitionInProgressRef.current &&
          nextLocalId &&
          graph.trackIds[standbyIdx] === nextLocalId
        ) {
          audio.pause();
          graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
          graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
          graph.activeDeck = standbyIdx;
          graph.crossfadeTargetId = nextLocalId;
          transitionInProgressRef.current = false;
          store.handleTrackEnded();
        } else if (
          !profile.directMode &&
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
  }, [htmlAudioTrackKey, isPlaying, manualQueue, sourceQueue]);

  useEffect(() => {
    if (!currentTrack || localActive) return;
    const vid = getPlayableVideoId(currentTrack);
    if (!vid) return;
    if (useOfflineBlob && usePlayerStore.getState().isBuffering) {
      usePlayerStore.getState().setIsBuffering(false);
    }
  }, [currentTrack, localActive, useOfflineBlob]);

  return null;
}
