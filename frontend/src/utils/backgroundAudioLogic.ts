declare global {
  interface Window {
    __scGetRealHidden?: () => boolean;
    __scGetRealVisibilityState?: () => string;
    __scSubscribeRealVisibility?: (
      fn: (visibilityState: string, hidden: boolean) => void,
    ) => () => void;
    __scSubscribeRealPageHide?: (fn: (event: PageTransitionEvent) => void) => () => void;
  }
}

let userPausedState = false;

export function isUserPaused(): boolean {
  return userPausedState;
}

export function setUserPaused(paused: boolean): void {
  userPausedState = Boolean(paused);
}

export function getRealDocumentHidden(): boolean {
  if (typeof window !== 'undefined' && typeof window.__scGetRealHidden === 'function') {
    return window.__scGetRealHidden();
  }
  if (typeof document !== 'undefined') {
    return Boolean(document.hidden);
  }
  return false;
}

export function getRealDocumentVisibilityState(): string {
  if (typeof window !== 'undefined' && typeof window.__scGetRealVisibilityState === 'function') {
    return window.__scGetRealVisibilityState();
  }
  if (typeof document !== 'undefined') {
    return document.visibilityState;
  }
  return 'visible';
}

export function subscribeRealVisibilityChange(
  listener: (visibilityState: string, hidden: boolean) => void,
): () => void {
  if (typeof window !== 'undefined' && typeof window.__scSubscribeRealVisibility === 'function') {
    return window.__scSubscribeRealVisibility(listener);
  }
  if (typeof document === 'undefined') return () => {};
  const handler = () => {
    listener(document.visibilityState, Boolean(document.hidden));
  };
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
}

export function subscribeRealPageHide(listener: (event: PageTransitionEvent) => void): () => void {
  if (typeof window !== 'undefined' && typeof window.__scSubscribeRealPageHide === 'function') {
    return window.__scSubscribeRealPageHide(listener);
  }
  if (typeof window === 'undefined') return () => {};
  const handler = (event: PageTransitionEvent) => listener(event);
  window.addEventListener('pagehide', handler);
  return () => {
    window.removeEventListener('pagehide', handler);
  };
}

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
  return params.contextState !== 'running';
}

