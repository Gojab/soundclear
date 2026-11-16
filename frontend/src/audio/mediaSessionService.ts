import type { MediaItem } from '../types/music';
import {
  buildMediaMetadataInit,
  buildMediaPositionState,
  type MediaPositionStateInput,
} from '../utils/mediaSessionLogic';

export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onSeekTo: (seekTime: number) => void;
  onSeekBackward: (seekOffset?: number) => void;
  onSeekForward: (seekOffset?: number) => void;
}

export function isMediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

export function registerMediaSessionHandlers(handlers: MediaSessionHandlers): () => void {
  if (!isMediaSessionSupported()) return () => {};

  const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', () => handlers.onPlay()],
    ['pause', () => handlers.onPause()],
    ['stop', () => handlers.onStop()],
    ['previoustrack', () => handlers.onPreviousTrack()],
    ['nexttrack', () => handlers.onNextTrack()],
    [
      'seekto',
      (details) => {
        if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
          handlers.onSeekTo(details.seekTime);
        }
      },
    ],
    [
      'seekbackward',
      (details) => {
        handlers.onSeekBackward(
          typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset)
            ? details.seekOffset
            : undefined,
        );
      },
    ],
    [
      'seekforward',
      (details) => {
        handlers.onSeekForward(
          typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset)
            ? details.seekOffset
            : undefined,
        );
      },
    ],
  ];

  const registered: MediaSessionAction[] = [];
  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
      registered.push(action);
    } catch {
      // Action unsupported on this browser/OS version (e.g. older Firefox/Safari)
    }
  }

  return () => {
    if (!isMediaSessionSupported()) return;
    for (const action of registered) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Ignore cleanup failure
      }
    }
  };
}

export function syncMediaSessionMetadata(track: MediaItem | null): void {
  if (!isMediaSessionSupported()) return;

  if (!track) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    } catch {
      // Ignore
    }
    return;
  }

  if (typeof MediaMetadata === 'undefined') return;

  try {
    const init = buildMediaMetadataInit(track);
    navigator.mediaSession.metadata = new MediaMetadata(init);
  } catch {
    // Ignore invalid MediaMetadata artwork/fields on strict browsers
  }
}

export function syncMediaSessionPlaybackState(
  state: 'playing' | 'paused' | 'none',
): void {
  if (!isMediaSessionSupported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // Ignore
  }
}

export function syncMediaSessionPosition(input: MediaPositionStateInput): void {
  if (!isMediaSessionSupported()) return;
  if (typeof navigator.mediaSession.setPositionState !== 'function') return;

  const safe = buildMediaPositionState(input);
  if (!safe) return;

  try {
    navigator.mediaSession.setPositionState(safe);
  } catch {
    // Ignore transient MediaSession position errors
  }
}
