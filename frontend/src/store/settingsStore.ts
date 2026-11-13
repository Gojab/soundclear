import { create } from 'zustand';
import { db, DEFAULT_HOME_SECTION_ORDER, DEFAULT_SETTINGS } from '../db/soundclearDb';
import type { HomeSectionId, UserSettings } from '../types/music';

interface SettingsState extends UserSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  moveHomeSection: (id: HomeSectionId, direction: 'up' | 'down') => void;
  resetHomeSectionOrder: () => void;
}

function persistSettings(settings: UserSettings): void {
  void db.kvState.put({ key: 'settings', value: settings }).catch(() => {});
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    try {
      const rec = await db.kvState.get('settings');
      if (rec?.value && typeof rec.value === 'object') {
        const stored = rec.value as Partial<UserSettings>;
        const order = Array.isArray(stored.homeSectionOrder) && stored.homeSectionOrder.length > 0
          ? stored.homeSectionOrder
          : DEFAULT_HOME_SECTION_ORDER;
        set({
          hideExplicit: Boolean(stored.hideExplicit),
          autoplay: stored.autoplay ?? true,
          dataSaver: Boolean(stored.dataSaver),
          showRightPanel: stored.showRightPanel ?? true,
          homeSectionOrder: order,
          hydrated: true,
        });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  updateSetting: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    const s = get();
    persistSettings({
      hideExplicit: s.hideExplicit,
      autoplay: s.autoplay,
      dataSaver: s.dataSaver,
      showRightPanel: s.showRightPanel,
      homeSectionOrder: s.homeSectionOrder,
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
