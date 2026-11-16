import type { MediaItem } from '../types/music';
import { formatArtists } from './playerLogic';

export interface MediaArtworkEntry {
  src: string;
  sizes?: string;
  type?: string;
}

export interface MediaPositionStateInput {
  duration: number;
  currentTime: number;
  playbackRate: number;
}

export interface SafeMediaPositionState {
  duration: number;
  position: number;
  playbackRate: number;
}

export interface PlatformDetectionInput {
  userAgent?: string;
  maxTouchPoints?: number;
  isStandalone?: boolean;
}

export interface PwaPlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  isStandalone: boolean;
}

function inferImageMimeType(url: string): string | undefined {
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/')) {
    const end = lower.indexOf(';');
    return end > 5 ? lower.slice(5, end) : undefined;
  }
  const pathOnly = lower.split('?')[0].split('#')[0];
  if (pathOnly.endsWith('.png')) return 'image/png';
  if (pathOnly.endsWith('.webp')) return 'image/webp';
  if (pathOnly.endsWith('.jpg') || pathOnly.endsWith('.jpeg')) return 'image/jpeg';
  if (pathOnly.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}

export function resolveAbsoluteAssetUrl(src: string, origin?: string): string {
  const clean = src.trim();
  if (!clean) return '';
  if (/^(https?:|data:|blob:)/i.test(clean)) return clean;
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return clean;
  try {
    return new URL(clean, base).href;
  } catch {
    return clean;
  }
}

export function resolveMediaArtwork(
  thumbnail?: string | null,
  origin?: string,
): MediaArtworkEntry[] {
  const entries: MediaArtworkEntry[] = [];
  const raw = (thumbnail || '').trim();
  if (raw) {
    const resolved = resolveAbsoluteAssetUrl(raw, origin);
    if (resolved) {
      const mime = inferImageMimeType(resolved);
      entries.push({
        src: resolved,
        sizes: '512x512',
        ...(mime ? { type: mime } : {}),
      });
    }
  }

  const icon512 = resolveAbsoluteAssetUrl('/pwa-512x512.png', origin);
  const icon192 = resolveAbsoluteAssetUrl('/pwa-192x192.png', origin);

  if (entries.length === 0) {
    if (icon512) entries.push({ src: icon512, sizes: '512x512', type: 'image/png' });
    if (icon192) entries.push({ src: icon192, sizes: '192x192', type: 'image/png' });
  }

  return entries;
}

export function buildMediaMetadataInit(
  track: MediaItem,
  origin?: string,
): {
  title: string;
  artist: string;
  album: string;
  artwork: MediaArtworkEntry[];
} {
  return {
    title: track.title || 'SoundClear',
    artist: formatArtists(track.artists) || 'SoundClear',
    album: track.album?.name || 'SoundClear',
    artwork: resolveMediaArtwork(track.thumbnail, origin),
  };
}

export function buildMediaPositionState(
  input: MediaPositionStateInput,
): SafeMediaPositionState | null {
  const { duration, currentTime, playbackRate } = input;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!Number.isFinite(currentTime) || currentTime < 0) return null;

  const safeRate =
    Number.isFinite(playbackRate) && playbackRate > 0
      ? Math.max(0.25, Math.min(4, playbackRate))
      : 1;

  return {
    duration,
    position: Math.max(0, Math.min(currentTime, duration)),
    playbackRate: safeRate,
  };
}

export function detectPwaPlatform(env?: PlatformDetectionInput): PwaPlatformInfo {
  const ua = (
    env?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')
  ).toLowerCase();
  const touchPoints =
    env?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);

  const isStandalone =
    env?.isStandalone ??
    (typeof window !== 'undefined'
      ? window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      : false);

  const isIPadDesktopMode = /macintosh/.test(ua) && touchPoints > 1;
  const isIOS = /iphone|ipad|ipod/.test(ua) || isIPadDesktopMode;
  const isAndroid = /android/.test(ua);
  const isFirefox = /firefox|fxios/.test(ua);
  const isSafari =
    /safari/.test(ua) &&
    !/chrome|crios|fxios|edg|opr|android/.test(ua);

  return {
    isIOS,
    isAndroid,
    isSafari,
    isFirefox,
    isStandalone,
  };
}
