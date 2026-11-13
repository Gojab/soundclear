import { useEffect } from 'react';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { formatArtists } from '../utils/playerLogic';

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export function YouTubePlayerBridge() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

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

  // Media Session API (artwork thumbnail + music metadata, no video)
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

  return null;
}
