import assert from 'node:assert/strict';
import test from 'node:test';
import type { LyricsResponse, MediaItem } from '../types/music';
import {
  isTopLevelBrowsingContext,
  isWindowsPlatform,
  normalizeNotchDisplayMode,
  normalizeNotchMonitor,
  resolveNotchDisplayLines,
  resolveWindowsExternalNotchSupport,
  shouldShowNotchMiniPlayer,
  supportsDocumentPictureInPicture,
  supportsVideoPictureInPicture,
} from './notchPlayer';

const SAMPLE_TRACK: MediaItem = {
  id: 'vid-1',
  videoId: 'vid-1',
  title: 'Monokrom - Live Studio Version With Long Subtitle',
  artists: [{ id: 'art-1', name: 'Tulus' }],
  type: 'song',
};

const SYNCED_LYRICS: LyricsResponse = {
  browseId: 'lyrics-1',
  hasTimestamps: true,
  source: 'Synced',
  lines: [
    { text: 'Lembaran foto hitam putih', startTimeMs: 4000, endTimeMs: 8000 },
    { text: 'Aku coba ingat lagi warna bajumu kala itu', startTimeMs: 8000, endTimeMs: 13000 },
    { text: 'Kali pertama di hidupku', startTimeMs: 13000, endTimeMs: 18000 },
  ],
  plainText: 'Should never be rendered when unsynced',
};

const UNSYNCED_LYRICS: LyricsResponse = {
  browseId: 'lyrics-2',
  hasTimestamps: false,
  source: 'Plain',
  lines: [],
  plainText: 'Baris satu lirik tidak sinkron\nBaris dua lirik tidak sinkron',
};

test('resolveNotchDisplayLines returns active, prev, next lines when lyrics are timestamp-synced', () => {
  const middle = resolveNotchDisplayLines(SAMPLE_TRACK, SYNCED_LYRICS, 9.5);
  assert.equal(middle.mode, 'synced');
  assert.equal(middle.prev, 'Lembaran foto hitam putih');
  assert.equal(middle.active, 'Aku coba ingat lagi warna bajumu kala itu');
  assert.equal(middle.next, 'Kali pertama di hidupku');
  assert.equal(middle.activeIndex, 1);

  const first = resolveNotchDisplayLines(SAMPLE_TRACK, SYNCED_LYRICS, 5.0);
  assert.equal(first.mode, 'synced');
  assert.equal(first.prev, null);
  assert.equal(first.active, 'Lembaran foto hitam putih');
  assert.equal(first.next, 'Aku coba ingat lagi warna bajumu kala itu');

  const last = resolveNotchDisplayLines(SAMPLE_TRACK, SYNCED_LYRICS, 15.0);
  assert.equal(last.mode, 'synced');
  assert.equal(last.prev, 'Aku coba ingat lagi warna bajumu kala itu');
  assert.equal(last.active, 'Kali pertama di hidupku');
  assert.equal(last.next, null);
});

test('resolveNotchDisplayLines shows artist before first timestamp and exposes upcoming first line', () => {
  const intro = resolveNotchDisplayLines(SAMPLE_TRACK, SYNCED_LYRICS, 1.2);
  assert.equal(intro.mode, 'synced-intro');
  assert.equal(intro.active, 'Tulus');
  assert.equal(intro.prev, null);
  assert.equal(intro.next, 'Lembaran foto hitam putih');
});

test('resolveNotchDisplayLines NEVER returns unsynced plain lyrics and falls back to artist name', () => {
  const res = resolveNotchDisplayLines(SAMPLE_TRACK, UNSYNCED_LYRICS, 10);
  assert.equal(res.mode, 'fallback');
  assert.equal(res.active, 'Tulus');
  assert.equal(res.prev, null);
  assert.equal(res.next, null);

  const missing = resolveNotchDisplayLines(SAMPLE_TRACK, null, 10);
  assert.equal(missing.mode, 'fallback');
  assert.equal(missing.active, 'Tulus');
});

test('resolveNotchDisplayLines handles missing track gracefully', () => {
  const empty = resolveNotchDisplayLines(null, SYNCED_LYRICS, 5);
  assert.equal(empty.mode, 'fallback');
  assert.equal(empty.active, '');
});

test('shouldShowNotchMiniPlayer respects track presence, stop state, and display modes', () => {
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: false,
      isPlaying: false,
      hasActivePlayback: false,
      manuallyHidden: false,
      displayMode: 'always',
      isAppInBackground: false,
    }),
    false,
  );

  // Idle restored track on launch before playback starts
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: false,
      hasActivePlayback: false,
      manuallyHidden: false,
      displayMode: 'always',
      isAppInBackground: false,
    }),
    false,
  );

  // Playing normally in 'always' mode
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: true,
      hasActivePlayback: true,
      manuallyHidden: false,
      displayMode: 'always',
      isAppInBackground: false,
    }),
    true,
  );

  // Manually stopped hides notch even though currentTrack stays loaded
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: false,
      hasActivePlayback: false,
      manuallyHidden: true,
      displayMode: 'always',
      isAppInBackground: false,
    }),
    false,
  );

  // 'background' mode only visible when app is in background
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: true,
      hasActivePlayback: true,
      manuallyHidden: false,
      displayMode: 'background',
      isAppInBackground: false,
    }),
    false,
  );
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: true,
      hasActivePlayback: true,
      manuallyHidden: false,
      displayMode: 'background',
      isAppInBackground: true,
    }),
    true,
  );

  // 'off' mode hides unless forceOpen
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: true,
      hasActivePlayback: true,
      manuallyHidden: false,
      displayMode: 'off',
      isAppInBackground: true,
    }),
    false,
  );
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: false,
      hasActivePlayback: false,
      manuallyHidden: false,
      displayMode: 'off',
      isAppInBackground: false,
      forceOpen: true,
    }),
    true,
  );
});

