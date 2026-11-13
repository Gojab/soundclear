import { useEffect, useRef } from 'react';
import { resolvePlayableYoutube } from '../api/client';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  clampYoutubeVolume,
  computeNonOverlappingFadeMultiplier,
} from '../utils/audioMath';
import {
  formatArtists,
  getPlayableVideoId,
  hasPlayableOfflineAudio,
  isYouTubeVideoId,
} from '../utils/playerLogic';

interface YTPlayer {
  loadVideoById: (options: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: string | { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
  setPlaybackRate: (suggestedRate: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

interface YTPlayerEvent {
  data: number;
  target: YTPlayer;
}

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: YTPlayerEvent) => void;
            onStateChange?: (e: YTPlayerEvent) => void;
            onError?: (e: YTPlayerEvent) => void;
          };
        },
      ) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      resolve();
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

export function YouTubePlayerBridge() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const loadedYtIdRef = useRef<string | null>(null);
  const candidatesRef = useRef<string[]>([]);
  const candidateIdxRef = useRef(0);
  const fallbackAttemptedRef = useRef<Set<string>>(new Set());
  const microFadeTimerRef = useRef<number | null>(null);
  const bufferStallTimerRef = useRef<number | null>(null);

  const hydrated = usePlayerStore((s) => s.hydrated);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const seekVersion = usePlayerStore((s) => s.seekVersion);
  const pendingSeekSeconds = usePlayerStore((s) => s.pendingSeekSeconds);
  const selectedQualityOverride = usePlayerStore((s) => s.selectedQualityOverride);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);

  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);
  const youtubeSound = useSettingsStore((s) => s.youtubeSound);

  const rawVideoId = getPlayableVideoId(currentTrack);
  const offlineRec = rawVideoId
    ? offlineDownloads.find((d) => d.id === rawVideoId) ?? null
    : null;
  const offlineExists = hasPlayableOfflineAudio(offlineRec);
  const handledByHtmlAudio = Boolean(
    !rawVideoId ||
      selectedQualityOverride !== null ||
      (offlineExists &&
        (sourceLabel === 'Unduhan Offline' ||
          (typeof navigator !== 'undefined' && navigator.onLine === false))),
  );
  const currentVideoId = handledByHtmlAudio ? null : rawVideoId;

  const activateCloudStreamMeta = (trackKey: string) => {
    const store = usePlayerStore.getState();
    const localProf = useSettingsStore.getState().localProfile;
    store.setWebAudioWarning(null);
    store.setActiveStreamMeta({
      trackId: trackKey,
      requestedTier: localProf.wifiQuality,
      actualTier: 'cloud',
      codec: 'Streaming Cloud',
      bitrateKbps: 128,
      sampleRateHz: 44100,
      bitDepth: null,
      lossless: false,
      hiRes: false,
      badgeLabel: 'Streaming Cloud',
      sourceMode: 'youtube-iframe',
      proxiedViaBackend: false,
      audiodownloadAllowed: true,
      replayGainDb: null,
    });
  };

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

  // Initialize single persistent hidden audio player once
  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeAPI().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player || playerRef.current) return;

      const player = new window.YT.Player(hostRef.current, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            readyRef.current = true;
            const state = usePlayerStore.getState();
            const ytSound = useSettingsStore.getState().youtubeSound;
            const cappedVol = clampYoutubeVolume(state.volume, ytSound.maxVolumeLimit, state.isMuted);

            event.target.setVolume(cappedVol);
            try {
              event.target.setPlaybackRate(state.playbackRate);
            } catch {
              // Ignore
            }
            if (state.isMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
            }

            const track = state.currentTrack;
            const vid = getPlayableVideoId(track);
            const skipBridge =
              !vid ||
              state.selectedQualityOverride !== null ||
              (hasPlayableOfflineAudio(
                useLibraryStore.getState().offlineDownloads.find((d) => d.id === vid),
              ) &&
                (state.sourceLabel === 'Unduhan Offline' || !navigator.onLine));

            if (track && vid && !skipBridge && loadedVideoIdRef.current !== vid) {
              loadedVideoIdRef.current = vid;
              fallbackAttemptedRef.current.clear();
              activateCloudStreamMeta(vid);
              const startSec = ytSound.resumeLastPosition
                ? Math.floor(state.pendingSeekSeconds ?? state.currentTime ?? 0)
                : 0;
              if (isYouTubeVideoId(vid)) {
                candidatesRef.current = [vid];
                candidateIdxRef.current = 0;
                loadedYtIdRef.current = vid;
                if (state.isPlaying) {
                  event.target.loadVideoById({ videoId: vid, startSeconds: startSec });
                } else {
                  event.target.cueVideoById({ videoId: vid, startSeconds: startSec });
                }
                state.clearPendingSeek();
              } else {
                loadedYtIdRef.current = null;
                candidatesRef.current = [];
                candidateIdxRef.current = 0;
                void resolvePlayableYoutube(vid, {
                  title: track.title,
                  artist: formatArtists(track.artists),
                  type: track.type,
                  durationSeconds: track.durationSeconds,
                })
                  .then((resolved) => {
                    const latest = usePlayerStore.getState();
                    if (!readyRef.current || !playerRef.current) return;
                    if (getPlayableVideoId(latest.currentTrack) !== vid) return;
                    if (latest.selectedQualityOverride !== null) return;
                    const list =
                      resolved.candidates.length > 0
                        ? resolved.candidates
                        : [resolved.youtubeVideoId];
                    candidatesRef.current = list;
                    candidateIdxRef.current = 0;
                    loadedYtIdRef.current = list[0];
                    if (latest.isPlaying) {
                      playerRef.current.loadVideoById({ videoId: list[0], startSeconds: startSec });
                    } else {
                      playerRef.current.cueVideoById({ videoId: list[0], startSeconds: startSec });
                    }
                    latest.clearPendingSeek();
                  })
                  .catch(() => {
                    const latest = usePlayerStore.getState();
                    if (getPlayableVideoId(latest.currentTrack) !== vid) return;
                    latest.setIsBuffering(false);
                    latest.setIsPlaying(false);
                    latest.setPlayerError('Gagal menemukan sumber pemutaran audio untuk lagu ini.');
                  });
              }
            }
          },
          onStateChange: (event) => {
            const YTState = window.YT?.PlayerState;
            if (!YTState) return;
            const store = usePlayerStore.getState();
            const vid = getPlayableVideoId(store.currentTrack);
            if (!vid || store.selectedQualityOverride !== null) return;

            if (bufferStallTimerRef.current !== null) {
              window.clearTimeout(bufferStallTimerRef.current);
              bufferStallTimerRef.current = null;
            }

            if (event.data === YTState.PLAYING) {
              store.setIsBuffering(false);
              if (!store.isPlaying) store.setIsPlaying(true);
              store.setPlayerError(null);
              activateCloudStreamMeta(vid);
              try {
                event.target.setPlaybackRate(store.playbackRate);
              } catch {
                // Ignore
              }
            } else if (event.data === YTState.PAUSED) {
              store.setIsBuffering(false);
              if (store.isPlaying) store.setIsPlaying(false);
            } else if (event.data === YTState.BUFFERING) {
              store.setIsBuffering(true);
              bufferStallTimerRef.current = window.setTimeout(() => {
                usePlayerStore.getState().recordBufferingStall();
              }, 3500);
            } else if (event.data === YTState.ENDED) {
              store.setIsBuffering(false);
              store.handleTrackEnded();
            }
          },
          onError: (event) => {
            const store = usePlayerStore.getState();
            const trackKey = getPlayableVideoId(store.currentTrack);
            if (!trackKey || store.selectedQualityOverride !== null) return;

            if (candidateIdxRef.current + 1 < candidatesRef.current.length) {
              candidateIdxRef.current += 1;
              const nextYtId = candidatesRef.current[candidateIdxRef.current];
              loadedYtIdRef.current = nextYtId;
              try {
                event.target.loadVideoById({ videoId: nextYtId, startSeconds: 0 });
                return;
              } catch {
                // Fall through
              }
            }

            const code = event.data;
            const buildErrorMsg = (errCode: number) => {
              if (errCode === 101 || errCode === 150) {
                return 'Pemilik lagu membatasi pemutaran audio untuk trek ini.';
              }
              if (errCode === 100) {
                return 'Lagu tidak ditemukan atau bersifat pribadi.';
              }
              if (errCode === 5) {
                return 'Browser ini tidak mendukung pemutaran media HTML5.';
              }
              return 'Trek ini tidak tersedia untuk diputar saat ini.';
            };

            if (
              (code === 101 || code === 150 || code === 100) &&
              store.currentTrack &&
              !fallbackAttemptedRef.current.has(trackKey)
            ) {
              fallbackAttemptedRef.current.add(trackKey);
              store.setIsBuffering(true);
              const targetTrack = store.currentTrack;
              void resolvePlayableYoutube(trackKey, {
                title: targetTrack.title,
                artist: formatArtists(targetTrack.artists),
                type: targetTrack.type,
                durationSeconds: targetTrack.durationSeconds,
                fallback: true,
                exclude: candidatesRef.current,
              })
                .then((resolved) => {
                  const latest = usePlayerStore.getState();
                  if (!readyRef.current || !playerRef.current) return;
                  if (getPlayableVideoId(latest.currentTrack) !== trackKey) return;
                  if (latest.selectedQualityOverride !== null) return;
                  const unseen = (resolved.candidates || []).filter(
                    (c) => c && !candidatesRef.current.includes(c),
                  );
                  if (unseen.length === 0) {
                    latest.setIsBuffering(false);
                    latest.setIsPlaying(false);
                    latest.setPlayerError(buildErrorMsg(code));
                    return;
                  }
                  candidatesRef.current = [...candidatesRef.current, ...unseen];
                  candidateIdxRef.current += 1;
                  const nextYtId = candidatesRef.current[candidateIdxRef.current];
                  loadedYtIdRef.current = nextYtId;
                  latest.setPlayerError(null);
                  playerRef.current.loadVideoById({ videoId: nextYtId, startSeconds: 0 });
                })
                .catch(() => {
                  const latest = usePlayerStore.getState();
                  if (getPlayableVideoId(latest.currentTrack) !== trackKey) return;
                  latest.setIsBuffering(false);
                  latest.setIsPlaying(false);
                  latest.setPlayerError(buildErrorMsg(code));
                });
              return;
            }

            store.setIsBuffering(false);
            store.setIsPlaying(false);
            store.setPlayerError(buildErrorMsg(code));
          },
        },
      });

      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      if (microFadeTimerRef.current) {
        window.clearInterval(microFadeTimerRef.current);
      }
      if (bufferStallTimerRef.current !== null) {
        window.clearTimeout(bufferStallTimerRef.current);
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
        readyRef.current = false;
      }
    };
  }, []);

  // Load/cue track or yield immediately when LocalAudioEngine handles local/offline track
  useEffect(() => {
    if (!hydrated || !readyRef.current || !playerRef.current) return;
    if (!currentVideoId || !currentTrack) {
      loadedVideoIdRef.current = null;
      loadedYtIdRef.current = null;
      candidatesRef.current = [];
      candidateIdxRef.current = 0;
      try {
        playerRef.current.pauseVideo();
      } catch {
        // Ignore
      }
      return;
    }

    if (loadedVideoIdRef.current === currentVideoId) return;
    loadedVideoIdRef.current = currentVideoId;
    fallbackAttemptedRef.current.clear();
    activateCloudStreamMeta(currentVideoId);

    const state = usePlayerStore.getState();
    const ytSound = useSettingsStore.getState().youtubeSound;
    const startSec = ytSound.resumeLastPosition
      ? Math.floor(state.pendingSeekSeconds ?? state.currentTime ?? 0)
      : 0;

    if (isYouTubeVideoId(currentVideoId)) {
      candidatesRef.current = [currentVideoId];
      candidateIdxRef.current = 0;
      loadedYtIdRef.current = currentVideoId;
      try {
        if (state.isPlaying) {
          playerRef.current.loadVideoById({ videoId: currentVideoId, startSeconds: startSec });
        } else {
          playerRef.current.cueVideoById({ videoId: currentVideoId, startSeconds: startSec });
        }
        state.clearPendingSeek();
      } catch {
        // Ignore
      }
      return;
    }

    loadedYtIdRef.current = null;
    candidatesRef.current = [];
    candidateIdxRef.current = 0;
    const targetId = currentVideoId;

    void resolvePlayableYoutube(targetId, {
      title: currentTrack.title,
      artist: formatArtists(currentTrack.artists),
      type: currentTrack.type,
      durationSeconds: currentTrack.durationSeconds,
    })
      .then((resolved) => {
        const latest = usePlayerStore.getState();
        if (!readyRef.current || !playerRef.current) return;
        if (getPlayableVideoId(latest.currentTrack) !== targetId) return;
        if (latest.selectedQualityOverride !== null) return;
        const list =
          resolved.candidates.length > 0 ? resolved.candidates : [resolved.youtubeVideoId];
        candidatesRef.current = list;
        candidateIdxRef.current = 0;
        loadedYtIdRef.current = list[0];
        try {
          if (latest.isPlaying) {
            playerRef.current.loadVideoById({ videoId: list[0], startSeconds: startSec });
          } else {
            playerRef.current.cueVideoById({ videoId: list[0], startSeconds: startSec });
          }
          latest.clearPendingSeek();
        } catch {
          // Ignore
        }
      })
      .catch(() => {
        const latest = usePlayerStore.getState();
        if (getPlayableVideoId(latest.currentTrack) !== targetId) return;
        latest.setIsBuffering(false);
        latest.setIsPlaying(false);
        latest.setPlayerError('Gagal menemukan sumber pemutaran audio untuk lagu ini.');
      });
  }, [hydrated, currentVideoId, currentTrack]);

  // Sync play / pause with fade
  useEffect(() => {
    if (!readyRef.current || !playerRef.current || !currentVideoId || !loadedYtIdRef.current) return;
    if (microFadeTimerRef.current) {
      window.clearInterval(microFadeTimerRef.current);
      microFadeTimerRef.current = null;
    }

    const ytSound = useSettingsStore.getState().youtubeSound;
    const state = usePlayerStore.getState();
    const targetVol = clampYoutubeVolume(state.volume, ytSound.maxVolumeLimit, state.isMuted);

    try {
      if (isPlaying) {
        if (ytSound.fadeOnPauseResume && !state.isMuted && targetVol > 0) {
          let step = 0;
          const steps = 6;
          playerRef.current.setVolume(Math.round(targetVol * 0.15));
          playerRef.current.playVideo();
          microFadeTimerRef.current = window.setInterval(() => {
            step += 1;
            if (!playerRef.current || step >= steps) {
              if (playerRef.current) playerRef.current.setVolume(targetVol);
              if (microFadeTimerRef.current) {
                window.clearInterval(microFadeTimerRef.current);
                microFadeTimerRef.current = null;
              }
              return;
            }
            playerRef.current.setVolume(Math.round(targetVol * (0.15 + 0.85 * (step / steps))));
          }, 40);
        } else {
          playerRef.current.setVolume(targetVol);
          playerRef.current.playVideo();
        }
      } else if (ytSound.fadeOnPauseResume && !state.isMuted && targetVol > 0) {
        let step = 0;
        const steps = 5;
        microFadeTimerRef.current = window.setInterval(() => {
          step += 1;
          if (!playerRef.current || step >= steps) {
            if (playerRef.current) {
              playerRef.current.pauseVideo();
              playerRef.current.setVolume(targetVol);
            }
            if (microFadeTimerRef.current) {
              window.clearInterval(microFadeTimerRef.current);
              microFadeTimerRef.current = null;
            }
            return;
          }
          playerRef.current.setVolume(Math.round(targetVol * (1 - step / steps)));
        }, 40);
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {
      // Ignore
    }
  }, [isPlaying, currentVideoId]);

  useEffect(() => {
    const cappedVol = clampYoutubeVolume(volume, youtubeSound.maxVolumeLimit, isMuted);
    if (!readyRef.current || !playerRef.current || !currentVideoId) return;
    try {
      playerRef.current.setVolume(cappedVol);
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    } catch {
      // Ignore
    }
  }, [volume, isMuted, youtubeSound.maxVolumeLimit, currentVideoId]);

  useEffect(() => {
    if (!readyRef.current || !playerRef.current || !currentVideoId) return;
    try {
      playerRef.current.setPlaybackRate(playbackRate);
    } catch {
      // Ignore
    }
  }, [playbackRate, currentVideoId]);

  useEffect(() => {
    if (pendingSeekSeconds === null || !currentVideoId) return;
    if (!readyRef.current || !playerRef.current) return;
    try {
      playerRef.current.seekTo(pendingSeekSeconds, true);
    } catch {
      // Ignore
    }
    usePlayerStore.getState().clearPendingSeek();
  }, [seekVersion, pendingSeekSeconds, currentVideoId]);

  useEffect(() => {
    if (!isPlaying || !currentVideoId) return;
    const interval = window.setInterval(() => {
      if (!readyRef.current || !playerRef.current) return;
      try {
        const cur = playerRef.current.getCurrentTime();
        const dur = playerRef.current.getDuration();
        if (Number.isFinite(cur)) {
          const store = usePlayerStore.getState();
          const ytSound = useSettingsStore.getState().youtubeSound;
          store.setProgress(cur, Number.isFinite(dur) && dur > 0 ? dur : undefined);

          const baseVol = clampYoutubeVolume(store.volume, ytSound.maxVolumeLimit, store.isMuted);
          if (!store.isMuted && baseVol > 0) {
            let factor = computeNonOverlappingFadeMultiplier(
              cur,
              dur,
              ytSound.trackFadeSeconds,
            );

            if (
              ytSound.fadeOutOnSleepTimer &&
              store.sleepTimerMode === 'minutes' &&
              store.sleepTimerEndsAt
            ) {
              const remainingMs = store.sleepTimerEndsAt - Date.now();
              if (remainingMs > 0 && remainingMs <= 1800) {
                factor = Math.min(factor, Math.max(0.05, remainingMs / 1800));
              }
            }

            playerRef.current.setVolume(Math.round(baseVol * factor));
          }

          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && dur > 0) {
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
        }
      } catch {
        // Ignore
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isPlaying, currentVideoId]);

  // Media Session API
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
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action
      }
    }
  }, [currentTrack, isPlaying]);

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

  return (
    <div
      aria-label="Mesin pemutar audio"
      className="fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
    >
      <div ref={hostRef} id="soundclear-audio-host" className="w-full h-full" />
    </div>
  );
}
