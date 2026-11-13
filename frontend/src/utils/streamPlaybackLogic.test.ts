import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildYoutubeIframeStreamMeta,
  decideOnlineStreamAction,
  isYoutubeIframeActive,
  pickNextYoutubeFallbackCandidate,
} from './streamPlaybackLogic';

test('decideOnlineStreamAction switches to youtube-iframe when backend stream is unavailable', () => {
  assert.equal(
    decideOnlineStreamAction({ available: true, fallbackMode: null }),
    'play-audio',
  );
  assert.equal(
    decideOnlineStreamAction({ available: false, fallbackMode: 'youtube-iframe' }),
    'use-youtube-iframe',
  );
  assert.equal(decideOnlineStreamAction(null), 'use-youtube-iframe');
});

test('buildYoutubeIframeStreamMeta creates honest non-DSP YouTube Music metadata', () => {
  const meta = buildYoutubeIframeStreamMeta('5F28ye50-Kc', '_N6vSc_mT6I', 'high');
  assert.equal(meta.trackId, '5F28ye50-Kc');
  assert.equal(meta.resolvedVideoId, '_N6vSc_mT6I');
  assert.equal(meta.sourceMode, 'youtube-iframe');
  assert.equal(meta.actualTier, 'youtube');
  assert.equal(meta.audiodownloadAllowed, false);
  assert.equal(isYoutubeIframeActive(meta), true);
  assert.equal(isYoutubeIframeActive({ sourceMode: 'webaudio' }), false);
});

test('pickNextYoutubeFallbackCandidate skips already attempted video IDs', () => {
  const attempted = new Set(['vidA', 'vidB']);
  assert.equal(pickNextYoutubeFallbackCandidate(attempted, ['vidA', 'vidB', 'vidC']), 'vidC');
  assert.equal(pickNextYoutubeFallbackCandidate(attempted, ['vidA', 'vidB']), null);
  assert.equal(pickNextYoutubeFallbackCandidate(attempted, []), null);
});
