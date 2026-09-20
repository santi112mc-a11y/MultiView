const { contextBridge, ipcRenderer } = require('electron');

const allowedEvents = ['mv-ui-error', 'mv-status'];

contextBridge.exposeInMainWorld('multiview', {
  goBack: (data) => ipcRenderer.invoke('mv-go-back', data),
  reload: (data) => ipcRenderer.invoke('mv-reload-frame', data),
  setZoom: (data) => ipcRenderer.invoke('mv-set-zoom', data),
  clearFrame: (data) => ipcRenderer.invoke('mv-clear-frame', data),
  registerPanel: (data) => ipcRenderer.send('mv-register-panel', data),
  clearAll: () => ipcRenderer.invoke('mv-clear-all'),
  on: (channel, cb) => {
    if (!allowedEvents.includes(channel)) return;
    ipcRenderer.on(channel, (_event, data) => cb(data));
  }
});
