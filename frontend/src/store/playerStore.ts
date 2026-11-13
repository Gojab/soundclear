import { create } from 'zustand';
import { fetchArtworkColor, fetchWatchPlaylist } from '../api/client';
import { db, type PersistedPlayerSession } from '../db/soundclearDb';
import type { MediaItem, RepeatMode } from '../types/music';
import {
  getPlayableVideoId,
  interleaveSmartShuffleTracks,
} from '../utils/playerLogic';
import { useLibraryStore } from './libraryStore';
import { useSettingsStore } from './settingsStore';

export type RightPanelTab = 'queue' | 'lyrics' | 'details';
export type SleepTimerMode = 'off' | 'minutes' | 'end_of_track';

interface AmbientColor {
  r: number;
  g: number;
  b: number;
}

interface PlayerState {
  hydrated: boolean;
  currentTrack: MediaItem | null;
  manualQueue: MediaItem[];
  sourceQueue: MediaItem[];
  historyStack: MediaItem[];
  sourceLabel: string | null;

  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  smartShuffle: boolean;
  repeat: RepeatMode;
  playbackRate: number;
  crossfadeSeconds: number;

  sleepTimerMode: SleepTimerMode;
  sleepTimerEndsAt: number | null;

  lyricsBrowseId: string | null;
  ambientColor: AmbientColor;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  mobileExpanded: boolean;
  karaokeOpen: boolean;
  fullscreenNowPlaying: boolean;
  floatingMiniOpen: boolean;

  seekVersion: number;
  pendingSeekSeconds: number | null;
  playerError: string | null;

  hydrate: () => Promise<void>;
  playTrack: (
    track: MediaItem,
    options?: {
      autoRadio?: boolean;
      openPanel?: boolean;
      startAtSeconds?: number;
      sourceLabel?: string;
    },
  ) => void;
  playTrackList: (tracks: MediaItem[], startIndex?: number, sourceLabel?: string) => void;
  playFromManualQueue: (index: number) => void;
  playFromSourceQueue: (index: number) => void;
  addToQueue: (track: MediaItem) => void;
  playNextInQueue: (track: MediaItem) => void;
  removeFromManualQueue: (index: number) => void;
  removeFromSourceQueue: (index: number) => void;
  reorderManualQueue: (fromIndex: number, toIndex: number) => void;
  reorderSourceQueue: (fromIndex: number, toIndex: number) => void;
  clearManualQueue: () => void;
  clearSourceQueue: () => void;
  clearAllUpcoming: () => void;

  setIsPlaying: (playing: boolean) => void;
  togglePlayPause: () => void;
  setIsBuffering: (buffering: boolean) => void;
  setProgress: (currentTime: number, duration?: number) => void;
  requestSeek: (seconds: number) => void;
  clearPendingSeek: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleSmartShuffle: () => void;
  cycleRepeat: () => void;
  setPlaybackRate: (rate: number) => void;
  setCrossfadeSeconds: (seconds: number) => void;
  setSleepTimer: (mode: SleepTimerMode, minutes?: number) => void;

  nextTrack: () => void;
  prevTrack: () => void;
  handleTrackEnded: () => void;

  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setMobileExpanded: (expanded: boolean) => void;
  setKaraokeOpen: (open: boolean) => void;
  setFullscreenNowPlaying: (open: boolean) => void;
  setFloatingMiniOpen: (open: boolean) => void;
  setPlayerError: (error: string | null) => void;
}

const DEFAULT_AMBIENT: AmbientColor = { r: 22, g: 48, b: 40 };

let lastPersistAt = 0;
function persistPlayerSession(state: PlayerState, force = false): void {
  const now = Date.now();
  if (!force && now - lastPersistAt < 2500) return;
  lastPersistAt = now;

  const payload: PersistedPlayerSession = {
    currentTrack: state.currentTrack,
    queue: state.manualQueue,
    queueIndex: 0,
    sourceQueue: state.sourceQueue,
    sourceLabel: state.sourceLabel,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    isMuted: state.isMuted,
    shuffle: state.shuffle,
    smartShuffle: state.smartShuffle,
    repeat: state.repeat,
    playbackRate: state.playbackRate,
    crossfadeSeconds: state.crossfadeSeconds,
  };
  void db.kvState.put({ key: 'player_session', value: payload }).catch(() => {});
}

