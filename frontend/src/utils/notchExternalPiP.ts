import { useSyncExternalStore } from 'react';
import { usePlayerStore } from '../store/playerStore';
import {
  isWindowsPlatform,
  supportsDocumentPictureInPicture,
} from './notchPlayer';

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

let activePipWindow: Window | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
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

function getActivePipSnapshot(): Window | null {
  if (activePipWindow && activePipWindow.closed) {
    activePipWindow = null;
  }
  return activePipWindow;
}

export function useExternalPiPWindow(): Window | null {
  return useSyncExternalStore(subscribePipStore, getActivePipSnapshot, () => null);
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

export type OpenExternalNotchResult =
  | { ok: true; window: Window }
  | { ok: false; reason: 'windows-only' | 'unsupported-browser' | 'failed' };

export async function openWindowsExternalNotch(options?: {
  width?: number;
  height?: number;
}): Promise<OpenExternalNotchResult> {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'unsupported-browser' };
  }
  if (!isWindowsPlatform()) {
    return { ok: false, reason: 'windows-only' };
  }
  const win = window as WindowWithDocumentPiP;
  if (!supportsDocumentPictureInPicture(win) || !win.documentPictureInPicture) {
    return { ok: false, reason: 'unsupported-browser' };
  }

  if (activePipWindow && !activePipWindow.closed) {
    try {
      activePipWindow.focus();
    } catch {
      // Ignore focus restriction
    }
    usePlayerStore.getState().setExternalNotchOpen(true);
    return { ok: true, window: activePipWindow };
  }

  const width = options?.width ?? 320;
  const height = options?.height ?? 60;

  try {
    const pipWindow = await win.documentPictureInPicture.requestWindow({
      width,
      height,
      disallowReturnToOpener: false,
    });

    pipWindow.document.title = 'SoundClear Mini Player';
    pipWindow.document.documentElement.className = 'dark';
    pipWindow.document.documentElement.style.backgroundColor = '#000000';
    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.padding = '0';
    pipWindow.document.body.style.backgroundColor = '#000000';
    pipWindow.document.body.style.color = '#ffffff';
    pipWindow.document.body.style.overflow = 'hidden';
    pipWindow.document.body.style.userSelect = 'none';
    pipWindow.document.body.style.fontFamily =
      '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif';

    copyDocumentStyles(document, pipWindow.document);

    const handlePageHide = () => {
      if (activePipWindow === pipWindow) {
        activePipWindow = null;
        usePlayerStore.getState().setExternalNotchOpen(false);
        notifyListeners();
      }
    };

    pipWindow.addEventListener('pagehide', handlePageHide, { once: true });

    activePipWindow = pipWindow;
    usePlayerStore.getState().setExternalNotchOpen(true);
    notifyListeners();
    return { ok: true, window: pipWindow };
  } catch {
    return { ok: false, reason: 'failed' };
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
  usePlayerStore.getState().setExternalNotchOpen(false);
  notifyListeners();
  if (win && !win.closed) {
    try {
      win.close();
    } catch {
      // Ignore close errors
    }
  }
}
