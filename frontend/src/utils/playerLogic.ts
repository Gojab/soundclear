import type { ArtistRef, LyricLine, MediaItem, RepeatMode } from '../types/music';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const secStr = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const minStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minStr}:${secStr}`;
  }
  return `${mins}:${secStr}`;
}

export function formatArtists(artists: ArtistRef[] | undefined | null): string {
  if (!artists || artists.length === 0) return 'Artis tidak diketahui';
  return artists.map((a) => a.name).filter(Boolean).join(', ') || 'Artis tidak diketahui';
}

export function getPlayableVideoId(item: MediaItem | null | undefined): string | null {
  if (!item) return null;
  if (item.videoId) return item.videoId;
  if (item.type === 'song' || item.type === 'video') return item.id || null;
  return null;
}

export function findActiveLyricIndex(lines: LyricLine[], currentTimeMs: number): number {
  if (!lines || lines.length === 0 || currentTimeMs < 0) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (currentTimeMs >= line.startTimeMs) {
      if (currentTimeMs < line.endTimeMs || i === lines.length - 1 || currentTimeMs < lines[i + 1].startTimeMs) {
        active = i;
      }
    } else {
      break;
    }
  }
  return active;
}

export function computeNextIndex(
  currentIndex: number,
  queueLength: number,
  shuffle: boolean,
  repeat: RepeatMode,
  randomFn: () => number = Math.random,
): number | null {
  if (queueLength <= 0) return null;
  if (repeat === 'one') return currentIndex >= 0 ? currentIndex : 0;

  if (shuffle && queueLength > 1) {
    let candidate = Math.floor(randomFn() * queueLength);
    if (candidate === currentIndex) {
      candidate = (currentIndex + 1) % queueLength;
    }
    return candidate;
  }

  const next = currentIndex + 1;
  if (next < queueLength) return next;
  if (repeat === 'all') return 0;
  return null;
}

export function computePrevIndex(
  currentIndex: number,
  queueLength: number,
  currentTimeSeconds: number,
  repeat: RepeatMode,
): { action: 'restart' | 'jump'; index: number | null } {
  if (queueLength <= 0) return { action: 'restart', index: null };
  if (currentTimeSeconds > 3) {
    return { action: 'restart', index: currentIndex >= 0 ? currentIndex : 0 };
  }
  if (currentIndex > 0) {
    return { action: 'jump', index: currentIndex - 1 };
  }
  if (repeat === 'all') {
    return { action: 'jump', index: queueLength - 1 };
  }
  return { action: 'restart', index: 0 };
}

export function mergeWatchTracksIntoQueue(
  currentQueue: MediaItem[],
  currentIndex: number,
  watchTracks: MediaItem[],
): MediaItem[] {
  const existingVideoIds = new Set<string>();
  const head = currentIndex >= 0 && currentIndex < currentQueue.length
    ? currentQueue.slice(0, currentIndex + 1)
    : [];

  for (const item of head) {
    const vid = getPlayableVideoId(item);
    if (vid) existingVideoIds.add(vid);
  }

  const manualUpcoming = currentIndex >= 0
    ? currentQueue.slice(currentIndex + 1)
    : [];
  for (const item of manualUpcoming) {
    const vid = getPlayableVideoId(item);
    if (vid) existingVideoIds.add(vid);
  }

  const additions: MediaItem[] = [];
  for (const track of watchTracks) {
    const vid = getPlayableVideoId(track);
    if (!vid || existingVideoIds.has(vid)) continue;
    existingVideoIds.add(vid);
    additions.push(track);
  }

  return [...head, ...manualUpcoming, ...additions];
}
