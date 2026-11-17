import { useEffect, useRef } from 'react';
import { resolvePlayableYoutube } from '../api/client';
import {
  isCapacitorAndroidPlatform,
  isCapacitorNativeStreamActive,
  pauseCapacitorNativeStream,
  resumeCapacitorNativeStream,
  seekCapacitorNativeStream,
  stopCapacitorNativeStream,
  syncCapacitorPlaybackNotification,
} from '../audio/capacitorAudioBridge';
import {
  registerMediaSessionHandlers,
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
  syncMediaSessionPosition,
} from '../audio/mediaSessionService';
import {
  ensurePlaybackAudioSession,
  getActivePlaybackElement,
  getSharedAudioGraphIfExists,
  getStandaloneDirectDeck,
  pauseAudioElementProgrammatically,
  resumeAudioContext,
  startSilentKeepaliveAudio,
  stopSilentKeepaliveAudio,
  unlockPlaybackOnUserGesture,
} from '../audio/soundclearAudioEngine';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { clampYoutubeVolume } from '../utils/audioMath';
import {
  clampSeekTarget,
  getRealDocumentVisibilityState,
  isMobileAudioEnvironment,
  isUserPaused,
  setUserPaused,
  shouldRunSilentKeepalive,
  shouldTreatYoutubeAsAutoplayBlocked,
  subscribeRealVisibilityChange,
} from '../utils/backgroundAudioLogic';
import { resolveEffectiveMediaSessionPlaybackState } from '../utils/mediaSessionLogic';
import {
  formatArtists,
  getPlayableVideoId,
  getTrackUniqueId,
  isLocalTrack,
} from '../utils/playerLogic';
import {
  isYoutubeIframeActive,
  pickNextYoutubeFallbackCandidate,
} from '../utils/streamPlaybackLogic';

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface YTPlayerInstance {
  loadVideoById: (opts: { videoId: string; startSeconds?: number } | string) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number } | string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayerInstance }) => void;
        onStateChange?: (event: { target: YTPlayerInstance; data: number }) => void;
        onError?: (event: { target: YTPlayerInstance; data: number }) => void;
      };
    },
  ) => YTPlayerInstance;
  PlayerState?: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube IFrame API load timeout'));
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {
          // Ignore prior handler errors
        }
      }
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        ytApiPromise = null;
        reject(new Error('YouTube IFrame API failed to initialize'));
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]',
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API script'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

