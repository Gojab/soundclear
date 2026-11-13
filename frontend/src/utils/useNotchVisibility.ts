import { useEffect, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { isDesktopNotchHost } from './notchDesktopBridge';
import { isWindowsPlatform, shouldShowNotchMiniPlayer } from './notchPlayer';

export function useNotchVisibility(): {
  notchVisible: boolean;
  desktopNotchVisible: boolean;
  externalNotchActive: boolean;
  isAppInBackground: boolean;
} {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const hasActiveSessionPlayback = usePlayerStore((s) => s.hasActiveSessionPlayback);
  const notchManuallyHidden = usePlayerStore((s) => s.notchManuallyHidden);
  const floatingMiniOpen = usePlayerStore((s) => s.floatingMiniOpen);
  const externalNotchOpen = usePlayerStore((s) => s.externalNotchOpen);
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

  const isWin = isWindowsPlatform();
  const windowsDesktopHost = isWin && isDesktopNotchHost();
  const externalNotchActive = (externalNotchOpen && isWin) || windowsDesktopHost;

  const desktopNotchVisible = windowsDesktopHost
    ? shouldShowNotchMiniPlayer({
        hasTrack: Boolean(currentTrack),
        isPlaying,
        hasActivePlayback: hasActiveSessionPlayback,
        manuallyHidden: notchManuallyHidden,
        displayMode: notchDisplayMode,
        isAppInBackground,
        forceOpen: floatingMiniOpen,
        isWindows: true,
      })
    : false;

  // Mini player is never rendered inside the web DOM; it only pops out externally on Windows.
  const notchVisible = false;

  return { notchVisible, desktopNotchVisible, externalNotchActive, isAppInBackground };
}
