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
import type { ActiveStreamMeta, ConcreteQualityTier, StreamQualityOption } from '../types/music';
import {
  classifyStreamQualityBadge,
  computeEqualPowerCrossfade,
  selectEffectiveStreamOption,
} from '../utils/audioMath';
import { getPlayableVideoId, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';

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
  const streamOptions = usePlayerStore((s) => s.streamOptions);
  const selectedQualityOverride = usePlayerStore((s) => s.selectedQualityOverride);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);
  const bufferingStallCount = usePlayerStore((s) => s.bufferingStallCount);

  const localProfile = useSettingsStore((s) => s.localProfile);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const localFiles = useLibraryStore((s) => s.localFiles);
  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);

  const trackUniqueId = getTrackUniqueId(currentTrack);
  const localActive = isLocalTrack(currentTrack);
  const offlineRec =
    !localActive && trackUniqueId
      ? offlineDownloads.find((d) => d.id === trackUniqueId) ?? null
      : null;

  // Engine takes over `<audio>` Web Audio playback for:
  // 1. Local imported files
  // 2. Offline downloaded tracks when offline OR explicitly played from Offline collection
  // 3. Online catalog tracks when user explicitly picked a direct/proxied audio tier
  const useOfflineBlob =
    Boolean(offlineRec) &&
    (sourceLabel === 'Unduhan Offline' ||
      (typeof navigator !== 'undefined' && navigator.onLine === false));

  const effectiveStreamSelection =
    !localActive && !useOfflineBlob && selectedQualityOverride && streamOptions
      ? selectEffectiveStreamOption(streamOptions.options, {
          requestedTier: selectedQualityOverride,
          dataSaver,
          autoAdjustQuality: localProfile.autoAdjustQuality,
          effectiveType: usePlayerStore.getState().networkEffectiveType,
          bufferingStalls: bufferingStallCount,
        })
      : null;

  const streamOptionActive: StreamQualityOption | null =
    effectiveStreamSelection?.selectedOption ?? null;

  const htmlAudioTrackKey = localActive
    ? trackUniqueId
    : useOfflineBlob && offlineRec
      ? `offline:${offlineRec.id}`
      : streamOptionActive && trackUniqueId
        ? `stream:${trackUniqueId}:${streamOptionActive.tier}`
        : null;

  const loadedKeyRef = useRef<string | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const transitionInProgressRef = useRef(false);
  const pauseTimerRef = useRef<number | null>(null);
  const silenceAccumMsRef = useRef(0);
  const lastSilentSeekAtRef = useRef(0);
  const dynamicLufsDoneRef = useRef(false);
  const fallbackNoCorsAudioRef = useRef<HTMLAudioElement | null>(null);
  const usingFallbackNoCorsRef = useRef(false);

  const stopNoCorsFallback = () => {
    usingFallbackNoCorsRef.current = false;
    const el = fallbackNoCorsAudioRef.current;
    if (el) {
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // Ignore
      }
    }
  };

  // Sync output device (setSinkId) when configured
  useEffect(() => {
    if (localProfile.outputDeviceId) {
      void setAudioOutputDevice(localProfile.outputDeviceId);
    }
  }, [localProfile.outputDeviceId]);

  // Apply Web Audio DSP graph parameters live without reloading audio
  useEffect(() => {
    const activeLocal = localActive && trackUniqueId
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
        streamOptions?.replayGainDb ??
        null,
    });

    if (usingFallbackNoCorsRef.current && fallbackNoCorsAudioRef.current) {
      fallbackNoCorsAudioRef.current.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
      fallbackNoCorsAudioRef.current.muted = isMuted;
    }

    // Also update directMode reflection in activeStreamMeta badge if an audio track is loaded
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
    streamOptions,
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
    if (fallbackNoCorsAudioRef.current) {
      fallbackNoCorsAudioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Load source when track or quality tier changes (preserving exact position on mid-track quality switch)
  useEffect(() => {
    if (!hydrated) return;
    const graph = ensureAudioGraph();
    if (!graph) return;

    if (!htmlAudioTrackKey) {
      loadedKeyRef.current = null;
      lastTrackIdRef.current = trackUniqueId;
      stopNoCorsFallback();
      graph.decks.forEach((d) => d.pause());
      return;
    }

    // Handle pre-started crossfade / gapless standby deck
    if (localActive && trackUniqueId && graph.crossfadeTargetId === trackUniqueId) {
      graph.crossfadeTargetId = null;
      loadedKeyRef.current = htmlAudioTrackKey;
      lastTrackIdRef.current = trackUniqueId;
      transitionInProgressRef.current = false;
      dynamicLufsDoneRef.current = false;
      setDynamicMeasuredLufs(null);
      return;
    }

    if (loadedKeyRef.current === htmlAudioTrackKey) return;

    const isSameTrackQualitySwitch =
      Boolean(trackUniqueId) && lastTrackIdRef.current === trackUniqueId;
    const preservedTimeSec = isSameTrackQualitySwitch
      ? usePlayerStore.getState().currentTime
      : 0;

    loadedKeyRef.current = htmlAudioTrackKey;
    lastTrackIdRef.current = trackUniqueId;
    dynamicLufsDoneRef.current = false;
    setDynamicMeasuredLufs(null);
    silenceAccumMsRef.current = 0;
    stopNoCorsFallback();

    let cancelled = false;

    const loadSource = async () => {
      const nextDeckIdx: 0 | 1 = graph.activeDeck;
      const otherDeckIdx: 0 | 1 = nextDeckIdx === 0 ? 1 : 0;
      graph.decks[otherDeckIdx].pause();
      graph.deckGains[otherDeckIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
      graph.deckGains[nextDeckIdx].gain.setValueAtTime(1, graph.ctx.currentTime);

      const audio = graph.decks[nextDeckIdx];
      let urlToLoad: string | null = null;
      let isObjectUrl = false;
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
        isObjectUrl = true;
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
        isObjectUrl = true;
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
      } else if (streamOptionActive && trackUniqueId) {
        revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        // Prefer CORS-capable URL or backend CORS/Range proxy
        const chosenUrl = streamOptionActive.corsSupported
          ? streamOptionActive.streamUrl || streamOptionActive.proxyUrl
          : streamOptionActive.proxyUrl || streamOptionActive.streamUrl;
        urlToLoad = chosenUrl || null;
        graph.trackIds[nextDeckIdx] = trackUniqueId;

        if (urlToLoad) {
          const badge = classifyStreamQualityBadge({
            codec: streamOptionActive.codec,
            bitrateKbps: streamOptionActive.bitrateKbps,
            sampleRateHz: streamOptionActive.sampleRateHz,
            bitDepth: streamOptionActive.bitDepth,
            lossless: streamOptionActive.lossless,
          });
          metaToReport = {
            trackId: trackUniqueId,
            requestedTier: (selectedQualityOverride || localProfile.wifiQuality) as ConcreteQualityTier,
            actualTier: streamOptionActive.tier,
            codec: streamOptionActive.codec || 'Audio',
            bitrateKbps: streamOptionActive.bitrateKbps ?? null,
            sampleRateHz: streamOptionActive.sampleRateHz ?? null,
            bitDepth: streamOptionActive.bitDepth ?? null,
            lossless: badge.lossless,
            hiRes: badge.hiRes,
            badgeLabel: streamOptionActive.isPreview ? `${badge.badgeLabel} · Pratinjau` : badge.badgeLabel,
            sourceMode: localProfile.directMode ? 'direct' : 'webaudio',
            proxiedViaBackend: Boolean(urlToLoad.startsWith('/api/stream/')),
            audiodownloadAllowed: streamOptions?.audiodownload_allowed ?? false,
            replayGainDb: streamOptions?.replayGainDb ?? null,
          };
        }
      }

      if (!urlToLoad || cancelled) return;

      audio.crossOrigin = isObjectUrl ? null : 'anonymous';
      audio.src = urlToLoad;
      audio.playbackRate = usePlayerStore.getState().playbackRate;

      const storeState = usePlayerStore.getState();
      const targetSeek =
        preservedTimeSec > 0.5
          ? preservedTimeSec
          : storeState.pendingSeekSeconds ?? storeState.currentTime ?? 0;

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
        // If direct external URL failed CORS/load, automatically retry via backend proxy first
        if (
          streamOptionActive?.proxyUrl &&
          audio.src !== new URL(streamOptionActive.proxyUrl, window.location.origin).href
        ) {
          audio.crossOrigin = 'anonymous';
          audio.src = streamOptionActive.proxyUrl;
          audio.load();
          return;
        }

        // Fallback: play without Web Audio CORS so track never goes silent + warn user honestly
        const rawFallbackUrl = streamOptionActive?.rawUrl || streamOptionActive?.proxyUrl;
        if (rawFallbackUrl) {
          const el = fallbackNoCorsAudioRef.current || new Audio();
          el.preload = 'auto';
          el.crossOrigin = null;
          el.src = rawFallbackUrl;
          el.volume = storeState.isMuted ? 0 : Math.max(0, Math.min(1, storeState.volume / 100));
          el.muted = storeState.isMuted;
          el.playbackRate = storeState.playbackRate;
          el.onloadedmetadata = () => {
            if (targetSeek > 0 && Number.isFinite(el.duration) && targetSeek < el.duration) {
              el.currentTime = targetSeek;
            }
            usePlayerStore.getState().setIsBuffering(false);
            if (usePlayerStore.getState().isPlaying) {
              void el.play().catch(() => {});
            }
          };
          el.onended = () => {
            if (usingFallbackNoCorsRef.current) {
              usePlayerStore.getState().handleTrackEnded();
            }
          };
          fallbackNoCorsAudioRef.current = el;
          usingFallbackNoCorsRef.current = true;
          usePlayerStore
            .getState()
            .setWebAudioWarning('Efek suara tidak tersedia untuk lagu ini');
          if (metaToReport) {
            usePlayerStore.getState().setActiveStreamMeta({
              ...metaToReport,
              sourceMode: 'fallback-no-fx',
            });
          }
          el.load();
        } else {
          usePlayerStore.getState().setIsBuffering(false);
          usePlayerStore.getState().setPlayerError('Stream audio gagal dimuat.');
        }
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
    streamOptionActive,
    trackUniqueId,
  ]);

  // Sync Play / Pause with smooth fade in/out when fadeOnPlayPause is enabled
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph || !htmlAudioTrackKey) return;

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    if (usingFallbackNoCorsRef.current && fallbackNoCorsAudioRef.current) {
      const el = fallbackNoCorsAudioRef.current;
      if (isPlaying && el.paused) {
        void el.play().catch(() => {});
      } else if (!isPlaying && !el.paused) {
        el.pause();
      }
      return;
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
    if (!htmlAudioTrackKey || pendingSeekSeconds === null) return;

    if (usingFallbackNoCorsRef.current && fallbackNoCorsAudioRef.current) {
      const el = fallbackNoCorsAudioRef.current;
      if (Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = Math.max(0, Math.min(pendingSeekSeconds, el.duration));
        usePlayerStore.getState().clearPendingSeek();
      }
      return;
    }

    if (!graph) return;
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
      if (usingFallbackNoCorsRef.current && fallbackNoCorsAudioRef.current) {
        const el = fallbackNoCorsAudioRef.current;
        const cur = el.currentTime;
        const dur = Number.isFinite(el.duration) ? el.duration : 0;
        if (Number.isFinite(cur)) {
          usePlayerStore.getState().setProgress(cur, dur > 0 ? dur : undefined);
        }
        return;
      }

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

      // Dynamic loudness measurement during first 3.5 seconds if normalization active and no ReplayGain
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

      // Real-time Skip Silence via AnalyserNode
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

      // Upcoming track check for crossfade / gapless (bypassed in Direct Mode)
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

      // Equal-power crossfade (0-12s), disabled in Direct Mode
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

      // Sleep timer gentle fade-out in final 1.5s
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

  // Also ensure active track's offline status isn't lost if played via catalog ID
  useEffect(() => {
    if (!currentTrack || localActive) return;
    const vid = getPlayableVideoId(currentTrack);
    if (!vid) return;
    const isOffline = useOfflineBlob;
    if (isOffline && usePlayerStore.getState().isBuffering) {
      usePlayerStore.getState().setIsBuffering(false);
    }
  }, [currentTrack, localActive, useOfflineBlob]);

  return null;
}