let trackedPlayKey: string | null = null;
let trackedPlayStartMs = 0;
function commitListenProgress(track: MediaItem | null, listenedSec: number): void {
  if (!track) return;
  const key = getPlayableVideoId(track) || track.id;
  if (trackedPlayKey === key && listenedSec >= 8) {
    useLibraryStore.getState().recordPlay(track, Math.round(listenedSec));
    trackedPlayKey = null;
  }
}

function beginTrackTelemetry(track: MediaItem): void {
  const prev = usePlayerStore.getState();
  if (prev.currentTrack && trackedPlayKey) {
    const elapsed = (Date.now() - trackedPlayStartMs) / 1000;
    commitListenProgress(prev.currentTrack, Math.max(prev.currentTime, elapsed));
  }
  trackedPlayKey = getPlayableVideoId(track) || track.id;
  trackedPlayStartMs = Date.now();
}

function filterHiddenAndExplicit(tracks: MediaItem[]): MediaItem[] {
  const hidden = new Set(useLibraryStore.getState().hiddenTrackIds);
  const hideExplicit = useSettingsStore.getState().hideExplicit;
  return tracks.filter((t) => {
    const id = getPlayableVideoId(t) || t.id;
    if (hidden.has(id)) return false;
    if (hideExplicit && t.isExplicit) return false;
    return true;
  });
}

