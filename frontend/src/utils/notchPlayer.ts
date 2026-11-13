import type { LyricsResponse, MediaItem } from '../types/music';
import { findActiveLyricIndex, formatArtists } from './playerLogic';

export type NotchDisplayMode = 'always' | 'background' | 'off';

export interface NotchMonitorOption {
  id: string;
  label: string;
}

export const DEFAULT_NOTCH_DISPLAY_MODE: NotchDisplayMode = 'always';
export const DEFAULT_NOTCH_MONITOR = 'primary';

export const DEFAULT_NOTCH_MONITOR_OPTIONS: NotchMonitorOption[] = [
  { id: 'primary', label: 'Monitor Utama' },
  { id: 'cursor', label: 'Monitor Aktif (Posisi Kursor)' },
];

export type NotchLinesState =
  | {
      mode: 'synced';
      prev: string | null;
      active: string;
      next: string | null;
      activeIndex: number;
      lineKey: string;
    }
  | {
      mode: 'synced-intro';
      prev: null;
      active: string;
      next: string | null;
      activeIndex: -1;
      lineKey: string;
    }
  | {
      mode: 'fallback';
      prev: null;
      active: string;
      next: null;
      activeIndex: -1;
      lineKey: string;
    };

export function normalizeNotchDisplayMode(value: unknown): NotchDisplayMode {
  if (value === 'always' || value === 'background' || value === 'off') {
    return value;
  }
  return DEFAULT_NOTCH_DISPLAY_MODE;
}

export function normalizeNotchMonitor(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return DEFAULT_NOTCH_MONITOR;
}

/**
 * Resolves the text lines to display in the Notch Mini Player.
 * Never returns unsynced plain-text lyrics: when lyrics are missing
 * or do not have timestamps, strictly falls back to the artist name.
 */
export function resolveNotchDisplayLines(
  track: MediaItem | null | undefined,
  lyrics: LyricsResponse | null | undefined,
  currentTimeSeconds: number,
): NotchLinesState {
  if (!track) {
    return {
      mode: 'fallback',
      prev: null,
      active: '',
      next: null,
      activeIndex: -1,
      lineKey: 'empty',
    };
  }

  const artistName = formatArtists(track.artists);
  const lines = lyrics?.hasTimestamps && Array.isArray(lyrics.lines) ? lyrics.lines : [];

  if (lines.length === 0) {
    return {
      mode: 'fallback',
      prev: null,
      active: artistName,
      next: null,
      activeIndex: -1,
      lineKey: `fallback:${track.id}:${artistName}`,
    };
  }

  const timeMs = Number.isFinite(currentTimeSeconds) && currentTimeSeconds >= 0 ? currentTimeSeconds * 1000 : 0;
  const activeIndex = findActiveLyricIndex(lines, timeMs);

  if (activeIndex < 0) {
    const firstText = lines[0]?.text?.trim() || null;
    return {
      mode: 'synced-intro',
      prev: null,
      active: artistName,
      next: firstText,
      activeIndex: -1,
      lineKey: `intro:${track.id}`,
    };
  }

  const activeText = lines[activeIndex]?.text?.trim() || artistName;
  const prevText = activeIndex > 0 ? lines[activeIndex - 1]?.text?.trim() || null : null;
  const nextText =
    activeIndex + 1 < lines.length ? lines[activeIndex + 1]?.text?.trim() || null : null;

  return {
    mode: 'synced',
    prev: prevText,
    active: activeText,
    next: nextText,
    activeIndex,
    lineKey: `line:${track.id}:${activeIndex}:${lines[activeIndex]?.startTimeMs ?? 0}`,
  };
}

export interface NavigatorPlatformLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    platform?: string;
  };
}

export function isWindowsPlatform(navLike?: NavigatorPlatformLike | null): boolean {
  const nav =
    navLike ??
    (typeof navigator !== 'undefined'
      ? (navigator as unknown as NavigatorPlatformLike)
      : undefined);
  if (!nav) return false;

  const uaDataPlatform = (nav.userAgentData?.platform || '').trim().toLowerCase();
  if (uaDataPlatform) {
    return uaDataPlatform === 'windows';
  }

  const platform = (nav.platform || '').trim().toLowerCase();
  if (platform) {
    if (platform.startsWith('win')) return true;
    if (
      platform.includes('mac') ||
      platform.includes('linux') ||
      platform.includes('iphone') ||
      platform.includes('ipad') ||
      platform.includes('android')
    ) {
      return false;
    }
  }

  const ua = (nav.userAgent || '').toLowerCase();
  if (!ua) return false;
  if (ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
    return false;
  }
  return ua.includes('windows nt') || ua.includes('win64') || ua.includes('wow64');
}

export interface DocumentPiPWindowLike {
  documentPictureInPicture?: {
    requestWindow?: (options?: { width?: number; height?: number }) => Promise<Window>;
  };
}

export function supportsDocumentPictureInPicture(winLike?: unknown): boolean {
  const w =
    (winLike as DocumentPiPWindowLike | undefined) ??
    (typeof window !== 'undefined' ? (window as unknown as DocumentPiPWindowLike) : undefined);
  return typeof w?.documentPictureInPicture?.requestWindow === 'function';
}

export interface WindowsExternalNotchSupport {
  allowed: boolean;
  mode: 'desktop-ipc' | 'document-pip' | 'none';
  reason: 'ok' | 'windows-only' | 'unsupported-browser';
}

export function resolveWindowsExternalNotchSupport(input: {
  isWindows: boolean;
  hasDesktopHost: boolean;
  hasDocumentPiP: boolean;
}): WindowsExternalNotchSupport {
  if (!input.isWindows) {
    return {
      allowed: false,
      mode: 'none',
      reason: 'windows-only',
    };
  }
  if (input.hasDesktopHost) {
    return {
      allowed: true,
      mode: 'desktop-ipc',
      reason: 'ok',
    };
  }
  if (input.hasDocumentPiP) {
    return {
      allowed: true,
      mode: 'document-pip',
      reason: 'ok',
    };
  }
  return {
    allowed: false,
    mode: 'none',
    reason: 'unsupported-browser',
  };
}

export interface NotchVisibilityInput {
  hasTrack: boolean;
  isPlaying: boolean;
  hasActivePlayback: boolean;
  manuallyHidden: boolean;
  displayMode: NotchDisplayMode;
  isAppInBackground: boolean;
  forceOpen?: boolean;
  externalWindowActive?: boolean;
}

export function shouldShowNotchMiniPlayer(input: NotchVisibilityInput): boolean {
  if (input.externalWindowActive) return false;
  if (!input.hasTrack) return false;
  if (input.manuallyHidden) return false;

  if (input.forceOpen) {
    return true;
  }

  // When nothing has been started in the current session and playback is idle/paused,
  // keep the notch hidden ("Tidak ada lagu yang diputar: notch tersembunyi").
  if (!input.isPlaying && !input.hasActivePlayback) {
    return false;
  }

  if (input.displayMode === 'off') {
    return false;
  }
  if (input.displayMode === 'background') {
    return Boolean(input.isAppInBackground);
  }
  return true;
}
