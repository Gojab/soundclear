import {
  DEFAULT_NOTCH_MONITOR_OPTIONS,
  type NotchDisplayMode,
  type NotchMonitorOption,
} from './notchPlayer';

export type NotchDesktopCommand = 'skip' | 'stop';

export interface NotchDesktopPayload {
  visible: boolean;
  expanded: boolean;
  width: number;
  height: number;
  title: string;
  artist: string;
  prevLine: string | null;
  activeLine: string;
  nextLine: string | null;
  hasSyncedLyrics: boolean;
  displayMode: NotchDisplayMode;
  monitorId: string;
  clickThroughTransparent: boolean;
}

export interface DesktopNotchBridge {
  sendNotchState?: (payload: NotchDesktopPayload) => void;
  onNotchCommand?: (cb: (command: NotchDesktopCommand) => void) => (() => void) | void;
  getMonitors?: () => Promise<NotchMonitorOption[]> | NotchMonitorOption[];
}

interface TauriCoreLike {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriEventLike {
  listen?: (
    event: string,
    handler: (event: { payload?: unknown }) => void,
  ) => Promise<() => void>;
}

interface WindowWithDesktopApis extends Window {
  soundclearDesktop?: DesktopNotchBridge;
  electronAPI?: {
    notch?: DesktopNotchBridge;
    send?: (channel: string, data: unknown) => void;
    on?: (channel: string, cb: (...args: unknown[]) => void) => (() => void) | void;
    getDisplays?: () => Promise<Array<{ id?: string | number; label?: string; primary?: boolean }>>;
  };
  __TAURI_INTERNALS__?: TauriCoreLike;
  __TAURI__?: {
    core?: TauriCoreLike;
    event?: TauriEventLike;
    tauri?: TauriCoreLike;
  };
  getScreenDetails?: () => Promise<{
    screens?: Array<{ label?: string; isPrimary?: boolean }>;
  }>;
}

export function isDesktopNotchHost(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as WindowWithDesktopApis;
  return Boolean(
    w.soundclearDesktop ||
      w.electronAPI?.notch ||
      w.electronAPI?.send ||
      w.__TAURI_INTERNALS__ ||
      w.__TAURI__,
  );
}

export function publishDesktopNotchState(payload: NotchDesktopPayload): void {
  if (typeof window === 'undefined') return;
  const w = window as WindowWithDesktopApis;

  try {
    if (w.soundclearDesktop?.sendNotchState) {
      w.soundclearDesktop.sendNotchState(payload);
      return;
    }
    if (w.electronAPI?.notch?.sendNotchState) {
      w.electronAPI.notch.sendNotchState(payload);
      return;
    }
    if (w.electronAPI?.send) {
      w.electronAPI.send('soundclear:notch-state', payload);
      return;
    }
    const tauriInvoke =
      w.__TAURI__?.core?.invoke || w.__TAURI__?.tauri?.invoke || w.__TAURI_INTERNALS__?.invoke;
    if (typeof tauriInvoke === 'function') {
      void tauriInvoke('update_notch_window', { payload }).catch(() => {});
    }
  } catch {
    // Non-fatal in web runtime
  }
}

export function subscribeDesktopNotchCommands(
  onCommand: (cmd: NotchDesktopCommand) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as WindowWithDesktopApis;
  const cleanups: Array<() => void> = [];

  try {
    const directBridge = w.soundclearDesktop || w.electronAPI?.notch;
    if (directBridge?.onNotchCommand) {
      const unsub = directBridge.onNotchCommand((cmd) => {
        if (cmd === 'skip' || cmd === 'stop') onCommand(cmd);
      });
      if (typeof unsub === 'function') cleanups.push(unsub);
    } else if (w.electronAPI?.on) {
      const unsub = w.electronAPI.on('soundclear:notch-command', (cmd) => {
        if (cmd === 'skip' || cmd === 'stop') onCommand(cmd);
      });
      if (typeof unsub === 'function') cleanups.push(unsub);
    }

    if (w.__TAURI__?.event?.listen) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;
      void w.__TAURI__.event
        .listen('soundclear:notch-command', (event) => {
          const cmd = event?.payload;
          if (cmd === 'skip' || cmd === 'stop') onCommand(cmd);
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => {});
      cleanups.push(() => {
        cancelled = true;
        unlisten?.();
      });
    }
  } catch {
    // Ignore bridge errors in browser
  }

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // Ignore
      }
    }
  };
}

export async function listAvailableNotchMonitors(): Promise<NotchMonitorOption[]> {
  const options: NotchMonitorOption[] = [...DEFAULT_NOTCH_MONITOR_OPTIONS];
  if (typeof window === 'undefined') return options;

  const w = window as WindowWithDesktopApis;
  const seenIds = new Set(options.map((o) => o.id));
  const appendOption = (id: string, label: string) => {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    options.push({ id, label });
  };

  try {
    const customList =
      (await w.soundclearDesktop?.getMonitors?.()) ||
      (await w.electronAPI?.notch?.getMonitors?.());
    if (Array.isArray(customList)) {
      for (const m of customList) {
        if (m?.id && m?.label) appendOption(String(m.id), String(m.label));
      }
    } else if (typeof w.electronAPI?.getDisplays === 'function') {
      const displays = await w.electronAPI.getDisplays();
      if (Array.isArray(displays)) {
        displays.forEach((d, idx) => {
          const id = d.id !== undefined ? `display:${d.id}` : `display:${idx + 1}`;
          const label = d.label
            ? `${d.label}${d.primary ? ' (Utama)' : ''}`
            : `Monitor ${idx + 1}${d.primary ? ' (Utama)' : ''}`;
          appendOption(id, label);
        });
      }
    } else if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      typeof w.getScreenDetails === 'function'
    ) {
      try {
        const perm = await navigator.permissions.query({
          name: 'window-management' as PermissionName,
        });
        if (perm.state === 'granted') {
          const details = await w.getScreenDetails();
          details?.screens?.forEach((scr, idx) => {
            const label = scr.label || `Layar ${idx + 1}`;
            appendOption(
              `screen:${idx + 1}`,
              scr.isPrimary ? `${label} (Utama)` : label,
            );
          });
        }
      } catch {
        // Browser may not support window-management permission query
      }
    }
  } catch {
    // Non-fatal fallback to default options
  }

  return options;
}
