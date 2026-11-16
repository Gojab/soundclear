import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampSeekTarget,
  isMobileAudioEnvironment,
  shouldEngageDirectDeckOnHide,
  shouldFallbackSuspendedDspToDirect,
  shouldLoadTrackDirectlyOnDirectDeck,
  shouldRestoreDspOnForeground,
  shouldRunSilentKeepalive,
  shouldSyncExternalPause,
  shouldTreatYoutubeAsAutoplayBlocked,
} from './backgroundAudioLogic.ts';

test('isMobileAudioEnvironment detects iOS, iPadOS desktop UA, Android, and ignores desktop', () => {
  assert.equal(
    isMobileAudioEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
      hasAudioSession: true,
    }),
    true,
  );
  assert.equal(
    isMobileAudioEnvironment({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
      hasAudioSession: false,
    }),
    true,
  );
  assert.equal(
    isMobileAudioEnvironment({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/123.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      hasAudioSession: false,
    }),
    true,
  );
  assert.equal(
    isMobileAudioEnvironment({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
      hasAudioSession: false,
    }),
    false,
  );
});

test('shouldEngageDirectDeckOnHide triggers immediately on mobile or suspended context, never on iframe', () => {
  assert.equal(
    shouldEngageDirectDeckOnHide({
      isPlaying: true,
      isYoutubeIframe: false,
      hasActiveDeckSrc: true,
      isMobile: true,
      contextState: 'running',
      backgroundDirectActive: false,
    }),
    true,
  );

  assert.equal(
    shouldEngageDirectDeckOnHide({
      isPlaying: true,
      isYoutubeIframe: false,
      hasActiveDeckSrc: true,
      isMobile: false,
      contextState: 'suspended',
      backgroundDirectActive: false,
    }),
    true,
  );

  assert.equal(
    shouldEngageDirectDeckOnHide({
      isPlaying: true,
      isYoutubeIframe: false,
      hasActiveDeckSrc: true,
      isMobile: false,
      contextState: 'running',
      backgroundDirectActive: false,
    }),
    false,
  );

  assert.equal(
    shouldEngageDirectDeckOnHide({
      isPlaying: true,
      isYoutubeIframe: true,
      hasActiveDeckSrc: true,
      isMobile: true,
      contextState: 'suspended',
      backgroundDirectActive: false,
    }),
    false,
  );
});

test('shouldLoadTrackDirectlyOnDirectDeck routes mobile, directMode, and hidden tabs directly onto HTML5 Audio', () => {
  assert.equal(
    shouldLoadTrackDirectlyOnDirectDeck({
      visibilityState: 'hidden',
      backgroundDirectActive: false,
      isMobile: false,
      contextState: 'running',
    }),
    true,
  );
  assert.equal(
    shouldLoadTrackDirectlyOnDirectDeck({
      visibilityState: 'visible',
      backgroundDirectActive: true,
      isMobile: false,
      contextState: 'running',
    }),
    true,
  );
  assert.equal(
    shouldLoadTrackDirectlyOnDirectDeck({
      visibilityState: 'visible',
      backgroundDirectActive: false,
      isMobile: true,
      contextState: 'running',
    }),
    true,
  );
  assert.equal(
    shouldLoadTrackDirectlyOnDirectDeck({
      visibilityState: 'visible',
      backgroundDirectActive: false,
      isMobile: false,
      contextState: 'running',
      directMode: true,
    }),
    true,
  );
  assert.equal(
    shouldLoadTrackDirectlyOnDirectDeck({
      visibilityState: 'visible',
      backgroundDirectActive: false,
      isMobile: false,
      contextState: 'running',
    }),
    false,
  );
  assert.equal(
    shouldLoadTrackDirectlyOnDirectDeck({
      visibilityState: 'visible',
      backgroundDirectActive: false,
      isMobile: false,
      contextState: 'suspended',
    }),
    false,
  );
});

test('shouldRestoreDspOnForeground restores DSP only on visible desktop when directMode is off', () => {
  assert.equal(
    shouldRestoreDspOnForeground({
      backgroundDirectActive: true,
      isMobile: false,
      directMode: false,
      visibilityState: 'visible',
    }),
    true,
  );
  assert.equal(
    shouldRestoreDspOnForeground({
      backgroundDirectActive: true,
      isMobile: true,
      directMode: false,
      visibilityState: 'visible',
    }),
    false,
  );
  assert.equal(
    shouldRestoreDspOnForeground({
      backgroundDirectActive: true,
      isMobile: false,
      directMode: true,
      visibilityState: 'visible',
    }),
    false,
  );
  assert.equal(
    shouldRestoreDspOnForeground({
      backgroundDirectActive: true,
      isMobile: false,
      directMode: false,
      visibilityState: 'hidden',
    }),
    false,
  );
});

