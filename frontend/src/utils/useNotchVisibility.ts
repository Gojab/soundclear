import { useEffect, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { shouldShowNotchMiniPlayer } from './notchPlayer';

export function useNotchVisibility(): {
  notchVisible: boolean;
  isAppInBackground: boolean;
} {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const hasActiveSessionPlayback = usePlayerStore((s) => s.hasActiveSessionPlayback);
  const notchManuallyHidden = usePlayerStore((s) => s.notchManuallyHidden);
  const floatingMiniOpen = usePlayerStore((s) => s.floatingMiniOpen);
  const notchDisplayMode = useSettingsStore((s) => s.notchDisplayMode);

  const [isAppInBackground, setIsAppInBackground] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.hidden;
  });

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const syncBackgroundState = () => {
      const hidden = document.hidden || !document.hasFocus();
      setIsAppInBackground(hidden);
    };

    const onFocus = () => setIsAppInBackground(document.hidden);
    const onBlur = () => setIsAppInBackground(true);

    document.addEventListener('visibilitychange', syncBackgroundState);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', syncBackgroundState);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const notchVisible = shouldShowNotchMiniPlayer({
    hasTrack: Boolean(currentTrack),
    isPlaying,
    hasActivePlayback: hasActiveSessionPlayback,
    manuallyHidden: notchManuallyHidden,
    displayMode: notchDisplayMode,
    isAppInBackground,
    forceOpen: floatingMiniOpen,
  });

  return { notchVisible, isAppInBackground };
}
