const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multiview', {
  ping: () => ipcRenderer.invoke('mv-ping'),
  on: (channel, cb) => {
    const allowed = ['mv-ui-error'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  }
});
