const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multiview', {
  createView: (data) => ipcRenderer.send('mv-create-view', data),
  removeView: (data) => ipcRenderer.send('mv-remove-view', data),
  navigate: (data) => ipcRenderer.send('mv-navigate', data),
  reload: (data) => ipcRenderer.send('mv-reload', data),
  updateRects: (data) => ipcRenderer.send('mv-update-rects', data),
  on: (channel, cb) => {
    const allowed = ['mv-loaded','mv-navigated','mv-error'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
  }
});
