import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRecapSummary, filterHistoryByRange, getGreetingByHour } from './recapLogic';
import type { PlayHistoryEntry } from '../types/music';

const NOW = new Date('2026-11-12T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const sampleHistory: PlayHistoryEntry[] = [
  {
    trackId: 't1',
    playedAt: NOW - 2 * DAY,
    durationListenedSec: 240,
    sourceType: 'song',
    genreHint: 'Pop Indonesia',
    track: {
      id: 't1',
      videoId: 't1',
      title: 'Hati-Hati di Jalan',
      artists: [{ id: 'a1', name: 'Tulus' }],
      type: 'song',
    },
  },
  {
    trackId: 't1',
    playedAt: NOW - 5 * DAY,
    durationListenedSec: 240,
    sourceType: 'song',
    genreHint: 'Pop Indonesia',
    track: {
      id: 't1',
      videoId: 't1',
      title: 'Hati-Hati di Jalan',
      artists: [{ id: 'a1', name: 'Tulus' }],
      type: 'song',
    },
  },
  {
    trackId: 't2',
    playedAt: NOW - 60 * DAY,
    durationListenedSec: 180,
    sourceType: 'song',
    genreHint: 'Indie',
    track: {
      id: 't2',
      videoId: 't2',
      title: 'Kukira Kau Rumah',
      artists: [{ id: 'a2', name: 'Amigdala' }],
      type: 'song',
    },
  },
];

test('filterHistoryByRange filters 4w, 6m, and all accurately', () => {
  assert.equal(filterHistoryByRange(sampleHistory, '4w', NOW).length, 2);
  assert.equal(filterHistoryByRange(sampleHistory, '6m', NOW).length, 3);
  assert.equal(filterHistoryByRange(sampleHistory, 'all', NOW).length, 3);
});

test('computeRecapSummary aggregates total minutes, top tracks, artists, and monthly chart', () => {
  const summary = computeRecapSummary(sampleHistory, 'all', NOW);
  assert.equal(summary.totalPlays, 3);
  assert.equal(summary.totalMinutes, 11);
  assert.equal(summary.topTracks[0].key, 't1');
  assert.equal(summary.topTracks[0].plays, 2);
  assert.equal(summary.topArtists[0].item.name, 'Tulus');
  assert.equal(summary.topGenres[0].item.name, 'Pop Indonesia');
  assert.equal(summary.monthlyBreakdown.length, 2);
});

test('getGreetingByHour returns Indonesian greeting for each part of day', () => {
  assert.equal(getGreetingByHour(7).greeting, 'Selamat pagi');
  assert.equal(getGreetingByHour(13).greeting, 'Selamat siang');
  assert.equal(getGreetingByHour(17).greeting, 'Selamat sore');
  assert.equal(getGreetingByHour(22).greeting, 'Selamat malam');
});
