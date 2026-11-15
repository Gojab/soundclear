import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAudioBlobWithRangeSupport, parseContentRangeHeader } from './client';

test('parseContentRangeHeader parses valid Content-Range headers and rejects malformed values', () => {
  assert.deepEqual(parseContentRangeHeader('bytes 0-1572863/4200000'), {
    start: 0,
    end: 1572863,
    total: 4200000,
  });
  assert.deepEqual(parseContentRangeHeader('  BYTES 100-199/200 '), {
    start: 100,
    end: 199,
    total: 200,
  });
  assert.equal(parseContentRangeHeader(null), null);
  assert.equal(parseContentRangeHeader('bytes */4200000'), null);
  assert.equal(parseContentRangeHeader('bytes 0-10/0'), null);
});

test('fetchAudioBlobWithRangeSupport reassembles 206 Partial Content chunks into one audio Blob', async () => {
  const fullData = new Uint8Array([10, 20, 30, 40, 50, 60, 70]);
  const calls: Array<{ url: string; range: string | null }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headersObj = new Headers(init?.headers);
    const range = headersObj.get('Range');
    calls.push({ url, range });

    if (!range) {
      return new Response(fullData.slice(0, 3), {
        status: 206,
        headers: {
          'Content-Type': 'audio/mp4',
          'Content-Range': 'bytes 0-2/7',
        },
      });
    }
    if (range === 'bytes=3-') {
      return new Response(fullData.slice(3, 6), {
        status: 206,
        headers: {
          'Content-Type': 'audio/mp4',
          'Content-Range': 'bytes 3-5/7',
        },
      });
    }
    return new Response(fullData.slice(6, 7), {
      status: 206,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Range': 'bytes 6-6/7',
      },
    });
  }) as typeof fetch;

  try {
    const blob = await fetchAudioBlobWithRangeSupport('/api/stream/test123');
    assert.ok(blob);
    assert.equal(blob.type, 'audio/mp4');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.deepEqual(Array.from(bytes), Array.from(fullData));
    assert.equal(calls.length, 3);
    assert.equal(calls[1]?.range, 'bytes=3-');
    assert.equal(calls[2]?.range, 'bytes=6-');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildBackgroundSessionPayload bounds queue slices and enforces playing invariants', async () => {
  const mod = await import('./client');
  const payload = mod.buildBackgroundSessionPayload({
    sessionId: 'sc-test',
    isPlaying: true,
    currentTime: -5,
    duration: 210,
    playbackRate: 1.25,
    repeat: 'all',
    shuffle: true,
    sourceLabel: 'Tangga Lagu Indonesia',
    currentTrack: null,
    manualQueue: [],
    sourceQueue: [],
  });
  assert.equal(payload.sessionId, 'sc-test');
  assert.equal(payload.isPlaying, false);
  assert.equal(payload.currentTime, 0);
  assert.equal(payload.duration, 210);
  assert.equal(payload.playbackRate, 1.25);
});

