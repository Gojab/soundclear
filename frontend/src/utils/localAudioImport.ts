import { Buffer } from 'buffer';
import * as mm from 'music-metadata-browser';
import type { LocalAudioFileRecord, MediaItem } from '../types/music';
import { classifyStreamQualityBadge, estimateLoudnessFromRms } from './audioMath';
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

function inspectRawContainerHeader(buf: ArrayBuffer, fileName: string): {
  codec?: string;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  bitrateKbps?: number | null;
  lossless?: boolean;
} {
  const bytes = new Uint8Array(buf.slice(0, 64));
  const view = new DataView(buf.slice(0, Math.min(buf.byteLength, 256)));
  const lower = fileName.toLowerCase();

  // WAV ('RIFF' ... 'WAVEfmt ')
  if (
    bytes.length >= 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    // Search 'fmt ' chunk
    for (let i = 12; i < Math.min(view.byteLength - 24, 200); i += 1) {
      if (
        view.getUint8(i) === 0x66 &&
        view.getUint8(i + 1) === 0x6d &&
        view.getUint8(i + 2) === 0x74 &&
        view.getUint8(i + 3) === 0x20
      ) {
        const sampleRateHz = view.getUint32(i + 12, true);
        const byteRate = view.getUint32(i + 16, true);
        const bitDepth = view.getUint16(i + 22, true);
        return {
          codec: 'WAV (PCM)',
          sampleRateHz: sampleRateHz || null,
          bitDepth: bitDepth || null,
          bitrateKbps: byteRate > 0 ? Math.round((byteRate * 8) / 1000) : null,
          lossless: true,
        };
      }
    }
  }

  // FLAC ('fLaC')
  if (
    bytes.length >= 26 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    const packed = view.getUint32(18, false);
    const sampleRateHz = (packed >>> 12) & 0xfffff;
    const bitDepth = ((packed >>> 4) & 0x1f) + 1;
    return {
      codec: 'FLAC',
      sampleRateHz: sampleRateHz || null,
      bitDepth: bitDepth >= 4 && bitDepth <= 32 ? bitDepth : null,
      lossless: true,
    };
  }

  if (lower.endsWith('.flac')) return { codec: 'FLAC', lossless: true };
  if (lower.endsWith('.wav')) return { codec: 'WAV (PCM)', lossless: true };
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return { codec: 'OGG', lossless: false };
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return { codec: 'AAC (M4A)', lossless: false };
  if (lower.endsWith('.mp3')) return { codec: 'MP3', lossless: false };
  return {};
}

async function measureAudioLoudnessAndDuration(
  arrayBuffer: ArrayBuffer,
  fallbackDuration: number,
): Promise<{
  durationSeconds: number;
  estimatedLufs: number;
  peakLinear: number;
  decodedSampleRate: number | null;
}> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return {
      durationSeconds: fallbackDuration,
      estimatedLufs: -14,
      peakLinear: 0.9,
      decodedSampleRate: null,
    };
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
        decodedSampleRate: decoded.sampleRate || null,
      };
    }

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
      decodedSampleRate: decoded.sampleRate || null,
    };
  } catch {
    return {
      durationSeconds: fallbackDuration,
      estimatedLufs: -14,
      peakLinear: 0.9,
      decodedSampleRate: null,
    };
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

  let codec: string | undefined;
  let bitrateKbps: number | null = null;
  let sampleRateHz: number | null = null;
  let bitDepth: number | null = null;
  let lossless = false;
  let replayGainDb: number | null = null;

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
    if (metadata.format.codec) {
      codec = metadata.format.codec;
    } else if (metadata.format.container) {
      codec = metadata.format.container;
    }
    if (typeof metadata.format.bitrate === 'number' && Number.isFinite(metadata.format.bitrate)) {
      bitrateKbps = Math.round(metadata.format.bitrate / 1000);
    }
    if (
      typeof metadata.format.sampleRate === 'number' &&
      Number.isFinite(metadata.format.sampleRate)
    ) {
      sampleRateHz = metadata.format.sampleRate;
    }
    if (
      typeof metadata.format.bitsPerSample === 'number' &&
      Number.isFinite(metadata.format.bitsPerSample)
    ) {
      bitDepth = metadata.format.bitsPerSample;
    }
    if (typeof metadata.format.lossless === 'boolean') {
      lossless = metadata.format.lossless;
    }
    const rg = metadata.common.replaygain_track_gain;
    if (rg && typeof rg.dB === 'number' && Number.isFinite(rg.dB)) {
      replayGainDb = Math.round(rg.dB * 100) / 100;
    }

    const pic = mm.selectCover(metadata.common.picture);
    if (pic && pic.data?.length) {
      const bytes = pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data);
      coverDataUrl = uint8ArrayToDataUrl(bytes, pic.format || 'image/jpeg');
    }
  } catch {
    // Fallback gracefully to filename + header inspection + decoded PCM metadata
  }

  let estimatedLufs = -14;
  let peakLinear = 0.9;
  try {
    const buf = await file.arrayBuffer();
    const headerMeta = inspectRawContainerHeader(buf, file.name);
    if (!codec && headerMeta.codec) codec = headerMeta.codec;
    if (!sampleRateHz && headerMeta.sampleRateHz) sampleRateHz = headerMeta.sampleRateHz;
    if (!bitDepth && headerMeta.bitDepth) bitDepth = headerMeta.bitDepth;
    if (!bitrateKbps && headerMeta.bitrateKbps) bitrateKbps = headerMeta.bitrateKbps;
    if (!lossless && headerMeta.lossless) lossless = true;

    const measured = await measureAudioLoudnessAndDuration(buf, durationSeconds);
    if (measured.durationSeconds > 0 && durationSeconds <= 0) {
      durationSeconds = Math.round(measured.durationSeconds);
    }
    if (!sampleRateHz && measured.decodedSampleRate) {
      sampleRateHz = measured.decodedSampleRate;
    }
    estimatedLufs = measured.estimatedLufs;
    peakLinear = measured.peakLinear;
  } catch {
    // Keep safe defaults
  }

  const badgeInfo = classifyStreamQualityBadge({
    codec: codec || 'Audio Lokal',
    bitrateKbps,
    sampleRateHz,
    bitDepth,
    lossless,
  });

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
    codec: codec || 'Audio Lokal',
    bitrateKbps,
    sampleRateHz,
    bitDepth,
    lossless: badgeInfo.lossless,
    hiRes: badgeInfo.hiRes,
    replayGainDb,
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
