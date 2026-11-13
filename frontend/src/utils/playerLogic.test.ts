import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchFollowUps,
  computeNextIndex,
  computePrevIndex,
  extractTracksFromArtistDetail,
  findActiveLyricIndex,
  formatArtists,
  formatTime,
  getPlayableVideoId,
  getTrackUniqueId,
  hasPlayableOfflineAudio,
  isCollectionPlayableType,
  isExcludedRegionalItem,
  isExcludedRegionalText,
  isLocalTrack,
  isPlayableTrack,
  isYouTubeVideoId,
  mergeWatchTracksIntoQueue,
  normalizeRouteId,
  podcastEpisodesToMediaItems,
} from './playerLogic';
import type { ArtistDetailResponse, LyricLine, MediaItem, PodcastEpisode } from '../types/music';

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

test('isYouTubeVideoId distinguishes 11-char YouTube IDs from Spotify track IDs', () => {
  assert.equal(isYouTubeVideoId('dQw4w9WgXcQ'), true);
  assert.equal(isYouTubeVideoId('CSKr9seKdgI'), true);
  assert.equal(isYouTubeVideoId('4xoY4lZNoTjEuHsSmhgF1G'), false);
  assert.equal(isYouTubeVideoId(''), false);
  assert.equal(isYouTubeVideoId(null), false);
});

test('normalizeRouteId sanitizes Spotify URIs, URLs, and rejects empty or nullish IDs', () => {
  assert.equal(normalizeRouteId('4xoY4lZNoTjEuHsSmhgF1G'), '4xoY4lZNoTjEuHsSmhgF1G');
  assert.equal(normalizeRouteId('spotify:artist:4tZwfgrHOc3mvqYlEYSvVi'), '4tZwfgrHOc3mvqYlEYSvVi');
  assert.equal(
    normalizeRouteId('https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX?si=abc'),
    '1ATL5GLyefJaxhQzSPVrLX',
  );
  assert.equal(normalizeRouteId('  '), null);
  assert.equal(normalizeRouteId('undefined'), null);
  assert.equal(normalizeRouteId(null), null);
});

test('isCollectionPlayableType identifies albums, playlists, artists, and podcasts', () => {
  assert.equal(isCollectionPlayableType('album'), true);
  assert.equal(isCollectionPlayableType('playlist'), true);
  assert.equal(isCollectionPlayableType('artist'), true);
  assert.equal(isCollectionPlayableType('podcast'), true);
  assert.equal(isCollectionPlayableType('song'), false);
  assert.equal(isCollectionPlayableType('local'), false);
});

test('podcastEpisodesToMediaItems converts episodes into playable MediaItem tracks', () => {
  const episodes: PodcastEpisode[] = [
    {
      id: 'ep1',
      videoId: 'abc12345678',
      title: 'Episode 1: Pembuka',
      duration: '12:30',
      durationSeconds: 750,
      podcastId: 'pod1',
      podcastTitle: 'Podcast Harian',
    },
    {
      id: '',
      videoId: '',
      title: 'Invalid',
    },
  ];
  const converted = podcastEpisodesToMediaItems(episodes, 'Host', 'https://example.com/cover.jpg');
  assert.equal(converted.length, 1);
  assert.equal(converted[0].type, 'episode');
  assert.equal(converted[0].videoId, 'abc12345678');
  assert.equal(converted[0].artists[0].name, 'Podcast Harian');
  assert.equal(converted[0].thumbnail, 'https://example.com/cover.jpg');
  assert.equal(isPlayableTrack(converted[0]), true);
});

test('extractTracksFromArtistDetail prefers songs and falls back to videos', () => {
  const artistWithSongs: ArtistDetailResponse = {
    id: 'UC123',
    name: 'Tulus',
    songs: [makeTrack('5F28ye50-Kc', 'Hati-Hati di Jalan')],
    albums: [],
    singles: [],
    compilations: [],
    appearsOn: [],
    videos: [makeTrack('dQw4w9WgXcQ', 'Video Fallback')],
    related: [],
  };
  assert.deepEqual(
    extractTracksFromArtistDetail(artistWithSongs).map((t) => t.id),
    ['5F28ye50-Kc'],
  );

  const artistVideosOnly: ArtistDetailResponse = {
    ...artistWithSongs,
    songs: [],
  };
  assert.deepEqual(
    extractTracksFromArtistDetail(artistVideosOnly).map((t) => t.id),
    ['dQw4w9WgXcQ'],
  );
});

