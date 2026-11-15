import { useSyncExternalStore } from 'react';
import { usePlayerStore } from '../store/playerStore';
import {
  isTopLevelBrowsingContext,
  isWindowsPlatform,
  supportsDocumentPictureInPicture,
  supportsVideoPictureInPicture,
} from './notchPlayer';
import { formatArtists, formatTime } from './playerLogic';

interface DocumentPictureInPictureApi {
  requestWindow: (options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }) => Promise<Window>;
  window?: Window | null;
}

type WindowWithDocumentPiP = Window & {
  documentPictureInPicture?: DocumentPictureInPictureApi;
};

export type ExternalPiPMode = 'document-pip' | 'video-pip' | null;

export interface ExternalPiPSnapshot {
  open: boolean;
  mode: ExternalPiPMode;
  window: Window | null;
}

export interface VideoPiPRenderState {
  title: string;
  artist: string;
  prevLine: string | null;
  activeLine: string;
  nextLine: string | null;
  hasSyncedLyrics: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  thumbnail?: string | null;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 260;

let activePipWindow: Window | null = null;
let activeMode: ExternalPiPMode = null;
let pipCanvas: HTMLCanvasElement | null = null;
let pipVideo: HTMLVideoElement | null = null;
let pipStream: MediaStream | null = null;
let programmaticVideoSync = false;
let pauseCheckTimer: number | null = null;
let pipRedrawTimer: number | null = null;

let cachedArtworkSrc: string | null = null;
let cachedArtworkImg: HTMLImageElement | null = null;
let cachedArtworkLoaded = false;
let lastRenderState: VideoPiPRenderState | null = null;

let cachedSnapshot: ExternalPiPSnapshot = {
  open: false,
  mode: null,
  window: null,
};

const listeners = new Set<() => void>();

function refreshSnapshot(): void {
  if (activePipWindow && activePipWindow.closed) {
    activePipWindow = null;
    if (activeMode === 'document-pip') {
      activeMode = null;
    }
  }
  const videoActive =
    activeMode === 'video-pip' &&
    typeof document !== 'undefined' &&
    Boolean(pipVideo && document.pictureInPictureElement === pipVideo);

  const nextOpen =
    activeMode === 'document-pip'
      ? Boolean(activePipWindow && !activePipWindow.closed)
      : videoActive;

  const nextMode: ExternalPiPMode = nextOpen ? activeMode : null;
  const nextWindow = nextMode === 'document-pip' ? activePipWindow : null;

  if (
    cachedSnapshot.open !== nextOpen ||
    cachedSnapshot.mode !== nextMode ||
    cachedSnapshot.window !== nextWindow
  ) {
    cachedSnapshot = {
      open: nextOpen,
      mode: nextMode,
      window: nextWindow,
    };
  }
}

function notifyListeners(): void {
  refreshSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function subscribePipStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getActiveSnapshot(): ExternalPiPSnapshot {
  refreshSnapshot();
  return cachedSnapshot;
}

const SERVER_PIP_SNAPSHOT: ExternalPiPSnapshot = {
  open: false,
  mode: null,
  window: null,
};

export function useExternalPiPState(): ExternalPiPSnapshot {
  return useSyncExternalStore(subscribePipStore, getActiveSnapshot, () => SERVER_PIP_SNAPSHOT);
}

export function useExternalPiPWindow(): Window | null {
  return useExternalPiPState().window;
}

function copyDocumentStyles(sourceDoc: Document, targetDoc: Document): void {
  for (const styleSheet of Array.from(sourceDoc.styleSheets)) {
    try {
      const cssRules = Array.from(styleSheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      if (cssRules) {
        const styleEl = targetDoc.createElement('style');
        styleEl.textContent = cssRules;
        targetDoc.head.appendChild(styleEl);
        continue;
      }
    } catch {
      // Fallback to linking external stylesheet when CORS blocks cssRules inspection
    }

    if (styleSheet.href) {
      const linkEl = targetDoc.createElement('link');
      linkEl.rel = 'stylesheet';
      linkEl.href = styleSheet.href;
      targetDoc.head.appendChild(linkEl);
    }
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  const clean = text.trim();
  if (!clean) return '';
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${clean.slice(0, mid)}...`).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${clean.slice(0, Math.max(1, low))}...`;
}

function wrapTextTwoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (ctx.measureText(clean).width <= maxWidth) return [clean];

  const words = clean.split(/\s+/);
  let line1 = '';
  let idx = 0;
  while (idx < words.length) {
    const candidate = line1 ? `${line1} ${words[idx]}` : words[idx];
    if (ctx.measureText(candidate).width <= maxWidth) {
      line1 = candidate;
      idx += 1;
    } else {
      break;
    }
  }

  if (!line1) {
    return [truncateText(ctx, clean, maxWidth)];
  }

  const remaining = words.slice(idx).join(' ');
  if (!remaining) return [line1];
  return [line1, truncateText(ctx, remaining, maxWidth)];
}

function ensureArtworkLoaded(src: string | null | undefined): HTMLImageElement | null {
  const clean = src?.trim() || null;
  if (!clean) {
    cachedArtworkSrc = null;
    cachedArtworkImg = null;
    cachedArtworkLoaded = false;
    return null;
  }

  if (clean === cachedArtworkSrc) {
    return cachedArtworkLoaded ? cachedArtworkImg : null;
  }

  cachedArtworkSrc = clean;
  cachedArtworkLoaded = false;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (cachedArtworkSrc === clean) {
      cachedArtworkLoaded = true;
      if (lastRenderState && activeMode === 'video-pip') {
        renderVideoPiPFrame(lastRenderState);
      }
    }
  };
  img.onerror = () => {
    if (cachedArtworkSrc === clean) {
      cachedArtworkLoaded = false;
    }
  };
  img.src = clean;
  cachedArtworkImg = img;
  return null;
}

export function renderVideoPiPFrame(state: VideoPiPRenderState): void {
  lastRenderState = state;
  if (!pipCanvas) return;
  const ctx = pipCanvas.getContext('2d');
  if (!ctx) return;

  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;

  // Base dark background
  ctx.fillStyle = '#08120D';
  ctx.fillRect(0, 0, w, h);

  // Subtle emerald / ambient glow top-left
  const glow = ctx.createRadialGradient(90, 40, 10, 90, 40, 320);
  glow.addColorStop(0, 'rgba(25, 238, 138, 0.16)');
  glow.addColorStop(1, 'rgba(25, 238, 138, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Header strip
  ctx.fillStyle = 'rgba(15, 31, 23, 0.72)';
  ctx.fillRect(0, 0, w, 46);
  ctx.fillStyle = 'rgba(179, 247, 209, 0.12)';
  ctx.fillRect(0, 46, w, 1);

  // Status dot + Windows Mini label
  ctx.fillStyle = '#19EE8A';
  ctx.beginPath();
  ctx.arc(28, 23, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '600 13px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(232, 255, 243, 0.85)';
  ctx.textBaseline = 'middle';
  ctx.fillText('SOUNDCLEAR MINI • WINDOWS', 44, 24);

  // Time + state on right
  const safeDuration = state.duration > 0 ? state.duration : 0;
  const timeLabel =
    safeDuration > 0
      ? `${formatTime(state.currentTime)} / ${formatTime(safeDuration)}`
      : formatTime(state.currentTime);
  const statusLabel = state.isPlaying ? 'DIPUTAR' : 'DIJEDA';

  ctx.font = '600 12px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
  const statusTextWidth = ctx.measureText(statusLabel).width;
  const pillWidth = statusTextWidth + 18;
  const pillX = w - 22 - pillWidth;
  drawRoundedRect(ctx, pillX, 12, pillWidth, 22, 11);
  ctx.fillStyle = state.isPlaying
    ? 'rgba(25, 238, 138, 0.18)'
    : 'rgba(179, 247, 209, 0.12)';
  ctx.fill();

  ctx.fillStyle = state.isPlaying ? '#19EE8A' : 'rgba(179, 247, 209, 0.78)';
  ctx.fillText(statusLabel, pillX + 9, 23.5);

  ctx.font = '500 13px "JetBrains Mono", "Consolas", monospace';
  ctx.fillStyle = 'rgba(179, 247, 209, 0.62)';
  const timeWidth = ctx.measureText(timeLabel).width;
  ctx.fillText(timeLabel, pillX - 14 - timeWidth, 24);

  // Artwork card (136x136)
  const artX = 24;
  const artY = 72;
  const artSize = 136;
  const artworkImg = ensureArtworkLoaded(state.thumbnail);

  ctx.save();
  drawRoundedRect(ctx, artX, artY, artSize, artSize, 16);
  ctx.clip();

  if (artworkImg && artworkImg.naturalWidth > 0 && artworkImg.naturalHeight > 0) {
    const scale = Math.max(
      artSize / artworkImg.naturalWidth,
      artSize / artworkImg.naturalHeight,
    );
    const drawW = artworkImg.naturalWidth * scale;
    const drawH = artworkImg.naturalHeight * scale;
    ctx.drawImage(
      artworkImg,
      artX + (artSize - drawW) / 2,
      artY + (artSize - drawH) / 2,
      drawW,
      drawH,
    );
  } else {
    const fallbackGrad = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize);
    fallbackGrad.addColorStop(0, '#15291F');
    fallbackGrad.addColorStop(1, '#0F1F17');
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(artX, artY, artSize, artSize);

    // Subtle vinyl emblem
    ctx.strokeStyle = 'rgba(25, 238, 138, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(artX + artSize / 2, artY + artSize / 2, 34, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#19EE8A';
    ctx.beginPath();
    ctx.arc(artX + artSize / 2, artY + artSize / 2, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Artwork subtle border
  drawRoundedRect(ctx, artX, artY, artSize, artSize, 16);
  ctx.strokeStyle = 'rgba(179, 247, 209, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right track info + synced lyrics
  const textX = 182;
  const textMaxW = w - textX - 24;

  ctx.font = '700 23px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#E8FFF3';
  const titleLine = truncateText(ctx, state.title || 'SoundClear', textMaxW);
  ctx.fillText(titleLine, textX, 92);

  if (state.hasSyncedLyrics) {
    let cursorY = 128;
    if (state.prevLine) {
      ctx.font = '500 15px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(179, 247, 209, 0.48)';
      ctx.fillText(truncateText(ctx, state.prevLine, textMaxW), textX, cursorY);
      cursorY += 27;
    } else {
      cursorY += 6;
    }

    ctx.font = '600 19px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#19EE8A';
    const activeLines = wrapTextTwoLines(ctx, state.activeLine, textMaxW);
    for (const line of activeLines) {
      ctx.fillText(line, textX, cursorY);
      cursorY += 26;
    }

    if (state.nextLine && cursorY <= 204) {
      ctx.font = '500 15px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(179, 247, 209, 0.62)';
      ctx.fillText(truncateText(ctx, state.nextLine, textMaxW), textX, cursorY + 2);
    }
  } else {
    ctx.font = '500 18px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(179, 247, 209, 0.78)';
    ctx.fillText(truncateText(ctx, state.artist || state.activeLine, textMaxW), textX, 132);

    ctx.font = '500 13px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(25, 238, 138, 0.88)';
    ctx.fillText('Jendela mengambang aktif di luar web (Windows)', textX, 168);
  }

  // Bottom progress bar
  const barY = h - 8;
  ctx.fillStyle = 'rgba(179, 247, 209, 0.14)';
  ctx.fillRect(0, barY, w, 8);

  const progressRatio =
    safeDuration > 0 ? Math.min(1, Math.max(0, state.currentTime / safeDuration)) : 0;
  if (progressRatio > 0) {
    ctx.fillStyle = '#19EE8A';
    ctx.fillRect(0, barY, Math.round(w * progressRatio), 8);
  }
}

function getInitialRenderStateFromStore(): VideoPiPRenderState {
  const st = usePlayerStore.getState();
  const track = st.currentTrack;
  const artist = track ? formatArtists(track.artists) : 'SoundClear';
  return {
    title: track?.title || 'SoundClear',
    artist,
    prevLine: null,
    activeLine: artist,
    nextLine: null,
    hasSyncedLyrics: false,
    currentTime: st.currentTime,
    duration: st.duration > 0 ? st.duration : track?.durationSeconds || 0,
    isPlaying: st.isPlaying,
    thumbnail: track?.thumbnail ?? null,
  };
}

function cleanupVideoPiPResources(): void {
  if (pauseCheckTimer !== null) {
    window.clearTimeout(pauseCheckTimer);
    pauseCheckTimer = null;
  }
  if (pipRedrawTimer !== null) {
    window.clearInterval(pipRedrawTimer);
    pipRedrawTimer = null;
  }
  if (pipStream) {
    for (const track of pipStream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore stop errors
      }
    }
    pipStream = null;
  }
  if (pipVideo) {
    try {
      pipVideo.pause();
      pipVideo.srcObject = null;
    } catch {
      // Ignore cleanup errors
    }
  }
}

function ensureVideoPiPElements(): {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
} {
  if (!pipCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    pipCanvas = canvas;
  }

  if (!pipVideo) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.width = CANVAS_WIDTH;
    video.height = CANVAS_HEIGHT;
    video.setAttribute('aria-hidden', 'true');
    video.style.position = 'fixed';
    video.style.bottom = '0';
    video.style.right = '0';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.001';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-1';

    video.addEventListener('play', () => {
      if (programmaticVideoSync || document.pictureInPictureElement !== video) return;
      const st = usePlayerStore.getState();
      if (!st.isPlaying && st.currentTrack) {
        st.togglePlayPause();
      }
    });

    video.addEventListener('pause', () => {
      if (programmaticVideoSync || document.pictureInPictureElement !== video) return;
      if (pauseCheckTimer !== null) {
        window.clearTimeout(pauseCheckTimer);
      }
      // Wait briefly so closing the PiP window (which fires pause before leavepictureinpicture)
      // does not pause ongoing audio playback.
      pauseCheckTimer = window.setTimeout(() => {
        pauseCheckTimer = null;
        if (document.pictureInPictureElement === video) {
          const st = usePlayerStore.getState();
          if (st.isPlaying) {
            st.togglePlayPause();
          }
        }
      }, 80);
    });

    video.addEventListener('leavepictureinpicture', () => {
      if (activeMode === 'video-pip') {
        activeMode = null;
        cleanupVideoPiPResources();
        usePlayerStore.getState().setExternalNotchOpen(false);
        notifyListeners();
      }
    });

    document.body.appendChild(video);
    pipVideo = video;
  }

  return { canvas: pipCanvas, video: pipVideo };
}

export function syncVideoPiPPlayback(isPlaying: boolean): void {
  if (activeMode !== 'video-pip' || !pipVideo) return;
  if (typeof document === 'undefined' || document.pictureInPictureElement !== pipVideo) {
    return;
  }

  if (isPlaying && pipVideo.paused) {
    programmaticVideoSync = true;
    void pipVideo
      .play()
      .catch(() => {})
      .finally(() => {
        programmaticVideoSync = false;
      });
  } else if (!isPlaying && !pipVideo.paused) {
    programmaticVideoSync = true;
    pipVideo.pause();
    window.setTimeout(() => {
      programmaticVideoSync = false;
    }, 0);
  }
}

function waitForVideoMetadata(video: HTMLVideoElement, timeoutMs = 450): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('loadeddata', done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('loadeddata', done, { once: true });
  });
}

async function openWindowsVideoPiP(): Promise<OpenExternalNotchResult> {
  if (!supportsVideoPictureInPicture(document)) {
    return { ok: false, reason: 'unsupported-browser' };
  }

  const { canvas, video } = ensureVideoPiPElements();

  if (document.pictureInPictureElement === video) {
    activeMode = 'video-pip';
    usePlayerStore.getState().setExternalNotchOpen(true);
    notifyListeners();
    return { ok: true, mode: 'video-pip', window: null };
  }

  try {
    if (!pipStream || pipStream.getVideoTracks().every((t) => t.readyState === 'ended')) {
      pipStream = canvas.captureStream(12);
    }
    if (video.srcObject !== pipStream) {
      video.srcObject = pipStream;
    }

    // Draw AFTER captureStream is attached so the MediaStreamTrack emits its initial frame immediately
    const initialState = lastRenderState ?? getInitialRenderStateFromStore();
    renderVideoPiPFrame(initialState);

    if (pipRedrawTimer !== null) {
      window.clearInterval(pipRedrawTimer);
    }
    pipRedrawTimer = window.setInterval(() => {
      if (activeMode === 'video-pip' && lastRenderState) {
        renderVideoPiPFrame(lastRenderState);
      }
    }, 250);

    programmaticVideoSync = true;
    await video.play();
    renderVideoPiPFrame(lastRenderState ?? initialState);
    await waitForVideoMetadata(video);
    await video.requestPictureInPicture();

    const shouldBePlaying = usePlayerStore.getState().isPlaying;
    if (!shouldBePlaying && !video.paused) {
      video.pause();
    }
    programmaticVideoSync = false;

    activeMode = 'video-pip';
    usePlayerStore.getState().setExternalNotchOpen(true);
    notifyListeners();
    return { ok: true, mode: 'video-pip', window: null };
  } catch {
    programmaticVideoSync = false;
    cleanupVideoPiPResources();
    return { ok: false, reason: 'failed' };
  }
}

export type OpenExternalNotchResult =
  | { ok: true; mode: 'document-pip' | 'video-pip'; window: Window | null }
  | { ok: false; reason: 'windows-only' | 'unsupported-browser' | 'failed' };

export async function openWindowsExternalNotch(options?: {
  width?: number;
  height?: number;
}): Promise<OpenExternalNotchResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, reason: 'unsupported-browser' };
  }
  if (!isWindowsPlatform()) {
    return { ok: false, reason: 'windows-only' };
  }

  const win = window as WindowWithDocumentPiP;
  const isTopLevel = isTopLevelBrowsingContext(win);
  const hasDocPiP = supportsDocumentPictureInPicture(win) && Boolean(win.documentPictureInPicture);
  const hasVideoPiP = supportsVideoPictureInPicture(document);

  if (!hasDocPiP && !hasVideoPiP) {
    return { ok: false, reason: 'unsupported-browser' };
  }

  if (activePipWindow && !activePipWindow.closed) {
    try {
      activePipWindow.focus();
    } catch {
      // Ignore focus restriction
    }
    activeMode = 'document-pip';
    usePlayerStore.getState().setExternalNotchOpen(true);
    notifyListeners();
    return { ok: true, mode: 'document-pip', window: activePipWindow };
  }

  // Inside iframes (e.g. embedded preview), Document PiP is forbidden by browser spec.
  // Go straight to Video PiP so user activation is preserved.
  if (!isTopLevel || !hasDocPiP) {
    return openWindowsVideoPiP();
  }

  const width = options?.width ?? 360;
  const height = options?.height ?? 116;

  try {
    const pipWindow = await win.documentPictureInPicture!.requestWindow({
      width,
      height,
      disallowReturnToOpener: false,
    });

    pipWindow.document.title = 'SoundClear Mini Player (Windows)';
    pipWindow.document.documentElement.className = 'dark';
    pipWindow.document.documentElement.style.backgroundColor = '#08120D';
    pipWindow.document.documentElement.style.height = '100%';
    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.padding = '0';
    pipWindow.document.body.style.height = '100%';
    pipWindow.document.body.style.backgroundColor = '#08120D';
    pipWindow.document.body.style.color = '#E8FFF3';
    pipWindow.document.body.style.overflow = 'hidden';
    pipWindow.document.body.style.userSelect = 'none';
    pipWindow.document.body.style.fontFamily =
      '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif';

    copyDocumentStyles(document, pipWindow.document);

    const handlePageHide = () => {
      if (activePipWindow === pipWindow) {
        activePipWindow = null;
        if (activeMode === 'document-pip') {
          activeMode = null;
        }
        usePlayerStore.getState().setExternalNotchOpen(false);
        notifyListeners();
      }
    };

    pipWindow.addEventListener('pagehide', handlePageHide, { once: true });

    activePipWindow = pipWindow;
    activeMode = 'document-pip';
    usePlayerStore.getState().setExternalNotchOpen(true);
    notifyListeners();
    return { ok: true, mode: 'document-pip', window: pipWindow };
  } catch {
    if (hasVideoPiP) {
      return openWindowsVideoPiP();
    }
    return { ok: false, reason: 'failed' };
  }
}

export function updateWindowsExternalNotchTitle(title: string): void {
  if (!activePipWindow || activePipWindow.closed) return;
  try {
    activePipWindow.document.title = title;
  } catch {
    // Ignore title assignment restrictions
  }
}

export function resizeWindowsExternalNotch(width: number, height: number): void {
  if (!activePipWindow || activePipWindow.closed) return;
  try {
    activePipWindow.resizeTo(Math.round(width), Math.round(height));
  } catch {
    // Ignore browser minimum-window resize restrictions
  }
}

export function closeWindowsExternalNotch(): void {
  const win = activePipWindow;
  activePipWindow = null;
  activeMode = null;
  cleanupVideoPiPResources();
  usePlayerStore.getState().setExternalNotchOpen(false);
  notifyListeners();

  if (win && !win.closed) {
    try {
      win.close();
    } catch {
      // Ignore close errors
    }
  }

  if (typeof document !== 'undefined' && document.pictureInPictureElement) {
    void document.exitPictureInPicture().catch(() => {});
  }
}
