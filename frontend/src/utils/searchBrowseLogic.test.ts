import assert from 'node:assert/strict';
import test from 'node:test';
import type { HomeSection, MediaItem, MoodCategoryGroup } from '../types/music';
import {
  buildAllBrowseCategoryCards,
  buildQuickBrowseCards,
  pickDiscoverSomethingElse,
  pickSearchSpotlight,
} from './searchBrowseLogic';

const sampleSongs: MediaItem[] = [
  {
    id: 'vid-1',
    videoId: 'vid-1',
    title: 'Teh Hijau',
    artists: [{ id: 'a1', name: 'Tulus' }],
    thumbnail: 'https://lh3.googleusercontent.com/art1=w544-h544',
    type: 'song',
  },
  {
    id: 'vid-2',
    videoId: 'vid-2',
    title: 'Komang',
    artists: [{ id: 'a2', name: 'Raim Laode' }],
    thumbnail: 'https://lh3.googleusercontent.com/art2=w544-h544',
    type: 'song',
  },
  {
    id: 'vid-3',
    videoId: 'vid-3',
    title: 'Perayaan Patah Hati',
    artists: [{ id: 'a3', name: 'For Revenge' }],
    thumbnail: 'https://lh3.googleusercontent.com/art3=w544-h544',
    type: 'song',
  },
  {
    id: 'vid-4',
    videoId: 'vid-4',
    title: 'Bertaut',
    artists: [{ id: 'a4', name: 'Nadin Amizah' }],
    thumbnail: 'https://lh3.googleusercontent.com/art4=w544-h544',
    type: 'song',
  },
  {
    id: 'jp-blocked',
    videoId: 'jp-blocked',
    title: 'Tokyo Anime Song',
    artists: [{ id: 'jp1', name: 'J-Pop Idol' }],
    thumbnail: 'https://lh3.googleusercontent.com/jp=w544-h544',
    type: 'song',
  },
];

const sampleSections: HomeSection[] = [
  { title: 'Pop Hits', items: sampleSongs },
];

const sampleMoods: MoodCategoryGroup[] = [
  {
    title: 'Moods & Moments',
    items: [
      { title: 'Chill', params: 'chill-params' },
      { title: 'Workout', params: 'workout-params' },
      { title: 'J-Pop', params: 'jpop-blocked' },
      { title: 'Afro Beats', params: 'afro-params' },
    ],
  },
];

test('buildQuickBrowseCards creates 6 colored quick-access cards wired to SoundClear actions', () => {
  const cards = buildQuickBrowseCards({
    moodGroups: sampleMoods,
    chartSongs: sampleSongs,
    homeSections: sampleSections,
  });

  assert.equal(cards.length, 6);
  assert.equal(cards[0].title, 'Musik');
  assert.equal(cards[2].title, 'Audio Lokal');
  assert.deepEqual(cards[2].action, { kind: 'library' });
  assert.equal(cards[5].title, 'Dibuat Untukmu');
  assert.deepEqual(cards[5].action, { kind: 'mix', id: 'daily-mix-1' });
  assert.ok(cards.every((c) => c.bgColor.startsWith('#')));
  assert.ok(cards.every((c) => Boolean(c.thumbnail)));
});

test('buildAllBrowseCategoryCards matches real mood params and filters excluded regional categories', () => {
  const cards = buildAllBrowseCategoryCards({
    moodGroups: sampleMoods,
    chartSongs: sampleSongs,
    homeSections: sampleSections,
  });

  assert.ok(cards.length >= 24);
  assert.ok(!cards.some((c) => /j-?pop|jepang|anime/i.test(c.title)));

  const chillCard = cards.find((c) => c.title === 'Chill');
  assert.ok(chillCard);
  assert.deepEqual(chillCard.action, {
    kind: 'mood',
    params: 'chill-params',
    title: 'Chill',
  });

  const workoutCard = cards.find((c) => c.title === 'Musik Olahraga');
  assert.ok(workoutCard);
  assert.deepEqual(workoutCard.action, {
    kind: 'mood',
    params: 'workout-params',
    title: 'Workout',
  });

  const afroCard = cards.find((c) => c.title === 'Afro Beats');
  assert.ok(afroCard);
});

test('pickSearchSpotlight and pickDiscoverSomethingElse pick valid playable items and skip excluded items', () => {
  const spotlight = pickSearchSpotlight(sampleSongs, sampleSections);
  assert.ok(spotlight);
  assert.equal(spotlight.item.id, 'vid-4');
  assert.equal(spotlight.artistLine, 'Nadin Amizah');

  const more = pickDiscoverSomethingElse(sampleSongs, sampleSections, spotlight.item.id);
  assert.ok(more.length > 0);
  assert.ok(!more.some((m) => m.id === spotlight.item.id));
  assert.ok(!more.some((m) => m.id === 'jp-blocked'));
});
