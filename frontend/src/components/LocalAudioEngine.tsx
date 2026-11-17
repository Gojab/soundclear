import { useEffect, useRef } from 'react';
import {
  buildStreamAudioUrl,
  fetchStreamAudioMeta,
  resolvePlayableYoutube,
} from '../api/client';
import {
  isAndroidAudioFocusDucked,
  isCapacitorAndroidPlatform,
  isCapacitorNativeStreamActive,
  pauseCapacitorNativeStream,
  playCapacitorNativeStream,
  resolveCapacitorDirectAudioUrl,
  resumeCapacitorNativeStream,
  seekCapacitorNativeStream,
  setCapacitorNativePlaybackRate,
  setCapacitorNativeStreamErrorHandler,
  setCapacitorNativeVolume,
  stopCapacitorNativeStream,
  syncCapacitorPlaybackNotification,
} from '../audio/capacitorAudioBridge';
import {
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
  syncMediaSessionPosition,
} from '../audio/mediaSessionService';
import {
  analyzeAudioBlobBpm,
  applyAudioProfileToGraph,
  applyDeckDjMixFrame,
  cacheFallbackTrackBpm,
  clearElementPrimingFlag,
  computeLiveAnalyserRms,
  engageBackgroundDirectDeck,
  ensureAudioGraph,
  ensurePlaybackAudioSession,
  ensureStandaloneDirectDeck,
  getActivePlaybackElement,
  getCachedTrackBpm,
  incrementSkipSilenceCount,
  isBackgroundHandoffActive,
  isProgrammaticPause,
  markProgrammaticPause,
  measureAndEstimateLufs,
  pauseAudioElementProgrammatically,
  resetDeckDjStage,
  resetDirectDeck,
  restoreDspDeckFromBackground,
  resumeAudioContext,
  revokeDirectDeckUrl,
  setAudioOutputDevice,
  setDynamicMeasuredLufs,
  setElementBusyForLoad,
  startSilentKeepaliveAudio,
  stopSilentKeepaliveAudio,
  subscribeAudioContextInterrupted,
} from '../audio/soundclearAudioEngine';
import { db } from '../db/soundclearDb';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type {
  ActiveStreamMeta,
  ConcreteQualityTier,
  LocalAudioProfile,
  MediaItem,
  PlaylistMixSettings,
} from '../types/music';
import {
  clampYoutubeVolume,
  classifyStreamQualityBadge,
  computeEqualPowerCrossfade,
  resolveEffectiveCrossfadeSeconds,
  resolveTargetStreamQuality,
} from '../utils/audioMath';
import {
  clampEffectiveTransitionSeconds,
  computeBeatMatchPlan,
  computeDjTransitionFrame,
  computePhaseAlignedCueOffset,
  DEFAULT_PLAYLIST_MIX_SETTINGS,
  normalizePlaylistMixSettings,
} from '../utils/djMixLogic';
import {
  formatArtists,
  getPlayableVideoId,
  getTrackUniqueId,
  hasPlayableOfflineAudio,
  isLocalTrack,
  isYouTubeVideoId,
} from '../utils/playerLogic';
import {
  buildYoutubeIframeStreamMeta,
  decideOnlineStreamAction,
  isYoutubeIframeActive,
} from '../utils/streamPlaybackLogic';
import {
  prefetchStreamProbe,
  probeStreamWithCache,
  shouldFastRouteToIframe,
} from '../utils/streamProbeCache';
import {
  clampSeekTarget,
  getRealDocumentVisibilityState,
  isMobileAudioEnvironment,
  isUserPaused,
  shouldEngageDirectDeckOnHide,
  shouldFallbackSuspendedDspToDirect,
  shouldLoadTrackDirectlyOnDirectDeck,
  shouldRestoreDspOnForeground,
  shouldSyncExternalPause,
  subscribeRealPageHide,
  subscribeRealVisibilityChange,
} from '../utils/backgroundAudioLogic';
import { resolveEffectiveMediaSessionPlaybackState } from '../utils/mediaSessionLogic';

interface ActiveTransitionState {
  mode: 'dj' | 'crossfade';
  startedAtMs: number;
  effectiveSec: number;
  outgoingIdx: 0 | 1;
  incomingIdx: 0 | 1;
  targetKey: string;
  manual: boolean;
  beatMatched: boolean;
  incomingStartRate: number;
  outgoingBpm: number | null;
  incomingBpm: number | null;
  baseRate: number;
  style: PlaylistMixSettings['transitionStyle'];
  eqBlend: boolean;
  volumeCurve: PlaylistMixSettings['volumeCurve'];
}

function resolveEffectiveMixSettings(
  activeMixConfig: PlaylistMixSettings | null,
  profile: LocalAudioProfile,
): PlaylistMixSettings | null {
  if (profile.directMode) return null;
  if (activeMixConfig?.enabled) {
    return normalizePlaylistMixSettings(activeMixConfig);
  }
  if (profile.djMix?.enabled) {
    return normalizePlaylistMixSettings(profile.djMix);
  }
  return null;
}