test('shouldRunSilentKeepalive bridges gaps and iframe without hijacking active native HTMLAudio MediaSession', () => {
  assert.equal(
    shouldRunSilentKeepalive({
      isPlaying: true,
      isYoutubeIframe: false,
      isAudioLoading: false,
      contextSuspended: false,
      hasPlayingHtmlAudio: true,
    }),
    false,
  );
  assert.equal(
    shouldRunSilentKeepalive({
      isPlaying: true,
      isYoutubeIframe: false,
      isAudioLoading: true,
      contextSuspended: false,
      hasPlayingHtmlAudio: false,
    }),
    true,
  );
  assert.equal(
    shouldRunSilentKeepalive({
      isPlaying: true,
      isYoutubeIframe: true,
      isAudioLoading: false,
      contextSuspended: false,
      hasPlayingHtmlAudio: false,
    }),
    true,
  );
  assert.equal(
    shouldRunSilentKeepalive({
      isPlaying: true,
      isYoutubeIframe: true,
      youtubeActuallyPlaying: false,
      isAudioLoading: false,
      contextSuspended: false,
      hasPlayingHtmlAudio: false,
    }),
    false,
  );
  assert.equal(
    shouldRunSilentKeepalive({
      isPlaying: false,
      isYoutubeIframe: true,
      isAudioLoading: true,
      contextSuspended: true,
      hasPlayingHtmlAudio: false,
    }),
    false,
  );
});

test('shouldFallbackSuspendedDspToDirect detects non-running AudioContext during active HTML5 DSP playback', () => {
  assert.equal(
    shouldFallbackSuspendedDspToDirect({
      isPlaying: true,
      isYoutubeIframe: false,
      backgroundDirectActive: false,
      contextState: 'suspended',
    }),
    true,
  );
  assert.equal(
    shouldFallbackSuspendedDspToDirect({
      isPlaying: true,
      isYoutubeIframe: false,
      backgroundDirectActive: false,
      contextState: 'interrupted',
    }),
    true,
  );
  assert.equal(
    shouldFallbackSuspendedDspToDirect({
      isPlaying: true,
      isYoutubeIframe: false,
      backgroundDirectActive: false,
      contextState: 'running',
    }),
    false,
  );
  assert.equal(
    shouldFallbackSuspendedDspToDirect({
      isPlaying: true,
      isYoutubeIframe: false,
      backgroundDirectActive: true,
      contextState: 'suspended',
    }),
    false,
  );
  assert.equal(
    shouldFallbackSuspendedDspToDirect({
      isPlaying: true,
      isYoutubeIframe: true,
      backgroundDirectActive: false,
      contextState: 'suspended',
    }),
    false,
  );
});

test('shouldTreatYoutubeAsAutoplayBlocked detects foreground autoplay rejection without false positives', () => {
  assert.equal(
    shouldTreatYoutubeAsAutoplayBlocked({
      isPlaying: true,
      isYoutubeIframe: true,
      visibilityState: 'visible',
      playerState: 2,
      elapsedSincePlayRequestMs: 800,
      wasEverPlayingForTrack: false,
    }),
    true,
  );
  assert.equal(
    shouldTreatYoutubeAsAutoplayBlocked({
      isPlaying: true,
      isYoutubeIframe: true,
      visibilityState: 'visible',
      playerState: -1,
      elapsedSincePlayRequestMs: 4000,
      wasEverPlayingForTrack: false,
    }),
    true,
  );
  assert.equal(
    shouldTreatYoutubeAsAutoplayBlocked({
      isPlaying: true,
      isYoutubeIframe: true,
      visibilityState: 'hidden',
      playerState: 2,
      elapsedSincePlayRequestMs: 800,
      wasEverPlayingForTrack: false,
    }),
    false,
  );
  assert.equal(
    shouldTreatYoutubeAsAutoplayBlocked({
      isPlaying: true,
      isYoutubeIframe: true,
      visibilityState: 'visible',
      playerState: 2,
      elapsedSincePlayRequestMs: 800,
      wasEverPlayingForTrack: true,
    }),
    false,
  );
});

test('clampSeekTarget bounds seek safely within duration', () => {
  assert.equal(clampSeekTarget(-5, 180), 0);
  assert.equal(clampSeekTarget(42.5, 180), 42.5);
  assert.equal(clampSeekTarget(195, 180), 179.9);
  assert.equal(clampSeekTarget(30, null), 30);
});

test('shouldSyncExternalPause catches OS/headphone pauses without false positives during transitions or handoffs', () => {
  assert.equal(
    shouldSyncExternalPause({
      isActiveElement: true,
      storeIsPlaying: true,
      elementEnded: false,
      isPriming: false,
      isProgrammaticPause: false,
      isYoutubeIframe: false,
      isLoadingAudio: false,
      isTransitioning: false,
      isBackgroundHandoff: false,
    }),
    true,
  );

  assert.equal(
    shouldSyncExternalPause({
      isActiveElement: true,
      storeIsPlaying: true,
      elementEnded: false,
      isPriming: false,
      isProgrammaticPause: false,
      isYoutubeIframe: false,
      isLoadingAudio: false,
      isTransitioning: false,
      isBackgroundHandoff: true,
    }),
    false,
  );

  assert.equal(
    shouldSyncExternalPause({
      isActiveElement: true,
      storeIsPlaying: true,
      elementEnded: false,
      isPriming: false,
      isProgrammaticPause: true,
      isYoutubeIframe: false,
      isLoadingAudio: false,
      isTransitioning: false,
    }),
    false,
  );

  assert.equal(
    shouldSyncExternalPause({
      isActiveElement: true,
      storeIsPlaying: true,
      elementEnded: true,
      isPriming: false,
      isProgrammaticPause: false,
      isYoutubeIframe: false,
      isLoadingAudio: false,
      isTransitioning: false,
    }),
    false,
  );

  assert.equal(
    shouldSyncExternalPause({
      isActiveElement: false,
      storeIsPlaying: true,
      elementEnded: false,
      isPriming: false,
      isProgrammaticPause: false,
      isYoutubeIframe: false,
      isLoadingAudio: false,
      isTransitioning: false,
    }),
    false,
  );
});

