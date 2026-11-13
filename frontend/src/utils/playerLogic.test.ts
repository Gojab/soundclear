import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextIndex,
  computePrevIndex,
  findActiveLyricIndex,
  formatArtists,
  formatTime,
  getPlayableVideoId,
  getTrackUniqueId,
  isLocalTrack,
  isPlayableTrack,
  mergeWatchTracksIntoQueue,
} from './playerLogic';
import type { LyricLine, MediaItem } from '../types/music';

const makeTrack = (id: string, title: string): MediaItem => ({
  id,
  videoId: id,
  title,
  artists: [{ id: 'a1', name: 'Tulus' }],
  type: 'song',
});

test('formatTime formats mm:ss and hh:mm:ss cleanly', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(242), '4:02');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(-4), '0:00');
});

test('formatArtists joins names and handles missing artists', () => {
  assert.equal(formatArtists([{ name: 'Tulus' }, { name: 'Yura Yunita' }]), 'Tulus, Yura Yunita');
  assert.equal(formatArtists([]), 'Artis tidak diketahui');
});

test('findActiveLyricIndex matches current playback millisecond', () => {
  const lines: LyricLine[] = [
    { text: 'Baris satu', startTimeMs: 1000, endTimeMs: 5000 },
    { text: 'Baris dua', startTimeMs: 5200, endTimeMs: 9000 },
    { text: 'Baris tiga', startTimeMs: 9500, endTimeMs: 13000 },
  ];
  assert.equal(findActiveLyricIndex(lines, 500), -1);
  assert.equal(findActiveLyricIndex(lines, 1500), 0);
  assert.equal(findActiveLyricIndex(lines, 5100), 0);
  assert.equal(findActiveLyricIndex(lines, 6500), 1);
  assert.equal(findActiveLyricIndex(lines, 10000), 2);
});

test('computeNextIndex handles sequential, repeat, and shuffle modes', () => {
  assert.equal(computeNextIndex(0, 3, false, 'off'), 1);
  assert.equal(computeNextIndex(2, 3, false, 'off'), null);
  assert.equal(computeNextIndex(2, 3, false, 'all'), 0);
  assert.equal(computeNextIndex(1, 3, false, 'one'), 1);
  // Shuffle avoids repeating current index when queueLength > 1
  assert.equal(computeNextIndex(1, 3, true, 'off', () => 0.4), 2);
});

test('computePrevIndex restarts if > 3s else jumps back', () => {
  assert.deepEqual(computePrevIndex(2, 5, 10, 'off'), { action: 'restart', index: 2 });
  assert.deepEqual(computePrevIndex(2, 5, 1.5, 'off'), { action: 'jump', index: 1 });
  assert.deepEqual(computePrevIndex(0, 5, 1.0, 'all'), { action: 'jump', index: 4 });
  assert.deepEqual(computePrevIndex(0, 5, 1.0, 'off'), { action: 'restart', index: 0 });
});

test('mergeWatchTracksIntoQueue deduplicates while preserving manual upcoming', () => {
  const current = [makeTrack('v1', 'Lagu 1'), makeTrack('v2', 'Lagu 2')];
  const watch = [makeTrack('v1', 'Lagu 1'), makeTrack('v2', 'Lagu 2'), makeTrack('v3', 'Lagu 3')];
  const merged = mergeWatchTracksIntoQueue(current, 0, watch);
  assert.deepEqual(
    merged.map((t) => t.id),
    ['v1', 'v2', 'v3'],
  );
});

test('local audio tracks stay isolated from YouTube videoId resolution', () => {
  const localItem: MediaItem = {
    id: 'local_123',
    localFileId: 'local_123',
    title: 'Rekaman Demo',
    artists: [{ id: null, name: 'Artis Lokal' }],
    type: 'local',
  };
  assert.equal(isLocalTrack(localItem), true);
  assert.equal(getPlayableVideoId(localItem), null);
  assert.equal(getTrackUniqueId(localItem), 'local_123');
  assert.equal(isPlayableTrack(localItem), true);
});
