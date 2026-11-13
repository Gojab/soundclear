import { useEffect, useRef } from 'react';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { formatArtists, getPlayableVideoId } from '../utils/playerLogic';

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
  setSize: (width: number, height: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

interface YTPlayerEvent {
  data: number;
  target: YTPlayer;
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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const initialCuedRef = useRef(false);

  const hydrated = usePlayerStore((s) => s.hydrated);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const crossfadeSeconds = usePlayerStore((s) => s.crossfadeSeconds);
  const seekVersion = usePlayerStore((s) => s.seekVersion);
  const pendingSeekSeconds = usePlayerStore((s) => s.pendingSeekSeconds);
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const karaokeOpen = usePlayerStore((s) => s.karaokeOpen);
  const fullscreenNowPlaying = usePlayerStore((s) => s.fullscreenNowPlaying);

  const currentVideoId = getPlayableVideoId(currentTrack);

  // Initialize single persistent YouTube IFrame player once
  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeAPI().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player || playerRef.current) return;

      const player = new window.YT.Player(hostRef.current, {
        height: '180',
        width: '320',
        playerVars: {
          autoplay: 0,
          controls: 1,
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
            event.target.setVolume(state.volume);
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

            const vid = getPlayableVideoId(state.currentTrack);
            if (vid && loadedVideoIdRef.current !== vid) {
              loadedVideoIdRef.current = vid;
              const startSec = Math.floor(state.pendingSeekSeconds ?? state.currentTime ?? 0);
              if (state.isPlaying) {
                event.target.loadVideoById({ videoId: vid, startSeconds: startSec });
              } else {
                initialCuedRef.current = true;
                event.target.cueVideoById({ videoId: vid, startSeconds: startSec });
              }
              state.clearPendingSeek();
            }
          },
          onStateChange: (event) => {
            const YTState = window.YT?.PlayerState;
            if (!YTState) return;
            const store = usePlayerStore.getState();

            if (event.data === YTState.PLAYING) {
              store.setIsBuffering(false);
              if (!store.isPlaying) store.setIsPlaying(true);
              store.setPlayerError(null);
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
            } else if (event.data === YTState.ENDED) {
              store.setIsBuffering(false);
              store.handleTrackEnded();
            }
          },
          onError: (event) => {
            const store = usePlayerStore.getState();
            store.setIsBuffering(false);
            store.setIsPlaying(false);
            const code = event.data;
            let msg = 'Track ini tidak tersedia untuk diputar via YouTube Player.';
            if (code === 101 || code === 150) {
              msg = 'Pemilik lagu membatasi pemutaran di pemutar sematan YouTube.';
            } else if (code === 100) {
              msg = 'Video tidak ditemukan atau bersifat pribadi.';
            } else if (code === 5) {
              msg = 'Browser ini tidak mendukung pemutaran media HTML5 YouTube.';
            }
            store.setPlayerError(msg);
          },
        },
      });

      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore teardown errors
        }
        playerRef.current = null;
        readyRef.current = false;
      }
    };
  }, []);

  // Overlay visible YouTube player inside RightPanel [data-yt-visible-slot] without reparenting DOM node
  useEffect(() => {
    const syncSlotPosition = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const slot = document.querySelector<HTMLElement>('[data-yt-visible-slot="true"]');
      if (
        slot &&
        currentVideoId &&
        rightPanelOpen &&
        !karaokeOpen &&
        !fullscreenNowPlaying
      ) {
        const rect = slot.getBoundingClientRect();
        if (rect.width > 40 && rect.height > 40 && rect.bottom > 0 && rect.top < window.innerHeight) {
          wrapper.style.position = 'fixed';
          wrapper.style.left = `${Math.round(rect.left)}px`;
          wrapper.style.top = `${Math.round(rect.top)}px`;
          wrapper.style.width = `${Math.round(rect.width)}px`;
          wrapper.style.height = `${Math.round(rect.height)}px`;
          wrapper.style.opacity = '1';
          wrapper.style.pointerEvents = 'auto';
          wrapper.style.zIndex = '15';
          wrapper.style.borderRadius = '12px';
          wrapper.style.overflow = 'hidden';
          if (readyRef.current && playerRef.current) {
            try {
              playerRef.current.setSize(Math.round(rect.width), Math.round(rect.height));
            } catch {
              // Ignore
            }
          }
          return;
        }
      }

      wrapper.style.position = 'fixed';
      wrapper.style.left = '-9999px';
      wrapper.style.top = '0px';
      wrapper.style.width = '1px';
      wrapper.style.height = '1px';
      wrapper.style.opacity = '0';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.zIndex = '0';
    };

    syncSlotPosition();
    const timer = window.setInterval(syncSlotPosition, 200);
    window.addEventListener('resize', syncSlotPosition);
    window.addEventListener('scroll', syncSlotPosition, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', syncSlotPosition);
      window.removeEventListener('scroll', syncSlotPosition, true);
    };
  }, [currentVideoId, rightPanelOpen, karaokeOpen, fullscreenNowPlaying]);

  // Load or cue videoId when hydrated track changes
  useEffect(() => {
    if (!hydrated || !currentVideoId || !readyRef.current || !playerRef.current) return;
    if (loadedVideoIdRef.current === currentVideoId) return;
    loadedVideoIdRef.current = currentVideoId;
    const state = usePlayerStore.getState();
    const startSec = Math.floor(state.pendingSeekSeconds ?? state.currentTime ?? 0);
    try {
      if (state.isPlaying) {
        playerRef.current.loadVideoById({ videoId: currentVideoId, startSeconds: startSec });
      } else {
        initialCuedRef.current = true;
        playerRef.current.cueVideoById({ videoId: currentVideoId, startSeconds: startSec });
      }
      state.clearPendingSeek();
    } catch {
      // Ignore transient errors
    }
  }, [hydrated, currentVideoId]);

  // Sync play / pause state
  useEffect(() => {
    if (!readyRef.current || !playerRef.current || !currentVideoId) return;
    try {
      if (isPlaying) {
        initialCuedRef.current = false;
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {
      // Ignore
    }
  }, [isPlaying, currentVideoId]);

  // Sync volume & mute
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    try {
      playerRef.current.setVolume(volume);
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    } catch {
      // Ignore
    }
  }, [volume, isMuted]);

  // Sync playback rate
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    try {
      playerRef.current.setPlaybackRate(playbackRate);
    } catch {
      // Ignore
    }
  }, [playbackRate]);

  // Handle explicit seek requests
  useEffect(() => {
    if (pendingSeekSeconds === null || !readyRef.current || !playerRef.current) return;
    try {
      playerRef.current.seekTo(pendingSeekSeconds, true);
    } catch {
      // Ignore
    }
    usePlayerStore.getState().clearPendingSeek();
  }, [seekVersion, pendingSeekSeconds]);

  // Poll playback progress + crossfade volume tapering + media session position
  useEffect(() => {
    if (!isPlaying || !currentVideoId) return;
    const interval = window.setInterval(() => {
      if (!readyRef.current || !playerRef.current) return;
      try {
        const cur = playerRef.current.getCurrentTime();
        const dur = playerRef.current.getDuration();
        if (Number.isFinite(cur)) {
          const store = usePlayerStore.getState();
          store.setProgress(cur, Number.isFinite(dur) && dur > 0 ? dur : undefined);

          // Crossfade volume envelope (0-12s)
          if (crossfadeSeconds > 0 && !store.isMuted && dur > crossfadeSeconds * 2) {
            const fadeInDur = Math.min(crossfadeSeconds, 4);
            let factor = 1;
            if (cur < fadeInDur) {
              factor = Math.max(0.15, cur / fadeInDur);
            } else if (dur - cur < crossfadeSeconds) {
              factor = Math.max(0.08, (dur - cur) / crossfadeSeconds);
            }
            playerRef.current.setVolume(Math.round(store.volume * factor));
          }

          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && dur > 0) {
            try {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: store.playbackRate,
                position: Math.min(cur, dur),
              });
            } catch {
              // Ignore unsupported position states
            }
          }
        }
      } catch {
        // Ignore
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isPlaying, currentVideoId, crossfadeSeconds]);

  // Media Session API (lock screen & media keys)
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
      // Ignore metadata failures
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

  // Global keyboard shortcuts (Space, Arrows, M, L, S, R, ?, Esc)
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
      ref={wrapperRef}
      aria-label="Pemutar video YouTube"
      className="fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none bg-black"
    >
      <div ref={hostRef} id="soundclear-yt-host" className="w-full h-full" />
    </div>
  );
}
