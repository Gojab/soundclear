import { create } from 'zustand';
import {
  beaconBackgroundSession,
  buildBackgroundSessionPayload,
  fetchArtworkColor,
  fetchBackgroundSession,
  fetchWatchPlaylist,
  getOrCreateBackgroundSessionId,
  syncBackgroundSession,
} from '../api/client';
import { db, type PersistedPlayerSession } from '../db/soundclearDb';
import type {
  ActiveStreamMeta,
  ConcreteQualityTier,
  MediaItem,
  RepeatMode,
  StreamOptionsResponse,
} from '../types/music';
import {
  clampCrossfadeSeconds,
  clampPlaybackRate,
  computeUnmutedVolume,
  resolveEffectiveCrossfadeSeconds,
} from '../utils/audioMath';
import {
  getPlayableVideoId,
  getTrackUniqueId,
  interleaveSmartShuffleTracks,
  isExcludedRegionalItem,
  isLocalTrack,
  isPlayableTrack,
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
  lastNonZeroVolume: number;
  isMuted: boolean;
  shuffle: boolean;
  smartShuffle: boolean;
  repeat: RepeatMode;
  playbackRate: number;
  crossfadeSeconds: number;

  sleepTimerMode: SleepTimerMode;
  sleepTimerEndsAt: number | null;
  sleepTimerMinutes: number | null;

  lyricsBrowseId: string | null;
  ambientColor: AmbientColor;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  mobileExpanded: boolean;
  karaokeOpen: boolean;
  fullscreenNowPlaying: boolean;
  floatingMiniOpen: boolean;
  externalNotchOpen: boolean;
  notchManuallyHidden: boolean;
  hasActiveSessionPlayback: boolean;

  seekVersion: number;
  pendingSeekSeconds: number | null;
  playerError: string | null;

  activeStreamMeta: ActiveStreamMeta | null;
  streamOptions: StreamOptionsResponse | null;
  selectedQualityOverride: ConcreteQualityTier | null;
  webAudioWarning: string | null;
  networkEffectiveType: string | null;
  bufferingStallCount: number;

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
  stopPlayback: () => void;
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
  setExternalNotchOpen: (open: boolean) => void;
  setPlayerError: (error: string | null) => void;

  setActiveStreamMeta: (meta: ActiveStreamMeta | null) => void;
  setStreamOptions: (opts: StreamOptionsResponse | null) => void;
  setSelectedQualityOverride: (tier: ConcreteQualityTier | null) => void;
  setWebAudioWarning: (warning: string | null) => void;
  setNetworkEffectiveType: (effectiveType: string | null) => void;
  recordBufferingStall: () => void;
  resetBufferingStalls: () => void;
}

const DEFAULT_AMBIENT: AmbientColor = { r: 22, g: 48, b: 40 };

let lastPersistAt = 0;
let lastBackendSyncAt = 0;
let unloadHooksInstalled = false;

function buildBgPayloadFromState(state: PlayerState) {
  const settings = useSettingsStore.getState();
  const qualityTier =
    state.selectedQualityOverride ??
    (settings.localProfile.directMode ? 'lossless' : 'high');
  return buildBackgroundSessionPayload({
    sessionId: getOrCreateBackgroundSessionId(),
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    playbackRate: state.playbackRate,
    repeat: state.repeat,
    shuffle: state.shuffle,
    sourceLabel: state.sourceLabel,
    quality: qualityTier,
    currentTrack: state.currentTrack,
    manualQueue: state.manualQueue,
    sourceQueue: state.sourceQueue,
    historyStack: state.historyStack,
  });
}

function installBackgroundLifecycleSync(): void {
  if (unloadHooksInstalled || typeof window === 'undefined') return;
  unloadHooksInstalled = true;
  const flushNow = () => {
    const state = usePlayerStore.getState();
    if (!state.hydrated || !state.currentTrack) return;
    beaconBackgroundSession(buildBgPayloadFromState(state));
  };
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushNow();
    }
  });
}

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

  if (typeof window !== 'undefined' && state.hydrated && (force || now - lastBackendSyncAt >= 5000)) {
    lastBackendSyncAt = now;
    void syncBackgroundSession(buildBgPayloadFromState(state)).catch(() => {});
  }
}

let trackedPlayKey: string | null = null;
let trackedPlayStartMs = 0;
function commitListenProgress(track: MediaItem | null, listenedSec: number): void {
  if (!track) return;
  const key = getTrackUniqueId(track) || track.id;
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
  trackedPlayKey = getTrackUniqueId(track) || track.id;
  trackedPlayStartMs = Date.now();
}

