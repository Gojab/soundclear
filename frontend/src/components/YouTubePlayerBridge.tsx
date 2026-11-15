import { useEffect, useRef } from 'react';
import { resolvePlayableYoutube } from '../api/client';
import {
  startSilentKeepaliveAudio,
  stopSilentKeepaliveAudio,
} from '../audio/soundclearAudioEngine';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { clampYoutubeVolume } from '../utils/audioMath';
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

  // Media Session API (artwork thumbnail + music metadata + full lockscreen transport actions)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: formatArtists(currentTrack.artists),
        album: currentTrack.album?.name || 'SoundClear',
        artwork: currentTrack.thumbnail
          ? [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
    } catch {
      // Ignore
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => usePlayerStore.getState().setIsPlaying(true)],
      ['pause', () => usePlayerStore.getState().setIsPlaying(false)],
      ['stop', () => usePlayerStore.getState().stopPlayback()],
      ['previoustrack', () => usePlayerStore.getState().prevTrack()],
      ['nexttrack', () => usePlayerStore.getState().nextTrack()],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') {
            usePlayerStore.getState().requestSeek(details.seekTime);
          }
        },
      ],
      [
        'seekbackward',
        (details) => {
          const st = usePlayerStore.getState();
          const step = typeof details.seekOffset === 'number' ? details.seekOffset : 10;
          st.requestSeek(Math.max(0, st.currentTime - step));
        },
      ],
      [
        'seekforward',
        (details) => {
          const st = usePlayerStore.getState();
          const step = typeof details.seekOffset === 'number' ? details.seekOffset : 10;
          const max = st.duration > 0 ? st.duration : st.currentTime + step;
          st.requestSeek(Math.min(max, st.currentTime + step));
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action
      }
    }

    const syncVisibilityPosition = () => {
      const st = usePlayerStore.getState();
      if ('setPositionState' in navigator.mediaSession && st.duration > 0 && Number.isFinite(st.currentTime)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: st.duration,
            playbackRate: st.playbackRate || 1,
            position: Math.min(st.currentTime, st.duration),
          });
        } catch {
          // Ignore
        }
      }
    };
    document.addEventListener('visibilitychange', syncVisibilityPosition);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibilityPosition);
    };
  }, [currentTrack, isPlaying]);

  // Pre-warm YouTube IFrame API & standby hidden player immediately on mount for 0ms fallback startup
  useEffect(() => {
    let disposed = false;
    const warmStandby = async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (disposed || playerRef.current || !iframeHostRef.current) return;
        iframeHostRef.current.innerHTML = '';
        const mountNode = document.createElement('div');
        iframeHostRef.current.appendChild(mountNode);

        const instance = new YT.Player(mountNode, {
          width: 200,
          height: 112,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
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
                    p.loadVideoById({ videoId: pendingVid, startSeconds });
                  } else {
                    p.cueVideoById({ videoId: pendingVid, startSeconds });
                  }
                } catch {
                  // Ignore standby handoff errors
                }
              }
            },
            onStateChange: (event) => {
              const st = usePlayerStore.getState();
              if (!isYoutubeIframeActive(st.activeStreamMeta)) return;

              const stateCode = event.data;
              if (stateCode === 1) {
                st.setIsBuffering(false);
                st.setPlayerError(null);
                st.clearPendingSeek();
                const dur = event.target.getDuration?.() ?? 0;
                const cur = event.target.getCurrentTime?.() ?? st.currentTime;
                if (Number.isFinite(cur)) {
                  st.setProgress(cur, dur > 0 ? dur : undefined);
                }
                if (!st.isPlaying) {
                  try {
                    event.target.pauseVideo();
                  } catch {
                    // Ignore
                  }
                }
              } else if (stateCode === 3) {
                st.setIsBuffering(true);
              } else if (stateCode === 2) {
                st.setIsBuffering(false);
              } else if (stateCode === 0) {
                st.handleTrackEnded();
              }
            },
            onError: () => {
              if (isYoutubeIframeActive(usePlayerStore.getState().activeStreamMeta)) {
                handleYtErrorRef.current();
              }
            },
          },
        });
        playerRef.current = instance;
      } catch {
        // Non-fatal: fallback creation happens on demand if blocked offline
      }
    };
    void warmStandby();
    return () => {
      disposed = true;
    };
  }, []);

  // Keep first-party audio session & Screen WakeLock alive during background/cross-origin YouTube playback
  useEffect(() => {
    if (iframeActive && isPlaying) {
      startSilentKeepaliveAudio();
    } else if (iframeActive && !isPlaying) {
      stopSilentKeepaliveAudio();
    }
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
        if (nav.wakeLock && document.visibilityState === 'visible') {
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

    const onVisibilityRecover = () => {
      if (document.visibilityState === 'visible') {
        void acquireWakeLock();
      }
      const st = usePlayerStore.getState();
      if (
        st.isPlaying &&
        isYoutubeIframeActive(st.activeStreamMeta) &&
        playerRef.current &&
        playerReadyRef.current
      ) {
        startSilentKeepaliveAudio();
        try {
          const pState = playerRef.current.getPlayerState?.();
          if (pState !== 1 && pState !== 3) {
            playerRef.current.playVideo();
          }
        } catch {
          // Ignore YT state recovery error
        }
      }
    };

    void acquireWakeLock();
    document.addEventListener('visibilitychange', onVisibilityRecover);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityRecover);
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
    } else {
      attemptedVideoIdsRef.current.add(targetVideoId);
    }
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
      const st = usePlayerStore.getState();
      const startSeconds = Math.max(0, st.pendingSeekSeconds ?? st.currentTime ?? 0);
      syncPlayerConfig(player);
      try {
        if (st.isPlaying) {
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
      const st = usePlayerStore.getState();
      const activeTrack = st.currentTrack;
      const activeMeta = st.activeStreamMeta;
      const origVid = getPlayableVideoId(activeTrack);
      if (!activeTrack || !origVid || !isYoutubeIframeActive(activeMeta)) {
        return;
      }

      if (fallbackCountRef.current >= 3) {
        st.setIsBuffering(false);
        st.setIsPlaying(false);
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
        latest.setIsPlaying(false);
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

        const instance = new YT.Player(mountNode, {
          width: 200,
          height: 112,
          videoId: targetVideoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: initialState.isPlaying ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            start: startAt,
            origin: window.location.origin,
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
                try {
                  p.playVideo();
                } catch {
                  // Ignore autoplay errors
                }
              }
            },
            onStateChange: (event) => {
              const st = usePlayerStore.getState();
              if (!isYoutubeIframeActive(st.activeStreamMeta)) return;

              const stateCode = event.data;
              if (stateCode === 1) {
                // PLAYING
                st.setIsBuffering(false);
                st.setPlayerError(null);
                st.clearPendingSeek();
                const dur = event.target.getDuration?.() ?? 0;
                const cur = event.target.getCurrentTime?.() ?? st.currentTime;
                if (Number.isFinite(cur)) {
                  st.setProgress(cur, dur > 0 ? dur : undefined);
                }
                if (!st.isPlaying) {
                  try {
                    event.target.pauseVideo();
                  } catch {
                    // Ignore
                  }
                }
              } else if (stateCode === 3) {
                // BUFFERING
                st.setIsBuffering(true);
              } else if (stateCode === 2) {
                // PAUSED
                st.setIsBuffering(false);
              } else if (stateCode === 0) {
                // ENDED
                st.handleTrackEnded();
              }
            },
            onError: () => {
              handleYtErrorRef.current();
            },
          },
        });

        loadedVideoIdRef.current = targetVideoId;
        playerRef.current = instance;
      } catch {
        if (!cancelled) {
          const st = usePlayerStore.getState();
          st.setIsBuffering(false);
          st.setIsPlaying(false);
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
    if (!iframeActive || !playerRef.current || !playerReadyRef.current) return;
    const p = playerRef.current;
    const st = usePlayerStore.getState();
    try {
      if (isPlaying) {
        p.playVideo();
      } else if (!st.hasActiveSessionPlayback && st.currentTime === 0) {
        p.stopVideo();
      } else {
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
      playerRef.current.seekTo(Math.max(0, pendingSeekSeconds), true);
      usePlayerStore.getState().clearPendingSeek();
    } catch {
      // Ignore
    }
  }, [iframeActive, seekVersion, pendingSeekSeconds]);

  // Progress & MediaSession polling while playing in YT IFrame mode
  useEffect(() => {
    if (!iframeActive || !isPlaying) return;

    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !playerReadyRef.current) return;
      try {
        const cur = p.getCurrentTime?.() ?? 0;
        const dur = p.getDuration?.() ?? 0;
        const store = usePlayerStore.getState();
        if (Number.isFinite(cur) && cur >= 0) {
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
              playbackRate: store.playbackRate || 1,
              position: Math.min(cur, dur),
            });
          } catch {
            // Ignore
          }
        }
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
      className="fixed bottom-0 right-0 w-[200px] h-[112px] opacity-[0.001] pointer-events-none -z-10 overflow-hidden"
    />
  );
}

