import { create } from 'zustand';
import type { MediaItem, RouteView } from '../types/music';

interface NavigationState {
  history: RouteView[];
  historyIndex: number;
  currentRoute: RouteView;
  navigate: (route: RouteView) => void;
  navigateToItem: (item: MediaItem) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  history: [{ name: 'home' }],
  historyIndex: 0,
  currentRoute: { name: 'home' },

  navigate: (route) => {
    const { history, historyIndex } = get();
    const sliced = history.slice(0, historyIndex + 1);
    const nextHistory = [...sliced, route];
    set({
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      currentRoute: route,
    });
  },

  navigateToItem: (item) => {
    const { navigate } = get();
    if (item.type === 'artist') {
      navigate({ name: 'artist', id: item.browseId || item.id });
    } else if (item.type === 'album') {
      navigate({ name: 'album', id: item.browseId || item.id });
    } else if (item.type === 'playlist') {
      navigate({ name: 'playlist', id: item.playlistId || item.id });
    } else if (item.type === 'podcast') {
      navigate({ name: 'podcast', id: item.browseId || item.id });
    } else if (item.type === 'episode') {
      navigate({ name: 'episode', id: item.videoId || item.id });
    }
  },

  goBack: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const nextIdx = historyIndex - 1;
    set({
      historyIndex: nextIdx,
      currentRoute: history[nextIdx],
    });
  },

  goForward: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const nextIdx = historyIndex + 1;
    set({
      historyIndex: nextIdx,
      currentRoute: history[nextIdx],
    });
  },

  canGoBack: () => get().historyIndex > 0,
  canGoForward: () => get().historyIndex < get().history.length - 1,
}));