test('hasPlayableOfflineAudio validates playable local audio blobs vs metadata cache', () => {
  const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' });
  const jsonBlob = new Blob(['{"ok":true}'], { type: 'application/json' });

  assert.equal(
    hasPlayableOfflineAudio({
      hasAudioBlob: true,
      mimeType: 'audio/mpeg',
      blob: audioBlob,
    }),
    true,
  );
  assert.equal(
    hasPlayableOfflineAudio({
      hasAudioBlob: false,
      mimeType: 'application/json',
      blob: jsonBlob,
    }),
    false,
  );
  assert.equal(
    hasPlayableOfflineAudio({
      mimeType: 'application/json',
      blob: audioBlob,
    }),
    false,
  );
  assert.equal(hasPlayableOfflineAudio(null), false);
});

test('isExcludedRegionalText and isExcludedRegionalItem block Japanese and Indian songs while keeping ID/EN/KR', () => {
  assert.equal(isExcludedRegionalText('愛の形 - Ai no Katachi'), true);
  assert.equal(isExcludedRegionalText('YOASOBI - 夜に駆ける'), true);
  assert.equal(isExcludedRegionalText('Dilruba Dilnasheen'), true);
  assert.equal(isExcludedRegionalText('Tum Hi Ho - Arijit Singh'), true);
  assert.equal(isExcludedRegionalText('A R J I T S I N G H..'), true);
  assert.equal(isExcludedRegionalText('Y O A S O B I'), true);
  assert.equal(isExcludedRegionalText('Kis-My-Ft2'), true);
  assert.equal(isExcludedRegionalText('𝐁𝐨𝐥𝐥𝐲𝐰𝐨𝐨𝐝 Hits'), true);
  assert.equal(isExcludedRegionalText('Taiwan Top Pop'), true);
  assert.equal(isExcludedRegionalText('XG - WOKE UP'), true);
  assert.equal(isExcludedRegionalText('Hikaru Utada - First Love'), true);
  assert.equal(isExcludedRegionalText('Jyoti Magar'), true);

  assert.equal(isExcludedRegionalText('Tulus - Hati-Hati di Jalan'), false);
  assert.equal(isExcludedRegionalText('NewJeans - Ditto'), false);
  assert.equal(isExcludedRegionalText('Kira-kira kapan ya'), false);
  assert.equal(isExcludedRegionalText('Terbelah Jadi Dua'), false);

  assert.equal(
    isExcludedRegionalItem({
      title: 'La la la',
      artists: [{ id: null, name: 'Hey! Say! JUMP' }],
      album: null,
      description: null,
    }),
    true,
  );
  assert.equal(
    isExcludedRegionalItem({
      title: 'Monokrom',
      artists: [{ id: null, name: 'Tulus' }],
      album: { id: null, name: 'Monokrom' },
      description: 'Pop Indonesia',
    }),
    false,
  );
});

test('buildSearchFollowUps produces deduplicated, regionally safe follow-up queries', () => {
  const sampleItems: MediaItem[] = [
    {
      id: '5F28ye50-Kc',
      videoId: '5F28ye50-Kc',
      title: 'Hati-Hati di Jalan',
      artists: [{ id: 'UCtulus', name: 'Tulus' }],
      thumbnail: null,
      type: 'song',
    },
  ];
  const followUps = buildSearchFollowUps(
    'Tulus',
    sampleItems,
    ['Tulus', 'Tulus Monokrom', 'Tulus YOASOBI', 'Arijit Singh'],
    'all',
  );
  assert.ok(followUps.length >= 4);
  assert.ok(followUps.some((f) => f.label.includes('Tulus')));
  assert.ok(followUps.some((f) => f.query === 'Tulus Monokrom'));
  assert.equal(
    followUps.some((f) => /yoasobi|arijit/i.test(f.query)),
    false,
  );
});
