import { create } from 'zustand';
import {
  fetchAccountAudioSettings,
  resetAccountAudioSettings,
  saveAccountAudioSettings,
  type ServerAudioSettingsBundle,
} from '../api/client';
import {
  CUSTOM_BACKGROUND_IMAGE_KV_KEY,
  db,
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_LOCAL_AUDIO_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_YOUTUBE_SOUND,
  loadLocalAudioProfile,
  normalizeLocalAudioProfile,
  saveLocalAudioProfile,
} from '../db/soundclearDb';
import type {
  CustomBackgroundSettings,
  EqPreset,
  HomeSectionId,
  LocalAudioProfile,
  UserSettings,
  YouTubeSoundSettings,
} from '../types/music';
import {
  BUILTIN_EQ_PRESETS,
  clampEqGainDb,
  clampNumber,
  clampPlaybackRate,
  computeNextCrossfadeState,
  resolveEffectiveCrossfadeSeconds,
} from '../utils/audioMath';
import {
  DEFAULT_CUSTOM_BACKGROUND,
  isSafeBackgroundImageUrl,
  normalizeCustomBackground,
} from '../utils/backgroundTheme';
import {
  normalizeNotchDisplayMode,
  normalizeNotchMonitor,
} from '../utils/notchPlayer';

export type AudioSettingsSection =
  | 'streaming'
  | 'download'
  | 'eq'
  | 'normalization'
  | 'playback'
  | 'output'
  | 'all';

interface SettingsState extends UserSettings {
  hydrated: boolean;
  accountKey: string;
  localProfile: LocalAudioProfile;
  hydrate: () => Promise<void>;
  setAccountKey: (accountKey: string) => Promise<void>;
  syncAudioSettingsFromBackend: (accountKey?: string) => Promise<void>;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  updateYoutubeSound: <K extends keyof YouTubeSoundSettings>(
    key: K,
    value: YouTubeSoundSettings[K],
  ) => void;
  setEpisodePlaybackRate: (episodeId: string, rate: number | null) => void;
  updateLocalProfile: (patch: Partial<LocalAudioProfile>) => void;
  toggleCrossfade: (enabled?: boolean) => void;
  setCrossfadeDuration: (seconds: number) => void;
  applyEqPreset: (presetId: string) => void;
  setEqBandGain: (index: number, dbGain: number) => void;
  setEqPreamp: (dbGain: number) => void;
  saveCustomPreset: (name: string) => EqPreset | null;
  renameCustomPreset: (presetId: string, newName: string) => boolean;
  deleteCustomPreset: (presetId: string) => void;
  resetAudioProfileSection: (section: AudioSettingsSection) => void;
  enableAllDsp: () => void;
  moveHomeSection: (id: HomeSectionId, direction: 'up' | 'down') => void;
  resetHomeSectionOrder: () => void;
  updateCustomBackground: (patch: Partial<CustomBackgroundSettings>) => void;
  setCustomBackgroundImage: (dataUrl: string | null, fileName?: string | null) => Promise<void>;
  resetCustomBackground: () => Promise<void>;
}

