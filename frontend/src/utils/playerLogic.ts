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

export function isLocalTrack(item: MediaItem | null | undefined): boolean {
  return Boolean(item && (item.type === 'local' || item.localFileId));
}

export function getPlayableVideoId(item: MediaItem | null | undefined): string | null {
  if (!item || isLocalTrack(item)) return null;
  if (item.videoId) return item.videoId;
  if (item.type === 'song' || item.type === 'video' || item.type === 'episode') {
    return item.id || null;
  }
  return null;
}

export function getTrackUniqueId(item: MediaItem | null | undefined): string | null {
  if (!item) return null;
  if (isLocalTrack(item)) return item.localFileId || item.id;
  return getPlayableVideoId(item) || item.id || null;
}

export function isPlayableTrack(item: MediaItem | null | undefined): boolean {
  return Boolean(isLocalTrack(item) || getPlayableVideoId(item));
}

export function findActiveLyricIndex(lines: LyricLine[], currentTimeMs: number): number {
  if (!lines || lines.length === 0 || currentTimeMs < 0) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (currentTimeMs >= line.startTimeMs) {
      if (
        currentTimeMs < line.endTimeMs ||
        i === lines.length - 1 ||
        currentTimeMs < lines[i + 1].startTimeMs
      ) {
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
  const head =
    currentIndex >= 0 && currentIndex < currentQueue.length
      ? currentQueue.slice(0, currentIndex + 1)
      : [];

  for (const item of head) {
    const vid = getPlayableVideoId(item);
    if (vid) existingVideoIds.add(vid);
  }

  const manualUpcoming = currentIndex >= 0 ? currentQueue.slice(currentIndex + 1) : [];
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

export function getEffectiveThumbnail(
  url: string | null | undefined,
  dataSaver: boolean,
): string | null {
  if (!url) return null;
  if (!dataSaver || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return url.replace(/=w\d+-h\d+/, '=w120-h120');
}

export function findDuplicateTrackIndices(tracks: MediaItem[]): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  tracks.forEach((track, idx) => {
    const key = getTrackUniqueId(track) || track.id;
    if (seen.has(key)) {
      duplicates.add(idx);
    } else {
      seen.add(key);
    }
  });
  return duplicates;
}

export function interleaveSmartShuffleTracks(
  upcoming: MediaItem[],
  recommended: MediaItem[],
  currentVideoId: string | null,
): MediaItem[] {
  const existingIds = new Set<string>();
  if (currentVideoId) existingIds.add(currentVideoId);
  for (const t of upcoming) {
    const vid = getTrackUniqueId(t);
    if (vid) existingIds.add(vid);
  }

  const freshRecs = recommended.filter((r) => {
    const vid = getPlayableVideoId(r);
    if (!vid || existingIds.has(vid)) return false;
    existingIds.add(vid);
    return true;
  });

  if (freshRecs.length === 0) return upcoming;
  if (upcoming.length === 0) return freshRecs.slice(0, 10);

  const result: MediaItem[] = [];
  let recIdx = 0;
  for (let i = 0; i < upcoming.length; i += 1) {
    result.push(upcoming[i]);
    if ((i + 1) % 2 === 0 && recIdx < freshRecs.length) {
      result.push(freshRecs[recIdx]);
      recIdx += 1;
    }
  }
  while (recIdx < Math.min(freshRecs.length, 6)) {
    result.push(freshRecs[recIdx]);
    recIdx += 1;
  }
  return result;
}
