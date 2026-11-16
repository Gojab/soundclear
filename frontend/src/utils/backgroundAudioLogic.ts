export interface AudioEnvironmentInput {
  userAgent?: string;
  maxTouchPoints?: number;
  hasAudioSession?: boolean;
}

export function isMobileAudioEnvironment(env?: AudioEnvironmentInput): boolean {
  const ua =
    env?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const touchPoints =
    env?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);
  const hasAudioSession =
    env?.hasAudioSession ??
    (typeof navigator !== 'undefined' &&
      'audioSession' in (navigator as Navigator & { audioSession?: unknown }));

  if (hasAudioSession) return true;
  if (/iPhone|iPad|iPod|Android|Mobile|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  // iPadOS Safari reports "Macintosh" in desktop-site mode with touch points > 1
  if (/Macintosh/i.test(ua) && touchPoints > 1) {
    return true;
  }
  return false;
}

export function shouldEngageDirectDeckOnHide(params: {
  isPlaying: boolean;
  isYoutubeIframe: boolean;
  hasActiveDeckSrc: boolean;
  isMobile: boolean;
  contextState: AudioContextState | 'interrupted' | 'unavailable';
  backgroundDirectActive: boolean;
}): boolean {
  if (
    !params.isPlaying ||
    params.isYoutubeIframe ||
    !params.hasActiveDeckSrc ||
    params.backgroundDirectActive
  ) {
    return false;
  }
  return params.isMobile || params.contextState !== 'running';
}

export function shouldLoadTrackDirectlyOnDirectDeck(params: {
  visibilityState: string;
  backgroundDirectActive: boolean;
  isMobile: boolean;
  contextState: AudioContextState | 'interrupted' | 'unavailable';
  directMode?: boolean;
}): boolean {
  if (params.directMode) return true;
  if (params.isMobile) return true;
  if (params.visibilityState === 'hidden') return true;
  if (params.backgroundDirectActive) return true;
  if (params.contextState === 'interrupted') return true;
  return false;
}

export function shouldRestoreDspOnForeground(params: {
  backgroundDirectActive: boolean;
  isMobile: boolean;
  directMode: boolean;
  visibilityState: string;
}): boolean {
  if (!params.backgroundDirectActive) return false;
  if (params.isMobile || params.directMode) return false;
  return params.visibilityState === 'visible';
}

export function shouldRunSilentKeepalive(params: {
  isPlaying: boolean;
  isYoutubeIframe: boolean;
  youtubeActuallyPlaying?: boolean;
  isAudioLoading: boolean;
  contextSuspended: boolean;
  hasPlayingHtmlAudio: boolean;
}): boolean {
  if (!params.isPlaying) return false;
  if (params.isYoutubeIframe) {
    return params.youtubeActuallyPlaying !== false;
  }
  if (params.isAudioLoading && !params.hasPlayingHtmlAudio) return true;
  if (params.contextSuspended && !params.hasPlayingHtmlAudio) return true;
  return false;
}

export function shouldFallbackSuspendedDspToDirect(params: {
  isPlaying: boolean;
  isYoutubeIframe: boolean;
  backgroundDirectActive: boolean;
  contextState: AudioContextState | 'interrupted' | 'unavailable';
}): boolean {
  if (!params.isPlaying || params.isYoutubeIframe || params.backgroundDirectActive) {
    return false;
  }
  return params.contextState !== 'running';
}

export function shouldTreatYoutubeAsAutoplayBlocked(params: {
  isPlaying: boolean;
  isYoutubeIframe: boolean;
  visibilityState: string;
  playerState: number;
  elapsedSincePlayRequestMs: number;
  wasEverPlayingForTrack: boolean;
}): boolean {
  if (!params.isPlaying || !params.isYoutubeIframe) return false;
  if (params.visibilityState !== 'visible') return false;
  if (params.playerState === 2 && !params.wasEverPlayingForTrack && params.elapsedSincePlayRequestMs < 4000) {
    return true;
  }
  if ((params.playerState === -1 || params.playerState === 5) && params.elapsedSincePlayRequestMs >= 3500) {
    return true;
  }
  return false;
}

export function clampSeekTarget(
  targetSeconds: number,
  durationSeconds?: number | null,
): number {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return 0;
  if (
    typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  ) {
    const safeMax = Math.max(0, durationSeconds - 0.1);
    return Math.min(targetSeconds, safeMax);
  }
  return targetSeconds;
}

export function shouldSyncExternalPause(params: {
  isActiveElement: boolean;
  storeIsPlaying: boolean;
  elementEnded: boolean;
  isPriming: boolean;
  isProgrammaticPause: boolean;
  isYoutubeIframe: boolean;
  isLoadingAudio: boolean;
  isTransitioning: boolean;
  isBackgroundHandoff?: boolean;
}): boolean {
  if (!params.isActiveElement) return false;
  if (!params.storeIsPlaying) return false;
  if (params.elementEnded) return false;
  if (params.isPriming) return false;
  if (params.isProgrammaticPause) return false;
  if (params.isYoutubeIframe) return false;
  if (params.isLoadingAudio) return false;
  if (params.isTransitioning) return false;
  if (params.isBackgroundHandoff) return false;
  return true;
}