export function YouTubePlayerBridge() {
  const hydrated = usePlayerStore((s) => s.hydrated);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const seekVersion = usePlayerStore((s) => s.seekVersion);
  const pendingSeekSeconds = usePlayerStore((s) => s.pendingSeekSeconds);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const maxVolumeLimit = useSettingsStore((s) => s.youtubeSound.maxVolumeLimit);

  const iframeHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const playerReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const trackSessionKeyRef = useRef<string | null>(null);
  const attemptedVideoIdsRef = useRef<Set<string>>(new Set());
  const fallbackCountRef = useRef(0);
  const desiredVideoIdRef = useRef<string | null>(null);
  const handleYtErrorRef = useRef<() => void>(() => {});
  const handleYtStateChangeRef = useRef<(event: { target: YTPlayerInstance; data: number }) => void>(() => {});
  const ytActuallyPlayingRef = useRef(false);
  const ytEverPlayedForTrackRef = useRef(false);
  const ytPlayRequestedAtRef = useRef(0);
  const ytPauseVerifyTimerRef = useRef<number | null>(null);

  const localActive = isLocalTrack(currentTrack);
  const iframeActive =
    hydrated && Boolean(currentTrack) && !localActive && isYoutubeIframeActive(activeStreamMeta);
  const rawVideoId = currentTrack ? getPlayableVideoId(currentTrack) : null;
  const targetVideoId = iframeActive
    ? activeStreamMeta?.resolvedVideoId || rawVideoId
    : null;
  const trackSessionKey = getTrackUniqueId(currentTrack);

  // Monitor navigator.connection for Auto-Adjust Quality telemetry
  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformationLike };
    const conn = nav.connection;
    if (!conn) {
      usePlayerStore.getState().setNetworkEffectiveType(null);
      return;
    }
    const updateConn = () => {
      usePlayerStore.getState().setNetworkEffectiveType(conn.effectiveType || null);
    };
    updateConn();
    conn.addEventListener?.('change', updateConn);
    return () => {
      conn.removeEventListener?.('change', updateConn);
    };
  }, []);

  // Register Media Session transport action handlers directly bound to active engine + store
  useEffect(() => {
    const getLiveHtmlAudio = (): HTMLAudioElement | null => {
      const g = getSharedAudioGraphIfExists();
      if (g) return getActivePlaybackElement(g);
      return getStandaloneDirectDeck();
    };

    const applySeekImmediate = (rawTarget: number) => {
      const st = usePlayerStore.getState();
      const dur = st.duration > 0 ? st.duration : null;
      const target = clampSeekTarget(rawTarget, dur);
      st.requestSeek(target);

      if (isCapacitorNativeStreamActive()) {
        void seekCapacitorNativeStream(target);
        st.clearPendingSeek();
      } else if (isYoutubeIframeActive(st.activeStreamMeta) && playerRef.current && playerReadyRef.current) {
        try {
          playerRef.current.seekTo(target, true);
          st.clearPendingSeek();
        } catch {
          // Will apply via seek effect
        }
      } else {
        const el = getLiveHtmlAudio();
        if (el && el.src && Number.isFinite(el.duration) && el.duration > 0) {
          try {
            el.currentTime = clampSeekTarget(target, el.duration);
            st.clearPendingSeek();
          } catch {
            // Will apply via seek effect
          }
        }
      }
      syncMediaSessionPosition({
        duration: dur ?? 0,
        currentTime: target,
        playbackRate: st.playbackRate || 1,
      });
    };

    const unregisterHandlers = registerMediaSessionHandlers({
      onPlay: () => {
        const st = usePlayerStore.getState();
        if (!st.currentTrack) return;
        setUserPaused(false);
        unlockPlaybackOnUserGesture();
        void resumeAudioContext();
        st.setIsPlaying(true);
        if (isCapacitorNativeStreamActive()) {
          void resumeCapacitorNativeStream();
        } else if (isYoutubeIframeActive(st.activeStreamMeta)) {
          ytPlayRequestedAtRef.current = Date.now();
          if (playerRef.current && playerReadyRef.current) {
            try {
              playerRef.current.playVideo();
            } catch {
              // Handled via effect
            }
          }
        } else {
          const el = getLiveHtmlAudio();
          if (el && el.src && el.paused && el.dataset.scPriming !== '1') {
            void el.play().catch((err: unknown) => {
              if (err instanceof DOMException && err.name === 'NotAllowedError') {
                const latest = usePlayerStore.getState();
                latest.setIsPlaying(false, { userInitiated: false });
                latest.setAutoplayBlockedPendingResume(true);
                syncMediaSessionPlaybackState('paused');
              }
            });
          }
        }
      },
      onPause: () => {
        const st = usePlayerStore.getState();
        setUserPaused(true);
        stopSilentKeepaliveAudio(true);
        ytActuallyPlayingRef.current = false;
        if (isCapacitorNativeStreamActive()) {
          void pauseCapacitorNativeStream();
        } else if (isYoutubeIframeActive(st.activeStreamMeta)) {
          if (playerRef.current && playerReadyRef.current) {
            try {
              playerRef.current.pauseVideo();
            } catch {
              // Ignore
            }
          }
        } else {
          const el = getLiveHtmlAudio();
          if (el && !el.paused) {
            pauseAudioElementProgrammatically(el);
          }
        }
        st.setIsPlaying(false);
        syncMediaSessionPlaybackState('paused');
      },
      onStop: () => {
        const st = usePlayerStore.getState();
        setUserPaused(true);
        stopSilentKeepaliveAudio(true);
        ytActuallyPlayingRef.current = false;
        if (isCapacitorNativeStreamActive()) {
          void stopCapacitorNativeStream();
        } else if (isYoutubeIframeActive(st.activeStreamMeta)) {
          if (playerRef.current && playerReadyRef.current) {
            try {
              playerRef.current.stopVideo();
            } catch {
              // Ignore
            }
          }
        } else {
          const el = getLiveHtmlAudio();
          if (el) {
            pauseAudioElementProgrammatically(el);
            try {
              el.currentTime = 0;
            } catch {
              // Ignore
            }
          }
        }
        st.stopPlayback();
        syncMediaSessionPlaybackState('none');
      },
      onPreviousTrack: () => usePlayerStore.getState().prevTrack(),
      onNextTrack: () => usePlayerStore.getState().nextTrack(),
      onSeekTo: (seekTime) => applySeekImmediate(seekTime),
      onSeekBackward: (seekOffset) => {
        const st = usePlayerStore.getState();
        const step = typeof seekOffset === 'number' ? seekOffset : 10;
        applySeekImmediate(Math.max(0, st.currentTime - step));
      },
      onSeekForward: (seekOffset) => {
        const st = usePlayerStore.getState();
        const step = typeof seekOffset === 'number' ? seekOffset : 10;
        const max = st.duration > 0 ? st.duration : st.currentTime + step;
        applySeekImmediate(Math.min(max, st.currentTime + step));
      },
    });

    const unsubscribeVis = subscribeRealVisibilityChange(() => {
      const st = usePlayerStore.getState();
      syncMediaSessionPosition({
        duration: st.duration,
        currentTime: st.currentTime,
        playbackRate: st.playbackRate || 1,
      });
    });
    return () => {
      unregisterHandlers();
      unsubscribeVis();
    };
  }, []);

  // Update Media Session metadata & truthful playbackState (never claim 'playing' without real audio)
  useEffect(() => {
    if (!currentTrack) {
      syncMediaSessionMetadata(null);
      return;
    }

    ensurePlaybackAudioSession();
    syncMediaSessionMetadata(currentTrack);

    const st = usePlayerStore.getState();
    const isYt = isYoutubeIframeActive(st.activeStreamMeta);
    const graph = getSharedAudioGraphIfExists();
    const htmlEl = graph ? getActivePlaybackElement(graph) : getStandaloneDirectDeck();
    const htmlAudioPlaying = Boolean(
      htmlEl &&
        htmlEl.src &&
        htmlEl.dataset.scPriming !== '1' &&
        !htmlEl.paused &&
        !htmlEl.ended &&
        htmlEl.readyState >= 2,
    );
    const audioContextRunningOrDirect = Boolean(
      !graph || graph.backgroundDirectActive || graph.ctx.state === 'running',
    );
    const effectiveState = resolveEffectiveMediaSessionPlaybackState({
      hasTrack: Boolean(currentTrack),
      storeIsPlaying: isPlaying,
      isYoutubeIframe: isYt,
      youtubePlayerState: isYt && ytActuallyPlayingRef.current ? 1 : null,
      htmlAudioPlaying,
      audioContextRunningOrDirect,
    });
    syncMediaSessionPlaybackState(effectiveState);

    syncMediaSessionPosition({
      duration: st.duration,
      currentTime: st.currentTime,
      playbackRate: st.playbackRate || 1,
    });
  }, [currentTrack, isPlaying, activeStreamMeta?.sourceMode]);

  // Pre-warm YouTube IFrame API & standby hidden player immediately on mount for 0ms fallback startup
  useEffect(() => {
    let disposed = false;
    const handlePlayerStateChange = (event: { target: YTPlayerInstance; data: number }) => {
      const st = usePlayerStore.getState();
      if (!isYoutubeIframeActive(st.activeStreamMeta)) {
        if (event.data === 1 || event.data === 3) {
          try {
            event.target.stopVideo();
          } catch {
            // Ignore
          }
        }
        return;
      }

      if (ytPauseVerifyTimerRef.current !== null) {
        window.clearTimeout(ytPauseVerifyTimerRef.current);
        ytPauseVerifyTimerRef.current = null;
      }

      const stateCode = event.data;
      if (stateCode === 1) {
        // PLAYING
        ytActuallyPlayingRef.current = true;
        ytEverPlayedForTrackRef.current = true;
        st.setIsBuffering(false);
        st.setPlayerError(null);
        st.setAutoplayBlockedPendingResume(false);
        st.clearPendingSeek();

        const cap = useSettingsStore.getState().youtubeSound.maxVolumeLimit;
        const effVol = clampYoutubeVolume(st.volume, cap, st.isMuted);
        try {
          event.target.setVolume(effVol);
          if (st.isMuted || effVol === 0) event.target.mute();
          else event.target.unMute();
        } catch {
          // Ignore
        }

        const dur = event.target.getDuration?.() ?? 0;
        const cur = event.target.getCurrentTime?.() ?? st.currentTime;
        if (Number.isFinite(cur)) {
          st.setProgress(cur, dur > 0 ? dur : undefined);
        }
        if (!st.isPlaying) {
          ytActuallyPlayingRef.current = false;
          stopSilentKeepaliveAudio();
          syncMediaSessionPlaybackState('paused');
          try {
            event.target.pauseVideo();
          } catch {
            // Ignore
          }
        } else {
          if (st.currentTrack) {
            syncMediaSessionMetadata(st.currentTrack);
          }
          syncMediaSessionPlaybackState('playing');
          syncMediaSessionPosition({
            duration: dur > 0 ? dur : st.duration,
            currentTime: Number.isFinite(cur) ? cur : st.currentTime,
            playbackRate: st.playbackRate || 1,
          });
          syncCapacitorPlaybackNotification({
            track: st.currentTrack,
            isPlaying: true,
            duration: dur > 0 ? dur : st.duration,
            currentTime: Number.isFinite(cur) ? cur : st.currentTime,
            playbackRate: st.playbackRate || 1,
            force: true,
          });
          if (
            shouldRunSilentKeepalive({
              isPlaying: true,
              isYoutubeIframe: true,
              youtubeActuallyPlaying: true,
              isAudioLoading: false,
              contextSuspended: false,
              hasPlayingHtmlAudio: false,
            }) &&
            (getRealDocumentVisibilityState() === 'hidden' || isMobileAudioEnvironment())
          ) {
            startSilentKeepaliveAudio();
          }
        }
      } else if (stateCode === 3) {
        // BUFFERING
        ytActuallyPlayingRef.current = false;
        st.setIsBuffering(true);
        syncMediaSessionPlaybackState('paused');
      } else if (stateCode === 2) {
        // PAUSED
        ytActuallyPlayingRef.current = false;
        st.setIsBuffering(false);
        if (!st.isPlaying || isUserPaused()) {
          stopSilentKeepaliveAudio(true);
          syncMediaSessionPlaybackState('paused');
        }
        syncCapacitorPlaybackNotification({
          track: st.currentTrack,
          isPlaying: false,
          duration: st.duration,
          currentTime: st.currentTime,
          playbackRate: st.playbackRate || 1,
          force: true,
        });

        if (st.isPlaying && !isUserPaused()) {
          const retryDelayMs = 300;
          ytPauseVerifyTimerRef.current = window.setTimeout(() => {
            ytPauseVerifyTimerRef.current = null;
            const midState = usePlayerStore.getState();
            if (!midState.isPlaying || isUserPaused() || !isYoutubeIframeActive(midState.activeStreamMeta)) {
              return;
            }
            try {
              event.target.playVideo();
            } catch {
              // Ignore transient resume error
            }
            ytPauseVerifyTimerRef.current = window.setTimeout(() => {
              ytPauseVerifyTimerRef.current = null;
              const latest = usePlayerStore.getState();
              if (!latest.isPlaying || isUserPaused() || !isYoutubeIframeActive(latest.activeStreamMeta)) {
                return;
              }
              const checkState = event.target.getPlayerState?.();
              const realVis = getRealDocumentVisibilityState();
              if (checkState !== 1 && checkState !== 3 && realVis === 'visible') {
                const blocked = shouldTreatYoutubeAsAutoplayBlocked({
                  isPlaying: latest.isPlaying,
                  isYoutubeIframe: true,
                  visibilityState: realVis,
                  playerState: typeof checkState === 'number' ? checkState : 2,
                  elapsedSincePlayRequestMs: Date.now() - ytPlayRequestedAtRef.current,
                  wasEverPlayingForTrack: ytEverPlayedForTrackRef.current,
                });
                if (blocked) {
                  ytActuallyPlayingRef.current = false;
                  stopSilentKeepaliveAudio(true);
                  latest.setIsPlaying(false, { userInitiated: false });
                  if (!isCapacitorAndroidPlatform()) {
                    latest.setAutoplayBlockedPendingResume(true);
                  }
                  syncMediaSessionPlaybackState('paused');
                }
              }
            }, 700);
          }, retryDelayMs);
        }
      } else if (stateCode === 0) {
        // ENDED
        ytActuallyPlayingRef.current = false;
        stopSilentKeepaliveAudio();
        st.handleTrackEnded();
      } else if (stateCode === 5 || stateCode === -1) {
        ytActuallyPlayingRef.current = false;
        syncMediaSessionPlaybackState('paused');
      }
    };
    handleYtStateChangeRef.current = handlePlayerStateChange;

    const warmStandby = async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (disposed || playerRef.current || !iframeHostRef.current) return;
        iframeHostRef.current.innerHTML = '';
        const mountNode = document.createElement('div');
        iframeHostRef.current.appendChild(mountNode);

        const safeOrigin =
          typeof window !== 'undefined' && /^https?:\/\//i.test(window.location.origin)
            ? window.location.origin
            : undefined;

        const instance = new YT.Player(mountNode, {
          width: 200,
          height: 112,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            ...(safeOrigin ? { origin: safeOrigin } : {}),
          },
          events: {
            onReady: (event) => {
              playerReadyRef.current = true;
              const p = event.target;
              const pendingVid = desiredVideoIdRef.current;
              const st = usePlayerStore.getState();
              if (pendingVid && isYoutubeIframeActive(st.activeStreamMeta)) {
                const cap = useSettingsStore.getState().youtubeSound.maxVolumeLimit;
                const effVol = clampYoutubeVolume(st.volume, cap, st.isMuted);
                try {
                  p.setVolume(effVol);
                  if (st.isMuted || effVol === 0) p.mute();
                  else p.unMute();
                  p.setPlaybackRate(st.playbackRate || 1);
                  loadedVideoIdRef.current = pendingVid;
                  const startSeconds = Math.max(0, st.pendingSeekSeconds ?? st.currentTime ?? 0);
                  if (st.isPlaying) {
                    ytPlayRequestedAtRef.current = Date.now();
                    p.loadVideoById({ videoId: pendingVid, startSeconds });
                  } else {
                    p.cueVideoById({ videoId: pendingVid, startSeconds });
                  }
                } catch {
                  // Ignore standby handoff errors
                }
              }
            },
            onStateChange: handlePlayerStateChange,
            onError: () => {
              if (isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) {
                ytActuallyPlayingRef.current = false;
                stopSilentKeepaliveAudio();
                handleYtErrorRef.current();
              }
            },
          },
        });
        playerRef.current = instance;
        const createdIframe = iframeHostRef.current?.querySelector('iframe');
        if (createdIframe) {
          createdIframe.setAttribute('allow', 'autoplay; encrypted-media');
        }
      } catch {
        // Non-fatal: fallback creation happens on demand if blocked offline
      }
    };
    void warmStandby();
    return () => {
      disposed = true;
      if (ytPauseVerifyTimerRef.current !== null) {
        window.clearTimeout(ytPauseVerifyTimerRef.current);
        ytPauseVerifyTimerRef.current = null;
      }
    };
  }, []);

  // Keep keepalive off unless YouTube IFrame is genuinely in PLAYING state in background/mobile
  useEffect(() => {
    if (!iframeActive || !isPlaying) {
      ytActuallyPlayingRef.current = false;
      if (iframeActive) {
        stopSilentKeepaliveAudio();
      }
    }
    return () => {
      if (iframeActive) {
        stopSilentKeepaliveAudio();
      }
    };
  }, [iframeActive, isPlaying]);

  useEffect(() => {
    if (typeof document === 'undefined' || !isPlaying) return;
    let wakeSentinel: { release: () => Promise<void> } | null = null;
    let disposed = false;

    const acquireWakeLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock && getRealDocumentVisibilityState() === 'visible') {
          const lock = await nav.wakeLock.request('screen');
          if (disposed) {
            void lock.release().catch(() => {});
          } else {
            wakeSentinel = lock;
          }
        }
      } catch {
        // WakeLock optional across browsers
      }
    };

    const recoverTimers: number[] = [];

    const checkAndRecoverYt = () => {
      const st = usePlayerStore.getState();
      if (
        st.isPlaying &&
        !isUserPaused() &&
        isYoutubeIframeActive(st.activeStreamMeta) &&
        playerRef.current &&
        playerReadyRef.current
      ) {
        ensurePlaybackAudioSession();
        try {
          const pState = playerRef.current.getPlayerState?.();
          if (pState === 1) {
            if (getRealDocumentVisibilityState() === 'hidden' || isMobileAudioEnvironment()) {
              startSilentKeepaliveAudio();
            }
            if (st.currentTrack) {
              syncMediaSessionMetadata(st.currentTrack);
              syncMediaSessionPlaybackState('playing');
            }
          } else if (pState !== 3) {
            playerRef.current.playVideo();
          }
        } catch {
          // Ignore YT state recovery error
        }
      }
    };

    const onVisibilityRecover = (vis: string) => {
      if (vis === 'visible') {
        void acquireWakeLock();
      }
      recoverTimers.forEach((id) => window.clearTimeout(id));
      recoverTimers.length = 0;

      checkAndRecoverYt();
      if (vis === 'hidden') {
        recoverTimers.push(window.setTimeout(checkAndRecoverYt, 300));
        recoverTimers.push(window.setTimeout(checkAndRecoverYt, 850));
      }
    };

    void acquireWakeLock();
    const unsubscribeVis = subscribeRealVisibilityChange((vis) => {
      onVisibilityRecover(vis);
    });
    return () => {
      disposed = true;
      recoverTimers.forEach((id) => window.clearTimeout(id));
      unsubscribeVis();
      if (wakeSentinel) {
        void wakeSentinel.release().catch(() => {});
        wakeSentinel = null;
      }
    };
  }, [isPlaying]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const state = usePlayerStore.getState();

      if (e.code === 'Space') {
        if (state.currentTrack) {
          e.preventDefault();
          state.togglePlayPause();
        }
      } else if (e.shiftKey && e.code === 'ArrowRight') {
        e.preventDefault();
        state.nextTrack();
      } else if (e.shiftKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        state.prevTrack();
      } else if (e.code === 'ArrowRight' && state.currentTrack) {
        e.preventDefault();
        const max = state.duration > 0 ? state.duration : 9999;
        state.requestSeek(Math.min(max, state.currentTime + 5));
      } else if (e.code === 'ArrowLeft' && state.currentTrack) {
        e.preventDefault();
        state.requestSeek(Math.max(0, state.currentTime - 5));
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        state.toggleMute();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        state.toggleShuffle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        state.cycleRepeat();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (state.karaokeOpen) {
          state.setKaraokeOpen(false);
        } else if (state.rightPanelOpen && state.rightPanelTab === 'lyrics') {
          state.setKaraokeOpen(true);
        } else {
          state.setRightPanelTab('lyrics');
        }
      } else if (e.key === '?') {
        e.preventDefault();
        useNavigationStore.getState().navigate({ name: 'shortcuts' });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Load / switch video in hidden YouTube IFrame player when youtube-iframe fallback is active
  useEffect(() => {
    if (!iframeActive || !targetVideoId) {
      desiredVideoIdRef.current = null;
      loadedVideoIdRef.current = null;
      ytActuallyPlayingRef.current = false;
      ytEverPlayedForTrackRef.current = false;
      ytPlayRequestedAtRef.current = 0;
      if (playerRef.current && playerReadyRef.current) {
        try {
          playerRef.current.stopVideo();
        } catch {
          // Ignore stop errors
        }
      }
      return;
    }

    let cancelled = false;
    if (trackSessionKeyRef.current !== trackSessionKey) {
      trackSessionKeyRef.current = trackSessionKey;
      attemptedVideoIdsRef.current = new Set([targetVideoId]);
      fallbackCountRef.current = 0;
      ytEverPlayedForTrackRef.current = false;
      ytPlayRequestedAtRef.current = usePlayerStore.getState().isPlaying ? Date.now() : 0;
    } else {
      attemptedVideoIdsRef.current.add(targetVideoId);
    }
    ytActuallyPlayingRef.current = false;
    desiredVideoIdRef.current = targetVideoId;

    const syncPlayerConfig = (player: YTPlayerInstance) => {
      const st = usePlayerStore.getState();
      const cap = useSettingsStore.getState().youtubeSound.maxVolumeLimit;
      const effVol = clampYoutubeVolume(st.volume, cap, st.isMuted);
      try {
        player.setVolume(effVol);
        if (st.isMuted || effVol === 0) {
          player.mute();
        } else {
          player.unMute();
        }
        player.setPlaybackRate(st.playbackRate || 1);
      } catch {
        // Ignore transient config errors
      }
    };

    const loadTargetInPlayer = (player: YTPlayerInstance, vid: string) => {
      if (loadedVideoIdRef.current === vid) return;
      loadedVideoIdRef.current = vid;
      ytActuallyPlayingRef.current = false;
      const st = usePlayerStore.getState();
      const startSeconds = Math.max(0, st.pendingSeekSeconds ?? st.currentTime ?? 0);
      syncPlayerConfig(player);
      try {
        if (st.isPlaying) {
          ytPlayRequestedAtRef.current = Date.now();
          player.loadVideoById({ videoId: vid, startSeconds });
        } else {
          player.cueVideoById({ videoId: vid, startSeconds });
        }
      } catch {
        // Ignore transient load error
      }
    };

    const handleYtPlayerError = async () => {
      if (cancelled) return;
      ytActuallyPlayingRef.current = false;
      stopSilentKeepaliveAudio();
      syncMediaSessionPlaybackState('paused');
      const st = usePlayerStore.getState();
      const activeTrack = st.currentTrack;
      const activeMeta = st.activeStreamMeta;
      const origVid = getPlayableVideoId(activeTrack);
      if (!activeTrack || !origVid || !isYoutubeIframeActive(activeMeta)) {
        return;
      }

      if (fallbackCountRef.current >= 3) {
        st.setIsBuffering(false);
        st.setIsPlaying(false, { userInitiated: false });
        st.setPlayerError(
          'Pemutar cloud tidak mengizinkan pemutaran untuk lagu ini di sesi saat ini.',
        );
        return;
      }

      fallbackCountRef.current += 1;
      st.setIsBuffering(true);
      try {
        const excludeList = Array.from(attemptedVideoIdsRef.current);
        const resolved = await resolvePlayableYoutube(origVid, {
          title: activeTrack.title,
          artist: formatArtists(activeTrack.artists),
          type: activeTrack.type,
          durationSeconds: activeTrack.durationSeconds,
          fallback: true,
          exclude: excludeList,
        });
        if (cancelled) return;
        const nextCand = pickNextYoutubeFallbackCandidate(
          attemptedVideoIdsRef.current,
          resolved.candidates,
        );
        if (!nextCand) {
          throw new Error('Tidak ada kandidat alternatif');
        }
        attemptedVideoIdsRef.current.add(nextCand);
        desiredVideoIdRef.current = nextCand;
        const latestMeta = usePlayerStore.getState().activeStreamMeta;
        if (latestMeta && isYoutubeIframeActive(latestMeta)) {
          usePlayerStore.getState().setActiveStreamMeta({
            ...latestMeta,
            resolvedVideoId: nextCand,
          });
        }
        if (playerRef.current && playerReadyRef.current) {
          loadTargetInPlayer(playerRef.current, nextCand);
        }
      } catch {
        if (cancelled) return;
        const latest = usePlayerStore.getState();
        latest.setIsBuffering(false);
        latest.setIsPlaying(false, { userInitiated: false });
        syncMediaSessionPlaybackState('paused');
        latest.setPlayerError(
          'Pemutar cloud tidak mengizinkan pemutaran untuk lagu ini di sesi saat ini.',
        );
      }
    };

    handleYtErrorRef.current = () => {
      void handleYtPlayerError();
    };

    const ensurePlayer = async () => {
      if (playerRef.current) {
        if (playerReadyRef.current) {
          loadTargetInPlayer(playerRef.current, targetVideoId);
        }
        return;
      }

      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled || !iframeHostRef.current) return;

        iframeHostRef.current.innerHTML = '';
        const mountNode = document.createElement('div');
        iframeHostRef.current.appendChild(mountNode);

        const initialState = usePlayerStore.getState();
        const startAt = Math.max(
          0,
          Math.floor(initialState.pendingSeekSeconds ?? initialState.currentTime ?? 0),
        );
        const safeOrigin =
          typeof window !== 'undefined' && /^https?:\/\//i.test(window.location.origin)
            ? window.location.origin
            : undefined;

        const instance = new YT.Player(mountNode, {
          width: 200,
          height: 112,
          videoId: targetVideoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            start: startAt,
            ...(safeOrigin ? { origin: safeOrigin } : {}),
          },
          events: {
            onReady: (event) => {
              playerReadyRef.current = true;
              const p = event.target;
              syncPlayerConfig(p);
              if (!isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) {
                try {
                  p.stopVideo();
                } catch {
                  // Ignore
                }
                return;
              }
              loadedVideoIdRef.current = targetVideoId;
              const latestVid = desiredVideoIdRef.current;
              if (latestVid && latestVid !== targetVideoId) {
                loadTargetInPlayer(p, latestVid);
                return;
              }
              if (usePlayerStore.getState().isPlaying) {
                ytPlayRequestedAtRef.current = Date.now();
                try {
                  p.playVideo();
                } catch {
                  // Ignore autoplay errors
                }
              }
            },
            onStateChange: (event) => {
              handleYtStateChangeRef.current(event);
            },
            onError: () => {
              handleYtErrorRef.current();
            },
          },
        });

        loadedVideoIdRef.current = targetVideoId;
        playerRef.current = instance;
        const createdIframe = iframeHostRef.current?.querySelector('iframe');
        if (createdIframe) {
          createdIframe.setAttribute('allow', 'autoplay; encrypted-media');
        }
      } catch {
        if (!cancelled) {
          ytActuallyPlayingRef.current = false;
          stopSilentKeepaliveAudio();
          syncMediaSessionPlaybackState('paused');
          const st = usePlayerStore.getState();
          st.setIsBuffering(false);
          st.setIsPlaying(false, { userInitiated: false });
          st.setPlayerError('Gagal memuat pemutar cloud.');
        }
      }
    };

    void ensurePlayer();

    return () => {
      cancelled = true;
    };
  }, [iframeActive, targetVideoId, trackSessionKey]);

  // Sync play / pause / stop state
  useEffect(() => {
    if (!iframeActive) return;
    ytPlayRequestedAtRef.current = isPlaying ? Date.now() : 0;
    if (!playerRef.current || !playerReadyRef.current) return;
    const p = playerRef.current;
    const st = usePlayerStore.getState();
    try {
      if (isPlaying) {
        p.playVideo();
      } else if (!st.hasActiveSessionPlayback && st.currentTime === 0) {
        ytActuallyPlayingRef.current = false;
        stopSilentKeepaliveAudio();
        syncMediaSessionPlaybackState('paused');
        p.stopVideo();
      } else {
        ytActuallyPlayingRef.current = false;
        stopSilentKeepaliveAudio();
        syncMediaSessionPlaybackState('paused');
        p.pauseVideo();
      }
    } catch {
      // Ignore transient YT state errors
    }
  }, [iframeActive, isPlaying]);

  // Sync volume & mute
  useEffect(() => {
    if (!iframeActive || !playerRef.current || !playerReadyRef.current) return;
    const p = playerRef.current;
    const effVol = clampYoutubeVolume(volume, maxVolumeLimit, isMuted);
    try {
      p.setVolume(effVol);
      if (isMuted || effVol === 0) {
        p.mute();
      } else {
        p.unMute();
      }
    } catch {
      // Ignore
    }
  }, [iframeActive, volume, isMuted, maxVolumeLimit]);

  // Sync playbackRate
  useEffect(() => {
    if (!iframeActive || !playerRef.current || !playerReadyRef.current) return;
    try {
      playerRef.current.setPlaybackRate(playbackRate || 1);
      const st = usePlayerStore.getState();
      syncMediaSessionPosition({
        duration: st.duration,
        currentTime: st.currentTime,
        playbackRate: playbackRate || 1,
      });
    } catch {
      // Ignore
    }
  }, [iframeActive, playbackRate]);

  // Explicit seek
  useEffect(() => {
    if (!iframeActive || pendingSeekSeconds === null || !playerRef.current || !playerReadyRef.current) {
      return;
    }
    try {
      const target = Math.max(0, pendingSeekSeconds);
      playerRef.current.seekTo(target, true);
      const st = usePlayerStore.getState();
      st.clearPendingSeek();
      syncMediaSessionPosition({
        duration: st.duration,
        currentTime: target,
        playbackRate: st.playbackRate || 1,
      });
    } catch {
      // Ignore
    }
  }, [iframeActive, seekVersion, pendingSeekSeconds]);

  // Progress & MediaSession polling strictly gated on actual YT PLAYING (1) state
  useEffect(() => {
    if (!iframeActive || !isPlaying) return;
    ytPlayRequestedAtRef.current = Date.now();
    const onCapAndroid = isCapacitorAndroidPlatform();

    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !playerReadyRef.current) return;
      try {
        const pState = p.getPlayerState?.();
        const store = usePlayerStore.getState();
        if (pState === 0 && store.isPlaying) {
          ytActuallyPlayingRef.current = false;
          stopSilentKeepaliveAudio();
          store.handleTrackEnded();
          return;
        }
        if (pState !== 1) {
          ytActuallyPlayingRef.current = false;
          const elapsed = Date.now() - ytPlayRequestedAtRef.current;
          const allowTimeoutCheck = !onCapAndroid || elapsed >= 10000;
          if (
            allowTimeoutCheck &&
            shouldTreatYoutubeAsAutoplayBlocked({
              isPlaying: store.isPlaying,
              isYoutubeIframe: true,
              visibilityState: getRealDocumentVisibilityState(),
              playerState: typeof pState === 'number' ? pState : -1,
              elapsedSincePlayRequestMs: elapsed,
              wasEverPlayingForTrack: ytEverPlayedForTrackRef.current,
            })
          ) {
            stopSilentKeepaliveAudio();
            syncMediaSessionPlaybackState('paused');
            store.setIsBuffering(false);
            store.setIsPlaying(false, { userInitiated: false });
            if (!onCapAndroid) {
              store.setAutoplayBlockedPendingResume(true);
            }
          }
          return;
        }

        ytActuallyPlayingRef.current = true;
        ytEverPlayedForTrackRef.current = true;
        const cur = p.getCurrentTime?.() ?? 0;
        const dur = p.getDuration?.() ?? 0;
        if (Number.isFinite(cur) && cur >= 0) {
          store.setProgress(cur, dur > 0 ? dur : undefined);
        }
        syncMediaSessionPlaybackState('playing');
        syncMediaSessionPosition({
          duration: dur,
          currentTime: cur,
          playbackRate: store.playbackRate || 1,
        });
      } catch {
        // Ignore polling errors
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [iframeActive, isPlaying]);

  return (
    <div
      ref={iframeHostRef}
      aria-hidden="true"
      className="fixed bottom-0 right-0 w-[200px] h-[112px] opacity-[0.01] pointer-events-none z-0 overflow-hidden"
    />
  );
}

