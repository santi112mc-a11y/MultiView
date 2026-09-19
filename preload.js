const { contextBridge, ipcRenderer } = require('electron');

const channels = ['mv-loaded', 'mv-navigated', 'mv-error', 'mv-ui-error'];

contextBridge.exposeInMainWorld('multiview', {
  ping: () => ipcRenderer.invoke('mv-ping'),
  createView: (data) => ipcRenderer.invoke('mv-create-view', data),
  removeView: (data) => ipcRenderer.invoke('mv-remove-view', data),
  navigate: (data) => ipcRenderer.invoke('mv-navigate', data),
  reload: (data) => ipcRenderer.invoke('mv-reload', data),
  updateRects: (data) => ipcRenderer.invoke('mv-update-rects', data),
  on: (channel, cb) => {
    if (!channels.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  }
});
