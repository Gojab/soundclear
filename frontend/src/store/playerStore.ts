import { create } from 'zustand';
import { fetchArtworkColor, fetchWatchPlaylist } from '../api/client';
import type { MediaItem, RepeatMode } from '../types/music';
import {
  computeNextIndex,
  computePrevIndex,
  getPlayableVideoId,
  mergeWatchTracksIntoQueue,
} from '../utils/playerLogic';

export type RightPanelTab = 'queue' | 'lyrics';

interface AmbientColor {
  r: number;
  g: number;
  b: number;
}

interface PlayerState {
  currentTrack: MediaItem | null;
  queue: MediaItem[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  lyricsBrowseId: string | null;
  ambientColor: AmbientColor;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  mobileExpanded: boolean;
  seekVersion: number;
  pendingSeekSeconds: number | null;
  playerError: string | null;

  playTrack: (track: MediaItem, options?: { autoRadio?: boolean; openPanel?: boolean }) => void;
  playTrackList: (tracks: MediaItem[], startIndex?: number) => void;
  playQueueIndex: (index: number) => void;
  addToQueue: (track: MediaItem) => void;
  playNextInQueue: (track: MediaItem) => void;
  removeFromQueue: (index: number) => void;
  clearUpcomingQueue: () => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayPause: () => void;
  setIsBuffering: (buffering: boolean) => void;
  setProgress: (currentTime: number, duration?: number) => void;
  requestSeek: (seconds: number) => void;
  clearPendingSeek: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  handleTrackEnded: () => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setMobileExpanded: (expanded: boolean) => void;
  setPlayerError: (error: string | null) => void;
}

const DEFAULT_AMBIENT: AmbientColor = { r: 22, g: 48, b: 40 };

async function hydrateTrackContext(
  track: MediaItem,
  autoRadio: boolean,
  getState: () => PlayerState,
  setState: (partial: Partial<PlayerState> | ((s: PlayerState) => Partial<PlayerState>)) => void,
) {
  const videoId = getPlayableVideoId(track);
  if (!videoId) return;

  if (track.thumbnail) {
    fetchArtworkColor(track.thumbnail)
      .then((color) => {
        if (getPlayableVideoId(getState().currentTrack) === videoId) {
          setState({ ambientColor: { r: color.r, g: color.g, b: color.b } });
        }
      })
      .catch(() => {
        // Keep current ambient color on artwork fetch failure
      });
  }

  try {
    const watch = await fetchWatchPlaylist(videoId, autoRadio, track.playlistId);
    if (getPlayableVideoId(getState().currentTrack) !== videoId) return;

    setState((state) => ({
      lyricsBrowseId: watch.lyricsBrowseId || null,
      queue: autoRadio
        ? mergeWatchTracksIntoQueue(state.queue, state.queueIndex, watch.tracks)
        : state.queue,
    }));
  } catch {
    // Non-fatal: playback still proceeds with current track
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  volume: 80,
  isMuted: false,
  shuffle: false,
  repeat: 'off',
  lyricsBrowseId: null,
  ambientColor: DEFAULT_AMBIENT,
  rightPanelOpen: true,
  rightPanelTab: 'queue',
  mobileExpanded: false,
  seekVersion: 0,
  pendingSeekSeconds: null,
  playerError: null,

  playTrack: (track, options) => {
    const videoId = getPlayableVideoId(track);
    if (!videoId) return;
    const autoRadio = options?.autoRadio ?? true;
    const openPanel = options?.openPanel ?? false;

    set((state) => ({
      currentTrack: track,
      queue: [track],
      queueIndex: 0,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: track.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
      rightPanelOpen: openPanel ? true : state.rightPanelOpen,
    }));

    void hydrateTrackContext(track, autoRadio, get, set);
  },

  playTrackList: (tracks, startIndex = 0) => {
    const playable = tracks.filter((t) => Boolean(getPlayableVideoId(t)));
    if (playable.length === 0) return;
    const safeIdx = Math.max(0, Math.min(startIndex, playable.length - 1));
    const target = playable[safeIdx];

    set({
      currentTrack: target,
      queue: playable,
      queueIndex: safeIdx,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: target.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
    });

    void hydrateTrackContext(target, true, get, set);
  },

  playQueueIndex: (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    const target = queue[index];
    set({
      currentTrack: target,
      queueIndex: index,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: target.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
    });
    void hydrateTrackContext(target, false, get, set);
  },

  addToQueue: (track) => {
    if (!getPlayableVideoId(track)) return;
    const { currentTrack, queue } = get();
    if (!currentTrack) {
      get().playTrack(track);
      return;
    }
    set({ queue: [...queue, track] });
  },

  playNextInQueue: (track) => {
    if (!getPlayableVideoId(track)) return;
    const { currentTrack, queue, queueIndex } = get();
    if (!currentTrack) {
      get().playTrack(track);
      return;
    }
    const nextQueue = [...queue];
    nextQueue.splice(queueIndex + 1, 0, track);
    set({ queue: nextQueue });
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length || index === queueIndex) return;
    const nextQueue = queue.filter((_, i) => i !== index);
    const nextIdx = index < queueIndex ? queueIndex - 1 : queueIndex;
    set({ queue: nextQueue, queueIndex: nextIdx });
  },

  clearUpcomingQueue: () => {
    const { queue, queueIndex } = get();
    if (queueIndex < 0 || queueIndex >= queue.length) {
      set({ queue: [], queueIndex: -1 });
      return;
    }
    set({ queue: queue.slice(0, queueIndex + 1) });
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  togglePlayPause: () => {
    const { currentTrack, isPlaying } = get();
    if (!currentTrack) return;
    set({ isPlaying: !isPlaying });
  },

  setIsBuffering: (buffering) => set({ isBuffering: buffering }),

  setProgress: (currentTime, duration) => {
    set((state) => ({
      currentTime,
      duration: duration && duration > 0 ? duration : state.duration,
    }));
  },

  requestSeek: (seconds) => {
    set((state) => ({
      currentTime: seconds,
      pendingSeekSeconds: seconds,
      seekVersion: state.seekVersion + 1,
    }));
  },

  clearPendingSeek: () => set({ pendingSeekSeconds: null }),

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    set({ volume: clamped, isMuted: clamped === 0 });
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  toggleShuffle: () => {
    set((state) => ({ shuffle: !state.shuffle }));
  },

  cycleRepeat: () => {
    set((state) => {
      const next: RepeatMode =
        state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      return { repeat: next };
    });
  },

  nextTrack: () => {
    const { queue, queueIndex, shuffle, repeat, currentTrack } = get();
    const effectiveRepeat: RepeatMode = repeat === 'one' ? 'all' : repeat;
    const nextIdx = computeNextIndex(queueIndex, queue.length, shuffle, effectiveRepeat);

    if (nextIdx !== null && queue[nextIdx]) {
      get().playQueueIndex(nextIdx);
      return;
    }

    // Fetch fresh radio continuation if queue reached end
    const vid = getPlayableVideoId(currentTrack);
    if (vid) {
      fetchWatchPlaylist(vid, true)
        .then((watch) => {
          const merged = mergeWatchTracksIntoQueue(get().queue, get().queueIndex, watch.tracks);
          if (merged.length > get().queueIndex + 1) {
            set({ queue: merged });
            get().playQueueIndex(get().queueIndex + 1);
          } else {
            set({ isPlaying: false });
          }
        })
        .catch(() => set({ isPlaying: false }));
    } else {
      set({ isPlaying: false });
    }
  },

  prevTrack: () => {
    const { queue, queueIndex, currentTime, repeat } = get();
    const res = computePrevIndex(queueIndex, queue.length, currentTime, repeat);
    if (res.action === 'restart') {
      get().requestSeek(0);
      set({ isPlaying: true });
    } else if (res.index !== null) {
      get().playQueueIndex(res.index);
    }
  },

  handleTrackEnded: () => {
    const { repeat, queue, queueIndex, shuffle, currentTrack } = get();
    if (repeat === 'one') {
      get().requestSeek(0);
      set({ isPlaying: true });
      return;
    }
    const nextIdx = computeNextIndex(queueIndex, queue.length, shuffle, repeat);
    if (nextIdx !== null && queue[nextIdx]) {
      get().playQueueIndex(nextIdx);
      return;
    }
    const vid = getPlayableVideoId(currentTrack);
    if (vid) {
      fetchWatchPlaylist(vid, true)
        .then((watch) => {
          const merged = mergeWatchTracksIntoQueue(get().queue, get().queueIndex, watch.tracks);
          if (merged.length > get().queueIndex + 1) {
            set({ queue: merged });
            get().playQueueIndex(get().queueIndex + 1);
          } else {
            set({ isPlaying: false });
          }
        })
        .catch(() => set({ isPlaying: false }));
    } else {
      set({ isPlaying: false });
    }
  },

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
  setMobileExpanded: (expanded) => set({ mobileExpanded: expanded }),
  setPlayerError: (error) => set({ playerError: error }),
}));
