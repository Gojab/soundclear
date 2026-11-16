import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMediaMetadataInit,
  buildMediaPositionState,
  detectPwaPlatform,
  resolveEffectiveMediaSessionPlaybackState,
  resolveMediaArtwork,
} from './mediaSessionLogic.ts';

test('resolveMediaArtwork resolves relative URLs, infers MIME types, and provides PNG fallback', () => {
  const fallback = resolveMediaArtwork(null, 'https://soundclear.app');
  assert.equal(fallback.length, 2);
  assert.equal(fallback[0].src, 'https://soundclear.app/pwa-512x512.png');
  assert.equal(fallback[0].type, 'image/png');

  const remote = resolveMediaArtwork('https://lh3.googleusercontent.com/cover123', 'https://soundclear.app');
  assert.equal(remote.length, 1);
  assert.equal(remote[0].src, 'https://lh3.googleusercontent.com/cover123');
  assert.equal(remote[0].type, undefined);

  const dataUri = resolveMediaArtwork('data:image/jpeg;base64,/9j/4AAQ', 'https://soundclear.app');
  assert.equal(dataUri[0].type, 'image/jpeg');
});

test('buildMediaMetadataInit populates title, artist, album, and artwork safely', () => {
  const meta = buildMediaMetadataInit(
    {
      id: 'abc12345678',
      videoId: 'abc12345678',
      title: 'Hati-Hati di Jalan',
      artists: [{ id: null, name: 'Tulus' }],
      album: { id: 'alb1', name: 'Manusia' },
      thumbnail: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
      type: 'song',
    },
    'https://soundclear.app',
  );
  assert.equal(meta.title, 'Hati-Hati di Jalan');
  assert.equal(meta.artist, 'Tulus');
  assert.equal(meta.album, 'Manusia');
  assert.equal(meta.artwork[0].type, 'image/jpeg');
});

test('buildMediaPositionState validates finite positive duration and clamps position and rate', () => {
  assert.equal(
    buildMediaPositionState({ duration: 0, currentTime: 5, playbackRate: 1 }),
    null,
  );
  assert.equal(
    buildMediaPositionState({ duration: Number.NaN, currentTime: 5, playbackRate: 1 }),
    null,
  );
  assert.equal(
    buildMediaPositionState({ duration: 120, currentTime: -1, playbackRate: 1 }),
    null,
  );
  assert.deepEqual(
    buildMediaPositionState({ duration: 120, currentTime: 145, playbackRate: 0 }),
    { duration: 120, position: 120, playbackRate: 1 },
  );
  assert.deepEqual(
    buildMediaPositionState({ duration: 200, currentTime: 42.5, playbackRate: 1.5 }),
    { duration: 200, position: 42.5, playbackRate: 1.5 },
  );
});

test('detectPwaPlatform identifies iOS, iPadOS desktop UA, Android, macOS Safari, and Firefox', () => {
  const ipadDesktop = detectPwaPlatform({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    maxTouchPoints: 5,
    isStandalone: false,
  });
  assert.equal(ipadDesktop.isIOS, true);
  assert.equal(ipadDesktop.isSafari, true);

  const androidChrome = detectPwaPlatform({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
    isStandalone: true,
  });
  assert.equal(androidChrome.isAndroid, true);
  assert.equal(androidChrome.isIOS, false);
  assert.equal(androidChrome.isSafari, false);
  assert.equal(androidChrome.isStandalone, true);

  const linuxFirefox = detectPwaPlatform({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    maxTouchPoints: 0,
    isStandalone: false,
  });
  assert.equal(linuxFirefox.isFirefox, true);
  assert.equal(linuxFirefox.isSafari, false);
  assert.equal(linuxFirefox.isIOS, false);
});

test('resolveEffectiveMediaSessionPlaybackState never reports playing without live audible playback', () => {
  assert.equal(
    resolveEffectiveMediaSessionPlaybackState({
      hasTrack: false,
      storeIsPlaying: true,
      isYoutubeIframe: false,
      htmlAudioPlaying: true,
      audioContextRunningOrDirect: true,
    }),
    'none',
  );
  assert.equal(
    resolveEffectiveMediaSessionPlaybackState({
      hasTrack: true,
      storeIsPlaying: false,
      isYoutubeIframe: false,
      htmlAudioPlaying: true,
      audioContextRunningOrDirect: true,
    }),
    'paused',
  );
  assert.equal(
    resolveEffectiveMediaSessionPlaybackState({
      hasTrack: true,
      storeIsPlaying: true,
      isYoutubeIframe: false,
      htmlAudioPlaying: true,
      audioContextRunningOrDirect: false,
    }),
    'paused',
  );
  assert.equal(
    resolveEffectiveMediaSessionPlaybackState({
      hasTrack: true,
      storeIsPlaying: true,
      isYoutubeIframe: false,
      htmlAudioPlaying: true,
      audioContextRunningOrDirect: true,
    }),
    'playing',
  );
  assert.equal(
    resolveEffectiveMediaSessionPlaybackState({
      hasTrack: true,
      storeIsPlaying: true,
      isYoutubeIframe: true,
      youtubePlayerState: 2,
      htmlAudioPlaying: false,
      audioContextRunningOrDirect: true,
    }),
    'paused',
  );
  assert.equal(
    resolveEffectiveMediaSessionPlaybackState({
      hasTrack: true,
      storeIsPlaying: true,
      isYoutubeIframe: true,
      youtubePlayerState: 1,
      htmlAudioPlaying: false,
      audioContextRunningOrDirect: true,
    }),
    'playing',
  );
});
