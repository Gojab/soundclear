const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, screen, session } = require('electron');

if (process.platform !== 'win32') {
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'SoundClear Desktop — Khusus Windows',
      'Aplikasi host notch melayang ini dirancang khusus untuk Windows 10/11.',
    );
    app.quit();
  });
}

const DEFAULT_APP_URL = process.env.SOUNDCLEAR_URL || 'http://localhost:3000';
const FILLET_PADDING_PX = 14;

let mainWindow = null;
let notchWindow = null;
let lastNotchState = null;
let notchHovered = false;

function effectiveNotchState(state) {
  if (!state) return state;
  if (notchHovered) {
    return {
      ...state,
      expanded: true,
      width: 380,
      height: 86,
    };
  }
  return state;
}

function resolveTargetDisplay(monitorId) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  if (monitorId === 'cursor') {
    const pt = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(pt) || primary;
  }

  if (typeof monitorId === 'string' && monitorId.startsWith('display:')) {
    const rawId = monitorId.slice('display:'.length);
    const matched = displays.find((d) => String(d.id) === rawId);
    if (matched) return matched;
  }

  return primary;
}

function positionNotchWindow(state) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  const pillWidth = Math.max(280, Math.min(440, Number(state?.width) || 320));
  const pillHeight = Math.max(48, Math.min(120, Number(state?.height) || 48));
  const totalWidth = pillWidth + FILLET_PADDING_PX * 2;
  const totalHeight = pillHeight;

  const display = resolveTargetDisplay(state?.monitorId || 'primary');
  const x = Math.round(display.bounds.x + (display.bounds.width - totalWidth) / 2);
  const y = Math.round(display.bounds.y);

  notchWindow.setBounds(
    {
      x,
      y,
      width: totalWidth,
      height: totalHeight,
    },
    false,
  );
}

function syncNotchVisibility(state) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  if (!state || !state.visible) {
    if (notchWindow.isVisible()) notchWindow.hide();
    return;
  }

  const isMainFocused =
    Boolean(mainWindow && !mainWindow.isDestroyed()) &&
    mainWindow.isFocused() &&
    !mainWindow.isMinimized();

  if (state.displayMode === 'off') {
    if (notchWindow.isVisible()) notchWindow.hide();
    return;
  }

  if (state.displayMode === 'background' && isMainFocused) {
    if (notchWindow.isVisible()) notchWindow.hide();
    return;
  }

  positionNotchWindow(effectiveNotchState(state));
  if (!notchWindow.isVisible()) {
    notchWindow.showInactive();
  }
  notchWindow.setAlwaysOnTop(true, 'screen-saver');
}

function createWindows() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'SoundClear',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  notchWindow = new BrowserWindow({
    width: 348,
    height: 48,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  notchWindow.setAlwaysOnTop(true, 'screen-saver');
  notchWindow.setIgnoreMouseEvents(true, { forward: true });
  notchWindow.loadFile(path.join(__dirname, 'notch.html'));

  mainWindow.loadURL(DEFAULT_APP_URL);

  const resync = () => {
    if (lastNotchState) syncNotchVisibility(lastNotchState);
  };

  mainWindow.on('focus', resync);
  mainWindow.on('blur', resync);
  mainWindow.on('minimize', resync);
  mainWindow.on('restore', resync);
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (notchWindow && !notchWindow.isDestroyed()) {
      notchWindow.close();
    }
  });

  notchWindow.on('closed', () => {
    notchWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform !== 'win32') return;

  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: [
        '*://*.doubleclick.net/*',
        '*://*.googleadservices.com/*',
        '*://*.googlesyndication.com/*',
      ],
    },
    (_details, callback) => {
      callback({ cancel: true });
    },
  );

  createWindows();

  ipcMain.on('soundclear:notch-state', (_event, payload) => {
    if (!payload || typeof payload !== 'object') return;
    lastNotchState = payload;
    syncNotchVisibility(payload);
    if (notchWindow && !notchWindow.isDestroyed()) {
      notchWindow.webContents.send('soundclear:notch-render', payload);
    }
  });

  ipcMain.on('soundclear:notch-command', (_event, command) => {
    if (command !== 'prev' && command !== 'toggle' && command !== 'skip' && command !== 'stop') return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('soundclear:notch-command', command);
    }
  });

  ipcMain.on('soundclear:notch-interactive', (_event, interactive) => {
    notchHovered = Boolean(interactive);
    if (!notchWindow || notchWindow.isDestroyed()) return;
    if (notchHovered) {
      notchWindow.setIgnoreMouseEvents(false);
    } else {
      notchWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    if (lastNotchState) {
      positionNotchWindow(effectiveNotchState(lastNotchState));
    }
  });

  ipcMain.handle('soundclear:get-displays', () => {
    const primaryId = screen.getPrimaryDisplay()?.id;
    return screen.getAllDisplays().map((display, idx) => ({
      id: String(display.id),
      label: display.label || `Monitor ${idx + 1}`,
      primary: display.id === primaryId,
    }));
  });

  screen.on('display-metrics-changed', () => {
    if (lastNotchState) positionNotchWindow(lastNotchState);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
