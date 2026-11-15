import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyMixes } from './mixLogic';
import type { MediaItem } from '../types/music';

function song(id: string, title: string, artist: string, thumb?: string): MediaItem {
  return {
    id,
    videoId: id,
    title,
    artists: [{ id: `uc_${artist.toLowerCase()}`, name: artist }],
    thumbnail: thumb ?? `https://lh3.googleusercontent.com/${id}=w544-h544-l90-rj`,
    type: 'song',
  };
}

test('buildDailyMixes creates Daily Mix 1..3 + genre mixes even with empty user history', () => {
  const chartSongs: MediaItem[] = [
    song('vid00000001', 'Hati-Hati di Jalan', 'Tulus'),
    song('vid00000002', 'Sial', 'Mahalini'),
    song('vid00000003', 'Satu Bulan', 'Bernadya'),
    song('vid00000004', 'Evaluasi', 'Hindia'),
    song('vid00000005', 'Bertaut', 'Nadin Amizah'),
    song('vid00000006', 'Monokrom', 'Tulus'),
  ];

  const mixes = buildDailyMixes({
    chartSongs,
    homeSections: [],
    likedTracks: [],
    playHistory: [],
  });

  assert.equal(mixes.length, 5);
  assert.deepEqual(
    mixes.map((m) => m.id),
    ['daily-mix-1', 'daily-mix-2', 'daily-mix-3', 'pop-indonesia-mix', 'indie-santai-mix'],
  );
  assert.equal(mixes[0].title, 'Daily Mix 1');
  assert.ok(mixes[0].tracks.length >= 5);
  assert.ok(mixes[0].coverArt);
  assert.ok(mixes[0].subtitle.includes('Tulus'));
});

test('buildDailyMixes filters hidden, taste-excluded, explicit, and excluded regional items', () => {
  const chartSongs: MediaItem[] = [
    song('vid00000001', 'Hati-Hati di Jalan', 'Tulus'),
    song('vid00000002', 'Excluded Taste Song', 'Tulus'),
    song('vid00000003', 'Hidden Song', 'Mahalini'),
    { ...song('vid00000004', 'Explicit Track', 'Pamungkas'), isExplicit: true },
    song('vid00000005', 'Idol', 'YOASOBI'),
    song('vid00000006', 'Tum Hi Ho', 'Arijit Singh'),
    song('vid00000007', 'Satu Bulan', 'Bernadya'),
  ];

  const mixes = buildDailyMixes({
    chartSongs,
    homeSections: [],
    likedTracks: [],
    playHistory: [],
    excludedTasteIds: ['vid00000002'],
    hiddenTrackIds: ['vid00000003'],
    hideExplicit: true,
  });

  assert.ok(mixes.length > 0);
  for (const mix of mixes) {
    const ids = new Set(mix.tracks.map((t) => t.id));
    assert.equal(ids.has('vid00000002'), false);
    assert.equal(ids.has('vid00000003'), false);
    assert.equal(ids.has('vid00000004'), false);
    assert.equal(ids.has('vid00000005'), false);
    assert.equal(ids.has('vid00000006'), false);
    assert.equal(ids.has('vid00000001'), true);
    assert.equal(ids.has('vid00000007'), true);
  }
});
