import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { formatArtists, getPlayableVideoId } from '../utils/playerLogic';

interface YTPlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const seekVersion = usePlayerStore((s) => s.seekVersion);
  const pendingSeekSeconds = usePlayerStore((s) => s.pendingSeekSeconds);

  const currentVideoId = getPlayableVideoId(currentTrack);

  // Initialize hidden YouTube IFrame player once
  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeAPI().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player || playerRef.current) return;

      const player = new window.YT.Player(hostRef.current, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 1,
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
            event.target.setVolume(state.volume);
            if (state.isMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
            }
            const vid = getPlayableVideoId(state.currentTrack);
            if (vid && loadedVideoIdRef.current !== vid) {
              loadedVideoIdRef.current = vid;
              event.target.loadVideoById(vid);
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

  // Load new videoId when currentTrack changes
  useEffect(() => {
    if (!currentVideoId || !readyRef.current || !playerRef.current) return;
    if (loadedVideoIdRef.current === currentVideoId) return;
    loadedVideoIdRef.current = currentVideoId;
    try {
      playerRef.current.loadVideoById(currentVideoId);
    } catch {
      // Ignore transient errors before iframe attaches
    }
  }, [currentVideoId]);

  // Sync play / pause state
  useEffect(() => {
    if (!readyRef.current || !playerRef.current || !currentVideoId) return;
    try {
      if (isPlaying) {
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

  // Poll playback progress for seek bar and synced lyrics
  useEffect(() => {
    if (!isPlaying || !currentVideoId) return;
    const interval = window.setInterval(() => {
      if (!readyRef.current || !playerRef.current) return;
      try {
        const cur = playerRef.current.getCurrentTime();
        const dur = playerRef.current.getDuration();
        if (Number.isFinite(cur)) {
          usePlayerStore
            .getState()
            .setProgress(cur, Number.isFinite(dur) && dur > 0 ? dur : undefined);

          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && dur > 0) {
            try {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: 1,
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
  }, [isPlaying, currentVideoId]);

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
        // Unsupported action in current browser
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

      if (e.code === 'Space') {
        const state = usePlayerStore.getState();
        if (state.currentTrack) {
          e.preventDefault();
          state.togglePlayPause();
        }
      } else if (e.shiftKey && e.code === 'ArrowRight') {
        e.preventDefault();
        usePlayerStore.getState().nextTrack();
      } else if (e.shiftKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        usePlayerStore.getState().prevTrack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
    >
      <div ref={hostRef} id="soundclear-yt-host" />
    </div>
  );
}
