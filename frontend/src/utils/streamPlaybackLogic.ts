import type { StreamAudioMetaResponse } from '../api/client';
import type { ActiveStreamMeta, ConcreteQualityTier } from '../types/music';

export type OnlineStreamAction = 'play-audio' | 'use-youtube-iframe';

export function buildYoutubeIframeStreamMeta(
  trackId: string,
  resolvedVideoId: string,
  requestedTier: ConcreteQualityTier,
): ActiveStreamMeta {
  return {
    trackId,
    resolvedVideoId,
    requestedTier,
    actualTier: 'youtube',
    codec: 'YT Music',
    bitrateKbps: null,
    sampleRateHz: null,
    bitDepth: null,
    lossless: false,
    hiRes: false,
    badgeLabel: 'YT Music Player',
    sourceMode: 'youtube-iframe',
    proxiedViaBackend: false,
    audiodownloadAllowed: false,
    replayGainDb: null,
  };
}

export function decideOnlineStreamAction(
  meta: Pick<StreamAudioMetaResponse, 'available' | 'fallbackMode'> | null | undefined,
): OnlineStreamAction {
  if (!meta || meta.available === false || meta.fallbackMode === 'youtube-iframe') {
    return 'use-youtube-iframe';
  }
  return 'play-audio';
}

export function pickNextYoutubeFallbackCandidate(
  attemptedIds: ReadonlySet<string>,
  candidates: readonly string[] | null | undefined,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  for (const cand of candidates) {
    const clean = (cand || '').trim();
    if (clean && !attemptedIds.has(clean)) {
      return clean;
    }
  }
  return null;
}

export function isYoutubeIframeActive(
  meta: Pick<ActiveStreamMeta, 'sourceMode'> | null | undefined,
): boolean {
  return meta?.sourceMode === 'youtube-iframe';
}