async function hydrateTrackContext(
  track: MediaItem,
  populateSourceQueue: boolean,
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
      .catch(() => {});
  }

  try {
    const watch = await fetchWatchPlaylist(videoId, true, track.playlistId);
    if (getPlayableVideoId(getState().currentTrack) !== videoId) return;

    const upcoming = filterHiddenAndExplicit(
      watch.tracks.filter((t) => getPlayableVideoId(t) !== videoId),
    );

    setState((state) => {
      let nextSourceQueue = state.sourceQueue;
      if (populateSourceQueue && upcoming.length > 0) {
        nextSourceQueue = upcoming;
      } else if (state.smartShuffle && upcoming.length > 0) {
        nextSourceQueue = interleaveSmartShuffleTracks(state.sourceQueue, upcoming, videoId);
      }
      return {
        lyricsBrowseId: watch.lyricsBrowseId || null,
        sourceQueue: nextSourceQueue,
      };
    });
    persistPlayerSession(getState(), true);
  } catch {
    // Non-fatal
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  hydrated: false,
  currentTrack: null,
  manualQueue: [],
  sourceQueue: [],
  historyStack: [],
  sourceLabel: null,

  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  volume: 80,
  isMuted: false,
  shuffle: false,
  smartShuffle: false,
  repeat: 'off',
  playbackRate: 1,
  crossfadeSeconds: 0,

  sleepTimerMode: 'off',
  sleepTimerEndsAt: null,

  lyricsBrowseId: null,
  ambientColor: DEFAULT_AMBIENT,
  rightPanelOpen: true,
  rightPanelTab: 'queue',
  mobileExpanded: false,
  karaokeOpen: false,
  fullscreenNowPlaying: false,
  floatingMiniOpen: false,

  seekVersion: 0,
  pendingSeekSeconds: null,
  playerError: null,

  hydrate: async () => {
    try {
      const rec = await db.kvState.get('player_session');
      const settingsRightPanel = useSettingsStore.getState().showRightPanel;
      if (rec?.value && typeof rec.value === 'object') {
        const s = rec.value as Partial<PersistedPlayerSession>;
        set({
          hydrated: true,
          currentTrack: s.currentTrack ?? null,
          manualQueue: Array.isArray(s.queue) ? s.queue : [],
          sourceQueue: Array.isArray(s.sourceQueue) ? s.sourceQueue : [],
          sourceLabel: s.sourceLabel ?? null,
          currentTime: typeof s.currentTime === 'number' ? s.currentTime : 0,
          duration: typeof s.duration === 'number' ? s.duration : 0,
          volume: typeof s.volume === 'number' ? s.volume : 80,
          isMuted: Boolean(s.isMuted),
          shuffle: Boolean(s.shuffle),
          smartShuffle: Boolean(s.smartShuffle),
          repeat: s.repeat ?? 'off',
          playbackRate: typeof s.playbackRate === 'number' ? s.playbackRate : 1,
          crossfadeSeconds: typeof s.crossfadeSeconds === 'number' ? s.crossfadeSeconds : 0,
          pendingSeekSeconds:
            s.currentTrack && typeof s.currentTime === 'number' && s.currentTime > 2
              ? s.currentTime
              : null,
          rightPanelOpen: settingsRightPanel,
          isPlaying: false,
        });

        if (s.currentTrack) {
          void hydrateTrackContext(s.currentTrack, false, get, set);
        }
      } else {
        set({ hydrated: true, rightPanelOpen: settingsRightPanel });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  playTrack: (track, options) => {
    const videoId = getPlayableVideoId(track);
    if (!videoId) return;
    beginTrackTelemetry(track);

    const startAt = options?.startAtSeconds ?? 0;
    const prevTrack = get().currentTrack;

    set((state) => ({
      currentTrack: track,
      historyStack: prevTrack ? [prevTrack, ...state.historyStack].slice(0, 40) : state.historyStack,
      sourceQueue: options?.autoRadio === false ? [] : state.sourceQueue,
      sourceLabel: options?.sourceLabel ?? 'Radio Lagu',
      isPlaying: true,
      isBuffering: true,
      currentTime: startAt,
      duration: track.durationSeconds || 0,
      pendingSeekSeconds: startAt > 0 ? startAt : null,
      seekVersion: startAt > 0 ? state.seekVersion + 1 : state.seekVersion,
      lyricsBrowseId: null,
      playerError: null,
      rightPanelOpen: options?.openPanel ? true : state.rightPanelOpen,
    }));

    persistPlayerSession(get(), true);
    void hydrateTrackContext(track, options?.autoRadio ?? true, get, set);
  },

  playTrackList: (tracks, startIndex = 0, sourceLabel = 'Daftar Putar') => {
    const playable = filterHiddenAndExplicit(
      tracks.filter((t) => Boolean(getPlayableVideoId(t))),
    );
    if (playable.length === 0) return;

    const safeIdx = Math.max(0, Math.min(startIndex, playable.length - 1));
    const target = playable[safeIdx];
    const remaining = playable.slice(safeIdx + 1);

    beginTrackTelemetry(target);
    const prevTrack = get().currentTrack;

    set((state) => ({
      currentTrack: target,
      historyStack: prevTrack ? [prevTrack, ...state.historyStack].slice(0, 40) : state.historyStack,
      sourceQueue: remaining,
      sourceLabel,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: target.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
    }));

    persistPlayerSession(get(), true);
    void hydrateTrackContext(target, remaining.length === 0, get, set);
  },

  playFromManualQueue: (index) => {
    const { manualQueue, currentTrack } = get();
    if (index < 0 || index >= manualQueue.length) return;
    const target = manualQueue[index];
    const nextManual = manualQueue.slice(index + 1);
    beginTrackTelemetry(target);
    set((state) => ({
      currentTrack: target,
      manualQueue: nextManual,
      historyStack: currentTrack
        ? [currentTrack, ...state.historyStack].slice(0, 40)
        : state.historyStack,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: target.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
    }));
    persistPlayerSession(get(), true);
    void hydrateTrackContext(target, false, get, set);
  },

  playFromSourceQueue: (index) => {
    const { sourceQueue, currentTrack } = get();
    if (index < 0 || index >= sourceQueue.length) return;
    const target = sourceQueue[index];
    const nextSource = sourceQueue.slice(index + 1);
    beginTrackTelemetry(target);
    set((state) => ({
      currentTrack: target,
      sourceQueue: nextSource,
      historyStack: currentTrack
        ? [currentTrack, ...state.historyStack].slice(0, 40)
        : state.historyStack,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: target.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
    }));
    persistPlayerSession(get(), true);
    void hydrateTrackContext(target, false, get, set);
  },

  addToQueue: (track) => {
    if (!getPlayableVideoId(track)) return;
    if (!get().currentTrack) {
      get().playTrack(track);
      return;
    }
    set((state) => ({ manualQueue: [...state.manualQueue, track] }));
    persistPlayerSession(get(), true);
  },

  playNextInQueue: (track) => {
    if (!getPlayableVideoId(track)) return;
    if (!get().currentTrack) {
      get().playTrack(track);
      return;
    }
    set((state) => ({ manualQueue: [track, ...state.manualQueue] }));
    persistPlayerSession(get(), true);
  },

  removeFromManualQueue: (index) => {
    set((state) => ({
      manualQueue: state.manualQueue.filter((_, i) => i !== index),
    }));
    persistPlayerSession(get(), true);
  },

  removeFromSourceQueue: (index) => {
    set((state) => ({
      sourceQueue: state.sourceQueue.filter((_, i) => i !== index),
    }));
    persistPlayerSession(get(), true);
  },

  reorderManualQueue: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    set((state) => {
      const copy = [...state.manualQueue];
      if (
        fromIndex < 0 ||
        fromIndex >= copy.length ||
        toIndex < 0 ||
        toIndex >= copy.length
      ) {
        return state;
      }
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return { manualQueue: copy };
    });
    persistPlayerSession(get(), true);
  },

  reorderSourceQueue: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    set((state) => {
      const copy = [...state.sourceQueue];
      if (
        fromIndex < 0 ||
        fromIndex >= copy.length ||
        toIndex < 0 ||
        toIndex >= copy.length
      ) {
        return state;
      }
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return { sourceQueue: copy };
    });
    persistPlayerSession(get(), true);
  },

  clearManualQueue: () => {
    set({ manualQueue: [] });
    persistPlayerSession(get(), true);
  },

  clearSourceQueue: () => {
    set({ sourceQueue: [] });
    persistPlayerSession(get(), true);
  },

  clearAllUpcoming: () => {
    set({ manualQueue: [], sourceQueue: [] });
    persistPlayerSession(get(), true);
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  togglePlayPause: () => {
    if (!get().currentTrack) return;
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setIsBuffering: (buffering) => set({ isBuffering: buffering }),

  setProgress: (currentTime, duration) => {
    const state = get();
    const nextDuration = duration && duration > 0 ? duration : state.duration;
    set({ currentTime, duration: nextDuration });

    // Record play once user listened >= 15s
    if (state.currentTrack && trackedPlayKey && currentTime >= 15) {
      commitListenProgress(state.currentTrack, Math.max(currentTime, nextDuration || 180));
    }

    // Track episode resume progress
    if (state.currentTrack?.type === 'episode' && currentTime > 3) {
      useLibraryStore
        .getState()
        .saveEpisodeProgress(
          getPlayableVideoId(state.currentTrack) || state.currentTrack.id,
          state.currentTrack.podcastId,
          Math.floor(currentTime),
          Math.floor(nextDuration),
        );
    }

    // Check sleep timer minute countdown
    if (state.sleepTimerMode === 'minutes' && state.sleepTimerEndsAt && Date.now() >= state.sleepTimerEndsAt) {
      set({ isPlaying: false, sleepTimerMode: 'off', sleepTimerEndsAt: null });
    }

    persistPlayerSession(get(), false);
  },

  requestSeek: (seconds) => {
    set((state) => ({
      currentTime: seconds,
      pendingSeekSeconds: seconds,
      seekVersion: state.seekVersion + 1,
    }));
    persistPlayerSession(get(), true);
  },

  clearPendingSeek: () => set({ pendingSeekSeconds: null }),

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    set({ volume: clamped, isMuted: clamped === 0 });
    persistPlayerSession(get(), false);
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
    persistPlayerSession(get(), false);
  },

  toggleShuffle: () => {
    set((state) => ({
      shuffle: !state.shuffle,
      smartShuffle: !state.shuffle ? state.smartShuffle : false,
    }));
    persistPlayerSession(get(), true);
  },

  toggleSmartShuffle: () => {
    const nextSmart = !get().smartShuffle;
    set({
      smartShuffle: nextSmart,
      shuffle: nextSmart ? true : get().shuffle,
    });
    const current = get().currentTrack;
    if (nextSmart && current) {
      void hydrateTrackContext(current, false, get, set);
    }
    persistPlayerSession(get(), true);
  },

  cycleRepeat: () => {
    set((state) => {
      const next: RepeatMode =
        state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      return { repeat: next };
    });
    persistPlayerSession(get(), true);
  },

  setPlaybackRate: (playbackRate) => {
    set({ playbackRate });
    persistPlayerSession(get(), true);
  },

  setCrossfadeSeconds: (seconds) => {
    const clamped = Math.max(0, Math.min(12, Math.round(seconds)));
    set({ crossfadeSeconds: clamped });
    persistPlayerSession(get(), true);
  },

  setSleepTimer: (mode, minutes = 30) => {
    if (mode === 'off') {
      set({ sleepTimerMode: 'off', sleepTimerEndsAt: null });
    } else if (mode === 'end_of_track') {
      set({ sleepTimerMode: 'end_of_track', sleepTimerEndsAt: null });
    } else {
      set({
        sleepTimerMode: 'minutes',
        sleepTimerEndsAt: Date.now() + minutes * 60 * 1000,
      });
    }
  },

  nextTrack: () => {
    const state = get();
    const { manualQueue, sourceQueue, shuffle, repeat, currentTrack } = state;

    if (manualQueue.length > 0) {
      get().playFromManualQueue(0);
      return;
    }

    if (sourceQueue.length > 0) {
      const pickIdx = shuffle ? Math.floor(Math.random() * sourceQueue.length) : 0;
      const target = sourceQueue[pickIdx];
      const remaining = sourceQueue.filter((_, i) => i !== pickIdx);
      const nextSource = repeat === 'all' && currentTrack ? [...remaining, currentTrack] : remaining;

      beginTrackTelemetry(target);
      set({
        currentTrack: target,
        sourceQueue: nextSource,
        historyStack: currentTrack ? [currentTrack, ...state.historyStack].slice(0, 40) : state.historyStack,
        isPlaying: true,
        isBuffering: true,
        currentTime: 0,
        duration: target.durationSeconds || 0,
        lyricsBrowseId: null,
        playerError: null,
      });
      persistPlayerSession(get(), true);
      void hydrateTrackContext(target, false, get, set);
      return;
    }

    const autoplay = useSettingsStore.getState().autoplay;
    const vid = getPlayableVideoId(currentTrack);
    if (autoplay && vid) {
      fetchWatchPlaylist(vid, true)
        .then((watch) => {
          const rec = filterHiddenAndExplicit(
            watch.tracks.filter((t) => getPlayableVideoId(t) !== vid),
          );
          if (rec.length > 0) {
            get().playTrackList(rec, 0, 'Putar Otomatis Radio');
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
    const state = get();
    if (state.currentTime > 3 || state.historyStack.length === 0) {
      get().requestSeek(0);
      set({ isPlaying: true });
      return;
    }

    const [prev, ...restHistory] = state.historyStack;
    beginTrackTelemetry(prev);
    set({
      currentTrack: prev,
      historyStack: restHistory,
      sourceQueue: state.currentTrack ? [state.currentTrack, ...state.sourceQueue] : state.sourceQueue,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: prev.durationSeconds || 0,
      lyricsBrowseId: null,
      playerError: null,
    });
    persistPlayerSession(get(), true);
    void hydrateTrackContext(prev, false, get, set);
  },

  handleTrackEnded: () => {
    const state = get();
    if (state.currentTrack) {
      commitListenProgress(
        state.currentTrack,
        Math.max(state.currentTime, state.duration || state.currentTrack.durationSeconds || 180),
      );
      if (state.currentTrack.type === 'episode') {
        useLibraryStore
          .getState()
          .markEpisodeCompleted(
            getPlayableVideoId(state.currentTrack) || state.currentTrack.id,
            state.currentTrack.podcastId,
            true,
          );
      }
    }

    if (state.sleepTimerMode === 'end_of_track') {
      set({ isPlaying: false, sleepTimerMode: 'off', sleepTimerEndsAt: null });
      return;
    }

    if (state.repeat === 'one') {
      get().requestSeek(0);
      set({ isPlaying: true });
      return;
    }

    get().nextTrack();
  },

  setRightPanelOpen: (open) => {
    set({ rightPanelOpen: open });
    useSettingsStore.getState().updateSetting('showRightPanel', open);
  },
  setRightPanelTab: (tab) => {
    set({ rightPanelTab: tab, rightPanelOpen: true });
    useSettingsStore.getState().updateSetting('showRightPanel', true);
  },
  setMobileExpanded: (expanded) => set({ mobileExpanded: expanded }),
  setKaraokeOpen: (open) => set({ karaokeOpen: open }),
  setFullscreenNowPlaying: (open) => set({ fullscreenNowPlaying: open }),
  setFloatingMiniOpen: (open) => set({ floatingMiniOpen: open }),
  setPlayerError: (error) => set({ playerError: error }),
}));