export function shouldLoadTrackDirectlyOnDirectDeck(params: {
  visibilityState: string;
  backgroundDirectActive: boolean;
  isMobile: boolean;
  contextState: AudioContextState | 'interrupted' | 'unavailable';
  directMode?: boolean;
}): boolean {
  if (params.directMode) return true;
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
  if (params.directMode) return false;
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

export type EffectiveAudioSourceMode =
  | 'webaudio'
  | 'direct'
  | 'fallback-no-fx'
  | 'youtube-iframe'
  | 'test-tone'
  | null
  | undefined;

export interface PlaybackEngineSummary {
  dspActive: boolean;
  isDirectPath: boolean;
  topBannerSummary: string;
  activeBadgeLabel: string;
  activeDetailText: string;
  eqBypassNotice: string | null;
}

export function resolvePlaybackEngineSummary(params: {
  sourceMode: EffectiveAudioSourceMode;
  directMode: boolean;
  isMobile: boolean;
  backgroundDirectActive?: boolean;
}): PlaybackEngineSummary {
  const { sourceMode, directMode, isMobile, backgroundDirectActive } = params;

  const topBannerSummary = directMode
    ? 'Mode Direct aktif — sinyal audio dilewatkan langsung tanpa pemrosesan Web Audio DSP.'
    : 'Semua kontrol DSP aktif dan diterapkan langsung ke mesin audio tanpa memuat ulang halaman.';

  if (sourceMode === 'youtube-iframe') {
    return {
      dspActive: false,
      isDirectPath: true,
      topBannerSummary,
      activeBadgeLabel: 'Cloud Audio (DSP Bypass)',
      activeDetailText:
        'Diputar langsung lewat pemutar cloud di browser (Web Audio DSP dilewati).',
      eqBypassNotice:
        'Cloud Audio melewati DSP browser — Equalizer aktif penuh pada File Lokal, Unduhan Offline, Direct Stream desktop, dan Tes Nada.',
    };
  }

  if (sourceMode === 'fallback-no-fx') {
    return {
      dspActive: false,
      isDirectPath: true,
      topBannerSummary,
      activeBadgeLabel: 'HTML5 Audio (Tanpa DSP)',
      activeDetailText:
        'Diputar langsung lewat HTML5 Audio tanpa Web Audio DSP karena keterbatasan CORS atau konteks audio browser.',
      eqBypassNotice:
        'Stream ini berjalan pada mode fallback HTML5 tanpa Web Audio DSP — kontrol Equalizer tidak memengaruhi lagu ini (Tes Nada tetap aktif di foreground).',
    };
  }

  const effectiveDirect =
    sourceMode === 'direct' || directMode || Boolean(backgroundDirectActive);

  if (effectiveDirect) {
    if (directMode) {
      return {
        dspActive: false,
        isDirectPath: true,
        topBannerSummary,
        activeBadgeLabel: 'Direct Bypass DSP',
        activeDetailText:
          'Streaming HTML5 Audio langsung melewati rantai Web Audio DSP sesuai Mode Direct.',
        eqBypassNotice:
          'Mode Direct aktif — Equalizer & efek DSP dilewati. Nonaktifkan Mode Direct di bagian Output Audio agar EQ bekerja pada desktop.',
      };
    }

    if (isMobile) {
      return {
        dspActive: false,
        isDirectPath: true,
        topBannerSummary,
        activeBadgeLabel: 'HTML5 Direct (Mobile)',
        activeDetailText:
          'Diputar via HTML5 Audio langsung demi kestabilan background & Media Session Android/iOS (Web Audio DSP dilewati).',
        eqBypassNotice:
          'Browser mobile memutar stream lewat HTML5 Audio langsung agar audio tidak terputus saat layar mati atau berpindah aplikasi — EQ/DSP dilewati untuk lagu ini (Tes Nada tetap dapat diuji di foreground).',
      };
    }

    return {
      dspActive: false,
      isDirectPath: true,
      topBannerSummary,
      activeBadgeLabel: 'HTML5 Direct (Fallback)',
      activeDetailText:
        'Diputar langsung melalui HTML5 Audio sementara (AudioContext sedang dialihkan atau suspended).',
      eqBypassNotice:
        'Audio sedang melewati jalur HTML5 Audio langsung (AudioContext suspended/background) — klik "Aktifkan AudioContext" di bagian Diagnostik atau kembali ke tab aktif untuk memulihkan DSP.',
    };
  }

  return {
    dspActive: true,
    isDirectPath: false,
    topBannerSummary,
    activeBadgeLabel: 'Web Audio DSP Aktif',
    activeDetailText:
      'Streaming audio-only (tanpa video) diproses langsung melalui Web Audio DSP & Equalizer.',
    eqBypassNotice: null,
  };
}

export interface DiagnosticNodeDescriptor {
  id: string;
  label: string;
  status: 'active' | 'bypassed' | 'inactive';
  detail?: string;
}

export function computeAudioChainNodes(params: {
  sourceMode?: string | null;
  testToneMode: 'sweep' | 'pink' | null;
  backgroundDirectActive: boolean;
  profile: {
    directMode: boolean;
    eqEnabled: boolean;
    preampDb: number;
    bassBoostEnabled: boolean;
    stereoWidenerEnabled: boolean;
    normalizationTarget: string;
    limiterEnabled: boolean;
    monoAudio: boolean;
  } | null;
  lastEffectiveNormGain: number;
}): DiagnosticNodeDescriptor[] {
  const { sourceMode, testToneMode, backgroundDirectActive, profile, lastEffectiveNormGain } =
    params;

  const isTone = testToneMode !== null;
  const externalBypass = sourceMode === 'youtube-iframe' || sourceMode === 'fallback-no-fx';
  const directDeckActive =
    Boolean(profile?.directMode) || backgroundDirectActive || sourceMode === 'direct';
  const graphBypassed = !isTone && (externalBypass || directDeckActive);

  const bypassStatus: 'bypassed' | 'inactive' = externalBypass ? 'inactive' : 'bypassed';

  return [
    {
      id: 'source',
      label: testToneMode
        ? `Sumber: Tes Nada (${testToneMode === 'sweep' ? 'Sweep' : 'Pink Noise'})`
        : externalBypass
          ? 'Sumber: Audio Tanpa DSP (Direct)'
          : directDeckActive
            ? 'Sumber: HTML5 Audio Langsung (Direct)'
            : 'Sumber: MediaElementAudioSource',
      status: graphBypassed ? 'bypassed' : 'active',
    },
    {
      id: 'preamp',
      label: 'Preamp',
      status: graphBypassed
        ? bypassStatus
        : profile?.eqEnabled
          ? 'active'
          : 'bypassed',
      detail: profile ? `${profile.preampDb > 0 ? '+' : ''}${profile.preampDb} dB` : undefined,
    },
    {
      id: 'eq',
      label: 'EQ 10-Band',
      status: graphBypassed
        ? bypassStatus
        : profile?.eqEnabled
          ? 'active'
          : 'bypassed',
    },
    {
      id: 'bass_widener',
      label: 'Bass Boost & Widener',
      status: graphBypassed
        ? bypassStatus
        : profile?.bassBoostEnabled || profile?.stereoWidenerEnabled
          ? 'active'
          : 'bypassed',
    },
    {
      id: 'norm_limiter',
      label: 'Normalisasi & Limiter',
      status: graphBypassed
        ? bypassStatus
        : profile?.normalizationTarget !== 'off' || profile?.limiterEnabled
          ? 'active'
          : 'bypassed',
      detail:
        profile?.normalizationTarget && profile.normalizationTarget !== 'off'
          ? `${lastEffectiveNormGain.toFixed(2)}x`
          : undefined,
    },
    {
      id: 'panner_mono',
      label: profile?.monoAudio ? 'Mono + Balance' : 'Stereo + Balance',
      status: graphBypassed ? bypassStatus : 'active',
    },
    {
      id: 'master',
      label: 'Master Gain + Analyser',
      status: graphBypassed ? bypassStatus : 'active',
    },
  ];
}