function setElementRatePreservingPitch(el: HTMLAudioElement, rate: number): void {
  el.playbackRate = rate;
  const m = el as HTMLAudioElement & {
    preservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
    mozPreservesPitch?: boolean;
  };
  m.preservesPitch = true;
  m.webkitPreservesPitch = true;
  m.mozPreservesPitch = true;
}

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
  const selectedQualityOverride = usePlayerStore((s) => s.selectedQualityOverride);
  const networkEffectiveType = usePlayerStore((s) => s.networkEffectiveType);
  const bufferingStallCount = usePlayerStore((s) => s.bufferingStallCount);
  const activeStreamSourceMode = usePlayerStore((s) => s.activeStreamMeta?.sourceMode ?? null);

  const localProfile = useSettingsStore((s) => s.localProfile);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const youtubeSound = useSettingsStore((s) => s.youtubeSound);
  const localFiles = useLibraryStore((s) => s.localFiles);
  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);

  const trackUniqueId = getTrackUniqueId(currentTrack);
  const localActive = isLocalTrack(currentTrack);
  const rawVideoId = !localActive ? getPlayableVideoId(currentTrack) : null;
  const offlineRec =
    !localActive && trackUniqueId
      ? offlineDownloads.find((d) => d.id === trackUniqueId) ?? null
      : null;

  const useOfflineBlob =
    hasPlayableOfflineAudio(offlineRec) && !selectedQualityOverride;

  const targetStreamTier: ConcreteQualityTier =
    selectedQualityOverride ??
    resolveTargetStreamQuality(
      localProfile,
      typeof navigator === 'undefined' ? true : navigator.onLine,
      dataSaver,
      networkEffectiveType,
      bufferingStallCount,
    );

  // Unified `<audio>` + Web Audio DSP pipeline handles:
  // 1. Local imported files (`local:{id}`)
  // 2. Offline downloaded audio blobs (`offline:{id}`)
  // 3. All online tracks via audio-only backend stream (`stream:{videoId}:{tier}`)
  const htmlAudioTrackKey = localActive
    ? trackUniqueId
    : useOfflineBlob && offlineRec
      ? `offline:${offlineRec.id}`
      : rawVideoId
        ? `stream:${rawVideoId}:${targetStreamTier}`
        : null;

  const loadedKeyRef = useRef<string | null>(null);
  const loadedDirectModeRef = useRef<boolean>(localProfile.directMode);
  const transitionInProgressRef = useRef(false);
  const transitionStateRef = useRef<ActiveTransitionState | null>(null);
  const lastHandledManualMixRef = useRef<number>(0);
  const pauseTimerRef = useRef<number | null>(null);
  const autoResumeTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const silenceAccumMsRef = useRef(0);
  const suspendedCtxAccumMsRef = useRef(0);
  const digitalZeroAccumMsRef = useRef(0);
  const lastSilentSeekAtRef = useRef(0);
  const lastProgressTickAtRef = useRef(0);
  const dynamicLufsDoneRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);
  const isLoadingAudioRef = useRef(false);
  const preloadGenerationRef = useRef(0);
  const standaloneObjectUrlRef = useRef<string | null>(null);
  const loadingNativeForKeyRef = useRef<string | null>(null);
  const manualMixRequestVersion = usePlayerStore((s) => s.manualMixRequestVersion);

  useEffect(() => {
    return () => {
      void stopCapacitorNativeStream();
      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      if (autoResumeTimerRef.current !== null) {
        window.clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = null;
      }
      if (standaloneObjectUrlRef.current) {
        URL.revokeObjectURL(standaloneObjectUrlRef.current);
        standaloneObjectUrlRef.current = null;
      }
    };
  }, []);

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
    const effectiveVolume = localActive
      ? volume
      : clampYoutubeVolume(volume, youtubeSound.maxVolumeLimit, isMuted);

    if (isCapacitorNativeStreamActive()) {
      void setCapacitorNativeVolume(effectiveVolume, isMuted);
    }

    applyAudioProfileToGraph({
      profile: localProfile,
      volume0to100: effectiveVolume,
      isMuted,
      trackLufs: activeLocal?.estimatedLufs ?? activeOffline?.estimatedLufs ?? null,
      trackPeak: activeLocal?.peakLinear ?? activeOffline?.peakLinear ?? null,
      replayGainDb:
        activeLocal?.replayGainDb ??
        activeOffline?.replayGainDb ??
        null,
    });

    const graph = ensureAudioGraph();
    const duckScale = isAndroidAudioFocusDucked() ? 0.25 : 1;
    const directVol = isMuted ? 0 : Math.max(0, Math.min(1, (effectiveVolume / 100) * duckScale));
    if (graph) {
      graph.directDeck.muted = isMuted;
      graph.directDeck.volume = directVol;
      graph.decks.forEach((d) => {
        if (d.dataset.scPriming !== '1') {
          d.muted = false;
          d.volume = 1;
        }
      });
    } else {
      const standalone = ensureStandaloneDirectDeck();
      if (standalone) {
        standalone.muted = isMuted;
        standalone.volume = directVol;
      }
    }

    const currentMeta = usePlayerStore.getState().activeStreamMeta;
    if (
      currentMeta &&
      (currentMeta.sourceMode === 'webaudio' || currentMeta.sourceMode === 'direct')
    ) {
      const nextMode =
        localProfile.directMode || Boolean(graph?.backgroundDirectActive)
          ? 'direct'
          : 'webaudio';
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
    youtubeSound.maxVolumeLimit,
    localActive,
    trackUniqueId,
    localFiles,
    useOfflineBlob,
    offlineRec,
  ]);

  // Apply playbackRate with pitch preservation (unless currently tempo-gliding back from beat match)
  useEffect(() => {
    if (isCapacitorNativeStreamActive()) {
      void setCapacitorNativePlaybackRate(playbackRate);
    }
    const graph = ensureAudioGraph();
    if (graph) {
      [...graph.decks, graph.directDeck].forEach((deck) => {
        setElementRatePreservingPitch(deck, playbackRate);
      });
    } else {
      const standalone = ensureStandaloneDirectDeck();
      if (standalone) setElementRatePreservingPitch(standalone, playbackRate);
    }
  }, [playbackRate]);

  // Keep active user-unlocked audio playing seamlessly across iOS/Android lockscreen and tab switches.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let fallbackCheckTimer: number | null = null;
    let visAutoResumeTimer: number | null = null;
    const isMobile = isMobileAudioEnvironment();

    const clearFallbackTimer = () => {
      if (fallbackCheckTimer !== null) {
        window.clearTimeout(fallbackCheckTimer);
        fallbackCheckTimer = null;
      }
      if (visAutoResumeTimer !== null) {
        window.clearTimeout(visAutoResumeTimer);
        visAutoResumeTimer = null;
      }
    };

    const getEffectiveVol = (latest: ReturnType<typeof usePlayerStore.getState>) =>
      isLocalTrack(latest.currentTrack)
        ? latest.volume
        : clampYoutubeVolume(
            latest.volume,
            useSettingsStore.getState().youtubeSound.maxVolumeLimit,
            latest.isMuted,
          );

    const tryEngageDirectDeck = () => {
      const latest = usePlayerStore.getState();
      const g = ensureAudioGraph();
      if (!g || !latest.isPlaying || isYoutubeIframeActive(latest.activeStreamMeta)) return;

      const activeDeck = g.decks[g.activeDeck];
      if (
        shouldEngageDirectDeckOnHide({
          isPlaying: latest.isPlaying,
          isYoutubeIframe: isYoutubeIframeActive(latest.activeStreamMeta),
          hasActiveDeckSrc: Boolean(activeDeck.src),
          isMobile,
          contextState: g.ctx.state,
          backgroundDirectActive: g.backgroundDirectActive,
        })
      ) {
        void engageBackgroundDirectDeck(getEffectiveVol(latest), latest.isMuted);
      }
    };

    const scheduleAutoResumeOnVisibility = () => {
      if (visAutoResumeTimer !== null) {
        window.clearTimeout(visAutoResumeTimer);
      }
      visAutoResumeTimer = window.setTimeout(() => {
        visAutoResumeTimer = null;
        const latest = usePlayerStore.getState();
        if (!latest.isPlaying || isUserPaused() || isYoutubeIframeActive(latest.activeStreamMeta)) {
          return;
        }
        const g = ensureAudioGraph();
        const activeEl = g ? getActivePlaybackElement(g) : ensureStandaloneDirectDeck();
        if (
          activeEl &&
          activeEl.src &&
          activeEl.paused &&
          !activeEl.ended &&
          activeEl.dataset.scPriming !== '1'
        ) {
          void resumeAudioContext();
          void activeEl.play().catch(() => {});
        }
      }, 300);
    };

    const keepAliveOrFallbackForBackground = () => {
      if (isCapacitorNativeStreamActive()) return;
      const graph = ensureAudioGraph();
      const state = usePlayerStore.getState();
      if (!graph || !state.isPlaying || isYoutubeIframeActive(state.activeStreamMeta)) return;

      ensurePlaybackAudioSession();
      if (!isUserPaused()) {
        startSilentKeepaliveAudio();
      }

      // On iOS/Android or when AudioContext is already suspended/interrupted,
      // hand off cleanly within the real visibilitychange / pagehide grace window.
      tryEngageDirectDeck();
      scheduleAutoResumeOnVisibility();

      // Safety timer in case AudioContext suspends shortly after tab hide
      clearFallbackTimer();
      fallbackCheckTimer = window.setTimeout(() => {
        fallbackCheckTimer = null;
        if (getRealDocumentVisibilityState() !== 'hidden') return;
        const latest = usePlayerStore.getState();
        if (!latest.isPlaying || isUserPaused() || isYoutubeIframeActive(latest.activeStreamMeta)) {
          return;
        }

        const g = ensureAudioGraph();
        if (!g || g.backgroundDirectActive) return;
        const activeDeck = g.decks[g.activeDeck];
        if (!activeDeck.src) return;

        if (g.ctx.state !== 'running') {
          void engageBackgroundDirectDeck(getEffectiveVol(latest), latest.isMuted);
        } else if (activeDeck.paused && !activeDeck.ended) {
          void activeDeck.play().catch(() => {
            void engageBackgroundDirectDeck(getEffectiveVol(latest), latest.isMuted);
          });
        }
      }, 300);
    };

    const onVisibility = (vis: string) => {
      if (vis === 'hidden') {
        keepAliveOrFallbackForBackground();
        return;
      }

      clearFallbackTimer();
      if (isCapacitorNativeStreamActive()) return;
      const graph = ensureAudioGraph();
      const state = usePlayerStore.getState();
      const directMode = useSettingsStore.getState().localProfile.directMode;
      if (
        graph &&
        shouldRestoreDspOnForeground({
          backgroundDirectActive: graph.backgroundDirectActive,
          isMobile,
          directMode,
          visibilityState: vis,
        })
      ) {
        void restoreDspDeckFromBackground();
      } else if (graph && state.isPlaying && !isUserPaused() && !isYoutubeIframeActive(state.activeStreamMeta)) {
        if (!graph.backgroundDirectActive) {
          void resumeAudioContext();
        }
        const activeEl = getActivePlaybackElement(graph);
        if (activeEl.src && activeEl.paused && !activeEl.ended && activeEl.dataset.scPriming !== '1') {
          scheduleAutoResumeOnVisibility();
        }
      } else if (!graph && state.isPlaying && !isUserPaused() && !isYoutubeIframeActive(state.activeStreamMeta)) {
        const standalone = ensureStandaloneDirectDeck();
        if (
          standalone &&
          standalone.src &&
          standalone.paused &&
          !standalone.ended &&
          standalone.dataset.scPriming !== '1'
        ) {
          scheduleAutoResumeOnVisibility();
        }
      }
    };

    const unsubscribeInterrupt = subscribeAudioContextInterrupted(() => {
      if (isCapacitorNativeStreamActive()) return;
      const latest = usePlayerStore.getState();
      const g = ensureAudioGraph();
      if (!g) return;
      if (getRealDocumentVisibilityState() === 'hidden') {
        tryEngageDirectDeck();
        return;
      }
      if (
        shouldFallbackSuspendedDspToDirect({
          isPlaying: latest.isPlaying,
          isYoutubeIframe: isYoutubeIframeActive(latest.activeStreamMeta),
          backgroundDirectActive: g.backgroundDirectActive,
          contextState: g.ctx.state,
        })
      ) {
        void engageBackgroundDirectDeck(getEffectiveVol(latest), latest.isMuted);
      }
    });

    const onPageShow = () => onVisibility(getRealDocumentVisibilityState());
    const unsubscribeVisibility = subscribeRealVisibilityChange((vis) => onVisibility(vis));
    const unsubscribePageHide = subscribeRealPageHide(keepAliveOrFallbackForBackground);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearFallbackTimer();
      unsubscribeInterrupt();
      unsubscribeVisibility();
      unsubscribePageHide();
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  // Native `'ended'` event listener across all audio elements so track advance never stalls
  // when background tabs throttle setInterval timers.
  const endGuardRef = useRef<{ sig: string; at: number } | null>(null);
  const advanceOnTrackEnd = useRef<() => void>(() => {});

  useEffect(() => {
    const graph = ensureAudioGraph();
    const standalone = !graph ? ensureStandaloneDirectDeck() : null;
    if (!graph && !standalone) return;

    const triggerEndOnce = () => {
      const st = usePlayerStore.getState();
      if (!st.currentTrack || !st.isPlaying) return;
      if (isYoutubeIframeActive(st.activeStreamMeta)) return;
      if (!graph) {
        st.handleTrackEnded();
        return;
      }

      const sig = `${getTrackUniqueId(st.currentTrack) || st.currentTrack.id}::${graph.activeDeck}`;
      const now = Date.now();
      if (
        endGuardRef.current &&
        endGuardRef.current.sig === sig &&
        now - endGuardRef.current.at < 1500
      ) {
        return;
      }
      endGuardRef.current = { sig, at: now };

      const activeIdx = graph.activeDeck;
      const standbyIdx: 0 | 1 = activeIdx === 0 ? 1 : 0;
      const activeAudio = getActivePlaybackElement(graph);
      const settingsProfile = useSettingsStore.getState().localProfile;
      const upcoming = st.manualQueue[0] ?? st.sourceQueue[0] ?? null;
      const isManualDjTransition = Boolean(transitionStateRef.current?.manual);
      const nextKey =
        (st.repeat !== 'one' || isManualDjTransition) && upcoming
          ? isLocalTrack(upcoming)
            ? getTrackUniqueId(upcoming)
            : getPlayableVideoId(upcoming)
          : null;

      if (
        !graph.backgroundDirectActive &&
        !settingsProfile.directMode &&
        transitionInProgressRef.current &&
        nextKey &&
        graph.trackIds[standbyIdx] === nextKey
      ) {
        pauseAudioElementProgrammatically(activeAudio);
        resetDeckDjStage(graph, activeIdx, true);
        resetDeckDjStage(graph, standbyIdx, false);
        graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
        graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
        graph.activeDeck = standbyIdx;
        graph.crossfadeTargetId = nextKey;
        transitionInProgressRef.current = false;
        transitionStateRef.current = null;
        st.setDjTransitionStatus({
          active: false,
          progress: 0,
          style: st.djTransitionStatus.style,
          beatMatched: false,
          outgoingBpm: null,
          incomingBpm: null,
          tempoRatio: 1,
        });
        if (isManualDjTransition) {
          st.nextTrack();
        } else {
          st.handleTrackEnded();
        }
        return;
      }

      if (
        !graph.backgroundDirectActive &&
        !settingsProfile.directMode &&
        settingsProfile.gaplessPlayback &&
        nextKey &&
        graph.trackIds[standbyIdx] === nextKey &&
        graph.decks[standbyIdx].readyState >= 2
      ) {
        const standby = graph.decks[standbyIdx];
        standby.currentTime = 0;
        resetDeckDjStage(graph, standbyIdx, true);
        void standby
          .play()
          .then(() => {
            pauseAudioElementProgrammatically(activeAudio);
            resetDeckDjStage(graph, activeIdx, true);
            graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
            graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
            graph.activeDeck = standbyIdx;
            graph.crossfadeTargetId = nextKey;
            st.handleTrackEnded();
          })
          .catch(() => {
            // Standby deck blocked without gesture in background — reuse unlocked deck
            transitionInProgressRef.current = false;
            transitionStateRef.current = null;
            st.handleTrackEnded();
          });
        return;
      }

      transitionInProgressRef.current = false;
      transitionStateRef.current = null;
      st.handleTrackEnded();
    };

    advanceOnTrackEnd.current = triggerEndOnce;

    const onDeckEnded = (el: HTMLAudioElement) => () => {
      const g = ensureAudioGraph();
      if (!g) return;
      if (getActivePlaybackElement(g) !== el) return;
      triggerEndOnce();
    };

    const d0Handler = graph ? onDeckEnded(graph.decks[0]) : () => {};
    const d1Handler = graph ? onDeckEnded(graph.decks[1]) : () => {};
    const directHandler = graph
      ? onDeckEnded(graph.directDeck)
      : () => {
          const st = usePlayerStore.getState();
          if (!st.currentTrack || !st.isPlaying || isYoutubeIframeActive(st.activeStreamMeta)) return;
          st.handleTrackEnded();
        };

    // Auto-resume after 300ms when paused unintentionally while userPaused === false
    const onDeckExternalPause = (el: HTMLAudioElement) => () => {
      const g = ensureAudioGraph();
      const activeEl = g ? getActivePlaybackElement(g) : ensureStandaloneDirectDeck();
      const st = usePlayerStore.getState();
      const shouldSync = shouldSyncExternalPause({
        isActiveElement: activeEl === el,
        storeIsPlaying: st.isPlaying,
        elementEnded: el.ended,
        isPriming: el.dataset.scPriming === '1',
        isProgrammaticPause: isProgrammaticPause(el),
        isYoutubeIframe: isYoutubeIframeActive(st.activeStreamMeta),
        isLoadingAudio: isLoadingAudioRef.current,
        isTransitioning: transitionInProgressRef.current,
        isBackgroundHandoff: isBackgroundHandoffActive(),
      });
      if (!shouldSync) return;

      if (!isUserPaused()) {
        if (autoResumeTimerRef.current !== null) {
          window.clearTimeout(autoResumeTimerRef.current);
        }
        autoResumeTimerRef.current = window.setTimeout(() => {
          autoResumeTimerRef.current = null;
          const latest = usePlayerStore.getState();
          if (
            !latest.isPlaying ||
            isUserPaused() ||
            el.ended ||
            !el.src ||
            !el.paused ||
            el.dataset.scPriming === '1'
          ) {
            return;
          }
          void resumeAudioContext();
          void el.play().catch((err: unknown) => {
            if (
              err instanceof DOMException &&
              err.name === 'NotAllowedError' &&
              getRealDocumentVisibilityState() === 'visible'
            ) {
              const curr = usePlayerStore.getState();
              curr.setIsPlaying(false, { userInitiated: false });
              curr.setAutoplayBlockedPendingResume(true);
              syncMediaSessionPlaybackState('paused');
            }
          });
        }, 300);
        return;
      }

      st.setIsPlaying(false, { userInitiated: false });
      syncMediaSessionPlaybackState('paused');
      syncMediaSessionPosition({
        duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : st.duration,
        currentTime: Number.isFinite(el.currentTime) ? el.currentTime : st.currentTime,
        playbackRate: st.playbackRate,
      });
    };

    const onDeckSeeked = (el: HTMLAudioElement) => () => {
      const g = ensureAudioGraph();
      const activeEl = g ? getActivePlaybackElement(g) : ensureStandaloneDirectDeck();
      if (activeEl !== el) return;
      const st = usePlayerStore.getState();
      if (!el.paused && el.readyState >= 3) {
        st.setIsBuffering(false);
      }
      if (Number.isFinite(el.currentTime)) {
        const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : st.duration;
        st.setProgress(el.currentTime, dur > 0 ? dur : undefined);
        syncMediaSessionPosition({
          duration: dur,
          currentTime: el.currentTime,
          playbackRate: st.playbackRate,
        });
      }
    };

    const targetDecks = graph
      ? [graph.decks[0], graph.decks[1], graph.directDeck]
      : standalone
        ? [standalone]
        : [];
    const endHandlers = graph ? [d0Handler, d1Handler, directHandler] : [directHandler];
    const pauseHandlers = targetDecks.map((el) => onDeckExternalPause(el));
    const seekedHandlers = targetDecks.map((el) => onDeckSeeked(el));

    targetDecks.forEach((el, idx) => {
      el.addEventListener('ended', endHandlers[idx]);
      el.addEventListener('pause', pauseHandlers[idx]);
      el.addEventListener('seeked', seekedHandlers[idx]);
    });
    return () => {
      targetDecks.forEach((el, idx) => {
        el.removeEventListener('ended', endHandlers[idx]);
        el.removeEventListener('pause', pauseHandlers[idx]);
        el.removeEventListener('seeked', seekedHandlers[idx]);
      });
    };
  }, []);

  // Auto-resume on first user interaction when browser blocked autoplay on reopen
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onFirstGesture = () => {
      const st = usePlayerStore.getState();
      if (st.autoplayBlockedPendingResume && st.currentTrack) {
        st.resumeBlockedPlayback();
      }
    };
    ['pointerdown', 'keydown', 'click'].forEach((evt) => {
      window.addEventListener(evt, onFirstGesture, { passive: true, capture: true });
    });
    return () => {
      ['pointerdown', 'keydown', 'click'].forEach((evt) => {
        window.removeEventListener(evt, onFirstGesture, { capture: true });
      });
    };
  }, []);

  // Pause HTML5 audio decks cleanly whenever youtube-iframe mode takes over
  useEffect(() => {
    if (activeStreamSourceMode !== 'youtube-iframe') return;
    void stopCapacitorNativeStream();
    resetDirectDeck();
    const graph = ensureAudioGraph();
    if (graph) {
      graph.decks.forEach((d) => pauseAudioElementProgrammatically(d));
    }
  }, [activeStreamSourceMode]);

  // Load local, offline, or audio-only stream source when active track or stream quality changes
  useEffect(() => {
    if (!hydrated) return;
    const graph = ensureAudioGraph();
    const standalone = !graph ? ensureStandaloneDirectDeck() : null;
    if (!graph && !standalone) return;

    if (!htmlAudioTrackKey) {
      loadedKeyRef.current = null;
      loadingNativeForKeyRef.current = null;
      void stopCapacitorNativeStream();
      resetDirectDeck();
      if (standaloneObjectUrlRef.current) {
        URL.revokeObjectURL(standaloneObjectUrlRef.current);
        standaloneObjectUrlRef.current = null;
      }
      if (graph) {
        graph.decks.forEach((d) => pauseAudioElementProgrammatically(d));
      }
      return;
    }

    if (
      !localActive &&
      !useOfflineBlob &&
      rawVideoId &&
      !isCapacitorAndroidPlatform() &&
      shouldFastRouteToIframe(rawVideoId)
    ) {
      loadedKeyRef.current = htmlAudioTrackKey;
      resetDirectDeck();
      if (graph) {
        graph.decks.forEach((d) => {
          pauseAudioElementProgrammatically(d);
          d.removeAttribute('src');
        });
      }
      usePlayerStore
        .getState()
        .setActiveStreamMeta(
          buildYoutubeIframeStreamMeta(rawVideoId, rawVideoId, targetStreamTier),
        );
      return;
    }

    // Handle pre-started crossfade / DJ / gapless standby deck
    const expectedStandbyId = localActive ? trackUniqueId : rawVideoId;
    if (graph && expectedStandbyId && graph.crossfadeTargetId === expectedStandbyId) {
      graph.crossfadeTargetId = null;
      loadedKeyRef.current = htmlAudioTrackKey;
      transitionInProgressRef.current = false;
      transitionStateRef.current = null;
      dynamicLufsDoneRef.current = false;
      setDynamicMeasuredLufs(null);
      resetDeckDjStage(graph, graph.activeDeck, false);

      // Smoothly glide beat-matched deck playbackRate back to original track speed
      const promotedDeck = graph.decks[graph.activeDeck];
      const targetRate = usePlayerStore.getState().playbackRate || 1;
      if (Math.abs(promotedDeck.playbackRate - targetRate) > 0.005) {
        const startRate = promotedDeck.playbackRate;
        const glideStart = performance.now();
        const glideMs = 1400;
        const stepGlide = () => {
          if (graph.decks[graph.activeDeck] !== promotedDeck) return;
          const p = Math.min(1, (performance.now() - glideStart) / glideMs);
          const nextR = startRate + (targetRate - startRate) * p;
          setElementRatePreservingPitch(promotedDeck, nextR);
          if (p < 1) {
            window.setTimeout(stepGlide, 60);
          } else {
            setElementRatePreservingPitch(promotedDeck, targetRate);
          }
        };
        window.setTimeout(stepGlide, 60);
      }
      return;
    }

    if (loadedKeyRef.current === htmlAudioTrackKey) return;

    loadedKeyRef.current = htmlAudioTrackKey;
    loadedDirectModeRef.current = localProfile.directMode;
    dynamicLufsDoneRef.current = false;
    fallbackAttemptedRef.current = false;
    transitionInProgressRef.current = false;
    transitionStateRef.current = null;
    usePlayerStore.getState().setDjTransitionStatus({
      active: false,
      progress: 0,
      style: DEFAULT_PLAYLIST_MIX_SETTINGS.transitionStyle,
      beatMatched: false,
      outgoingBpm: null,
      incomingBpm: null,
      tempoRatio: 1,
    });
    setDynamicMeasuredLufs(null);
    silenceAccumMsRef.current = 0;
    suspendedCtxAccumMsRef.current = 0;
    digitalZeroAccumMsRef.current = 0;

    let cancelled = false;
    let detachListeners: (() => void) | null = null;

    const clearStallTimer = () => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const loadSource = async () => {
      isLoadingAudioRef.current = true;
      ensurePlaybackAudioSession();
      void stopCapacitorNativeStream();
      loadingNativeForKeyRef.current =
        isCapacitorAndroidPlatform() && !localActive && !useOfflineBlob && rawVideoId
          ? htmlAudioTrackKey
          : null;

      const useDirectTarget =
        !graph ||
        shouldLoadTrackDirectlyOnDirectDeck({
          visibilityState: getRealDocumentVisibilityState(),
          backgroundDirectActive: graph.backgroundDirectActive,
          isMobile: isMobileAudioEnvironment(),
          contextState: graph.ctx.state,
          directMode: localProfile.directMode,
        });

      const storeAtStart = usePlayerStore.getState();
      if (storeAtStart.isPlaying && getRealDocumentVisibilityState() === 'hidden') {
        // Hold background audio session alive across async network probe/load gap
        startSilentKeepaliveAudio();
      }

      preloadGenerationRef.current += 1;
      const nextDeckIdx: 0 | 1 = graph ? graph.activeDeck : 0;
      const otherDeckIdx: 0 | 1 = nextDeckIdx === 0 ? 1 : 0;

      if (graph) {
        if (useDirectTarget) {
          graph.backgroundDirectActive = true;
          pauseAudioElementProgrammatically(graph.decks[0]);
          pauseAudioElementProgrammatically(graph.decks[1]);
        } else {
          resetDirectDeck();
          pauseAudioElementProgrammatically(graph.decks[otherDeckIdx]);
          resetDeckDjStage(graph, nextDeckIdx, true);
          resetDeckDjStage(graph, otherDeckIdx, true);
          graph.deckGains[otherDeckIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
          graph.deckGains[nextDeckIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
        }
      }

      const audio = graph
        ? useDirectTarget
          ? graph.directDeck
          : graph.decks[nextDeckIdx]
        : standalone!;
      setElementBusyForLoad(audio, true);
      let urlToLoad: string | null = null;
      let isObjectUrl = false;
      let resolvedTrackKey: string | null = null;
      let metaToReport: ActiveStreamMeta | null = null;
      let streamMetaFetchTarget: {
        streamVideoId: string;
        queryMeta: {
          title: string;
          artist: string;
          durationSeconds?: number | null;
          quality: ConcreteQualityTier;
        };
        defaultBitrate: number;
      } | null = null;

      if (localActive && trackUniqueId) {
        const record =
          useLibraryStore.getState().localFiles.find((f) => f.id === trackUniqueId) ||
          (await db.localFiles.get(trackUniqueId));
        if (cancelled) return;
        if (!record) {
          isLoadingAudioRef.current = false;
          usePlayerStore
            .getState()
            .setPlayerError('File audio lokal tidak ditemukan di penyimpanan browser.');
          usePlayerStore.getState().setIsPlaying(false, { userInitiated: false });
          return;
        }
        if (!graph) {
          if (standaloneObjectUrlRef.current) {
            URL.revokeObjectURL(standaloneObjectUrlRef.current);
            standaloneObjectUrlRef.current = null;
          }
        } else if (useDirectTarget) {
          revokeDirectDeckUrl(graph);
        } else {
          revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        }
        urlToLoad = URL.createObjectURL(record.blob);
        isObjectUrl = true;
        resolvedTrackKey = record.id;

        void analyzeAudioBlobBpm(record.id, record.blob).then((analysis) => {
          if (analysis) {
            usePlayerStore.getState().setTrackBpm(record.id, analysis);
          } else if (currentTrack) {
            const est = cacheFallbackTrackBpm(record.id, currentTrack);
            usePlayerStore.getState().setTrackBpm(record.id, est);
          }
        });

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
          sourceMode: !graph ? 'fallback-no-fx' : useDirectTarget || localProfile.directMode ? 'direct' : 'webaudio',
          proxiedViaBackend: false,
          audiodownloadAllowed: true,
          replayGainDb: record.replayGainDb ?? null,
        };
      } else if (useOfflineBlob && offlineRec) {
        if (!graph) {
          if (standaloneObjectUrlRef.current) {
            URL.revokeObjectURL(standaloneObjectUrlRef.current);
            standaloneObjectUrlRef.current = null;
          }
        } else if (useDirectTarget) {
          revokeDirectDeckUrl(graph);
        } else {
          revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        }
        urlToLoad = URL.createObjectURL(offlineRec.blob);
        isObjectUrl = true;
        resolvedTrackKey = offlineRec.id;

        void analyzeAudioBlobBpm(offlineRec.id, offlineRec.blob).then((analysis) => {
          if (analysis) {
            usePlayerStore.getState().setTrackBpm(offlineRec.id, analysis);
          } else if (currentTrack) {
            const est = cacheFallbackTrackBpm(offlineRec.id, currentTrack);
            usePlayerStore.getState().setTrackBpm(offlineRec.id, est);
          }
        });

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
          sourceMode: !graph ? 'fallback-no-fx' : useDirectTarget || localProfile.directMode ? 'direct' : 'webaudio',
          proxiedViaBackend: false,
          audiodownloadAllowed: true,
          replayGainDb: offlineRec.replayGainDb ?? null,
        };
      } else if (rawVideoId && currentTrack) {
        const est = cacheFallbackTrackBpm(trackUniqueId || rawVideoId, currentTrack);
        usePlayerStore.getState().setTrackBpm(trackUniqueId || rawVideoId, est);
        if (!graph) {
          if (standaloneObjectUrlRef.current) {
            URL.revokeObjectURL(standaloneObjectUrlRef.current);
            standaloneObjectUrlRef.current = null;
          }
        } else if (useDirectTarget) {
          revokeDirectDeckUrl(graph);
        } else {
          revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        }
        let streamVideoId = rawVideoId;
        const artistName = formatArtists(currentTrack.artists);

        if (!isYouTubeVideoId(rawVideoId)) {
          pauseAudioElementProgrammatically(audio);
          audio.removeAttribute('src');
          try {
            const resolved = await resolvePlayableYoutube(rawVideoId, {
              title: currentTrack.title,
              artist: artistName,
              type: currentTrack.type,
              durationSeconds: currentTrack.durationSeconds,
            });
            if (cancelled) return;
            streamVideoId = resolved.youtubeVideoId || resolved.candidates?.[0] || rawVideoId;
          } catch {
            // Fall back to rawVideoId; /api/stream resolves via watch/search metadata
          }
        }

        const streamQueryMeta = {
          title: currentTrack.title,
          artist: artistName,
          durationSeconds: currentTrack.durationSeconds,
          quality: targetStreamTier,
        };
        const defaultBitrate =
          targetStreamTier === 'low' ? 96 : targetStreamTier === 'normal' ? 128 : 160;

        // On Capacitor Android, resolve via on-device InnerTube proxy first (mobile IP, full HTTP 206 range support),
        // then fall back to backend stream proxy, and execute playback natively inside MediaPlaybackService
        // so background / app-exit / lockscreen playback never pauses when WebView goes offscreen.
        const onCapAndroid = isCapacitorAndroidPlatform();
        let resolvedNativeUrl: string | null = null;
        let usedNativeProxyUrl = false;

        if (onCapAndroid) {
          const nativeStream = await resolveCapacitorDirectAudioUrl(streamVideoId);
          if (cancelled) return;
          if (nativeStream?.available && nativeStream.url) {
            resolvedNativeUrl = nativeStream.url;
            usedNativeProxyUrl = true;
            const nativeKbps = nativeStream.bitrateKbps ?? defaultBitrate;
            const nativeCodec = nativeStream.codec || 'AAC';
            metaToReport = {
              trackId: rawVideoId,
              resolvedVideoId: streamVideoId,
              requestedTier: targetStreamTier,
              actualTier: targetStreamTier,
              codec: nativeCodec,
              bitrateKbps: nativeKbps,
              sampleRateHz: 44100,
              bitDepth: null,
              lossless: false,
              hiRes: false,
              badgeLabel: `${nativeCodec} ${nativeKbps} kbps`,
              sourceMode: 'direct',
              proxiedViaBackend: false,
              audiodownloadAllowed: true,
              replayGainDb: null,
            };
          }
        }

        if (!resolvedNativeUrl) {
          try {
            if (onCapAndroid && shouldFastRouteToIframe(streamVideoId)) {
              throw new Error('fast-native-proxy');
            }
            const probeMeta = await probeStreamWithCache(
              streamVideoId,
              streamQueryMeta,
              (vid, q) => fetchStreamAudioMeta(vid, q),
            );
            if (cancelled) return;
            if (decideOnlineStreamAction(probeMeta) === 'use-youtube-iframe') {
              isLoadingAudioRef.current = false;
              loadingNativeForKeyRef.current = null;
              setElementBusyForLoad(audio, false);
              pauseAudioElementProgrammatically(audio);
              audio.removeAttribute('src');
              usePlayerStore
                .getState()
                .setActiveStreamMeta(
                  buildYoutubeIframeStreamMeta(rawVideoId, streamVideoId, targetStreamTier),
                );
              return;
            }
            const kbps = probeMeta.bitrateKbps ?? defaultBitrate;
            metaToReport = {
              trackId: rawVideoId,
              resolvedVideoId: streamVideoId,
              requestedTier: targetStreamTier,
              actualTier: targetStreamTier,
              codec: probeMeta.codec || 'AAC',
              bitrateKbps: kbps,
              sampleRateHz: probeMeta.sampleRateHz ?? 44100,
              bitDepth: null,
              lossless: false,
              hiRes: false,
              badgeLabel: `${probeMeta.codec || 'AAC'} ${kbps} kbps`,
              sourceMode: onCapAndroid
                ? 'direct'
                : !graph
                  ? 'fallback-no-fx'
                  : useDirectTarget || localProfile.directMode
                    ? 'direct'
                    : 'webaudio',
              proxiedViaBackend: true,
              audiodownloadAllowed: true,
              replayGainDb: null,
            };
          } catch {
            if (cancelled) return;
            isLoadingAudioRef.current = false;
            loadingNativeForKeyRef.current = null;
            setElementBusyForLoad(audio, false);
            pauseAudioElementProgrammatically(audio);
            audio.removeAttribute('src');
            usePlayerStore
              .getState()
              .setActiveStreamMeta(
                buildYoutubeIframeStreamMeta(rawVideoId, streamVideoId, targetStreamTier),
              );
            return;
          }
        }

        urlToLoad = resolvedNativeUrl || buildStreamAudioUrl(streamVideoId, streamQueryMeta);
        resolvedTrackKey = rawVideoId;
        usePlayerStore.getState().setActiveStreamMeta(metaToReport);
        streamMetaFetchTarget = null;

        if (onCapAndroid && urlToLoad) {
          if (graph) {
            [graph.decks[0], graph.decks[1], graph.directDeck].forEach((el) => {
              pauseAudioElementProgrammatically(el);
              el.removeAttribute('src');
              el.load();
            });
          } else if (standalone) {
            pauseAudioElementProgrammatically(standalone);
            standalone.removeAttribute('src');
            standalone.load();
          }
          setElementBusyForLoad(audio, false);
          stopSilentKeepaliveAudio();

          const stNative = usePlayerStore.getState();
          const capTargetSeek = stNative.pendingSeekSeconds ?? stNative.currentTime ?? 0;
          const capEffVol = clampYoutubeVolume(
            stNative.volume,
            useSettingsStore.getState().youtubeSound.maxVolumeLimit,
            stNative.isMuted,
          );

          const handleNativeStreamError = async () => {
            if (cancelled) return;
            const latest = usePlayerStore.getState();
            const curTrack = latest.currentTrack;
            const fallbackVol = clampYoutubeVolume(
              latest.volume,
              useSettingsStore.getState().youtubeSound.maxVolumeLimit,
              latest.isMuted,
            );
            const resumeAt = Math.max(0, latest.currentTime || 0);

            // Step 1: if proxy URL failed, try backend proxy stream for same streamVideoId
            if (usedNativeProxyUrl && !fallbackAttemptedRef.current) {
              usedNativeProxyUrl = false;
              const backendMeta = await probeStreamWithCache(
                streamVideoId,
                streamQueryMeta,
                (vid, q) => fetchStreamAudioMeta(vid, q),
              ).catch(() => null);
              if (cancelled) return;
              if (decideOnlineStreamAction(backendMeta) !== 'use-youtube-iframe') {
                const backendUrl = buildStreamAudioUrl(streamVideoId, streamQueryMeta);
                const startedBackend = await playCapacitorNativeStream({
                  url: backendUrl,
                  track: curTrack ?? currentTrack,
                  startSeconds: resumeAt,
                  volume0to100: fallbackVol,
                  isMuted: latest.isMuted,
                  playbackRate: latest.playbackRate || 1,
                  autoplay: latest.isPlaying,
                });
                if (startedBackend) return;
              }
            }

            // Step 2: resolve alternative video ID and try native proxy -> backend stream
            if (!fallbackAttemptedRef.current && curTrack) {
              fallbackAttemptedRef.current = true;
              latest.setIsBuffering(true);
              try {
                const resolved = await resolvePlayableYoutube(rawVideoId, {
                  title: curTrack.title,
                  artist: artistName,
                  type: curTrack.type,
                  durationSeconds: curTrack.durationSeconds,
                  fallback: true,
                  exclude: [rawVideoId],
                });
                if (cancelled) return;
                const altId = resolved.youtubeVideoId || resolved.candidates?.[0] || rawVideoId;
                const nativeAlt = await resolveCapacitorDirectAudioUrl(altId);
                if (cancelled) return;
                if (nativeAlt?.available && nativeAlt.url) {
                  const okAlt = await playCapacitorNativeStream({
                    url: nativeAlt.url,
                    track: curTrack,
                    startSeconds: 0,
                    volume0to100: fallbackVol,
                    isMuted: usePlayerStore.getState().isMuted,
                    playbackRate: usePlayerStore.getState().playbackRate || 1,
                    autoplay: usePlayerStore.getState().isPlaying,
                  });
                  if (okAlt) return;
                }
                const altQueryMeta = {
                  title: curTrack.title,
                  artist: artistName,
                  durationSeconds: curTrack.durationSeconds,
                  quality: targetStreamTier,
                };
                const altMeta = await fetchStreamAudioMeta(altId, altQueryMeta).catch(() => null);
                if (cancelled) return;
                if (decideOnlineStreamAction(altMeta) !== 'use-youtube-iframe') {
                  const okAltBackend = await playCapacitorNativeStream({
                    url: buildStreamAudioUrl(altId, altQueryMeta),
                    track: curTrack,
                    startSeconds: 0,
                    volume0to100: fallbackVol,
                    isMuted: usePlayerStore.getState().isMuted,
                    playbackRate: usePlayerStore.getState().playbackRate || 1,
                    autoplay: usePlayerStore.getState().isPlaying,
                  });
                  if (okAltBackend) return;
                }
              } catch {
                // Fall through to YouTube IFrame fallback
              }
            }

            if (cancelled) return;
            setCapacitorNativeStreamErrorHandler(null);
            await stopCapacitorNativeStream();
            usePlayerStore
              .getState()
              .setActiveStreamMeta(
                buildYoutubeIframeStreamMeta(rawVideoId, streamVideoId, targetStreamTier),
              );
          };

          setCapacitorNativeStreamErrorHandler(() => {
            void handleNativeStreamError();
          });

          const nativeStarted = await playCapacitorNativeStream({
            url: urlToLoad,
            track: currentTrack,
            startSeconds: capTargetSeek,
            volume0to100: capEffVol,
            isMuted: stNative.isMuted,
            playbackRate: stNative.playbackRate || 1,
            autoplay: stNative.isPlaying,
          });
          loadingNativeForKeyRef.current = null;
          isLoadingAudioRef.current = false;

          if (cancelled) {
            setCapacitorNativeStreamErrorHandler(null);
            void stopCapacitorNativeStream();
            return;
          }

          if (nativeStarted) {
            stNative.clearPendingSeek();
            stNative.setPlayerError(null);
            stNative.setWebAudioWarning(null);
            const nextUpcoming = stNative.manualQueue[0] ?? stNative.sourceQueue[0] ?? null;
            if (nextUpcoming && !isLocalTrack(nextUpcoming)) {
              const nextVid = getPlayableVideoId(nextUpcoming);
              if (nextVid) {
                void resolveCapacitorDirectAudioUrl(nextVid);
                prefetchStreamProbe(
                  nextVid,
                  {
                    title: nextUpcoming.title,
                    artist: formatArtists(nextUpcoming.artists),
                    durationSeconds: nextUpcoming.durationSeconds,
                    quality: targetStreamTier,
                  },
                  (vid, q) => fetchStreamAudioMeta(vid, q),
                );
              }
            }
            return;
          }
          setCapacitorNativeStreamErrorHandler(null);
        }
      }

      if (!urlToLoad || cancelled) {
        setElementBusyForLoad(audio, false);
        isLoadingAudioRef.current = false;
        loadingNativeForKeyRef.current = null;
        return;
      }

      const stVol = usePlayerStore.getState();
      clearElementPrimingFlag(audio, !graph || useDirectTarget ? stVol.isMuted : false);

      if (!graph) {
        standaloneObjectUrlRef.current = isObjectUrl ? urlToLoad : null;
        const directEffVol = localActive
          ? stVol.volume
          : clampYoutubeVolume(
              stVol.volume,
              useSettingsStore.getState().youtubeSound.maxVolumeLimit,
              stVol.isMuted,
            );
        audio.muted = stVol.isMuted;
        audio.volume = stVol.isMuted
          ? 0
          : Math.max(0, Math.min(1, directEffVol / 100));
        if (metaToReport) {
          metaToReport = {
            ...metaToReport,
            sourceMode: 'fallback-no-fx',
          };
        }
      } else if (useDirectTarget) {
        graph.directDeckObjectUrl = isObjectUrl ? urlToLoad : null;
        graph.directDeckTrackId = resolvedTrackKey;
        const directEffVol = localActive
          ? stVol.volume
          : clampYoutubeVolume(
              stVol.volume,
              useSettingsStore.getState().youtubeSound.maxVolumeLimit,
              stVol.isMuted,
            );
        audio.muted = stVol.isMuted;
        audio.volume = stVol.isMuted
          ? 0
          : Math.max(0, Math.min(1, directEffVol / 100));
      } else {
        graph.objectUrls[nextDeckIdx] = isObjectUrl ? urlToLoad : null;
        graph.trackIds[nextDeckIdx] = resolvedTrackKey;
        audio.muted = false;
        audio.volume = 1;
      }

      audio.crossOrigin =
        !graph || useDirectTarget || urlToLoad.startsWith('blob:') ? null : 'anonymous';
      audio.src = urlToLoad;
      setElementBusyForLoad(audio, false);
      setElementRatePreservingPitch(audio, usePlayerStore.getState().playbackRate);

      const storeState = usePlayerStore.getState();
      const targetSeek = storeState.pendingSeekSeconds ?? storeState.currentTime ?? 0;
      let hasLoadedMeta = false;

      const handleLoadedMeta = () => {
        if (cancelled) return;
        hasLoadedMeta = true;
        clearStallTimer();
        if (targetSeek > 0 && Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = clampSeekTarget(targetSeek, audio.duration);
        }
        const st = usePlayerStore.getState();
        st.clearPendingSeek();
        st.setIsBuffering(false);
        st.setPlayerError(null);
        st.setWebAudioWarning(null);
        if (metaToReport && !st.activeStreamMeta?.proxiedViaBackend) {
          st.setActiveStreamMeta(metaToReport);
        }
        if (streamMetaFetchTarget) {
          const target = streamMetaFetchTarget;
          streamMetaFetchTarget = null;
          void probeStreamWithCache(
            target.streamVideoId,
            target.queryMeta,
            (vid, q) => fetchStreamAudioMeta(vid, q),
          )
            .then((realMeta) => {
              if (cancelled) return;
              const latest = usePlayerStore.getState();
              if (getPlayableVideoId(latest.currentTrack) !== rawVideoId) return;
              const kbps = realMeta.bitrateKbps ?? target.defaultBitrate;
              const latestDirect = useSettingsStore.getState().localProfile.directMode;
              latest.setActiveStreamMeta({
                trackId: rawVideoId!,
                requestedTier: targetStreamTier,
                actualTier: targetStreamTier,
                codec: realMeta.codec || 'AAC',
                bitrateKbps: kbps,
                sampleRateHz: realMeta.sampleRateHz ?? 44100,
                bitDepth: null,
                lossless: false,
                hiRes: false,
                badgeLabel: `${realMeta.codec || 'AAC'} ${kbps} kbps`,
                sourceMode: !graph
                  ? 'fallback-no-fx'
                  : useDirectTarget || latestDirect
                    ? 'direct'
                    : 'webaudio',
                proxiedViaBackend: true,
                audiodownloadAllowed: true,
                replayGainDb: null,
              });
            })
            .catch(() => {});
        }
        // Pre-warm probe cache for upcoming track so Next is instantaneous
        const nextUpcoming = st.manualQueue[0] ?? st.sourceQueue[0] ?? null;
        if (nextUpcoming && !isLocalTrack(nextUpcoming)) {
          const nextVid = getPlayableVideoId(nextUpcoming);
          if (nextVid) {
            prefetchStreamProbe(
              nextVid,
              {
                title: nextUpcoming.title,
                artist: formatArtists(nextUpcoming.artists),
                durationSeconds: nextUpcoming.durationSeconds,
                quality: targetStreamTier,
              },
              (vid, q) => fetchStreamAudioMeta(vid, q),
            );
          }
        }
        if (st.isPlaying) {
          ensurePlaybackAudioSession();
          // Keep DSP deck unmuted at full gain and guarantee other decks don't double-play
          if (graph) {
            if (useDirectTarget) {
              pauseAudioElementProgrammatically(graph.decks[0]);
              pauseAudioElementProgrammatically(graph.decks[1]);
              audio.muted = st.isMuted;
            } else {
              pauseAudioElementProgrammatically(graph.decks[otherDeckIdx]);
              pauseAudioElementProgrammatically(graph.directDeck);
              audio.muted = false;
              audio.volume = 1;
            }
          } else {
            audio.muted = st.isMuted;
          }

          const resumePromise =
            !useDirectTarget && graph
              ? resumeAudioContext()
              : Promise.resolve<'running'>('running');

          void audio
            .play()
            .then(async () => {
              if (cancelled) return;
              stopSilentKeepaliveAudio();
              await resumePromise;
              if (cancelled) return;

              const latest = usePlayerStore.getState();
              const g = ensureAudioGraph();
              if (!useDirectTarget && g && !g.backgroundDirectActive) {
                const needDirectFallback =
                  shouldFallbackSuspendedDspToDirect({
                    isPlaying: latest.isPlaying,
                    isYoutubeIframe: false,
                    backgroundDirectActive: g.backgroundDirectActive,
                    contextState: g.ctx.state,
                  }) ||
                  (getRealDocumentVisibilityState() === 'hidden' &&
                    shouldEngageDirectDeckOnHide({
                      isPlaying: latest.isPlaying,
                      isYoutubeIframe: false,
                      hasActiveDeckSrc: Boolean(audio.src),
                      isMobile: isMobileAudioEnvironment(),
                      contextState: g.ctx.state,
                      backgroundDirectActive: g.backgroundDirectActive,
                    }));

                if (needDirectFallback) {
                  const effectiveVol = isLocalTrack(latest.currentTrack)
                    ? latest.volume
                    : clampYoutubeVolume(
                        latest.volume,
                        useSettingsStore.getState().youtubeSound.maxVolumeLimit,
                        latest.isMuted,
                      );
                  const engaged = await engageBackgroundDirectDeck(effectiveVol, latest.isMuted);
                  if (engaged) {
                    const latestMeta = usePlayerStore.getState().activeStreamMeta;
                    if (latestMeta && latestMeta.sourceMode === 'webaudio') {
                      usePlayerStore.getState().setActiveStreamMeta({
                        ...latestMeta,
                        sourceMode: 'direct',
                      });
                    }
                  } else if (g.ctx.state !== 'running') {
                    pauseAudioElementProgrammatically(audio);
                    latest.setIsPlaying(false, { userInitiated: false });
                    latest.setAutoplayBlockedPendingResume(true);
                    syncMediaSessionPlaybackState('paused');
                  }
                }
              }
            })
            .catch((err: unknown) => {
              if (cancelled) return;
              if (err instanceof DOMException && err.name === 'AbortError') return;
              if (err instanceof DOMException && err.name === 'NotAllowedError') {
                const latest = usePlayerStore.getState();
                latest.setIsPlaying(false, { userInitiated: false });
                latest.setAutoplayBlockedPendingResume(true);
                latest.setIsBuffering(false);
                stopSilentKeepaliveAudio();
                syncMediaSessionPlaybackState('paused');
                return;
              }
              handleMediaError();
            });
        }
      };

      const handlePlaying = () => {
        if (cancelled) return;
        isLoadingAudioRef.current = false;
        clearStallTimer();
        stopSilentKeepaliveAudio();
        const st = usePlayerStore.getState();
        st.setIsBuffering(false);
        st.setPlayerError(null);
        const g = ensureAudioGraph();
        const playbackState = resolveEffectiveMediaSessionPlaybackState({
          hasTrack: Boolean(st.currentTrack),
          storeIsPlaying: st.isPlaying,
          isYoutubeIframe: false,
          htmlAudioPlaying: Boolean(audio.src && !audio.paused && !audio.ended),
          audioContextRunningOrDirect: Boolean(
            !g || g.backgroundDirectActive || g.ctx.state === 'running',
          ),
        });
        syncMediaSessionMetadata(st.currentTrack);
        syncMediaSessionPlaybackState(playbackState);
        const durVal = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : st.duration;
        const curVal = Number.isFinite(audio.currentTime) ? audio.currentTime : st.currentTime;
        syncMediaSessionPosition({
          duration: durVal,
          currentTime: curVal,
          playbackRate: st.playbackRate,
        });
        syncCapacitorPlaybackNotification({
          track: st.currentTrack,
          isPlaying: playbackState === 'playing',
          duration: durVal,
          currentTime: curVal,
          playbackRate: st.playbackRate || 1,
          force: true,
        });
      };

      const handleWaiting = () => {
        if (cancelled) return;
        usePlayerStore.getState().setIsBuffering(true);
        clearStallTimer();
        const stallWaitMs = hasLoadedMeta ? 3500 : 9000;
        stallTimerRef.current = window.setTimeout(() => {
          if (!cancelled && usePlayerStore.getState().isPlaying) {
            usePlayerStore.getState().recordBufferingStall();
          }
        }, stallWaitMs);
      };

      let corsDirectRetried = false;

      const handleMediaError = () => {
        if (cancelled) return;
        isLoadingAudioRef.current = false;
        clearStallTimer();

        // If CORS or WebAudio deck error occurred on a remote stream, retry on directDeck (`crossOrigin=null`) first
        if (
          !useDirectTarget &&
          graph &&
          !localActive &&
          !useOfflineBlob &&
          !corsDirectRetried &&
          audio.crossOrigin === 'anonymous' &&
          urlToLoad
        ) {
          corsDirectRetried = true;
          const st = usePlayerStore.getState();
          if (st.isPlaying) {
            const effectiveVol = clampYoutubeVolume(
              st.volume,
              useSettingsStore.getState().youtubeSound.maxVolumeLimit,
              st.isMuted,
            );
            void engageBackgroundDirectDeck(effectiveVol, st.isMuted).then((ok) => {
              if (cancelled) return;
              if (ok) {
                const latestMeta = usePlayerStore.getState().activeStreamMeta;
                if (latestMeta && latestMeta.sourceMode === 'webaudio') {
                  usePlayerStore.getState().setActiveStreamMeta({
                    ...latestMeta,
                    sourceMode: 'direct',
                  });
                }
              } else {
                handleMediaError();
              }
            });
            return;
          }
        }

        if (!localActive && !useOfflineBlob && rawVideoId && currentTrack && !fallbackAttemptedRef.current) {
          fallbackAttemptedRef.current = true;
          usePlayerStore.getState().setIsBuffering(true);
          const queryArtist = formatArtists(currentTrack.artists);
          const onCapAndroid = isCapacitorAndroidPlatform();
          void resolvePlayableYoutube(rawVideoId, {
            title: currentTrack.title,
            artist: queryArtist,
            type: currentTrack.type,
            durationSeconds: currentTrack.durationSeconds,
            fallback: true,
            exclude: [rawVideoId],
          })
            .then(async (resolved) => {
              if (cancelled) return;
              const altId = resolved.youtubeVideoId || resolved.candidates?.[0] || rawVideoId;
              const altQueryMeta = {
                title: currentTrack.title,
                artist: queryArtist,
                durationSeconds: currentTrack.durationSeconds,
                quality: targetStreamTier,
              };
              const altMeta = await fetchStreamAudioMeta(altId, altQueryMeta).catch(() => null);
              if (cancelled) return;
              if (decideOnlineStreamAction(altMeta) === 'use-youtube-iframe') {
                if (onCapAndroid) {
                  const nativeAlt = await resolveCapacitorDirectAudioUrl(altId);
                  if (cancelled) return;
                  if (nativeAlt?.available && nativeAlt.url) {
                    audio.crossOrigin = null;
                    audio.src = nativeAlt.url;
                    audio.load();
                    return;
                  }
                }
                pauseAudioElementProgrammatically(audio);
                audio.removeAttribute('src');
                syncMediaSessionPlaybackState('paused');
                usePlayerStore
                  .getState()
                  .setActiveStreamMeta(
                    buildYoutubeIframeStreamMeta(rawVideoId, altId, targetStreamTier),
                  );
                return;
              }
              const altUrl = buildStreamAudioUrl(altId, altQueryMeta);
              audio.crossOrigin = !graph || useDirectTarget ? null : 'anonymous';
              audio.src = altUrl;
              audio.load();
            })
            .catch(async () => {
              if (cancelled) return;
              if (onCapAndroid) {
                const nativeRetry = await resolveCapacitorDirectAudioUrl(rawVideoId);
                if (cancelled) return;
                if (nativeRetry?.available && nativeRetry.url) {
                  audio.crossOrigin = null;
                  audio.src = nativeRetry.url;
                  audio.load();
                  return;
                }
              }
              pauseAudioElementProgrammatically(audio);
              audio.removeAttribute('src');
              syncMediaSessionPlaybackState('paused');
              usePlayerStore
                .getState()
                .setActiveStreamMeta(
                  buildYoutubeIframeStreamMeta(rawVideoId, rawVideoId, targetStreamTier),
                );
            });
          return;
        }
        usePlayerStore.getState().setIsBuffering(false);
        usePlayerStore.getState().setIsPlaying(false, { userInitiated: false });
        stopSilentKeepaliveAudio();
        syncMediaSessionPlaybackState('paused');
        usePlayerStore
          .getState()
          .setPlayerError(
            localActive
              ? 'File audio lokal gagal diputar.'
              : 'Aliran audio belum tersedia untuk lagu ini.',
          );
      };

      const onOnlineRecover = () => {
        if (cancelled || localActive || useOfflineBlob) return;
        const st = usePlayerStore.getState();
        if (st.isPlaying && (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
          const resumeTime = st.currentTime;
          if (resumeTime > 0) {
            st.requestSeek(resumeTime);
          }
          audio.load();
          void audio.play().catch(() => {});
        }
      };

      const handleCanPlay = () => {
        if (cancelled) return;
        if (!audio.paused) {
          handlePlaying();
        } else {
          usePlayerStore.getState().setIsBuffering(false);
        }
      };

      audio.addEventListener('loadedmetadata', handleLoadedMeta, { once: true });
      audio.addEventListener('playing', handlePlaying);
      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('waiting', handleWaiting);
      audio.addEventListener('error', handleMediaError);
      window.addEventListener('online', onOnlineRecover);

      detachListeners = () => {
        setElementBusyForLoad(audio, false);
        audio.removeEventListener('loadedmetadata', handleLoadedMeta);
        audio.removeEventListener('playing', handlePlaying);
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('waiting', handleWaiting);
        audio.removeEventListener('error', handleMediaError);
        window.removeEventListener('online', onOnlineRecover);
      };

      audio.load();
    };

    void loadSource();

    return () => {
      cancelled = true;
      isLoadingAudioRef.current = false;
      loadingNativeForKeyRef.current = null;
      setCapacitorNativeStreamErrorHandler(null);
      clearStallTimer();
      detachListeners?.();
    };
  }, [
    hydrated,
    htmlAudioTrackKey,
    localActive,
    useOfflineBlob,
    offlineRec,
    trackUniqueId,
    rawVideoId,
    currentTrack,
    targetStreamTier,
  ]);

  // Switch cleanly between DSP deck and Direct deck when Mode Direct toggles mid-track
  useEffect(() => {
    if (!hydrated || !htmlAudioTrackKey) return;
    if (loadedDirectModeRef.current === localProfile.directMode) return;
    loadedDirectModeRef.current = localProfile.directMode;

    const graph = ensureAudioGraph();
    if (!graph) return;
    const st = usePlayerStore.getState();
    if (isYoutubeIframeActive(st.activeStreamMeta)) return;

    const effVol = localActive
      ? st.volume
      : clampYoutubeVolume(
          st.volume,
          useSettingsStore.getState().youtubeSound.maxVolumeLimit,
          st.isMuted,
        );

    if (localProfile.directMode) {
      if (!graph.backgroundDirectActive && graph.decks[graph.activeDeck].src) {
        if (st.isPlaying) {
          void engageBackgroundDirectDeck(effVol, st.isMuted);
        } else {
          // Force clean reload onto directDeck when resumed while paused
          loadedKeyRef.current = null;
        }
      }
    } else if (
      shouldRestoreDspOnForeground({
        backgroundDirectActive: graph.backgroundDirectActive,
        isMobile: isMobileAudioEnvironment(),
        directMode: false,
        visibilityState: getRealDocumentVisibilityState(),
      })
    ) {
      void restoreDspDeckFromBackground();
    }
  }, [hydrated, htmlAudioTrackKey, localActive, localProfile.directMode]);

  // Sync Play / Pause with smooth fade in/out when fadeOnPlayPause is enabled
  useEffect(() => {
    const graph = ensureAudioGraph();
    const standalone = !graph ? ensureStandaloneDirectDeck() : null;
    if ((!graph && !standalone) || !htmlAudioTrackKey) return;
    if (isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) return;
    if (loadingNativeForKeyRef.current === htmlAudioTrackKey) return;
    if (isCapacitorNativeStreamActive()) {
      if (isPlaying) {
        void resumeCapacitorNativeStream();
      } else {
        void pauseCapacitorNativeStream();
      }
      return;
    }
    if (graph && isBackgroundHandoffActive()) return;

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    const activeAudio = graph ? getActivePlaybackElement(graph) : standalone!;
    const activeGain = graph ? graph.deckGains[graph.activeDeck].gain : null;
    const profile = useSettingsStore.getState().localProfile;
    const ytFade = useSettingsStore.getState().youtubeSound.fadeOnPauseResume;
    const useFade =
      Boolean(graph && activeGain) &&
      (profile.fadeOnPlayPause || ytFade) &&
      !profile.directMode &&
      !graph!.backgroundDirectActive;
    const now = graph ? graph.ctx.currentTime : 0;

    if (isPlaying) {
      ensurePlaybackAudioSession();
      const resumePromise =
        graph && !graph.backgroundDirectActive
          ? resumeAudioContext()
          : Promise.resolve<'running'>('running');
      if (graph) {
        if (graph.backgroundDirectActive) {
          pauseAudioElementProgrammatically(graph.decks[0]);
          pauseAudioElementProgrammatically(graph.decks[1]);
          activeAudio.muted = usePlayerStore.getState().isMuted;
        } else {
          pauseAudioElementProgrammatically(graph.directDeck);
          if (!transitionInProgressRef.current) {
            pauseAudioElementProgrammatically(graph.decks[graph.activeDeck === 0 ? 1 : 0]);
          }
          activeAudio.muted = false;
          activeAudio.volume = 1;
        }
      } else {
        activeAudio.muted = usePlayerStore.getState().isMuted;
      }

      if (activeAudio.src && activeAudio.dataset.scPriming !== '1') {
        if (activeGain) {
          activeGain.cancelScheduledValues(now);
          if (useFade) {
            activeGain.setValueAtTime(0.02, now);
            activeGain.linearRampToValueAtTime(1, now + 0.18);
          } else {
            activeGain.setValueAtTime(1, now);
          }
        }
        if (activeAudio.paused) {
          void activeAudio
            .play()
            .then(async () => {
              stopSilentKeepaliveAudio();
              await resumePromise;
              const latest = usePlayerStore.getState();
              const g = ensureAudioGraph();
              if (
                g &&
                !g.backgroundDirectActive &&
                shouldFallbackSuspendedDspToDirect({
                  isPlaying: latest.isPlaying,
                  isYoutubeIframe: false,
                  backgroundDirectActive: g.backgroundDirectActive,
                  contextState: g.ctx.state,
                })
              ) {
                const effVol = isLocalTrack(latest.currentTrack)
                  ? latest.volume
                  : clampYoutubeVolume(
                      latest.volume,
                      useSettingsStore.getState().youtubeSound.maxVolumeLimit,
                      latest.isMuted,
                    );
                await engageBackgroundDirectDeck(effVol, latest.isMuted);
              }
            })
            .catch((err: unknown) => {
              if (err instanceof DOMException && err.name === 'AbortError') return;
              const st = usePlayerStore.getState();
              stopSilentKeepaliveAudio();
              syncMediaSessionPlaybackState('paused');
              st.setIsPlaying(false, { userInitiated: false });
              if (err instanceof DOMException && err.name === 'NotAllowedError') {
                st.setAutoplayBlockedPendingResume(true);
              } else {
                st.setPlayerError('Gagal memutar audio di perangkat ini.');
              }
            });
        }
      } else if (getRealDocumentVisibilityState() === 'hidden' && isLoadingAudioRef.current) {
        startSilentKeepaliveAudio();
      }
    } else if (!activeAudio.paused) {
      stopSilentKeepaliveAudio();
      if (useFade && activeGain && graph) {
        activeGain.cancelScheduledValues(now);
        activeGain.setValueAtTime(activeGain.value, now);
        activeGain.linearRampToValueAtTime(0.01, now + 0.14);
        markProgrammaticPause(activeAudio, 350);
        pauseTimerRef.current = window.setTimeout(() => {
          pauseTimerRef.current = null;
          if (!usePlayerStore.getState().isPlaying) {
            pauseAudioElementProgrammatically(activeAudio);
            activeGain.setValueAtTime(1, graph.ctx.currentTime);
            const st = usePlayerStore.getState();
            syncMediaSessionPosition({
              duration: Number.isFinite(activeAudio.duration) && activeAudio.duration > 0 ? activeAudio.duration : st.duration,
              currentTime: Number.isFinite(activeAudio.currentTime) ? activeAudio.currentTime : st.currentTime,
              playbackRate: st.playbackRate,
            });
          }
        }, 150);
      } else {
        pauseAudioElementProgrammatically(activeAudio);
        const st = usePlayerStore.getState();
        syncMediaSessionPosition({
          duration: Number.isFinite(activeAudio.duration) && activeAudio.duration > 0 ? activeAudio.duration : st.duration,
          currentTime: Number.isFinite(activeAudio.currentTime) ? activeAudio.currentTime : st.currentTime,
          playbackRate: st.playbackRate,
        });
      }
    } else {
      stopSilentKeepaliveAudio();
    }
  }, [isPlaying, htmlAudioTrackKey, activeStreamSourceMode]);

  // Keep Android Foreground Service notification/MediaSession synced on track or play/pause transitions
  useEffect(() => {
    const st = usePlayerStore.getState();
    syncCapacitorPlaybackNotification({
      track: currentTrack,
      isPlaying,
      duration: st.duration,
      currentTime: st.currentTime,
      playbackRate: st.playbackRate || 1,
      force: true,
    });
  }, [currentTrack, isPlaying]);

  // Explicit Seek (cancels any active transition cleanly)
  useEffect(() => {
    const graph = ensureAudioGraph();
    const standalone = !graph ? ensureStandaloneDirectDeck() : null;
    if (!htmlAudioTrackKey || pendingSeekSeconds === null || (!graph && !standalone)) return;
    if (isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) return;

    if (isCapacitorNativeStreamActive()) {
      const st = usePlayerStore.getState();
      const dur = st.duration > 0 ? st.duration : null;
      const clampedSeek = clampSeekTarget(pendingSeekSeconds, dur);
      void seekCapacitorNativeStream(clampedSeek);
      st.clearPendingSeek();
      return;
    }

    const activeAudio = graph ? getActivePlaybackElement(graph) : standalone!;
    if (Number.isFinite(activeAudio.duration) && activeAudio.duration > 0) {
      if (graph && transitionInProgressRef.current) {
        const activeIdx = graph.activeDeck;
        const standbyIdx: 0 | 1 = activeIdx === 0 ? 1 : 0;
        transitionInProgressRef.current = false;
        transitionStateRef.current = null;
        pauseAudioElementProgrammatically(graph.decks[standbyIdx]);
        resetDeckDjStage(graph, activeIdx, true);
        resetDeckDjStage(graph, standbyIdx, true);
        graph.deckGains[standbyIdx].gain.setTargetAtTime(0, graph.ctx.currentTime, 0.025);
        graph.deckGains[activeIdx].gain.setTargetAtTime(1, graph.ctx.currentTime, 0.025);
        usePlayerStore.getState().setDjTransitionStatus({
          active: false,
          progress: 0,
          style: DEFAULT_PLAYLIST_MIX_SETTINGS.transitionStyle,
          beatMatched: false,
          outgoingBpm: null,
          incomingBpm: null,
          tempoRatio: 1,
        });
      }
      const clampedSeek = Math.max(0, Math.min(pendingSeekSeconds, activeAudio.duration));
      activeAudio.currentTime = clampedSeek;
      const st = usePlayerStore.getState();
      st.clearPendingSeek();
      syncMediaSessionPosition({
        duration: activeAudio.duration,
        currentTime: clampedSeek,
        playbackRate: st.playbackRate,
      });
      if (st.isPlaying && activeAudio.paused) {
        void activeAudio.play().catch(() => {});
      }
    }
  }, [seekVersion, pendingSeekSeconds, htmlAudioTrackKey]);

  // Manual "Mix Sekarang" trigger from DJ controls
  useEffect(() => {
    if (manualMixRequestVersion === 0 || manualMixRequestVersion === lastHandledManualMixRef.current) {
      return;
    }
    lastHandledManualMixRef.current = manualMixRequestVersion;

    const st = usePlayerStore.getState();
    const upcoming = st.manualQueue[0] ?? st.sourceQueue[0] ?? null;
    if (!upcoming) return;

    const graph = ensureAudioGraph();
    const settingsState = useSettingsStore.getState();
    const profile = settingsState.localProfile;
    const djSettings = resolveEffectiveMixSettings(st.activeMixConfig, profile) ?? {
      ...DEFAULT_PLAYLIST_MIX_SETTINGS,
      enabled: true,
    };

    if (!graph || profile.directMode || graph.backgroundDirectActive || isYoutubeIframeActive(st.activeStreamMeta)) {
      st.nextTrack();
      return;
    }

    const nextKey = isLocalTrack(upcoming)
      ? getTrackUniqueId(upcoming)
      : getPlayableVideoId(upcoming);
    if (!nextKey) {
      st.nextTrack();
      return;
    }

    const activeIdx = graph.activeDeck;
    const standbyIdx: 0 | 1 = activeIdx === 0 ? 1 : 0;
    const standby = graph.decks[standbyIdx];
    const activeAudio = graph.decks[activeIdx];

    const startManualTransition = () => {
      if (graph.trackIds[standbyIdx] !== nextKey || standby.readyState < 1) {
        st.nextTrack();
        return;
      }
      const curId = st.currentTrack ? getTrackUniqueId(st.currentTrack) || st.currentTrack.id : '';
      const outBpmInfo =
        st.trackBpmMap[curId] ??
        getCachedTrackBpm(curId) ??
        (st.currentTrack ? cacheFallbackTrackBpm(curId, st.currentTrack) : null);
      const inBpmInfo =
        st.trackBpmMap[nextKey] ??
        getCachedTrackBpm(nextKey) ??
        cacheFallbackTrackBpm(nextKey, upcoming);

      const plan = computeBeatMatchPlan(
        outBpmInfo?.bpm ?? 120,
        inBpmInfo?.bpm ?? 120,
        djSettings.beatMatch,
      );

      const outDur = Number.isFinite(activeAudio.duration) ? activeAudio.duration : 180;
      const inDur = Number.isFinite(standby.duration) ? standby.duration : upcoming.durationSeconds;
      const remaining = Math.max(0.8, outDur - activeAudio.currentTime);
      const requested = djSettings.durationSeconds;
      const effectiveSec = Math.max(
        1.2,
        Math.min(
          requested,
          remaining > 1.5 ? Math.max(1.2, remaining) : requested,
          typeof inDur === 'number' && inDur > 2 ? inDur * 0.55 : requested,
        ),
      );

      const initFrame = computeDjTransitionFrame(0, djSettings);
      applyDeckDjMixFrame(graph, activeIdx, standbyIdx, initFrame, 0.02, true);

      const cueOffset = djSettings.beatMatch
        ? computePhaseAlignedCueOffset(activeAudio.currentTime, outBpmInfo, inBpmInfo, inDur)
        : 0;
      standby.currentTime = cueOffset;
      const baseRate = st.playbackRate || 1;
      setElementRatePreservingPitch(standby, baseRate * plan.incomingStartRate);

      transitionInProgressRef.current = true;
      transitionStateRef.current = {
        mode: 'dj',
        startedAtMs: Date.now(),
        effectiveSec,
        outgoingIdx: activeIdx,
        incomingIdx: standbyIdx,
        targetKey: nextKey,
        manual: true,
        beatMatched: plan.beatMatched,
        incomingStartRate: plan.incomingStartRate,
        outgoingBpm: outBpmInfo?.bpm ?? null,
        incomingBpm: inBpmInfo?.bpm ?? null,
        baseRate,
        style: djSettings.transitionStyle,
        eqBlend: djSettings.eqBlend,
        volumeCurve: djSettings.volumeCurve,
      };
      st.setDjTransitionStatus({
        active: true,
        progress: 0,
        style: djSettings.transitionStyle,
        beatMatched: plan.beatMatched,
        outgoingBpm: outBpmInfo?.bpm ?? null,
        incomingBpm: inBpmInfo?.bpm ?? null,
        tempoRatio: plan.incomingStartRate,
      });

      void resumeAudioContext();
      void standby.play().catch(() => {
        transitionInProgressRef.current = false;
        transitionStateRef.current = null;
        st.nextTrack();
      });
    };

    if (graph.trackIds[standbyIdx] === nextKey && standby.readyState >= 1) {
      startManualTransition();
      return;
    }

    const loadStandbyAndMix = async () => {
      if (isLocalTrack(upcoming)) {
        const rec =
          useLibraryStore.getState().localFiles.find((f) => f.id === nextKey) ||
          (await db.localFiles.get(nextKey));
        if (!rec) {
          st.nextTrack();
          return;
        }
        revokeDeckUrl(graph.objectUrls, standbyIdx);
        const url = URL.createObjectURL(rec.blob);
        graph.objectUrls[standbyIdx] = url;
        graph.trackIds[standbyIdx] = rec.id;
        standby.crossOrigin = null;
        standby.src = url;
        void analyzeAudioBlobBpm(rec.id, rec.blob).then((a) => {
          if (a) usePlayerStore.getState().setTrackBpm(rec.id, a);
        });
      } else {
        const off = useLibraryStore.getState().offlineDownloads.find((d) => d.id === nextKey);
        if (hasPlayableOfflineAudio(off) && off) {
          revokeDeckUrl(graph.objectUrls, standbyIdx);
          const url = URL.createObjectURL(off.blob);
          graph.objectUrls[standbyIdx] = url;
          graph.trackIds[standbyIdx] = nextKey;
          standby.crossOrigin = null;
          standby.src = url;
          void analyzeAudioBlobBpm(off.id, off.blob).then((a) => {
            if (a) usePlayerStore.getState().setTrackBpm(off.id, a);
          });
        } else {
          const streamQueryMeta = {
            title: upcoming.title,
            artist: formatArtists(upcoming.artists),
            durationSeconds: upcoming.durationSeconds,
            quality: targetStreamTier,
          };
          const probe = await fetchStreamAudioMeta(nextKey, streamQueryMeta).catch(() => null);
          if (decideOnlineStreamAction(probe) === 'use-youtube-iframe') {
            st.nextTrack();
            return;
          }
          revokeDeckUrl(graph.objectUrls, standbyIdx);
          const streamUrl = buildStreamAudioUrl(nextKey, streamQueryMeta);
          graph.trackIds[standbyIdx] = nextKey;
          standby.crossOrigin = 'anonymous';
          standby.src = streamUrl;
        }
      }

      const onCanMix = () => {
        standby.removeEventListener('canplay', onCanMix);
        startManualTransition();
      };
      standby.addEventListener('canplay', onCanMix, { once: true });
      standby.load();
    };

    void loadStandbyAndMix();
  }, [manualMixRequestVersion, targetStreamTier]);

  // Progress polling, DJ Mix Engine + crossfade (1-12s), gapless preloading, dynamic LUFS, skip silence, sleep timer fade
  useEffect(() => {
    if (!htmlAudioTrackKey || !isPlaying || activeStreamSourceMode === 'youtube-iframe') return;
    const graph = ensureAudioGraph();
    const standalone = !graph ? ensureStandaloneDirectDeck() : null;
    if (!graph && !standalone) return;

    if (!graph && standalone) {
      const syncStandaloneTick = () => {
        if (isCapacitorNativeStreamActive()) return;
        if (!standalone.src || standalone.dataset.scPriming === '1') return;
        const store = usePlayerStore.getState();
        const cur = standalone.currentTime;
        const dur = Number.isFinite(standalone.duration) ? standalone.duration : 0;
        const playingNow = !standalone.paused && !standalone.ended && standalone.readyState >= 2;
        syncMediaSessionPlaybackState(
          resolveEffectiveMediaSessionPlaybackState({
            hasTrack: Boolean(store.currentTrack),
            storeIsPlaying: store.isPlaying,
            isYoutubeIframe: false,
            htmlAudioPlaying: playingNow,
            audioContextRunningOrDirect: true,
          }),
        );
        if (standalone.paused && !standalone.ended) {
          return;
        }
        if (Number.isFinite(cur)) {
          store.setProgress(cur, dur > 0 ? dur : undefined);
        }
        syncMediaSessionPosition({
          duration: dur,
          currentTime: cur,
          playbackRate: store.playbackRate || 1,
        });
        if (dur > 0 && (standalone.ended || dur - cur <= 0.06)) {
          store.handleTrackEnded();
        }
      };
      const interval = window.setInterval(syncStandaloneTick, 150);
      standalone.addEventListener('timeupdate', syncStandaloneTick);
      return () => {
        window.clearInterval(interval);
        standalone.removeEventListener('timeupdate', syncStandaloneTick);
      };
    }
    if (!graph) return;

    const resolveStandbyInfo = (upcoming: MediaItem | null): {
      key: string;
      isLocal: boolean;
      track: MediaItem;
    } | null => {
      if (!upcoming) return null;
      if (isLocalTrack(upcoming)) {
        const lid = getTrackUniqueId(upcoming);
        return lid ? { key: lid, isLocal: true, track: upcoming } : null;
      }
      const vid = getPlayableVideoId(upcoming);
      return vid ? { key: vid, isLocal: false, track: upcoming } : null;
    };

    const preloadStandbyTrack = async (nextInfo: {
      key: string;
      isLocal: boolean;
      track: MediaItem;
    }) => {
      const gen = preloadGenerationRef.current;
      const standbyIdx: 0 | 1 = graph.activeDeck === 0 ? 1 : 0;
      if (graph.trackIds[standbyIdx] === nextInfo.key) return;

      if (nextInfo.isLocal) {
        const record =
          useLibraryStore.getState().localFiles.find((f) => f.id === nextInfo.key) ||
          (await db.localFiles.get(nextInfo.key));
        if (!record || gen !== preloadGenerationRef.current) return;
        const curStandbyIdx: 0 | 1 = graph.activeDeck === 0 ? 1 : 0;
        if (curStandbyIdx !== standbyIdx) return;
        revokeDeckUrl(graph.objectUrls, standbyIdx);
        const url = URL.createObjectURL(record.blob);
        graph.objectUrls[standbyIdx] = url;
        graph.trackIds[standbyIdx] = record.id;
        const standby = graph.decks[standbyIdx];
        standby.crossOrigin = null;
        standby.src = url;
        setElementRatePreservingPitch(standby, usePlayerStore.getState().playbackRate);
        standby.load();

        void analyzeAudioBlobBpm(record.id, record.blob).then((analysis) => {
          if (analysis) {
            usePlayerStore.getState().setTrackBpm(record.id, analysis);
          } else {
            const est = cacheFallbackTrackBpm(record.id, nextInfo.track);
            usePlayerStore.getState().setTrackBpm(record.id, est);
          }
        });
      } else {
        const offlineBlobRec = useLibraryStore
          .getState()
          .offlineDownloads.find((d) => d.id === nextInfo.key);
        if (hasPlayableOfflineAudio(offlineBlobRec) && offlineBlobRec) {
          revokeDeckUrl(graph.objectUrls, standbyIdx);
          const url = URL.createObjectURL(offlineBlobRec.blob);
          graph.objectUrls[standbyIdx] = url;
          graph.trackIds[standbyIdx] = nextInfo.key;
          const standby = graph.decks[standbyIdx];
          standby.crossOrigin = null;
          standby.src = url;
          setElementRatePreservingPitch(standby, usePlayerStore.getState().playbackRate);
          standby.load();

          void analyzeAudioBlobBpm(offlineBlobRec.id, offlineBlobRec.blob).then((analysis) => {
            if (analysis) {
              usePlayerStore.getState().setTrackBpm(offlineBlobRec.id, analysis);
            } else {
              const est = cacheFallbackTrackBpm(offlineBlobRec.id, nextInfo.track);
              usePlayerStore.getState().setTrackBpm(offlineBlobRec.id, est);
            }
          });
          return;
        }
        const est = cacheFallbackTrackBpm(nextInfo.key, nextInfo.track);
        usePlayerStore.getState().setTrackBpm(nextInfo.key, est);

        const streamQueryMeta = {
          title: nextInfo.track.title,
          artist: formatArtists(nextInfo.track.artists),
          durationSeconds: nextInfo.track.durationSeconds,
          quality: targetStreamTier,
        };
        const probe = await fetchStreamAudioMeta(nextInfo.key, streamQueryMeta).catch(() => null);
        if (gen !== preloadGenerationRef.current) return;
        const curStandbyIdx: 0 | 1 = graph.activeDeck === 0 ? 1 : 0;
        if (curStandbyIdx !== standbyIdx) return;
        if (decideOnlineStreamAction(probe) === 'use-youtube-iframe') {
          graph.trackIds[standbyIdx] = nextInfo.key;
          return;
        }
        revokeDeckUrl(graph.objectUrls, standbyIdx);
        const streamUrl = buildStreamAudioUrl(nextInfo.key, streamQueryMeta);
        graph.trackIds[standbyIdx] = nextInfo.key;
        const standby = graph.decks[standbyIdx];
        standby.crossOrigin = 'anonymous';
        standby.src = streamUrl;
        setElementRatePreservingPitch(standby, usePlayerStore.getState().playbackRate);
        standby.load();
      }
    };

    lastProgressTickAtRef.current = Date.now();

    const syncProgressTick = () => {
      if (isCapacitorNativeStreamActive()) return;
      const nowTickMs = Date.now();
      const deltaMs = Math.max(0, Math.min(500, nowTickMs - lastProgressTickAtRef.current));
      lastProgressTickAtRef.current = nowTickMs;

      const activeIdx = graph.activeDeck;
      const standbyIdx: 0 | 1 = activeIdx === 0 ? 1 : 0;
      const audio = getActivePlaybackElement(graph);
      if (!audio.src || audio.dataset.scPriming === '1') return;

      const cur = audio.currentTime;
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const store = usePlayerStore.getState();
      const settingsState = useSettingsStore.getState();
      const profile = settingsState.localProfile;
      const ytSound = settingsState.youtubeSound;

      const htmlPlayingNow = !audio.paused && !audio.ended && audio.readyState >= 2;
      const ctxRunningOrDirect = graph.backgroundDirectActive || graph.ctx.state === 'running';

      // Auto-restore foreground DSP if directDeck was engaged during a transient AudioContext interruption
      // and AudioContext has recovered to 'running' while visible (desktop, directMode off).
      if (
        graph.backgroundDirectActive &&
        store.isPlaying &&
        graph.ctx.state === 'running' &&
        shouldRestoreDspOnForeground({
          backgroundDirectActive: graph.backgroundDirectActive,
          isMobile: isMobileAudioEnvironment(),
          directMode: profile.directMode,
          visibilityState: getRealDocumentVisibilityState(),
        })
      ) {
        suspendedCtxAccumMsRef.current = 0;
        void restoreDspDeckFromBackground();
      } else if (
        !graph.backgroundDirectActive &&
        store.isPlaying &&
        !audio.paused &&
        !audio.ended &&
        shouldFallbackSuspendedDspToDirect({
          isPlaying: store.isPlaying,
          isYoutubeIframe: false,
          backgroundDirectActive: graph.backgroundDirectActive,
          contextState: graph.ctx.state,
        })
      ) {
        const realVis = getRealDocumentVisibilityState();
        if (realVis === 'visible') {
          void resumeAudioContext();
        }
        suspendedCtxAccumMsRef.current += deltaMs > 0 ? deltaMs : 100;
        const thresholdMs = realVis === 'visible' ? 1500 : 300;
        if (suspendedCtxAccumMsRef.current >= thresholdMs) {
          suspendedCtxAccumMsRef.current = 0;
          const effVol = localActive
            ? store.volume
            : clampYoutubeVolume(store.volume, ytSound.maxVolumeLimit, store.isMuted);
          void engageBackgroundDirectDeck(effVol, store.isMuted);
        }
      } else {
        suspendedCtxAccumMsRef.current = 0;
      }

      // Detect Safari/CORS MediaElementAudioSourceNode digital-zero silence bug and recover via directDeck
      if (
        !graph.backgroundDirectActive &&
        !localActive &&
        !useOfflineBlob &&
        graph.ctx.state === 'running' &&
        htmlPlayingNow &&
        !store.isMuted &&
        store.volume >= 10 &&
        cur >= 1.5 &&
        !transitionInProgressRef.current
      ) {
        const liveRms = computeLiveAnalyserRms();
        if (liveRms === 0) {
          digitalZeroAccumMsRef.current += deltaMs > 0 ? deltaMs : 100;
          if (digitalZeroAccumMsRef.current >= 2200) {
            digitalZeroAccumMsRef.current = 0;
            const effVol = clampYoutubeVolume(store.volume, ytSound.maxVolumeLimit, store.isMuted);
            void engageBackgroundDirectDeck(effVol, store.isMuted).then((ok) => {
              if (!ok) return;
              const latestMeta = usePlayerStore.getState().activeStreamMeta;
              if (latestMeta && latestMeta.sourceMode === 'webaudio') {
                usePlayerStore.getState().setActiveStreamMeta({
                  ...latestMeta,
                  sourceMode: 'direct',
                });
              }
            });
          }
        } else {
          digitalZeroAccumMsRef.current = 0;
        }
      } else {
        digitalZeroAccumMsRef.current = 0;
      }

      syncMediaSessionPlaybackState(
        resolveEffectiveMediaSessionPlaybackState({
          hasTrack: Boolean(store.currentTrack),
          storeIsPlaying: store.isPlaying,
          isYoutubeIframe: false,
          htmlAudioPlaying: htmlPlayingNow,
          audioContextRunningOrDirect: ctxRunningOrDirect,
        }),
      );

      if (audio.paused && !audio.ended) {
        return;
      }

      if (Number.isFinite(cur)) {
        store.setProgress(cur, dur > 0 ? dur : undefined);
      }

      syncMediaSessionPosition({
        duration: dur,
        currentTime: cur,
        playbackRate: store.playbackRate || 1,
      });
      syncCapacitorPlaybackNotification({
        track: store.currentTrack,
        isPlaying: store.isPlaying,
        duration: dur,
        currentTime: cur,
        playbackRate: store.playbackRate || 1,
      });

      if (
        !graph.backgroundDirectActive &&
        !profile.directMode &&
        profile.normalizationTarget !== 'off' &&
        !dynamicLufsDoneRef.current &&
        cur >= 1.5
      ) {
        const measured = measureAndEstimateLufs();
        if (measured !== null) {
          setDynamicMeasuredLufs(measured);
          const effectiveVol = localActive
            ? store.volume
            : clampYoutubeVolume(store.volume, ytSound.maxVolumeLimit, store.isMuted);
          applyAudioProfileToGraph({
            profile,
            volume0to100: effectiveVol,
            isMuted: store.isMuted,
            trackLufs: measured,
          });
        }
        if (cur >= 3.5) {
          dynamicLufsDoneRef.current = true;
        }
      }

      if (
        !graph.backgroundDirectActive &&
        !profile.directMode &&
        profile.skipSilence &&
        dur > 3 &&
        cur > 0.3 &&
        cur < dur - 1.5 &&
        !transitionInProgressRef.current
      ) {
        const rms = computeLiveAnalyserRms();
        if (rms < 0.0032) {
          silenceAccumMsRef.current += deltaMs > 0 ? deltaMs : 100;
          if (silenceAccumMsRef.current >= 450 && nowTickMs - lastSilentSeekAtRef.current >= 450) {
            lastSilentSeekAtRef.current = nowTickMs;
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
      const nextInfo = store.repeat !== 'one' ? resolveStandbyInfo(upcoming) : null;
      const activeDjSettings = resolveEffectiveMixSettings(store.activeMixConfig, profile);

      const effectiveCrossfade = activeDjSettings
        ? clampEffectiveTransitionSeconds(
            activeDjSettings.durationSeconds,
            dur,
            nextInfo?.track.durationSeconds,
          )
        : clampEffectiveTransitionSeconds(
            resolveEffectiveCrossfadeSeconds(profile),
            dur,
            nextInfo?.track.durationSeconds,
          );

      // Keep next track standby preloaded early whenever DJ Mix or Crossfade/Gapless is eligible
      if (
        !graph.backgroundDirectActive &&
        nextInfo &&
        !profile.directMode &&
        (activeDjSettings !== null ||
          effectiveCrossfade > 0 ||
          profile.gaplessPlayback) &&
        (activeDjSettings !== null ||
          (dur > 0 && dur - cur <= Math.max(12, effectiveCrossfade + 5)))
      ) {
        void preloadStandbyTrack(nextInfo);
      }

      // Cancel active transition if disabled mid-way
      if (transitionInProgressRef.current && effectiveCrossfade <= 0 && !transitionStateRef.current?.manual) {
        transitionInProgressRef.current = false;
        transitionStateRef.current = null;
        pauseAudioElementProgrammatically(graph.decks[standbyIdx]);
        resetDeckDjStage(graph, activeIdx, false);
        resetDeckDjStage(graph, standbyIdx, true);
        graph.deckGains[standbyIdx].gain.setTargetAtTime(0, graph.ctx.currentTime, 0.03);
        graph.deckGains[activeIdx].gain.setTargetAtTime(1, graph.ctx.currentTime, 0.03);
        store.setDjTransitionStatus({
          active: false,
          progress: 0,
          style: activeDjSettings?.transitionStyle ?? 'smooth',
          beatMatched: false,
          outgoingBpm: null,
          incomingBpm: null,
          tempoRatio: 1,
        });
      }

      // Drive active transition (either automatic near end of track OR manual "Mix Sekarang")
      const activeTransition = transitionStateRef.current;
      if (
        !graph.backgroundDirectActive &&
        activeTransition &&
        transitionInProgressRef.current &&
        activeTransition.outgoingIdx === activeIdx
      ) {
        const elapsedSec = (Date.now() - activeTransition.startedAtMs) / 1000;
        const progress = activeTransition.manual
          ? Math.min(1, elapsedSec / Math.max(0.5, activeTransition.effectiveSec))
          : dur > 0
            ? Math.min(1, 1 - Math.max(0, (dur - cur) / Math.max(0.5, activeTransition.effectiveSec)))
            : 1;

        if (activeTransition.mode === 'dj') {
          const liveSettings = activeDjSettings ?? {
            transitionStyle: activeTransition.style,
            eqBlend: activeTransition.eqBlend,
            volumeCurve: activeTransition.volumeCurve,
          };
          const frame = computeDjTransitionFrame(progress, liveSettings);
          applyDeckDjMixFrame(graph, activeIdx, standbyIdx, frame, 0.03, false);

          // Gradually begin pulling beat-matched speed slightly closer to 1.0 in last 25%
          if (activeTransition.beatMatched && Math.abs(activeTransition.incomingStartRate - 1) > 0.002 && progress > 0.75) {
            const settle = (progress - 0.75) / 0.25;
            const blendedRate =
              activeTransition.incomingStartRate +
              (1 - activeTransition.incomingStartRate) * (settle * 0.45);
            setElementRatePreservingPitch(
              graph.decks[standbyIdx],
              activeTransition.baseRate * blendedRate,
            );
          }

          store.setDjTransitionStatus({
            active: true,
            progress: Math.round(progress * 100) / 100,
            style: liveSettings.transitionStyle,
            beatMatched: activeTransition.beatMatched,
            outgoingBpm: activeTransition.outgoingBpm,
            incomingBpm: activeTransition.incomingBpm,
            tempoRatio: activeTransition.incomingStartRate,
          });
        } else {
          const { outGain, inGain } = computeEqualPowerCrossfade(progress);
          graph.deckGains[activeIdx].gain.setTargetAtTime(outGain, graph.ctx.currentTime, 0.04);
          graph.deckGains[standbyIdx].gain.setTargetAtTime(inGain, graph.ctx.currentTime, 0.04);
        }

        if (activeTransition.manual && progress >= 0.995) {
          advanceOnTrackEnd.current();
          return;
        }
      } else if (
        !graph.backgroundDirectActive &&
        !profile.directMode &&
        nextInfo &&
        effectiveCrossfade > 0 &&
        dur > effectiveCrossfade * 1.4 &&
        dur - cur <= effectiveCrossfade &&
        dur - cur > 0.08
      ) {
        const standbyAudio = graph.decks[standbyIdx];
        if (graph.trackIds[standbyIdx] === nextInfo.key && standbyAudio.readyState >= 2) {
          if (activeDjSettings) {
            const curId = store.currentTrack
              ? getTrackUniqueId(store.currentTrack) || store.currentTrack.id
              : '';
            const outBpmInfo =
              store.trackBpmMap[curId] ??
              getCachedTrackBpm(curId) ??
              (store.currentTrack ? cacheFallbackTrackBpm(curId, store.currentTrack) : null);
            const inBpmInfo =
              store.trackBpmMap[nextInfo.key] ??
              getCachedTrackBpm(nextInfo.key) ??
              cacheFallbackTrackBpm(nextInfo.key, nextInfo.track);
            const plan = computeBeatMatchPlan(
              outBpmInfo?.bpm ?? 120,
              inBpmInfo?.bpm ?? 120,
              activeDjSettings.beatMatch,
            );
            const initFrame = computeDjTransitionFrame(0, activeDjSettings);
            applyDeckDjMixFrame(graph, activeIdx, standbyIdx, initFrame, 0.02, true);

            const inDur = Number.isFinite(standbyAudio.duration)
              ? standbyAudio.duration
              : nextInfo.track.durationSeconds;
            const cueOffset = activeDjSettings.beatMatch
              ? computePhaseAlignedCueOffset(cur, outBpmInfo, inBpmInfo, inDur)
              : 0;
            standbyAudio.currentTime = cueOffset;
            const baseRate = store.playbackRate || 1;
            setElementRatePreservingPitch(standbyAudio, baseRate * plan.incomingStartRate);

            transitionInProgressRef.current = true;
            transitionStateRef.current = {
              mode: 'dj',
              startedAtMs: Date.now(),
              effectiveSec: effectiveCrossfade,
              outgoingIdx: activeIdx,
              incomingIdx: standbyIdx,
              targetKey: nextInfo.key,
              manual: false,
              beatMatched: plan.beatMatched,
              incomingStartRate: plan.incomingStartRate,
              outgoingBpm: outBpmInfo?.bpm ?? null,
              incomingBpm: inBpmInfo?.bpm ?? null,
              baseRate,
              style: activeDjSettings.transitionStyle,
              eqBlend: activeDjSettings.eqBlend,
              volumeCurve: activeDjSettings.volumeCurve,
            };
            store.setDjTransitionStatus({
              active: true,
              progress: 0,
              style: activeDjSettings.transitionStyle,
              beatMatched: plan.beatMatched,
              outgoingBpm: outBpmInfo?.bpm ?? null,
              incomingBpm: inBpmInfo?.bpm ?? null,
              tempoRatio: plan.incomingStartRate,
            });
            void standbyAudio.play().catch(() => {});
          } else {
            transitionInProgressRef.current = true;
            transitionStateRef.current = {
              mode: 'crossfade',
              startedAtMs: Date.now(),
              effectiveSec: effectiveCrossfade,
              outgoingIdx: activeIdx,
              incomingIdx: standbyIdx,
              targetKey: nextInfo.key,
              manual: false,
              beatMatched: false,
              incomingStartRate: 1,
              outgoingBpm: null,
              incomingBpm: null,
              baseRate: store.playbackRate || 1,
              style: 'smooth',
              eqBlend: false,
              volumeCurve: 'equal-power',
            };
            graph.deckGains[standbyIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
            standbyAudio.currentTime = 0;
            setElementRatePreservingPitch(standbyAudio, store.playbackRate || 1);
            void standbyAudio.play().catch(() => {});
          }
        }
      }

      if (store.sleepTimerMode === 'minutes' && store.sleepTimerEndsAt) {
        const remainingMs = store.sleepTimerEndsAt - Date.now();
        if (remainingMs > 0 && remainingMs <= 1800) {
          const fadeFactor = Math.max(0.02, remainingMs / 1800);
          const cappedVol = localActive
            ? store.volume
            : clampYoutubeVolume(store.volume, ytSound.maxVolumeLimit, store.isMuted);
          const baseVol = store.isMuted ? 0 : cappedVol / 100;
          if (graph.backgroundDirectActive) {
            graph.directDeck.volume = Math.max(0, Math.min(1, baseVol * fadeFactor));
          } else {
            graph.masterGain.gain.setTargetAtTime(baseVol * fadeFactor, graph.ctx.currentTime, 0.05);
          }
        }
      }

      if (dur > 0 && (audio.ended || dur - cur <= 0.06)) {
        advanceOnTrackEnd.current();
      }
    };

    const interval = window.setInterval(syncProgressTick, 100);
    const onTimeUpdate = (el: HTMLAudioElement) => () => {
      if (getActivePlaybackElement(graph) === el) {
        syncProgressTick();
      }
    };
    const d0Time = onTimeUpdate(graph.decks[0]);
    const d1Time = onTimeUpdate(graph.decks[1]);
    const directTime = onTimeUpdate(graph.directDeck);

    graph.decks[0].addEventListener('timeupdate', d0Time);
    graph.decks[1].addEventListener('timeupdate', d1Time);
    graph.directDeck.addEventListener('timeupdate', directTime);

    return () => {
      window.clearInterval(interval);
      graph.decks[0].removeEventListener('timeupdate', d0Time);
      graph.decks[1].removeEventListener('timeupdate', d1Time);
      graph.directDeck.removeEventListener('timeupdate', directTime);
    };
  }, [htmlAudioTrackKey, isPlaying, manualQueue, sourceQueue, localActive, targetStreamTier, activeStreamSourceMode]);

  return null;
}
