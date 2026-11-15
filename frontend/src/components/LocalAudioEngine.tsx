import { useEffect, useRef } from 'react';
import {
  buildStreamAudioUrl,
  fetchStreamAudioMeta,
  resolvePlayableYoutube,
} from '../api/client';
import {
  applyAudioProfileToGraph,
  computeLiveAnalyserRms,
  engageBackgroundDirectDeck,
  ensureAudioGraph,
  getActivePlaybackElement,
  incrementSkipSilenceCount,
  measureAndEstimateLufs,
  resetDirectDeck,
  restoreDspDeckFromBackground,
  resumeAudioContext,
  setAudioOutputDevice,
  setDynamicMeasuredLufs,
  startSilentKeepaliveAudio,
  stopSilentKeepaliveAudio,
} from '../audio/soundclearAudioEngine';
import { db } from '../db/soundclearDb';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { ActiveStreamMeta, ConcreteQualityTier, MediaItem } from '../types/music';
import {
  clampYoutubeVolume,
  classifyStreamQualityBadge,
  computeEqualPowerCrossfade,
  resolveEffectiveCrossfadeSeconds,
  resolveTargetStreamQuality,
} from '../utils/audioMath';
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
  const transitionInProgressRef = useRef(false);
  const pauseTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const silenceAccumMsRef = useRef(0);
  const lastSilentSeekAtRef = useRef(0);
  const dynamicLufsDoneRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);

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
    youtubeSound.maxVolumeLimit,
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
      [...graph.decks, graph.directDeck].forEach((deck) => {
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

  // Keep active user-unlocked audio playing seamlessly across tab switches / screen lock,
  // using direct-deck handoff only as a guarded fallback if AudioContext suspends in background.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let fallbackCheckTimer: number | null = null;

    const clearFallbackTimer = () => {
      if (fallbackCheckTimer !== null) {
        window.clearTimeout(fallbackCheckTimer);
        fallbackCheckTimer = null;
      }
    };

    const keepAliveOrFallbackForBackground = () => {
      const graph = ensureAudioGraph();
      const state = usePlayerStore.getState();
      if (!graph || !state.isPlaying || isYoutubeIframeActive(state.activeStreamMeta)) return;

      startSilentKeepaliveAudio();
      void resumeAudioContext();

      clearFallbackTimer();
      fallbackCheckTimer = window.setTimeout(() => {
        fallbackCheckTimer = null;
        if (document.visibilityState !== 'hidden') return;
        const latest = usePlayerStore.getState();
        if (!latest.isPlaying || isYoutubeIframeActive(latest.activeStreamMeta)) return;

        const g = ensureAudioGraph();
        if (!g || g.backgroundDirectActive) return;
        const activeDeck = g.decks[g.activeDeck];
        if (!activeDeck.src) return;

        // Only switch to directDeck if AudioContext remained suspended or activeDeck stalled
        if (g.ctx.state !== 'running') {
          const effectiveVolume = isLocalTrack(latest.currentTrack)
            ? latest.volume
            : clampYoutubeVolume(
                latest.volume,
                useSettingsStore.getState().youtubeSound.maxVolumeLimit,
                latest.isMuted,
              );
          void engageBackgroundDirectDeck(effectiveVolume, latest.isMuted);
        } else if (activeDeck.paused && !activeDeck.ended) {
          void activeDeck.play().catch(() => {});
        }
      }, 350);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        keepAliveOrFallbackForBackground();
        return;
      }

      clearFallbackTimer();
      const graph = ensureAudioGraph();
      const state = usePlayerStore.getState();
      if (graph?.backgroundDirectActive) {
        void restoreDspDeckFromBackground();
      } else if (graph && state.isPlaying && !isYoutubeIframeActive(state.activeStreamMeta)) {
        void resumeAudioContext();
        startSilentKeepaliveAudio();
        const activeEl = getActivePlaybackElement(graph);
        if (activeEl.src && activeEl.paused && !activeEl.ended) {
          void activeEl.play().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', keepAliveOrFallbackForBackground);
    window.addEventListener('pageshow', onVisibility);
    return () => {
      clearFallbackTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', keepAliveOrFallbackForBackground);
      window.removeEventListener('pageshow', onVisibility);
    };
  }, []);

  // Native `'ended'` event listener across all audio elements so track advance never stalls
  // when background tabs throttle setInterval timers.
  const endGuardRef = useRef<{ sig: string; at: number } | null>(null);
  const advanceOnTrackEnd = useRef<() => void>(() => {});

  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph) return;

    const triggerEndOnce = () => {
      const st = usePlayerStore.getState();
      if (!st.currentTrack || !st.isPlaying) return;
      if (isYoutubeIframeActive(st.activeStreamMeta)) return;

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
      const nextKey =
        st.repeat !== 'one' && upcoming
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
        activeAudio.pause();
        graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
        graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
        graph.activeDeck = standbyIdx;
        graph.crossfadeTargetId = nextKey;
        transitionInProgressRef.current = false;
        st.handleTrackEnded();
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
        void standby
          .play()
          .then(() => {
            activeAudio.pause();
            graph.deckGains[activeIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
            graph.deckGains[standbyIdx].gain.setValueAtTime(1, graph.ctx.currentTime);
            graph.activeDeck = standbyIdx;
            graph.crossfadeTargetId = nextKey;
            st.handleTrackEnded();
          })
          .catch(() => {
            // Standby deck blocked without gesture in background — reuse unlocked deck
            transitionInProgressRef.current = false;
            st.handleTrackEnded();
          });
        return;
      }

      transitionInProgressRef.current = false;
      st.handleTrackEnded();
    };

    advanceOnTrackEnd.current = triggerEndOnce;

    const onDeckEnded = (el: HTMLAudioElement) => () => {
      const g = ensureAudioGraph();
      if (!g) return;
      if (getActivePlaybackElement(g) !== el) return;
      triggerEndOnce();
    };

    const d0Handler = onDeckEnded(graph.decks[0]);
    const d1Handler = onDeckEnded(graph.decks[1]);
    const directHandler = onDeckEnded(graph.directDeck);

    graph.decks[0].addEventListener('ended', d0Handler);
    graph.decks[1].addEventListener('ended', d1Handler);
    graph.directDeck.addEventListener('ended', directHandler);
    return () => {
      graph.decks[0].removeEventListener('ended', d0Handler);
      graph.decks[1].removeEventListener('ended', d1Handler);
      graph.directDeck.removeEventListener('ended', directHandler);
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
    const graph = ensureAudioGraph();
    if (!graph) return;
    resetDirectDeck();
    graph.decks.forEach((d) => d.pause());
  }, [activeStreamSourceMode]);

  // Load local, offline, or audio-only stream source when active track or stream quality changes
  useEffect(() => {
    if (!hydrated) return;
    const graph = ensureAudioGraph();
    if (!graph) return;

    if (!htmlAudioTrackKey) {
      loadedKeyRef.current = null;
      resetDirectDeck();
      graph.decks.forEach((d) => d.pause());
      return;
    }

    // Fast-path 0ms: if online YouTube stream is globally blocked and we already have an 11-char ID, bypass network probe immediately
    if (!localActive && !useOfflineBlob && rawVideoId && shouldFastRouteToIframe(rawVideoId)) {
      loadedKeyRef.current = htmlAudioTrackKey;
      resetDirectDeck();
      graph.decks.forEach((d) => {
        d.pause();
        d.removeAttribute('src');
      });
      usePlayerStore
        .getState()
        .setActiveStreamMeta(
          buildYoutubeIframeStreamMeta(rawVideoId, rawVideoId, targetStreamTier),
        );
      return;
    }

    // Handle pre-started crossfade / gapless standby deck
    const expectedStandbyId = localActive ? trackUniqueId : rawVideoId;
    if (expectedStandbyId && graph.crossfadeTargetId === expectedStandbyId) {
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
    fallbackAttemptedRef.current = false;
    setDynamicMeasuredLufs(null);
    silenceAccumMsRef.current = 0;

    let cancelled = false;
    let detachListeners: (() => void) | null = null;

    const clearStallTimer = () => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const loadSource = async () => {
      resetDirectDeck();
      const nextDeckIdx: 0 | 1 = graph.activeDeck;
      const otherDeckIdx: 0 | 1 = nextDeckIdx === 0 ? 1 : 0;
      graph.decks[otherDeckIdx].pause();
      graph.deckGains[otherDeckIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
      graph.deckGains[nextDeckIdx].gain.setValueAtTime(1, graph.ctx.currentTime);

      const audio = graph.decks[nextDeckIdx];
      let urlToLoad: string | null = null;
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
      } else if (rawVideoId && currentTrack) {
        revokeDeckUrl(graph.objectUrls, nextDeckIdx);
        let streamVideoId = rawVideoId;
        const artistName = formatArtists(currentTrack.artists);

        if (!isYouTubeVideoId(rawVideoId)) {
          audio.pause();
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

        // Check if backend YT Music stream extraction is available using cached probe
        try {
          const probeMeta = await probeStreamWithCache(
            streamVideoId,
            streamQueryMeta,
            (vid, q) => fetchStreamAudioMeta(vid, q),
          );
          if (cancelled) return;
          if (decideOnlineStreamAction(probeMeta) === 'use-youtube-iframe') {
            audio.pause();
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
            sourceMode: localProfile.directMode ? 'direct' : 'webaudio',
            proxiedViaBackend: true,
            audiodownloadAllowed: true,
            replayGainDb: null,
          };
        } catch {
          if (cancelled) return;
          audio.pause();
          audio.removeAttribute('src');
          usePlayerStore
            .getState()
            .setActiveStreamMeta(
              buildYoutubeIframeStreamMeta(rawVideoId, streamVideoId, targetStreamTier),
            );
          return;
        }

        urlToLoad = buildStreamAudioUrl(streamVideoId, streamQueryMeta);
        graph.trackIds[nextDeckIdx] = rawVideoId;
        usePlayerStore.getState().setActiveStreamMeta(metaToReport);
        streamMetaFetchTarget = null;
      }

      if (!urlToLoad || cancelled) return;

      audio.crossOrigin = urlToLoad.startsWith('blob:') ? null : 'anonymous';
      audio.src = urlToLoad;
      audio.playbackRate = usePlayerStore.getState().playbackRate;

      const storeState = usePlayerStore.getState();
      const targetSeek = storeState.pendingSeekSeconds ?? storeState.currentTime ?? 0;
      let hasLoadedMeta = false;

      const handleLoadedMeta = () => {
        if (cancelled) return;
        hasLoadedMeta = true;
        clearStallTimer();
        if (targetSeek > 0 && Number.isFinite(audio.duration) && targetSeek < audio.duration) {
          audio.currentTime = targetSeek;
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
                sourceMode: latestDirect ? 'direct' : 'webaudio',
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
          void resumeAudioContext();
          startSilentKeepaliveAudio();
          void audio.play().then(() => {
            if (document.visibilityState === 'hidden') {
              window.setTimeout(() => {
                if (document.visibilityState !== 'hidden') return;
                const latest = usePlayerStore.getState();
                const g = ensureAudioGraph();
                if (!latest.isPlaying || !g || g.backgroundDirectActive) return;
                if (g.ctx.state !== 'running') {
                  const effectiveVol = isLocalTrack(latest.currentTrack)
                    ? latest.volume
                    : clampYoutubeVolume(
                        latest.volume,
                        useSettingsStore.getState().youtubeSound.maxVolumeLimit,
                        latest.isMuted,
                      );
                  void engageBackgroundDirectDeck(effectiveVol, latest.isMuted);
                }
              }, 250);
            }
          }).catch((err: unknown) => {
            if (!cancelled && err instanceof DOMException && err.name === 'NotAllowedError') {
              const latest = usePlayerStore.getState();
              latest.setIsPlaying(false);
              latest.setAutoplayBlockedPendingResume(true);
              latest.setIsBuffering(false);
              stopSilentKeepaliveAudio();
            }
          });
        }
      };

      const handlePlaying = () => {
        if (cancelled) return;
        clearStallTimer();
        usePlayerStore.getState().setIsBuffering(false);
        usePlayerStore.getState().setPlayerError(null);
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

      const handleMediaError = () => {
        if (cancelled) return;
        clearStallTimer();
        if (!localActive && !useOfflineBlob && rawVideoId && currentTrack && !fallbackAttemptedRef.current) {
          fallbackAttemptedRef.current = true;
          usePlayerStore.getState().setIsBuffering(true);
          const queryArtist = formatArtists(currentTrack.artists);
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
                audio.pause();
                audio.removeAttribute('src');
                usePlayerStore
                  .getState()
                  .setActiveStreamMeta(
                    buildYoutubeIframeStreamMeta(rawVideoId, altId, targetStreamTier),
                  );
                return;
              }
              const altUrl = buildStreamAudioUrl(altId, altQueryMeta);
              audio.crossOrigin = 'anonymous';
              audio.src = altUrl;
              audio.load();
            })
            .catch(() => {
              if (cancelled) return;
              audio.pause();
              audio.removeAttribute('src');
              usePlayerStore
                .getState()
                .setActiveStreamMeta(
                  buildYoutubeIframeStreamMeta(rawVideoId, rawVideoId, targetStreamTier),
                );
            });
          return;
        }
        usePlayerStore.getState().setIsBuffering(false);
        usePlayerStore.getState().setIsPlaying(false);
        usePlayerStore
          .getState()
          .setPlayerError(
            localActive
              ? 'File audio lokal gagal diputar.'
              : 'Aliran audio belum tersedia untuk lagu ini.',
          );
      };

      audio.addEventListener('loadedmetadata', handleLoadedMeta, { once: true });
      audio.addEventListener('playing', handlePlaying);
      audio.addEventListener('canplay', handlePlaying);
      audio.addEventListener('waiting', handleWaiting);
      audio.addEventListener('error', handleMediaError);

      detachListeners = () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMeta);
        audio.removeEventListener('playing', handlePlaying);
        audio.removeEventListener('canplay', handlePlaying);
        audio.removeEventListener('waiting', handleWaiting);
        audio.removeEventListener('error', handleMediaError);
      };

      audio.load();
    };

    void loadSource();

    return () => {
      cancelled = true;
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
    localProfile.directMode,
  ]);

  // Sync Play / Pause with smooth fade in/out when fadeOnPlayPause is enabled
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph || !htmlAudioTrackKey) return;
    if (isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) return;

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    const activeAudio = getActivePlaybackElement(graph);
    const activeGain = graph.deckGains[graph.activeDeck].gain;
    const profile = useSettingsStore.getState().localProfile;
    const ytFade = useSettingsStore.getState().youtubeSound.fadeOnPauseResume;
    const useFade =
      (profile.fadeOnPlayPause || ytFade) && !profile.directMode && !graph.backgroundDirectActive;
    const now = graph.ctx.currentTime;

    if (isPlaying) {
      void resumeAudioContext();
      startSilentKeepaliveAudio();
      if (activeAudio.src) {
        activeGain.cancelScheduledValues(now);
        if (useFade) {
          activeGain.setValueAtTime(0.02, now);
          activeGain.linearRampToValueAtTime(1, now + 0.18);
        } else {
          activeGain.setValueAtTime(1, now);
        }
        if (activeAudio.paused) {
          void activeAudio.play().catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
              const st = usePlayerStore.getState();
              st.setIsPlaying(false);
              st.setAutoplayBlockedPendingResume(true);
              stopSilentKeepaliveAudio();
            }
          });
        }
      }
    } else if (!activeAudio.paused) {
      stopSilentKeepaliveAudio();
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
    } else {
      stopSilentKeepaliveAudio();
    }
  }, [isPlaying, htmlAudioTrackKey, activeStreamSourceMode]);

  // Explicit Seek
  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!htmlAudioTrackKey || pendingSeekSeconds === null || !graph) return;
    if (isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) return;

    const activeAudio = getActivePlaybackElement(graph);
    if (Number.isFinite(activeAudio.duration) && activeAudio.duration > 0) {
      activeAudio.currentTime = Math.max(0, Math.min(pendingSeekSeconds, activeAudio.duration));
      usePlayerStore.getState().clearPendingSeek();
    }
  }, [seekVersion, pendingSeekSeconds, htmlAudioTrackKey]);

  // Progress polling, crossfade (0-12s), gapless preloading, dynamic LUFS, skip silence, sleep timer fade
  useEffect(() => {
    if (!htmlAudioTrackKey || !isPlaying || activeStreamSourceMode === 'youtube-iframe') return;
    const graph = ensureAudioGraph();
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
      const standbyIdx: 0 | 1 = graph.activeDeck === 0 ? 1 : 0;
      if (graph.trackIds[standbyIdx] === nextInfo.key) return;

      if (nextInfo.isLocal) {
        const record =
          useLibraryStore.getState().localFiles.find((f) => f.id === nextInfo.key) ||
          (await db.localFiles.get(nextInfo.key));
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
          standby.playbackRate = usePlayerStore.getState().playbackRate;
          standby.load();
          return;
        }
        const streamQueryMeta = {
          title: nextInfo.track.title,
          artist: formatArtists(nextInfo.track.artists),
          durationSeconds: nextInfo.track.durationSeconds,
          quality: targetStreamTier,
        };
        const probe = await fetchStreamAudioMeta(nextInfo.key, streamQueryMeta).catch(() => null);
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
        standby.playbackRate = usePlayerStore.getState().playbackRate;
        standby.load();
      }
    };

    const interval = window.setInterval(() => {
      const activeIdx = graph.activeDeck;
      const standbyIdx: 0 | 1 = activeIdx === 0 ? 1 : 0;
      const audio = getActivePlaybackElement(graph);
      if (!audio.src) return;

      const cur = audio.currentTime;
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const store = usePlayerStore.getState();
      const settingsState = useSettingsStore.getState();
      const profile = settingsState.localProfile;
      const ytSound = settingsState.youtubeSound;

      if (Number.isFinite(cur)) {
        store.setProgress(cur, dur > 0 ? dur : undefined);
      }

      if (
        'mediaSession' in navigator &&
        'setPositionState' in navigator.mediaSession &&
        dur > 0 &&
        Number.isFinite(cur)
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: store.playbackRate,
            position: Math.min(cur, dur),
          });
        } catch {
          // Ignore
        }
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
      const nextInfo = store.repeat !== 'one' ? resolveStandbyInfo(upcoming) : null;
      const effectiveCrossfade = resolveEffectiveCrossfadeSeconds(profile);

      if (transitionInProgressRef.current && effectiveCrossfade <= 0) {
        transitionInProgressRef.current = false;
        graph.decks[standbyIdx].pause();
        graph.deckGains[standbyIdx].gain.setTargetAtTime(0, graph.ctx.currentTime, 0.03);
        graph.deckGains[activeIdx].gain.setTargetAtTime(1, graph.ctx.currentTime, 0.03);
      }

      if (
        nextInfo &&
        !profile.directMode &&
        dur > 0 &&
        dur - cur <= Math.max(8, effectiveCrossfade + 3)
      ) {
        void preloadStandbyTrack(nextInfo);
      }

      if (
        !profile.directMode &&
        nextInfo &&
        effectiveCrossfade > 0 &&
        dur > effectiveCrossfade * 1.5 &&
        dur - cur <= effectiveCrossfade &&
        dur - cur > 0.05
      ) {
        const standbyAudio = graph.decks[standbyIdx];
        if (graph.trackIds[standbyIdx] === nextInfo.key) {
          if (!transitionInProgressRef.current && standbyAudio.readyState >= 2) {
            transitionInProgressRef.current = true;
            graph.deckGains[standbyIdx].gain.setValueAtTime(0, graph.ctx.currentTime);
            standbyAudio.currentTime = 0;
            void standbyAudio.play().catch(() => {});
          }
          if (transitionInProgressRef.current) {
            const progress = 1 - Math.max(0, (dur - cur) / effectiveCrossfade);
            const { outGain, inGain } = computeEqualPowerCrossfade(progress);
            graph.deckGains[activeIdx].gain.setTargetAtTime(outGain, graph.ctx.currentTime, 0.04);
            graph.deckGains[standbyIdx].gain.setTargetAtTime(inGain, graph.ctx.currentTime, 0.04);
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
          graph.masterGain.gain.setTargetAtTime(baseVol * fadeFactor, graph.ctx.currentTime, 0.05);
        }
      }

      if (dur > 0 && (audio.ended || dur - cur <= 0.06)) {
        advanceOnTrackEnd.current();
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [htmlAudioTrackKey, isPlaying, manualQueue, sourceQueue, localActive, targetStreamTier, activeStreamSourceMode]);

  return null;
}
