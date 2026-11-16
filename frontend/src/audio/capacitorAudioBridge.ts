import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { clampYoutubeVolume } from '../utils/audioMath';
import { clampSeekTarget } from '../utils/backgroundAudioLogic';
import { formatArtists, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { syncMediaSessionPlaybackState, syncMediaSessionPosition } from './mediaSessionService';
import {
  getActivePlaybackElement,
  getSharedAudioGraphIfExists,
  getStandaloneDirectDeck,
  pauseAudioElementProgrammatically,
  resumeAudioContext,
  stopSilentKeepaliveAudio,
  unlockPlaybackOnUserGesture,
} from './soundclearAudioEngine';

export interface DirectAudioResolutionResult {
  available: boolean;
  url?: string;
  mimeType?: string;
  bitrateKbps?: number;
  codec?: string;
}

interface SoundClearBackgroundAudioPlugin {
  syncPlaybackState(options: {
    title: string;
    artist: string;
    album: string;
    artworkUrl: string;
    isPlaying: boolean;
    durationSeconds: number;
    currentTimeSeconds: number;
    playbackRate: number;
  }): Promise<void>;
  setIdle(): Promise<void>;
  resolveDirectAudioUrl(options: { videoId: string }): Promise<DirectAudioResolutionResult>;
  requestBackgroundPermissions(): Promise<void>;
  checkBatteryOptimization(): Promise<{ ignoring: boolean }>;
  openBatteryOptimizationSettings(): Promise<void>;
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (event: { action: string; seekTime?: number }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'audioFocusChange',
    listenerFunc: (event: { state: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const SoundClearBackgroundAudio = registerPlugin<SoundClearBackgroundAudioPlugin>(
  'SoundClearBackgroundAudio',
);

export function isCapacitorAndroidPlatform(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function getActiveHtmlAudio(): HTMLAudioElement | null {
  const g = getSharedAudioGraphIfExists();
  if (g) return getActivePlaybackElement(g);
  return getStandaloneDirectDeck();
}

let lastNotificationSyncKey = '';
let lastNotificationSyncAtMs = 0;
let audioFocusDucked = false;

export function isAndroidAudioFocusDucked(): boolean {
  return audioFocusDucked;
}

export function syncCapacitorPlaybackNotification(params: {
  track: MediaItem | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackRate: number;
  force?: boolean;
}): void {
  if (!isCapacitorAndroidPlatform()) return;

  if (!params.track) {
    if (lastNotificationSyncKey !== 'idle') {
      lastNotificationSyncKey = 'idle';
      void SoundClearBackgroundAudio.setIdle().catch(() => {});
    }
    return;
  }

  const trackKey = `${getTrackUniqueId(params.track) || params.track.id}::${params.isPlaying ? '1' : '0'}`;
  const now = Date.now();
  if (!params.force && trackKey === lastNotificationSyncKey && now - lastNotificationSyncAtMs < 1200) {
    return;
  }

  lastNotificationSyncKey = trackKey;
  lastNotificationSyncAtMs = now;

  void SoundClearBackgroundAudio.syncPlaybackState({
    title: params.track.title || 'SoundClear',
    artist: formatArtists(params.track.artists) || 'SoundClear',
    album: params.track.album?.name || 'SoundClear',
    artworkUrl: params.track.thumbnail || '',
    isPlaying: params.isPlaying,
    durationSeconds: Number.isFinite(params.duration) ? Math.max(0, params.duration) : 0,
    currentTimeSeconds: Number.isFinite(params.currentTime) ? Math.max(0, params.currentTime) : 0,
    playbackRate: Number.isFinite(params.playbackRate) && params.playbackRate > 0 ? params.playbackRate : 1,
  }).catch(() => {});
}

export async function resolveCapacitorDirectAudioUrl(
  videoId: string,
): Promise<DirectAudioResolutionResult | null> {
  if (!isCapacitorAndroidPlatform() || !videoId.trim()) return null;
  try {
    return await SoundClearBackgroundAudio.resolveDirectAudioUrl({ videoId: videoId.trim() });
  } catch {
    return null;
  }
}

export async function requestAndroidBatteryOptimizationSettings(): Promise<void> {
  if (!isCapacitorAndroidPlatform()) return;
  try {
    await SoundClearBackgroundAudio.openBatteryOptimizationSettings();
  } catch {
    // Ignore
  }
}

function applyPlayCommandFromNative(): void {
  const st = usePlayerStore.getState();
  if (!st.currentTrack) return;
  unlockPlaybackOnUserGesture();
  void resumeAudioContext();
  st.setIsPlaying(true);

  const el = getActiveHtmlAudio();
  if (el && el.src && el.paused && el.dataset.scPriming !== '1') {
    void el.play().catch(() => {});
  }
  syncMediaSessionPlaybackState('playing');
  syncCapacitorPlaybackNotification({
    track: st.currentTrack,
    isPlaying: true,
    duration: st.duration,
    currentTime: st.currentTime,
    playbackRate: st.playbackRate || 1,
    force: true,
  });
}

function applyPauseCommandFromNative(): void {
  const st = usePlayerStore.getState();
  stopSilentKeepaliveAudio();
  const el = getActiveHtmlAudio();
  if (el && !el.paused) {
    pauseAudioElementProgrammatically(el);
  }
  st.setIsPlaying(false);
  syncMediaSessionPlaybackState('paused');
  syncCapacitorPlaybackNotification({
    track: st.currentTrack,
    isPlaying: false,
    duration: st.duration,
    currentTime: st.currentTime,
    playbackRate: st.playbackRate || 1,
    force: true,
  });
}

export function initCapacitorAndroidBridge(): () => void {
  if (!isCapacitorAndroidPlatform()) {
    return () => {};
  }

  let disposed = false;
  const handles: PluginListenerHandle[] = [];
  let pausedByCallFocus = false;

  const setupStatusBarAndSplash = async () => {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#000000' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch {
      // Ignore if unsupported
    }
    try {
      await SplashScreen.hide();
    } catch {
      // Ignore
    }
  };
  void setupStatusBarAndSplash();

  const registerListeners = async () => {
    const backHandle = await CapacitorApp.addListener('backButton', () => {
      const player = usePlayerStore.getState();
      if (player.mobileExpanded) {
        player.setMobileExpanded(false);
        return;
      }
      if (player.karaokeOpen) {
        player.setKaraokeOpen(false);
        return;
      }
      if (player.fullscreenNowPlaying) {
        player.setFullscreenNowPlaying(false);
        return;
      }
      const nav = useNavigationStore.getState();
      if (nav.canGoBack()) {
        nav.goBack();
        return;
      }
      void CapacitorApp.minimizeApp().catch(() => {});
    });
    if (disposed) {
      void backHandle.remove();
      return;
    }
    handles.push(backHandle);

    const mediaHandle = await SoundClearBackgroundAudio.addListener('mediaAction', (event) => {
      const action = event?.action;
      if (action === 'play') {
        pausedByCallFocus = false;
        applyPlayCommandFromNative();
      } else if (action === 'pause') {
        pausedByCallFocus = false;
        applyPauseCommandFromNative();
      } else if (action === 'stop') {
        pausedByCallFocus = false;
        stopSilentKeepaliveAudio();
        const el = getActiveHtmlAudio();
        if (el) {
          pauseAudioElementProgrammatically(el);
          try {
            el.currentTime = 0;
          } catch {
            // Ignore
          }
        }
        usePlayerStore.getState().stopPlayback();
        syncMediaSessionPlaybackState('none');
      } else if (action === 'nexttrack') {
        pausedByCallFocus = false;
        usePlayerStore.getState().nextTrack();
      } else if (action === 'previoustrack') {
        pausedByCallFocus = false;
        usePlayerStore.getState().prevTrack();
      } else if (action === 'seekto' && typeof event.seekTime === 'number' && Number.isFinite(event.seekTime)) {
        const st = usePlayerStore.getState();
        const dur = st.duration > 0 ? st.duration : null;
        const target = clampSeekTarget(event.seekTime, dur);
        st.requestSeek(target);
        const el = getActiveHtmlAudio();
        if (el && el.src && Number.isFinite(el.duration) && el.duration > 0) {
          try {
            el.currentTime = clampSeekTarget(target, el.duration);
            st.clearPendingSeek();
          } catch {
            // Will apply via seek effect
          }
        }
        syncMediaSessionPosition({
          duration: dur ?? 0,
          currentTime: target,
          playbackRate: st.playbackRate || 1,
        });
        syncCapacitorPlaybackNotification({
          track: st.currentTrack,
          isPlaying: st.isPlaying,
          duration: dur ?? 0,
          currentTime: target,
          playbackRate: st.playbackRate || 1,
          force: true,
        });
      }
    });
    if (disposed) {
      void mediaHandle.remove();
      return;
    }
    handles.push(mediaHandle);

    const focusHandle = await SoundClearBackgroundAudio.addListener('audioFocusChange', (event) => {
      const state = event?.state;
      const st = usePlayerStore.getState();
      const el = getActiveHtmlAudio();

      if (state === 'pause-transient') {
        pausedByCallFocus = st.isPlaying;
        if (st.isPlaying) {
          applyPauseCommandFromNative();
        }
      } else if (state === 'resume') {
        if (pausedByCallFocus) {
          pausedByCallFocus = false;
          applyPlayCommandFromNative();
        }
      } else if (state === 'pause-permanent') {
        pausedByCallFocus = false;
        if (st.isPlaying) {
          applyPauseCommandFromNative();
        }
      } else if (state === 'duck') {
        audioFocusDucked = true;
        if (el && !st.isMuted) {
          const eff = isLocalTrack(st.currentTrack)
            ? st.volume
            : clampYoutubeVolume(
                st.volume,
                useSettingsStore.getState().youtubeSound.maxVolumeLimit,
                st.isMuted,
              );
          el.volume = Math.max(0.05, (eff / 100) * 0.25);
        }
      } else if (state === 'unduck') {
        audioFocusDucked = false;
        if (el) {
          const eff = isLocalTrack(st.currentTrack)
            ? st.volume
            : clampYoutubeVolume(
                st.volume,
                useSettingsStore.getState().youtubeSound.maxVolumeLimit,
                st.isMuted,
              );
          el.volume = st.isMuted ? 0 : Math.max(0, Math.min(1, eff / 100));
        }
      }
    });
    if (disposed) {
      void focusHandle.remove();
      return;
    }
    handles.push(focusHandle);
  };

  void registerListeners();

  return () => {
    disposed = true;
    handles.forEach((h) => {
      void h.remove().catch(() => {});
    });
  };
}
