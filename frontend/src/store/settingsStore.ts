import { create } from 'zustand';
import {
  db,
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_LOCAL_AUDIO_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_YOUTUBE_SOUND,
  loadLocalAudioProfile,
  saveLocalAudioProfile,
} from '../db/soundclearDb';
import type {
  EqPreset,
  HomeSectionId,
  LocalAudioProfile,
  UserSettings,
  YouTubeSoundSettings,
} from '../types/music';
import { BUILTIN_EQ_PRESETS, clampEqGainDb, clampNumber } from '../utils/audioMath';

interface SettingsState extends UserSettings {
  hydrated: boolean;
  accountKey: string;
  localProfile: LocalAudioProfile;
  hydrate: () => Promise<void>;
  setAccountKey: (accountKey: string) => Promise<void>;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  updateYoutubeSound: <K extends keyof YouTubeSoundSettings>(
    key: K,
    value: YouTubeSoundSettings[K],
  ) => void;
  setEpisodePlaybackRate: (episodeId: string, rate: number | null) => void;
  updateLocalProfile: (patch: Partial<LocalAudioProfile>) => void;
  applyEqPreset: (presetId: string) => void;
  setEqBandGain: (index: number, dbGain: number) => void;
  setEqPreamp: (dbGain: number) => void;
  saveCustomPreset: (name: string) => EqPreset | null;
  deleteCustomPreset: (presetId: string) => void;
  moveHomeSection: (id: HomeSectionId, direction: 'up' | 'down') => void;
  resetHomeSectionOrder: () => void;
}

function persistSettings(s: UserSettings): void {
  void db.kvState
    .put({
      key: 'settings',
      value: {
        hideExplicit: s.hideExplicit,
        autoplay: s.autoplay,
        dataSaver: s.dataSaver,
        showRightPanel: s.showRightPanel,
        homeSectionOrder: s.homeSectionOrder,
        youtubeSound: s.youtubeSound,
        episodePlaybackRates: s.episodePlaybackRates,
      },
    })
    .catch(() => {});
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
      const [rec, accountProfile] = await Promise.all([
        db.kvState.get('settings'),
        loadLocalAudioProfile('local'),
      ]);
      if (rec?.value && typeof rec.value === 'object') {
        const stored = rec.value as Partial<UserSettings>;
        const order =
          Array.isArray(stored.homeSectionOrder) && stored.homeSectionOrder.length > 0
            ? stored.homeSectionOrder
            : DEFAULT_HOME_SECTION_ORDER;
        set({
          hideExplicit: Boolean(stored.hideExplicit),
          autoplay: stored.autoplay ?? true,
          dataSaver: Boolean(stored.dataSaver),
          showRightPanel: stored.showRightPanel ?? true,
          homeSectionOrder: order,
          youtubeSound: {
            ...DEFAULT_YOUTUBE_SOUND,
            ...(stored.youtubeSound || {}),
          },
          episodePlaybackRates: stored.episodePlaybackRates || {},
          localProfile: accountProfile,
          hydrated: true,
        });
      } else {
        set({ localProfile: accountProfile, hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  setAccountKey: async (accountKey) => {
    const cleanKey = accountKey || 'local';
    if (get().accountKey === cleanKey && get().hydrated) return;
    const profile = await loadLocalAudioProfile(cleanKey);
    set({ accountKey: cleanKey, localProfile: profile });
  },

  updateSetting: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    persistSettings(get());
  },

  updateYoutubeSound: (key, value) => {
    set((state) => ({
      youtubeSound: {
        ...state.youtubeSound,
        [key]: value,
      },
    }));
    persistSettings(get());
  },

  setEpisodePlaybackRate: (episodeId, rate) => {
    if (!episodeId) return;
    set((state) => {
      const next = { ...state.episodePlaybackRates };
      if (rate === null) {
        delete next[episodeId];
      } else {
        next[episodeId] = clampNumber(rate, 0.25, 2);
      }
      return { episodePlaybackRates: next };
    });
    persistSettings(get());
  },

  updateLocalProfile: (patch) => {
    const next: LocalAudioProfile = {
      ...get().localProfile,
      ...patch,
    };
    set({ localProfile: next });
    void saveLocalAudioProfile(get().accountKey, next).catch(() => {});
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

  deleteCustomPreset: (presetId) => {
    const profile = get().localProfile;
    const nextPresets = profile.customPresets.filter((p) => p.id !== presetId);
    const nextPresetId = profile.presetId === presetId ? 'custom' : profile.presetId;
    get().updateLocalProfile({
      presetId: nextPresetId,
      customPresets: nextPresets,
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
}));
