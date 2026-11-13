const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    if (channel === 'soundclear:notch-state') {
      ipcRenderer.send('soundclear:notch-state', data);
    }
  },
  on: (channel, cb) => {
    if (channel === 'soundclear:notch-command') {
      return subscribe('soundclear:notch-command', cb);
    }
    return () => {};
  },
  getDisplays: () => ipcRenderer.invoke('soundclear:get-displays'),
  notch: {
    sendNotchState: (payload) => ipcRenderer.send('soundclear:notch-state', payload),
    onNotchCommand: (cb) => subscribe('soundclear:notch-command', cb),
    getMonitors: async () => {
      const displays = await ipcRenderer.invoke('soundclear:get-displays');
      if (!Array.isArray(displays)) return [];
      return displays.map((d, idx) => ({
        id: `display:${d.id}`,
        label: `${d.label || `Monitor ${idx + 1}`}${d.primary ? ' (Utama)' : ''}`,
      }));
    },
    // Internal helper methods used exclusively by notch.html
    sendCommand: (cmd) => {
      if (cmd === 'prev' || cmd === 'toggle' || cmd === 'skip' || cmd === 'stop') {
        ipcRenderer.send('soundclear:notch-command', cmd);
      }
    },
    onRender: (cb) => subscribe('soundclear:notch-render', cb),
    setInteractive: (interactive) =>
      ipcRenderer.send('soundclear:notch-interactive', Boolean(interactive)),
  },
});
