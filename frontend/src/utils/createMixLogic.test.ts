import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediaItem } from '../types/music';
import {
  buildCustomMixMeta,
  curateCustomMixTracks,
  formatMixDurationSummary,
} from './createMixLogic';

function song(
  id: string,
  title: string,
  artist: string,
  extra: Partial<MediaItem> = {},
): MediaItem {
  return {
    id,
    videoId: id,
    title,
    artists: [{ id: `art-${artist.toLowerCase().replace(/\s+/g, '-')}`, name: artist }],
    thumbnail: `https://lh3.googleusercontent.com/${id}=w544-h544-l90-rj`,
    type: 'song',
    durationSeconds: 210,
    ...extra,
  };
}

test('curateCustomMixTracks blends multi-seed buckets, deduplicates, and preserves anchors', () => {
  const seed1 = song('abcdefgh101', 'Hati-Hati di Jalan', 'Tulus');
  const seed2 = song('abcdefgh102', 'Sesi Potret', 'enau');

  const bucketA = [
    seed1, // duplicate of seed
    song('abcdefgh999', 'Hati-Hati di Jalan (Official Audio)', 'Tulus'), // alternate videoId of seed1
    song('abcdefgh103', 'Monokrom', 'Tulus'),
    song('abcdefgh104', 'Sial', 'Mahalini'),
    song('abcdefgh105', 'Komang', 'Raim Laode'),
  ];
  const bucketB = [
    song('abcdefgh106', 'Membasuh', 'Hindia'),
    song('abcdefgh107', 'Bertaut', 'Nadin Amizah'),
    song('abcdefgh104', 'Sial', 'Mahalini'), // duplicate across buckets
  ];

  const curated = curateCustomMixTracks({
    seedTracks: [seed1, seed2],
    buckets: [bucketA, bucketB],
    targetCount: 15,
  });

  const ids = curated.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'should deduplicate tracks across seeds and buckets');
  assert.ok(!ids.includes('abcdefgh999'), 'should skip alternate audio/video version of same song');
  assert.ok(ids.includes('abcdefgh101'));
  assert.ok(ids.includes('abcdefgh102'));
  assert.equal(curated[0].id, 'abcdefgh101');
  assert.ok(curated.length >= 6);
});

test('curateCustomMixTracks filters hidden, excluded taste, explicit, and excluded regional items', () => {
  const seed = song('validseed01', 'Interaksi', 'Tulus');
  const bucket = [
    song('hidden00001', 'Lagu Tersembunyi', 'Artis A'),
    song('taste000001', 'Tidak Disukai', 'Artis B'),
    song('explicit001', 'Lagu Eksplisit', 'Artis C', { isExplicit: true }),
    song('jpblocked01', 'Idol', 'YOASOBI'),
    song('inblocked01', 'Tum Hi Ho', 'Arijit Singh'),
    song('validtrack1', 'Tutur Batin', 'Yura Yunita'),
  ];

  const curated = curateCustomMixTracks({
    seedTracks: [seed],
    buckets: [bucket],
    targetCount: 15,
    hiddenTrackIds: ['hidden00001'],
    excludedTasteIds: ['taste000001'],
    hideExplicit: true,
  });

  assert.deepEqual(
    curated.map((t) => t.id),
    ['validseed01', 'validtrack1'],
  );
});

test('buildCustomMixMeta and formatMixDurationSummary generate clean titles and duration text', () => {
  const s1 = song('trackseed01', 'Hati-Hati di Jalan', 'Tulus');
  const s2 = song('trackseed02', 'Bertaut', 'Nadin Amizah');

  const genreMeta = buildCustomMixMeta({
    mode: 'genre',
    seedTracks: [],
    selectedGenres: ['Pop Indonesia', 'Indie & Senja'],
    tracks: [s1, s2],
  });
  assert.equal(genreMeta.title, 'Blend Pop Indonesia & Indie & Senja');
  assert.ok(genreMeta.subtitle.includes('Tulus'));
  assert.ok(genreMeta.coverArt);

  const blendMeta = buildCustomMixMeta({
    mode: 'blend',
    seedTracks: [s1, s2],
    selectedGenres: ['Chill'],
    tracks: [s1, s2],
  });
  assert.equal(blendMeta.title, 'Blend: Hati-Hati di Jalan + Bertaut');

  const customMeta = buildCustomMixMeta({
    mode: 'track',
    seedTracks: [s1],
    selectedGenres: [],
    tracks: [s1, s2],
    customTitle: 'Senja Akhir Pekan',
  });
  assert.equal(customMeta.title, 'Senja Akhir Pekan');

  assert.equal(formatMixDurationSummary([s1, s2]), '2 lagu · 7 mnt');
});
