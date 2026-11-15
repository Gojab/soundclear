import test from 'node:test';
import assert from 'node:assert/strict';
import type { StreamAudioMetaResponse } from '../api/client';
import {
  clearGlobalYoutubeBlocked,
  getCachedStreamProbe,
  isGlobalYoutubeBlocked,
  markGlobalYoutubeBlocked,
  probeStreamWithCache,
  resetProbeCacheForTests,
  shouldFastRouteToIframe,
} from './streamProbeCache';

function makeMeta(overrides: Partial<StreamAudioMetaResponse> = {}): StreamAudioMetaResponse {
  return {
    trackId: 'dQw4w9WgXcQ',
    available: true,
    fallbackMode: null,
    reason: null,
    codec: 'AAC',
    bitrateKbps: 160,
    sampleRateHz: 44100,
    ext: 'm4a',
    mimeType: 'audio/mp4',
    source: 'YouTube Music Audio',
    tier: 'high',
    cacheReady: true,
    ...overrides,
  };
}

test('probeStreamWithCache caches results until TTL expiration', async () => {
  resetProbeCacheForTests();
  let calls = 0;
  const fetcher = async (vid: string) => {
    calls += 1;
    return makeMeta({ trackId: vid });
  };

  const t0 = 1_000_000;
  const first = await probeStreamWithCache('trackAlpha1', { quality: 'high' }, fetcher, t0);
  const second = await probeStreamWithCache('trackAlpha1', { quality: 'high' }, fetcher, t0 + 30_000);
  assert.equal(first.codec, 'AAC');
  assert.equal(second.bitrateKbps, 160);
  assert.equal(calls, 1);

  assert.equal(getCachedStreamProbe('trackAlpha1', 'high', t0 + 11 * 60 * 1000), null);
});

test('probeStreamWithCache deduplicates concurrent in-flight requests', async () => {
  resetProbeCacheForTests();
  let calls = 0;
  const fetcher = async (vid: string) => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 15));
    return makeMeta({ trackId: vid });
  };

  const [a, b, c] = await Promise.all([
    probeStreamWithCache('concurrent1', { quality: 'high' }, fetcher, 2_000_000),
    probeStreamWithCache('concurrent1', { quality: 'high' }, fetcher, 2_000_000),
    probeStreamWithCache('concurrent1', { quality: 'high' }, fetcher, 2_000_000),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.trackId, 'concurrent1');
  assert.equal(b.trackId, 'concurrent1');
  assert.equal(c.trackId, 'concurrent1');
});

test('global YouTube bot-block fast-routes 11-char YouTube IDs in 0ms without hitting network', async () => {
  resetProbeCacheForTests();
  let calls = 0;
  const fetcher = async (vid: string) => {
    calls += 1;
    return makeMeta({
      trackId: vid,
      available: false,
      fallbackMode: 'youtube-iframe',
      reason: 'Aliran audio langsung sedang dibatasi YouTube.',
    });
  };

  // First blocked probe sets global block
  const res1 = await probeStreamWithCache('dQw4w9WgXcQ', { quality: 'high' }, fetcher, Date.now());
  assert.equal(res1.fallbackMode, 'youtube-iframe');
  assert.equal(isGlobalYoutubeBlocked(), true);
  assert.equal(shouldFastRouteToIframe('_N6vSc_mT6I'), true);
  assert.equal(shouldFastRouteToIframe('custom-slug-id'), false);

  // Next 11-char track resolves immediately with zero additional network calls
  const res2 = await probeStreamWithCache('_N6vSc_mT6I', { quality: 'high' }, fetcher, Date.now());
  assert.equal(res2.available, false);
  assert.equal(res2.fallbackMode, 'youtube-iframe');
  assert.equal(calls, 1);

  clearGlobalYoutubeBlocked();
  markGlobalYoutubeBlocked(5000, 100);
  assert.equal(isGlobalYoutubeBlocked(4999), true);
  assert.equal(isGlobalYoutubeBlocked(5100), false);
});

test('non-bot empty fallback reason does not trigger global YouTube block', async () => {
  resetProbeCacheForTests();
  const res = await probeStreamWithCache(
    'nonBot12345',
    { quality: 'high' },
    async (vid) =>
      makeMeta({
        trackId: vid,
        available: false,
        fallbackMode: 'youtube-iframe',
        reason: null,
      }),
    Date.now(),
  );
  assert.equal(res.fallbackMode, 'youtube-iframe');
  assert.equal(isGlobalYoutubeBlocked(), false);
});