function resolvePlaybackRateForTrack(track: MediaItem | null | undefined): number {
  const settings = useSettingsStore.getState();
  if (track?.type === 'episode') {
    const epKey = getPlayableVideoId(track) || track.id;
    const epRate = epKey ? settings.episodePlaybackRates[epKey] : undefined;
    if (typeof epRate === 'number' && Number.isFinite(epRate)) {
      return epRate;
    }
  }
  return settings.youtubeSound.defaultPlaybackRate || 1;
}

function filterHiddenAndExplicit(tracks: MediaItem[]): MediaItem[] {
  const hidden = new Set(useLibraryStore.getState().hiddenTrackIds);
  const hideExplicit = useSettingsStore.getState().hideExplicit;
  return tracks.filter((t) => {
    if (isExcludedRegionalItem(t)) return false;
    const id = getTrackUniqueId(t) || t.id;
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
  if (isLocalTrack(track)) {
    setState({ ambientColor: DEFAULT_AMBIENT });
    return;
  }

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
  lastNonZeroVolume: 80,
  isMuted: false,
  shuffle: false,
  smartShuffle: false,
  repeat: 'off',
  playbackRate: 1,
  crossfadeSeconds: 0,

  sleepTimerMode: 'off',
  sleepTimerEndsAt: null,
  sleepTimerMinutes: null,

  lyricsBrowseId: null,
  ambientColor: DEFAULT_AMBIENT,
  rightPanelOpen: true,
  rightPanelTab: 'queue',
  mobileExpanded: false,
  karaokeOpen: false,
  fullscreenNowPlaying: false,
  floatingMiniOpen: false,
  externalNotchOpen: false,
  notchManuallyHidden: false,
  hasActiveSessionPlayback: false,

  seekVersion: 0,
  pendingSeekSeconds: null,
  playerError: null,

  activeStreamMeta: null,
  streamOptions: null,
  selectedQualityOverride: null,
  webAudioWarning: null,
  networkEffectiveType: null,
  bufferingStallCount: 0,

  hydrate: async () => {
    installBackgroundLifecycleSync();
    try {
      const rec = await db.kvState.get('player_session');
      const settingsState = useSettingsStore.getState();
      const settingsRightPanel = settingsState.showRightPanel;
      const ytSound = settingsState.youtubeSound;

      // Query server-tracked background session in case the backend kept advancing while Chrome was closed
      let remoteSession: Awaited<ReturnType<typeof fetchBackgroundSession>>['session'] = null;
      if (typeof window !== 'undefined') {
        try {
          const ctrl = new AbortController();
          const tid = window.setTimeout(() => ctrl.abort(), 1200);
          const remoteRes = await fetchBackgroundSession(
            getOrCreateBackgroundSessionId(),
            ctrl.signal,
          );
          window.clearTimeout(tid);
          if (remoteRes.found && remoteRes.session?.currentTrack) {
            remoteSession = remoteRes.session;
          }
        } catch {
          // Non-fatal fallback to local IndexedDB session
        }
      }

      if (rec?.value && typeof rec.value === 'object') {
        const s = rec.value as Partial<PersistedPlayerSession>;
        const activeTrack = remoteSession?.currentTrack ?? s.currentTrack ?? null;
        const activeManualQueue = remoteSession?.manualQueue ?? (Array.isArray(s.queue) ? s.queue : []);
        const activeSourceQueue =
          remoteSession?.sourceQueue ?? (Array.isArray(s.sourceQueue) ? s.sourceQueue : []);
        const activeSourceLabel = remoteSession?.sourceLabel ?? s.sourceLabel ?? null;
        const activeCurrentTime =
          remoteSession && typeof remoteSession.currentTime === 'number'
            ? remoteSession.currentTime
            : typeof s.currentTime === 'number'
              ? s.currentTime
              : 0;
        const activeDuration =
          remoteSession && typeof remoteSession.duration === 'number' && remoteSession.duration > 0
            ? remoteSession.duration
            : typeof s.duration === 'number'
              ? s.duration
              : 0;

        const rawVol =
          ytSound.startupVolumeMode === 'fixed'
            ? ytSound.startupFixedVolume
            : typeof s.volume === 'number'
              ? s.volume
              : 80;
        const effectiveVol = isLocalTrack(activeTrack)
          ? rawVol
          : Math.min(ytSound.maxVolumeLimit, rawVol);
        const resumedTime = ytSound.resumeLastPosition ? activeCurrentTime : 0;

        set({
          hydrated: true,
          currentTrack: activeTrack,
          manualQueue: activeManualQueue,
          sourceQueue: activeSourceQueue,
          historyStack: remoteSession?.historyStack ?? [],
          sourceLabel: activeSourceLabel,
          currentTime: resumedTime,
          duration: activeDuration,
          volume: effectiveVol,
          lastNonZeroVolume: effectiveVol > 0 ? effectiveVol : 80,
          isMuted: Boolean(s.isMuted),
          shuffle: remoteSession ? Boolean(remoteSession.shuffle) : Boolean(s.shuffle),
          smartShuffle: Boolean(s.smartShuffle),
          repeat: remoteSession?.repeat ?? s.repeat ?? 'off',
          playbackRate: resolvePlaybackRateForTrack(activeTrack),
          crossfadeSeconds: resolveEffectiveCrossfadeSeconds(settingsState.localProfile),
          pendingSeekSeconds: activeTrack && resumedTime > 2 ? resumedTime : null,
          rightPanelOpen: settingsRightPanel,
          isPlaying: Boolean(activeTrack && (ytSound.autoStartOnOpen || remoteSession?.isPlaying)),
          hasActiveSessionPlayback: Boolean(
            activeTrack && (ytSound.autoStartOnOpen || remoteSession?.isPlaying),
          ),
          notchManuallyHidden: false,
        });

        if (activeTrack) {
          void hydrateTrackContext(activeTrack, false, get, set);
        }
      } else if (remoteSession?.currentTrack) {
        const initialVol =
          ytSound.startupVolumeMode === 'fixed'
            ? Math.min(ytSound.maxVolumeLimit, ytSound.startupFixedVolume)
            : Math.min(ytSound.maxVolumeLimit, 80);
        const resumedTime = ytSound.resumeLastPosition ? remoteSession.currentTime : 0;
        set({
          hydrated: true,
          currentTrack: remoteSession.currentTrack,
          manualQueue: remoteSession.manualQueue,
          sourceQueue: remoteSession.sourceQueue,
          historyStack: remoteSession.historyStack ?? [],
          sourceLabel: remoteSession.sourceLabel,
          currentTime: resumedTime,
          duration: remoteSession.duration,
          volume: initialVol,
          lastNonZeroVolume: initialVol > 0 ? initialVol : 80,
          shuffle: remoteSession.shuffle,
          repeat: remoteSession.repeat,
          playbackRate: resolvePlaybackRateForTrack(remoteSession.currentTrack),
          crossfadeSeconds: resolveEffectiveCrossfadeSeconds(settingsState.localProfile),
          pendingSeekSeconds: resumedTime > 2 ? resumedTime : null,
          rightPanelOpen: settingsRightPanel,
          isPlaying: Boolean(ytSound.autoStartOnOpen || remoteSession.isPlaying),
          hasActiveSessionPlayback: Boolean(ytSound.autoStartOnOpen || remoteSession.isPlaying),
          notchManuallyHidden: false,
        });
        void hydrateTrackContext(remoteSession.currentTrack, false, get, set);
      } else {
        const initialVol =
          ytSound.startupVolumeMode === 'fixed'
            ? Math.min(ytSound.maxVolumeLimit, ytSound.startupFixedVolume)
            : Math.min(ytSound.maxVolumeLimit, 80);
        set({
          hydrated: true,
          volume: initialVol,
          lastNonZeroVolume: initialVol > 0 ? initialVol : 80,
          playbackRate: ytSound.defaultPlaybackRate || 1,
          crossfadeSeconds: resolveEffectiveCrossfadeSeconds(settingsState.localProfile),
          rightPanelOpen: settingsRightPanel,
        });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  playTrack: (track, options) => {
    if (!isPlayableTrack(track)) return;
    beginTrackTelemetry(track);

    const startAt = options?.startAtSeconds ?? 0;
    const prevTrack = get().currentTrack;
    const targetRate = resolvePlaybackRateForTrack(track);

    set((state) => ({
      currentTrack: track,
      historyStack: prevTrack ? [prevTrack, ...state.historyStack].slice(0, 40) : state.historyStack,
      sourceQueue: options?.autoRadio === false ? [] : state.sourceQueue,
      sourceLabel: options?.sourceLabel ?? (isLocalTrack(track) ? 'File Lokal' : 'Radio Lagu'),
      isPlaying: true,
      isBuffering: !isLocalTrack(track),
      currentTime: startAt,
      duration: track.durationSeconds || 0,
      playbackRate: targetRate,
      pendingSeekSeconds: startAt > 0 ? startAt : null,
      seekVersion: startAt > 0 ? state.seekVersion + 1 : state.seekVersion,
      lyricsBrowseId: null,
      playerError: null,
      activeStreamMeta: null,
      streamOptions: null,
      selectedQualityOverride: null,
      webAudioWarning: null,
      bufferingStallCount: 0,
      notchManuallyHidden: false,
      hasActiveSessionPlayback: true,
      rightPanelOpen: options?.openPanel ? true : state.rightPanelOpen,
    }));

    persistPlayerSession(get(), true);
    void hydrateTrackContext(track, options?.autoRadio ?? true, get, set);
  },

  playTrackList: (tracks, startIndex = 0, sourceLabel = 'Daftar Putar') => {
    const playable = filterHiddenAndExplicit(tracks.filter((t) => isPlayableTrack(t)));
    if (playable.length === 0) return;

    const safeIdx = Math.max(0, Math.min(startIndex, playable.length - 1));
    const target = playable[safeIdx];
    const remaining = playable.slice(safeIdx + 1);

    beginTrackTelemetry(target);
    const prevTrack = get().currentTrack;
    const targetRate = resolvePlaybackRateForTrack(target);

    set((state) => ({
      currentTrack: target,
      historyStack: prevTrack ? [prevTrack, ...state.historyStack].slice(0, 40) : state.historyStack,
      sourceQueue: remaining,
      sourceLabel,
      isPlaying: true,
      isBuffering: !isLocalTrack(target),
      currentTime: 0,
      duration: target.durationSeconds || 0,
      playbackRate: targetRate,
      lyricsBrowseId: null,
      playerError: null,
      activeStreamMeta: null,
      streamOptions: null,
      selectedQualityOverride: null,
      webAudioWarning: null,
      bufferingStallCount: 0,
      notchManuallyHidden: false,
      hasActiveSessionPlayback: true,
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
    const targetRate = resolvePlaybackRateForTrack(target);
    set((state) => ({
      currentTrack: target,
      manualQueue: nextManual,
      historyStack: currentTrack
        ? [currentTrack, ...state.historyStack].slice(0, 40)
        : state.historyStack,
      isPlaying: true,
      isBuffering: !isLocalTrack(target),
      currentTime: 0,
      duration: target.durationSeconds || 0,
      playbackRate: targetRate,
      lyricsBrowseId: null,
      playerError: null,
      activeStreamMeta: null,
      streamOptions: null,
      selectedQualityOverride: null,
      webAudioWarning: null,
      bufferingStallCount: 0,
      notchManuallyHidden: false,
      hasActiveSessionPlayback: true,
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
    const targetRate = resolvePlaybackRateForTrack(target);
    set((state) => ({
      currentTrack: target,
      sourceQueue: nextSource,
      historyStack: currentTrack
        ? [currentTrack, ...state.historyStack].slice(0, 40)
        : state.historyStack,
      isPlaying: true,
      isBuffering: !isLocalTrack(target),
      currentTime: 0,
      duration: target.durationSeconds || 0,
      playbackRate: targetRate,
      lyricsBrowseId: null,
      playerError: null,
      activeStreamMeta: null,
      streamOptions: null,
      selectedQualityOverride: null,
      webAudioWarning: null,
      bufferingStallCount: 0,
      notchManuallyHidden: false,
      hasActiveSessionPlayback: true,
    }));
    persistPlayerSession(get(), true);
    void hydrateTrackContext(target, false, get, set);
  },

  addToQueue: (track) => {
    if (!isPlayableTrack(track)) return;
    if (!get().currentTrack) {
      get().playTrack(track);
      return;
    }
    set((state) => ({ manualQueue: [...state.manualQueue, track] }));
    persistPlayerSession(get(), true);
  },

  playNextInQueue: (track) => {
    if (!isPlayableTrack(track)) return;
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

  setIsPlaying: (playing) => {
    set((state) => ({
      isPlaying: playing,
      notchManuallyHidden: playing ? false : state.notchManuallyHidden,
      hasActiveSessionPlayback: playing ? true : state.hasActiveSessionPlayback,
    }));
    persistPlayerSession(get(), true);
  },

  togglePlayPause: () => {
    if (!get().currentTrack) return;
    set((state) => {
      const nextPlaying = !state.isPlaying;
      return {
        isPlaying: nextPlaying,
        notchManuallyHidden: nextPlaying ? false : state.notchManuallyHidden,
        hasActiveSessionPlayback: nextPlaying ? true : state.hasActiveSessionPlayback,
      };
    });
    persistPlayerSession(get(), true);
  },

  stopPlayback: () => {
    const state = get();
    if (!state.currentTrack) return;
    set({
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      pendingSeekSeconds: 0,
      seekVersion: state.seekVersion + 1,
      floatingMiniOpen: false,
      notchManuallyHidden: true,
      hasActiveSessionPlayback: false,
    });
    persistPlayerSession(get(), true);
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
      set({ isPlaying: false, sleepTimerMode: 'off', sleepTimerEndsAt: null, sleepTimerMinutes: null });
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
    set((state) => ({
      volume: clamped,
      lastNonZeroVolume: clamped > 0 ? clamped : state.lastNonZeroVolume,
      isMuted: clamped === 0,
    }));
    persistPlayerSession(get(), false);
  },

  toggleMute: () => {
    set((state) => {
      if (state.isMuted || state.volume === 0) {
        const maxCap = isLocalTrack(state.currentTrack)
          ? 100
          : useSettingsStore.getState().youtubeSound.maxVolumeLimit;
        const restoredVolume = computeUnmutedVolume(
          state.volume,
          state.lastNonZeroVolume,
          maxCap,
        );
        return {
          isMuted: false,
          volume: restoredVolume,
          lastNonZeroVolume: restoredVolume,
        };
      }
      return { isMuted: true };
    });
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
    const clampedRate = clampPlaybackRate(playbackRate);
    const current = get().currentTrack;
    if (current?.type === 'episode') {
      const epKey = getPlayableVideoId(current) || current.id;
      if (epKey) {
        useSettingsStore.getState().setEpisodePlaybackRate(epKey, clampedRate);
      }
    }
    set({ playbackRate: clampedRate });
    persistPlayerSession(get(), true);
  },

  setCrossfadeSeconds: (seconds) => {
    const clamped = clampCrossfadeSeconds(seconds);
    useSettingsStore.getState().setCrossfadeDuration(clamped);
    set({ crossfadeSeconds: clamped });
    persistPlayerSession(get(), true);
  },

  setSleepTimer: (mode, minutes = 30) => {
    if (mode === 'off') {
      set({ sleepTimerMode: 'off', sleepTimerEndsAt: null, sleepTimerMinutes: null });
    } else if (mode === 'end_of_track') {
      set({ sleepTimerMode: 'end_of_track', sleepTimerEndsAt: null, sleepTimerMinutes: null });
    } else {
      set({
        sleepTimerMode: 'minutes',
        sleepTimerEndsAt: Date.now() + minutes * 60 * 1000,
        sleepTimerMinutes: minutes,
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
        isBuffering: !isLocalTrack(target),
        currentTime: 0,
        duration: target.durationSeconds || 0,
        playbackRate: resolvePlaybackRateForTrack(target),
        lyricsBrowseId: null,
        playerError: null,
        activeStreamMeta: null,
        streamOptions: null,
        selectedQualityOverride: null,
        webAudioWarning: null,
        bufferingStallCount: 0,
        notchManuallyHidden: false,
        hasActiveSessionPlayback: true,
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
    if (!state.currentTrack) return;
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
      isBuffering: !isLocalTrack(prev),
      currentTime: 0,
      duration: prev.durationSeconds || 0,
      playbackRate: resolvePlaybackRateForTrack(prev),
      lyricsBrowseId: null,
      playerError: null,
      activeStreamMeta: null,
      streamOptions: null,
      selectedQualityOverride: null,
      webAudioWarning: null,
      bufferingStallCount: 0,
      notchManuallyHidden: false,
      hasActiveSessionPlayback: true,
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
      set({ isPlaying: false, sleepTimerMode: 'off', sleepTimerEndsAt: null, sleepTimerMinutes: null });
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
  setFloatingMiniOpen: (open) =>
    set({
      floatingMiniOpen: open,
      notchManuallyHidden: !open,
    }),
  setExternalNotchOpen: (open) => set({ externalNotchOpen: open }),
  setPlayerError: (error) => set({ playerError: error }),

  setActiveStreamMeta: (activeStreamMeta) => set({ activeStreamMeta }),
  setStreamOptions: (streamOptions) => set({ streamOptions }),
  setSelectedQualityOverride: (selectedQualityOverride) => set({ selectedQualityOverride }),
  setWebAudioWarning: (webAudioWarning) => set({ webAudioWarning }),
  setNetworkEffectiveType: (networkEffectiveType) => set({ networkEffectiveType }),
  recordBufferingStall: () =>
    set((state) => ({ bufferingStallCount: Math.min(10, state.bufferingStallCount + 1) })),
  resetBufferingStalls: () => set({ bufferingStallCount: 0 }),
}));