test('normalizeNotchDisplayMode and normalizeNotchMonitor sanitize invalid values', () => {
  assert.equal(normalizeNotchDisplayMode('always'), 'always');
  assert.equal(normalizeNotchDisplayMode('background'), 'background');
  assert.equal(normalizeNotchDisplayMode('off'), 'off');
  assert.equal(normalizeNotchDisplayMode('invalid'), 'always');
  assert.equal(normalizeNotchMonitor('display-2'), 'display-2');
  assert.equal(normalizeNotchMonitor(''), 'primary');
});

test('shouldShowNotchMiniPlayer hides in-web notch when externalWindowActive is true', () => {
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: true,
      hasActivePlayback: true,
      manuallyHidden: false,
      displayMode: 'always',
      isAppInBackground: false,
      forceOpen: true,
      externalWindowActive: true,
    }),
    false,
  );
});

test('isWindowsPlatform allows Windows and rejects macOS, Linux, Android, and iOS', () => {
  assert.equal(isWindowsPlatform({ userAgentData: { platform: 'Windows' } }), true);
  assert.equal(isWindowsPlatform({ platform: 'Win32' }), true);
  assert.equal(
    isWindowsPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    true,
  );
  assert.equal(isWindowsPlatform({ userAgentData: { platform: 'macOS' }, platform: 'MacIntel' }), false);
  assert.equal(isWindowsPlatform({ platform: 'Linux x86_64' }), false);
  assert.equal(
    isWindowsPlatform({
      platform: 'Linux armv8l',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    }),
    false,
  );
  assert.equal(isWindowsPlatform({ platform: 'iPhone' }), false);
});

test('resolveWindowsExternalNotchSupport enforces Windows-only external pop-out capability', () => {
  assert.deepEqual(
    resolveWindowsExternalNotchSupport({
      isWindows: false,
      hasDesktopHost: false,
      hasDocumentPiP: true,
    }),
    { allowed: false, mode: 'none', reason: 'windows-only' },
  );

  assert.deepEqual(
    resolveWindowsExternalNotchSupport({
      isWindows: true,
      hasDesktopHost: true,
      hasDocumentPiP: true,
    }),
    { allowed: true, mode: 'desktop-ipc', reason: 'ok' },
  );

  assert.deepEqual(
    resolveWindowsExternalNotchSupport({
      isWindows: true,
      hasDesktopHost: false,
      hasDocumentPiP: true,
    }),
    { allowed: true, mode: 'document-pip', reason: 'ok' },
  );

  assert.deepEqual(
    resolveWindowsExternalNotchSupport({
      isWindows: true,
      hasDesktopHost: false,
      hasDocumentPiP: false,
    }),
    { allowed: false, mode: 'none', reason: 'unsupported-browser' },
  );

  assert.equal(
    supportsDocumentPictureInPicture({
      documentPictureInPicture: { requestWindow: async () => ({} as Window) },
    }),
    true,
  );
  assert.equal(supportsDocumentPictureInPicture({}), false);
});

test('shouldShowNotchMiniPlayer stays hidden on non-Windows platforms even when playing or forced', () => {
  assert.equal(
    shouldShowNotchMiniPlayer({
      hasTrack: true,
      isPlaying: true,
      hasActivePlayback: true,
      manuallyHidden: false,
      displayMode: 'always',
      isAppInBackground: true,
      forceOpen: true,
      isWindows: false,
    }),
    false,
  );
});

test('resolveWindowsExternalNotchSupport falls back to video-pip inside iframes or when Document PiP is unavailable', () => {
  const selfObj = {};
  const otherObj = {};
  assert.equal(isTopLevelBrowsingContext({ self: selfObj, top: selfObj }), true);
  assert.equal(isTopLevelBrowsingContext({ self: selfObj, top: otherObj }), false);
  assert.equal(supportsVideoPictureInPicture({ pictureInPictureEnabled: true }), true);
  assert.equal(supportsVideoPictureInPicture({ pictureInPictureEnabled: false }), false);

  // Inside an iframe on Windows, Document PiP is blocked by browser spec so video-pip is selected
  assert.deepEqual(
    resolveWindowsExternalNotchSupport({
      isWindows: true,
      hasDesktopHost: false,
      hasDocumentPiP: true,
      hasVideoPiP: true,
      isTopLevel: false,
    }),
    { allowed: true, mode: 'video-pip', reason: 'ok' },
  );

  // Top-level Windows Chrome/Edge prefers Document PiP
  assert.deepEqual(
    resolveWindowsExternalNotchSupport({
      isWindows: true,
      hasDesktopHost: false,
      hasDocumentPiP: true,
      hasVideoPiP: true,
      isTopLevel: true,
    }),
    { allowed: true, mode: 'document-pip', reason: 'ok' },
  );
});
