import { create } from 'zustand';
import type { MediaItem } from '../types/music';

interface TrackMenuOptions {
  onAddToPlaylist?: (track: MediaItem) => void;
  onRemoveFromList?: () => void;
  removeLabel?: string;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  track: MediaItem | null;
  options: TrackMenuOptions;
  creditsTrack: MediaItem | null;
  toastMessage: string | null;

  openMenu: (x: number, y: number, track: MediaItem, options?: TrackMenuOptions) => void;
  closeMenu: () => void;
  openCredits: (track: MediaItem) => void;
  closeCredits: () => void;
  showToast: (msg: string) => void;
}

let toastTimer: number | null = null;

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  track: null,
  options: {},
  creditsTrack: null,
  toastMessage: null,

  openMenu: (x, y, track, options = {}) => set({ open: true, x, y, track, options }),
  closeMenu: () => set({ open: false }),
  openCredits: (track) => set({ creditsTrack: track, open: false }),
  closeCredits: () => set({ creditsTrack: null }),
  showToast: (msg) => {
    if (toastTimer) window.clearTimeout(toastTimer);
    set({ toastMessage: msg });
    toastTimer = window.setTimeout(() => {
      set({ toastMessage: null });
    }, 2600);
  },
}));