function persistSettings(s: UserSettings): void {
  const safeBackgroundMeta: CustomBackgroundSettings = {
    ...normalizeCustomBackground(s.customBackground, null),
    customImageDataUrl: null,
  };
  const payload = {
    hideExplicit: s.hideExplicit,
    autoplay: s.autoplay,
    dataSaver: s.dataSaver,
    showRightPanel: s.showRightPanel,
    lyricsPreviewEnabled: s.lyricsPreviewEnabled,
    homeSectionOrder: s.homeSectionOrder,
    youtubeSound: s.youtubeSound,
    episodePlaybackRates: s.episodePlaybackRates,
    customBackground: safeBackgroundMeta,
    notchDisplayMode: normalizeNotchDisplayMode(s.notchDisplayMode),
    notchMonitor: normalizeNotchMonitor(s.notchMonitor),
  };
  try {
    window.localStorage.setItem('soundclear_user_settings_v1', JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }
  void db.kvState
    .put({
      key: 'settings',
      value: payload,
    })
    .catch(() => {});
}

let backendSyncTimer: number | null = null;
function scheduleBackendAudioSettingsSync(state: SettingsState): void {
  if (!state.hydrated) return;
  if (backendSyncTimer !== null) {
    window.clearTimeout(backendSyncTimer);
  }
  backendSyncTimer = window.setTimeout(() => {
    backendSyncTimer = null;
    const latest = useSettingsStore.getState();
    const bundle: ServerAudioSettingsBundle = {
      localProfile: latest.localProfile,
      defaultPlaybackRate: latest.youtubeSound.defaultPlaybackRate,
      fadeOnPauseResume: latest.youtubeSound.fadeOnPauseResume,
      trackFadeSeconds: latest.youtubeSound.trackFadeSeconds,
      maxVolumeLimit: latest.youtubeSound.maxVolumeLimit,
      dataSaver: latest.dataSaver,
    };
    void saveAccountAudioSettings(bundle, latest.accountKey).catch(() => {});
  }, 450);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  accountKey: 'local',
  localProfile: {
    ...DEFAULT_LOCAL_AUDIO_PROFILE,
    bands: [...DEFAULT_LOCAL_AUDIO_PROFILE.bands],
    customPresets: [],
  },

  hydrate: async () => {
    try {
      const [rec, customBgImgRec, accountProfile] = await Promise.all([
        db.kvState.get('settings'),
        db.kvState.get(CUSTOM_BACKGROUND_IMAGE_KV_KEY),
        loadLocalAudioProfile('local'),
      ]);
      let stored =
        rec?.value && typeof rec.value === 'object'
          ? (rec.value as Partial<UserSettings>)
          : null;
      if (!stored) {
        try {
          const rawLs = window.localStorage.getItem('soundclear_user_settings_v1');
          if (rawLs) stored = JSON.parse(rawLs) as Partial<UserSettings>;
        } catch {
          // Ignore malformed fallback
        }
      }

      const storedBgImage = isSafeBackgroundImageUrl(customBgImgRec?.value)
        ? customBgImgRec.value
        : null;

      let effectiveProfile = accountProfile;
      try {
        const dspFlag = await db.kvState.get('dsp_all_enabled_v1');
        if (!dspFlag?.value) {
          effectiveProfile = normalizeLocalAudioProfile({
            ...accountProfile,
            eqEnabled: true,
            bassBoostEnabled: true,
            stereoWidenerEnabled: true,
            normalizationTarget:
              accountProfile.normalizationTarget === 'off'
                ? 'normal'
                : accountProfile.normalizationTarget,
            useReplayGain: true,
            limiterEnabled: true,
            gaplessPlayback: true,
            fadeOnPlayPause: true,
            skipSilence: true,
            crossfadeEnabled: true,
            crossfadeSeconds:
              accountProfile.crossfadeSeconds > 0 ? accountProfile.crossfadeSeconds : 3,
            directMode: false,
          });
          await Promise.all([
            saveLocalAudioProfile('local', effectiveProfile),
            db.kvState.put({ key: 'dsp_all_enabled_v1', value: true }),
          ]);
        }
      } catch {
        // Non-fatal migration fallback
      }

      if (stored) {
        const order =
          Array.isArray(stored.homeSectionOrder) && stored.homeSectionOrder.length > 0
            ? stored.homeSectionOrder
            : DEFAULT_HOME_SECTION_ORDER;
        const yt = {
          ...DEFAULT_YOUTUBE_SOUND,
          ...(stored.youtubeSound || {}),
        };
        yt.defaultPlaybackRate = clampPlaybackRate(yt.defaultPlaybackRate ?? 1);
        const customBackground = normalizeCustomBackground(stored.customBackground, storedBgImage);

        set({
          hideExplicit: Boolean(stored.hideExplicit),
          autoplay: stored.autoplay ?? true,
          dataSaver: Boolean(stored.dataSaver),
          showRightPanel: stored.showRightPanel ?? true,
          lyricsPreviewEnabled: stored.lyricsPreviewEnabled ?? true,
          homeSectionOrder: order,
          youtubeSound: yt,
          episodePlaybackRates: stored.episodePlaybackRates || {},
          customBackground,
          notchDisplayMode: normalizeNotchDisplayMode(stored.notchDisplayMode),
          notchMonitor: normalizeNotchMonitor(stored.notchMonitor),
          localProfile: effectiveProfile,
          hydrated: true,
        });
      } else {
        set({
          customBackground: normalizeCustomBackground(null, storedBgImage),
          localProfile: effectiveProfile,
          hydrated: true,
        });
      }

      void get().syncAudioSettingsFromBackend('local');
    } catch {
      set({ hydrated: true });
    }
  },

  syncAudioSettingsFromBackend: async (explicitKey) => {
    const key = explicitKey || get().accountKey || 'local';
    try {
      const resp = await fetchAccountAudioSettings(key);
      if (!resp.settings || typeof resp.settings !== 'object') return;
      const bundle = resp.settings;
      if (bundle.localProfile) {
        const merged = normalizeLocalAudioProfile({
          ...get().localProfile,
          ...bundle.localProfile,
        });
        set({ localProfile: merged });
        void saveLocalAudioProfile(key, merged).catch(() => {});
      }
      set((state) => {
        const nextYt = { ...state.youtubeSound };
        if (typeof bundle.defaultPlaybackRate === 'number') {
          nextYt.defaultPlaybackRate = clampPlaybackRate(bundle.defaultPlaybackRate);
        }
        if (typeof bundle.fadeOnPauseResume === 'boolean') {
          nextYt.fadeOnPauseResume = bundle.fadeOnPauseResume;
        }
        if (typeof bundle.trackFadeSeconds === 'number') {
          nextYt.trackFadeSeconds = Math.max(0, Math.min(12, Math.round(bundle.trackFadeSeconds)));
        }
        if (typeof bundle.maxVolumeLimit === 'number') {
          nextYt.maxVolumeLimit = Math.max(20, Math.min(100, Math.round(bundle.maxVolumeLimit)));
        }
        return {
          youtubeSound: nextYt,
          dataSaver: typeof bundle.dataSaver === 'boolean' ? bundle.dataSaver : state.dataSaver,
        };
      });
      persistSettings(get());
    } catch {
      // Offline or unconfigured backend fallback silently ignored
    }
  },

  setAccountKey: async (accountKey) => {
    const cleanKey = accountKey || 'local';
    if (get().accountKey === cleanKey && get().hydrated) {
      await get().syncAudioSettingsFromBackend(cleanKey);
      return;
    }
    const profile = await loadLocalAudioProfile(cleanKey);
    set({ accountKey: cleanKey, localProfile: profile });
    await get().syncAudioSettingsFromBackend(cleanKey);
  },

  updateSetting: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    const next = get();
    persistSettings(next);
    if (key === 'dataSaver') {
      scheduleBackendAudioSettingsSync(next);
    }
  },

  updateYoutubeSound: (key, value) => {
    const cleanVal =
      key === 'defaultPlaybackRate' && typeof value === 'number'
        ? clampPlaybackRate(value)
        : value;
    set((state) => ({
      youtubeSound: {
        ...state.youtubeSound,
        [key]: cleanVal,
      },
    }));
    const next = get();
    persistSettings(next);
    scheduleBackendAudioSettingsSync(next);
  },

  setEpisodePlaybackRate: (episodeId, rate) => {
    if (!episodeId) return;
    set((state) => {
      const next = { ...state.episodePlaybackRates };
      if (rate === null) {
        delete next[episodeId];
      } else {
        next[episodeId] = clampNumber(rate, 0.5, 2);
      }
      return { episodePlaybackRates: next };
    });
    persistSettings(get());
  },

  updateLocalProfile: (patch) => {
    const current = get().localProfile;
    const next = normalizeLocalAudioProfile({
      ...current,
      ...patch,
    });
    set({ localProfile: next });
    void saveLocalAudioProfile(get().accountKey, next).catch(() => {});

    // Keep overlapping YouTube sound playback mirror flags synchronized
    if (
      typeof patch.crossfadeSeconds === 'number' ||
      typeof patch.crossfadeEnabled === 'boolean' ||
      typeof patch.directMode === 'boolean' ||
      typeof patch.fadeOnPlayPause === 'boolean'
    ) {
      const effectiveCrossfade = resolveEffectiveCrossfadeSeconds(next);
      set((state) => ({
        youtubeSound: {
          ...state.youtubeSound,
          trackFadeSeconds: effectiveCrossfade,
          fadeOnPauseResume:
            typeof patch.fadeOnPlayPause === 'boolean'
              ? patch.fadeOnPlayPause
              : state.youtubeSound.fadeOnPauseResume,
        },
      }));
      persistSettings(get());
    }

    scheduleBackendAudioSettingsSync(get());
  },

  toggleCrossfade: (enabled) => {
    const nextCrossfade = computeNextCrossfadeState(get().localProfile, {
      type: 'toggle',
      enabled,
    });
    get().updateLocalProfile({
      crossfadeEnabled: nextCrossfade.crossfadeEnabled,
      crossfadeSeconds: nextCrossfade.crossfadeSeconds,
    });
  },

  setCrossfadeDuration: (seconds) => {
    const nextCrossfade = computeNextCrossfadeState(get().localProfile, {
      type: 'set-duration',
      seconds,
    });
    get().updateLocalProfile({
      crossfadeEnabled: nextCrossfade.crossfadeEnabled,
      crossfadeSeconds: nextCrossfade.crossfadeSeconds,
    });
  },

  applyEqPreset: (presetId) => {
    const profile = get().localProfile;
    const allPresets = [...BUILTIN_EQ_PRESETS, ...profile.customPresets];
    const found = allPresets.find((p) => p.id === presetId);
    if (!found) return;
    get().updateLocalProfile({
      presetId: found.id,
      preampDb: found.preampDb,
      bands: [...found.bands],
    });
  },

  setEqBandGain: (index, dbGain) => {
    if (index < 0 || index >= 10) return;
    const bands = [...get().localProfile.bands];
    bands[index] = clampEqGainDb(dbGain);
    get().updateLocalProfile({
      presetId: 'custom',
      bands,
    });
  },

  setEqPreamp: (dbGain) => {
    get().updateLocalProfile({
      preampDb: clampEqGainDb(dbGain),
    });
  },

  saveCustomPreset: (name) => {
    const clean = name.trim();
    if (!clean) return null;
    const profile = get().localProfile;
    const preset: EqPreset = {
      id: `custom_${Date.now().toString(36)}`,
      name: clean,
      preampDb: profile.preampDb,
      bands: [...profile.bands],
      isCustom: true,
    };
    const nextPresets = [
      preset,
      ...profile.customPresets.filter((p) => p.name.toLowerCase() !== clean.toLowerCase()),
    ];
    get().updateLocalProfile({
      presetId: preset.id,
      customPresets: nextPresets,
    });
    return preset;
  },

  renameCustomPreset: (presetId, newName) => {
    const clean = newName.trim();
    if (!clean) return false;
    const profile = get().localProfile;
    const exists = profile.customPresets.some((p) => p.id === presetId);
    if (!exists) return false;
    const nextPresets = profile.customPresets.map((p) =>
      p.id === presetId ? { ...p, name: clean } : p,
    );
    get().updateLocalProfile({ customPresets: nextPresets });
    return true;
  },

  deleteCustomPreset: (presetId) => {
    const profile = get().localProfile;
    const nextPresets = profile.customPresets.filter((p) => p.id !== presetId);
    const nextPresetId = profile.presetId === presetId ? 'custom' : profile.presetId;
    get().updateLocalProfile({
      presetId: nextPresetId,
      customPresets: nextPresets,
    });
  },

  resetAudioProfileSection: (section) => {
    const def = DEFAULT_LOCAL_AUDIO_PROFILE;
    if (section === 'streaming') {
      get().updateLocalProfile({
        wifiQuality: def.wifiQuality,
        cellularQuality: def.cellularQuality,
        autoAdjustQuality: def.autoAdjustQuality,
      });
      get().updateSetting('dataSaver', false);
      return;
    }
    if (section === 'download') {
      get().updateLocalProfile({
        downloadQuality: def.downloadQuality,
      });
      return;
    }
    if (section === 'eq') {
      get().updateLocalProfile({
        eqEnabled: def.eqEnabled,
        presetId: 'flat',
        preampDb: 0,
        bands: [...BUILTIN_EQ_PRESETS[0].bands],
        bassBoostEnabled: def.bassBoostEnabled,
        bassBoostLevel: def.bassBoostLevel,
        stereoWidenerEnabled: def.stereoWidenerEnabled,
        stereoWidenerLevel: def.stereoWidenerLevel,
      });
      return;
    }
    if (section === 'normalization') {
      get().updateLocalProfile({
        normalizationTarget: def.normalizationTarget,
        useReplayGain: def.useReplayGain,
        limiterEnabled: def.limiterEnabled,
      });
      get().updateYoutubeSound('maxVolumeLimit', DEFAULT_YOUTUBE_SOUND.maxVolumeLimit);
      return;
    }
    if (section === 'playback') {
      get().updateLocalProfile({
        crossfadeEnabled: def.crossfadeEnabled,
        crossfadeSeconds: def.crossfadeSeconds,
        gaplessPlayback: def.gaplessPlayback,
        fadeOnPlayPause: def.fadeOnPlayPause,
        skipSilence: def.skipSilence,
      });
      set((state) => ({
        youtubeSound: {
          ...state.youtubeSound,
          defaultPlaybackRate: DEFAULT_YOUTUBE_SOUND.defaultPlaybackRate,
          trackFadeSeconds: DEFAULT_YOUTUBE_SOUND.trackFadeSeconds,
          fadeOnPauseResume: DEFAULT_YOUTUBE_SOUND.fadeOnPauseResume,
          fadeOutOnSleepTimer: DEFAULT_YOUTUBE_SOUND.fadeOutOnSleepTimer,
          resumeLastPosition: DEFAULT_YOUTUBE_SOUND.resumeLastPosition,
          autoStartOnOpen: DEFAULT_YOUTUBE_SOUND.autoStartOnOpen,
        },
      }));
      persistSettings(get());
      scheduleBackendAudioSettingsSync(get());
      return;
    }
    if (section === 'output') {
      get().updateLocalProfile({
        monoAudio: def.monoAudio,
        balance: def.balance,
        outputDeviceId: def.outputDeviceId,
        directMode: def.directMode,
      });
      return;
    }

    // 'all': reset every audio setting (preserve custom presets only if user doesn't reset, or reset clean)
    const freshProfile = normalizeLocalAudioProfile({
      ...DEFAULT_LOCAL_AUDIO_PROFILE,
      customPresets: [],
    });
    set((state) => ({
      localProfile: freshProfile,
      dataSaver: false,
      youtubeSound: { ...DEFAULT_YOUTUBE_SOUND },
      autoplay: state.autoplay,
    }));
    const latest = get();
    persistSettings(latest);
    void saveLocalAudioProfile(latest.accountKey, freshProfile).catch(() => {});
    void resetAccountAudioSettings(latest.accountKey).catch(() => {});
  },

  enableAllDsp: () => {
    const current = get().localProfile;
    get().updateLocalProfile({
      eqEnabled: true,
      bassBoostEnabled: true,
      bassBoostLevel: current.bassBoostLevel > 0 ? current.bassBoostLevel : 35,
      stereoWidenerEnabled: true,
      stereoWidenerLevel: current.stereoWidenerLevel > 0 ? current.stereoWidenerLevel : 35,
      normalizationTarget:
        current.normalizationTarget === 'off' ? 'normal' : current.normalizationTarget,
      useReplayGain: true,
      limiterEnabled: true,
      gaplessPlayback: true,
      fadeOnPlayPause: true,
      skipSilence: true,
      crossfadeEnabled: true,
      crossfadeSeconds: current.crossfadeSeconds > 0 ? current.crossfadeSeconds : 3,
      directMode: false,
    });
  },

  moveHomeSection: (id, direction) => {
    const order = [...get().homeSectionOrder];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    get().updateSetting('homeSectionOrder', order);
  },

  resetHomeSectionOrder: () => {
    get().updateSetting('homeSectionOrder', [...DEFAULT_HOME_SECTION_ORDER]);
  },

  updateCustomBackground: (patch) => {
    const current = get().customBackground;
    const next = normalizeCustomBackground(
      { ...current, ...patch },
      patch.customImageDataUrl !== undefined
        ? patch.customImageDataUrl
        : current.customImageDataUrl,
    );
    set({ customBackground: next });
    persistSettings(get());
  },

  setCustomBackgroundImage: async (dataUrl, fileName) => {
    const safeUrl = isSafeBackgroundImageUrl(dataUrl) ? dataUrl : null;
    const current = get().customBackground;
    const next = normalizeCustomBackground(
      {
        ...current,
        mode: safeUrl ? 'image' : current.mode === 'image' ? 'default' : current.mode,
        customImageName: safeUrl ? (fileName ?? current.customImageName ?? 'Latar Kustom') : null,
      },
      safeUrl,
    );
    set({ customBackground: next });
    persistSettings(get());
    try {
      if (safeUrl) {
        await db.kvState.put({
          key: CUSTOM_BACKGROUND_IMAGE_KV_KEY,
          value: safeUrl,
        });
      } else {
        await db.kvState.delete(CUSTOM_BACKGROUND_IMAGE_KV_KEY);
      }
    } catch {
      // Non-fatal IndexedDB fallback
    }
  },

  resetCustomBackground: async () => {
    set({ customBackground: { ...DEFAULT_CUSTOM_BACKGROUND } });
    persistSettings(get());
    try {
      await db.kvState.delete(CUSTOM_BACKGROUND_IMAGE_KV_KEY);
    } catch {
      // Ignore delete error
    }
  },
}));
