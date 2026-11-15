import type { StreamAudioMetaResponse } from '../api/client';

export interface StreamProbeMetaInput {
  title?: string;
  artist?: string;
  durationSeconds?: number | null;
  quality?: string;
}

export interface ProbeCacheEntry {
  meta: StreamAudioMetaResponse;
  expiresAtMs: number;
}

export const PROBE_CACHE_TTL_MS = 10 * 60 * 1000;
export const GLOBAL_YT_BLOCK_TTL_MS = 5 * 60 * 1000;

const YT_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const probeCache = new Map<string, ProbeCacheEntry>();
const inFlightProbes = new Map<string, Promise<StreamAudioMetaResponse>>();
let globalYoutubeBlockedUntilMs = 0;

function makeCacheKey(videoId: string, quality?: string): string {
  return `${videoId.trim()}::${(quality || 'high').trim().toLowerCase()}`;
}

export function isGlobalYoutubeBlocked(nowMs: number = Date.now()): boolean {
  return nowMs < globalYoutubeBlockedUntilMs;
}

export function markGlobalYoutubeBlocked(
  ttlMs: number = GLOBAL_YT_BLOCK_TTL_MS,
  nowMs: number = Date.now(),
): void {
  globalYoutubeBlockedUntilMs = Math.max(globalYoutubeBlockedUntilMs, nowMs + Math.max(1000, ttlMs));
}

export function clearGlobalYoutubeBlocked(): void {
  globalYoutubeBlockedUntilMs = 0;
}

export function resetProbeCacheForTests(): void {
  probeCache.clear();
  inFlightProbes.clear();
  globalYoutubeBlockedUntilMs = 0;
}

export function shouldFastRouteToIframe(
  videoId: string,
  nowMs: number = Date.now(),
): boolean {
  const clean = (videoId || '').trim();
  if (!YT_ID_REGEX.test(clean)) return false;
  return isGlobalYoutubeBlocked(nowMs);
}

export function getCachedStreamProbe(
  videoId: string,
  quality?: string,
  nowMs: number = Date.now(),
): StreamAudioMetaResponse | null {
  const key = makeCacheKey(videoId, quality);
  const entry = probeCache.get(key);
  if (!entry) return null;
  if (nowMs >= entry.expiresAtMs) {
    probeCache.delete(key);
    return null;
  }
  return entry.meta;
}

function isBotOrRateLimitFallback(meta: StreamAudioMetaResponse): boolean {
  if (meta.available !== false || meta.fallbackMode !== 'youtube-iframe') {
    return false;
  }
  const reason = (meta.reason || '').toLowerCase();
  if (!reason) return true;
  return (
    reason.includes('dibatasi') ||
    reason.includes('verifikasi') ||
    reason.includes('bot') ||
    reason.includes('403')
  );
}

export function setCachedStreamProbe(
  videoId: string,
  quality: string | undefined,
  meta: StreamAudioMetaResponse,
  ttlMs: number = PROBE_CACHE_TTL_MS,
  nowMs: number = Date.now(),
): void {
  const key = makeCacheKey(videoId, quality);
  if (probeCache.size >= 250) {
    const oldestKey = probeCache.keys().next().value;
    if (oldestKey) probeCache.delete(oldestKey);
  }
  probeCache.set(key, {
    meta,
    expiresAtMs: nowMs + ttlMs,
  });
  if (isBotOrRateLimitFallback(meta)) {
    markGlobalYoutubeBlocked(GLOBAL_YT_BLOCK_TTL_MS, nowMs);
  }
}

export async function probeStreamWithCache(
  videoId: string,
  meta: StreamProbeMetaInput,
  fetcher: (vid: string, input: StreamProbeMetaInput) => Promise<StreamAudioMetaResponse>,
  nowMs?: number,
): Promise<StreamAudioMetaResponse> {
  const cleanId = (videoId || '').trim();
  const quality = meta.quality || 'high';
  const checkNow = nowMs ?? Date.now();

  const cached = getCachedStreamProbe(cleanId, quality, checkNow);
  if (cached) {
    return cached;
  }

  if (shouldFastRouteToIframe(cleanId, checkNow)) {
    return {
      trackId: cleanId,
      available: false,
      fallbackMode: 'youtube-iframe',
      reason: 'Sesi direct stream sedang dibatasi server; langsung ke pemutar cloud.',
      codec: 'Cloud Audio',
      bitrateKbps: null,
      sampleRateHz: null,
      ext: 'm4a',
      mimeType: 'audio/mp4',
      source: 'SoundClear Cloud',
      tier: quality,
      cacheReady: false,
    };
  }

  const key = makeCacheKey(cleanId, quality);
  const existingFlight = inFlightProbes.get(key);
  if (existingFlight) {
    return existingFlight;
  }

  const flight = fetcher(cleanId, meta)
    .then((result) => {
      setCachedStreamProbe(cleanId, quality, result, PROBE_CACHE_TTL_MS, nowMs ?? Date.now());
      return result;
    })
    .finally(() => {
      inFlightProbes.delete(key);
    });

  inFlightProbes.set(key, flight);
  return flight;
}

export function prefetchStreamProbe(
  videoId: string,
  meta: StreamProbeMetaInput,
  fetcher: (vid: string, input: StreamProbeMetaInput) => Promise<StreamAudioMetaResponse>,
): void {
  const cleanId = (videoId || '').trim();
  if (!cleanId) return;
  const now = Date.now();
  if (getCachedStreamProbe(cleanId, meta.quality, now)) return;
  if (shouldFastRouteToIframe(cleanId, now)) return;
  void probeStreamWithCache(cleanId, meta, fetcher, now).catch(() => {});
}
