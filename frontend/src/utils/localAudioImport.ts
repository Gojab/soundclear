import { Buffer } from 'buffer';
import * as mm from 'music-metadata-browser';
import type { LocalAudioFileRecord, MediaItem } from '../types/music';
import { estimateLoudnessFromRms } from './audioMath';
import { formatTime } from './playerLogic';

// Ensure Buffer is globally available for music-metadata-browser in Vite browser bundles
if (typeof globalThis !== 'undefined' && !(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

const ACCEPTED_EXT_RE = /\.(mp3|m4a|flac|ogg|oga|wav|aac)$/i;
const ACCEPTED_MIME_RE = /^audio\/(mpeg|mp3|mp4|x-m4a|aac|flac|x-flac|ogg|wav|wave|x-wav)/i;

export function isSupportedLocalAudioFile(file: File): boolean {
  return ACCEPTED_EXT_RE.test(file.name) || ACCEPTED_MIME_RE.test(file.type || '');
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
  const safeMime = mimeType || 'image/jpeg';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${safeMime};base64,${btoa(binary)}`;
}

async function measureAudioLoudnessAndDuration(
  arrayBuffer: ArrayBuffer,
  fallbackDuration: number,
): Promise<{ durationSeconds: number; estimatedLufs: number; peakLinear: number }> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { durationSeconds: fallbackDuration, estimatedLufs: -14, peakLinear: 0.9 };
  }

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels = decoded.numberOfChannels;
    const len = decoded.length;
    if (channels === 0 || len === 0) {
      return {
        durationSeconds: decoded.duration || fallbackDuration,
        estimatedLufs: -14,
        peakLinear: 0.9,
      };
    }

    // Subsample uniformly (up to ~60k frames) for fast, accurate loudness & peak estimation
    const step = Math.max(1, Math.floor(len / 60000));
    let sumSq = 0;
    let count = 0;
    let peak = 0;

    for (let ch = 0; ch < channels; ch += 1) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < len; i += step) {
        const sample = data[i];
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSq += sample * sample;
        count += 1;
      }
    }

    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0.1;
    const estimatedLufs = estimateLoudnessFromRms(rms);
    return {
      durationSeconds: decoded.duration || fallbackDuration,
      estimatedLufs,
      peakLinear: Math.max(0.05, Math.min(1, peak || 0.9)),
    };
  } catch {
    return { durationSeconds: fallbackDuration, estimatedLufs: -14, peakLinear: 0.9 };
  } finally {
    if (ctx) {
      await ctx.close().catch(() => {});
    }
  }
}

export async function parseLocalAudioFile(file: File): Promise<LocalAudioFileRecord> {
  const strippedName = file.name.replace(/\.[^.]+$/, '');
  let title = strippedName;
  let artist = 'Artis Lokal';
  let album = 'File Lokal';
  let durationSeconds = 0;
  let coverDataUrl: string | null = null;

  try {
    const metadata = await mm.parseBlob(file);
    if (metadata.common.title?.trim()) {
      title = metadata.common.title.trim();
    }
    if (metadata.common.artist?.trim()) {
      artist = metadata.common.artist.trim();
    } else if (metadata.common.artists?.length) {
      artist = metadata.common.artists.filter(Boolean).join(', ');
    }
    if (metadata.common.album?.trim()) {
      album = metadata.common.album.trim();
    }
    if (typeof metadata.format.duration === 'number' && Number.isFinite(metadata.format.duration)) {
      durationSeconds = Math.round(metadata.format.duration);
    }
    const pic = mm.selectCover(metadata.common.picture);
    if (pic && pic.data?.length) {
      const bytes = pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data);
      coverDataUrl = uint8ArrayToDataUrl(bytes, pic.format || 'image/jpeg');
    }
  } catch {
    // Fallback gracefully to filename + decoded PCM metadata
  }

  let estimatedLufs = -14;
  let peakLinear = 0.9;
  try {
    const buf = await file.arrayBuffer();
    const measured = await measureAudioLoudnessAndDuration(buf, durationSeconds);
    if (measured.durationSeconds > 0 && durationSeconds <= 0) {
      durationSeconds = Math.round(measured.durationSeconds);
    }
    estimatedLufs = measured.estimatedLufs;
    peakLinear = measured.peakLinear;
  } catch {
    // Keep safe defaults
  }

  const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
    fileSize: file.size,
    title,
    artist,
    album,
    durationSeconds,
    coverDataUrl,
    estimatedLufs,
    peakLinear,
    addedAt: Date.now(),
    blob: file,
  };
}

export function localFileToMediaItem(record: LocalAudioFileRecord): MediaItem {
  return {
    id: record.id,
    localFileId: record.id,
    title: record.title,
    artists: [{ id: null, name: record.artist || 'Artis Lokal' }],
    album: { id: null, name: record.album || 'File Lokal' },
    duration: record.durationSeconds > 0 ? formatTime(record.durationSeconds) : null,
    durationSeconds: record.durationSeconds || null,
    thumbnail: record.coverDataUrl || null,
    type: 'local',
    genre: 'File Lokal',
  };
}
