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
}): boolean {
  if (params.visibilityState === 'hidden') return true;
  if (params.backgroundDirectActive) return true;
  if (params.isMobile && params.contextState !== 'running') return true;
  return false;
}

export function shouldRunSilentKeepalive(params: {
  isPlaying: boolean;
  isYoutubeIframe: boolean;
  isAudioLoading: boolean;
  contextSuspended: boolean;
  hasPlayingHtmlAudio: boolean;
}): boolean {
  if (!params.isPlaying) return false;
  if (params.isYoutubeIframe) return true;
  if (params.isAudioLoading && !params.hasPlayingHtmlAudio) return true;
  if (params.contextSuspended && !params.hasPlayingHtmlAudio) return true;
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
