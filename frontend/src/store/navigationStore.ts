import { create } from 'zustand';
import type { MediaItem, RouteView } from '../types/music';
import { normalizeRouteId } from '../utils/playerLogic';

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
    let normalizedRoute = route;
    if (
      route.name === 'artist' ||
      route.name === 'album' ||
      route.name === 'playlist' ||
      route.name === 'podcast' ||
      route.name === 'episode' ||
      route.name === 'local-playlist'
    ) {
      const cleanId =
        route.name === 'local-playlist' ? route.id.trim() || null : normalizeRouteId(route.id);
      if (!cleanId) return;
      normalizedRoute = { ...route, id: cleanId };
    } else if (route.name === 'mood-detail') {
      const cleanParams = route.params.trim();
      if (!cleanParams) return;
      normalizedRoute = { ...route, params: cleanParams };
    }

    const { history, historyIndex } = get();
    const sliced = history.slice(0, historyIndex + 1);
    const nextHistory = [...sliced, normalizedRoute];
    set({
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      currentRoute: normalizedRoute,
    });
  },

  navigateToItem: (item) => {
    const { navigate } = get();
    const fallbackQuery = item.title?.trim() || undefined;
    if (item.type === 'artist') {
      navigate({ name: 'artist', id: item.browseId || item.id, fallbackQuery });
    } else if (item.type === 'album') {
      navigate({ name: 'album', id: item.browseId || item.id, fallbackQuery });
    } else if (item.type === 'playlist') {
      navigate({ name: 'playlist', id: item.playlistId || item.id, fallbackQuery });
    } else if (item.type === 'podcast') {
      navigate({ name: 'podcast', id: item.browseId || item.id, fallbackQuery });
    } else if (item.type === 'episode') {
      navigate({ name: 'episode', id: item.videoId || item.id, fallbackQuery });
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
