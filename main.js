const { app, BrowserWindow, BrowserView, ipcMain, session } = require('electron');
const path = require('path');

let win;
const views = new Map();

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080a0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // Permitir reproducción multimedia sin exigir un click en el reproductor.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'fullscreen'];
    callback(allowed.includes(permission));
  });

  win.on('resize', layoutViews);
  win.on('maximize', layoutViews);
  win.on('unmaximize', layoutViews);
  win.on('closed', () => {
    for (const v of views.values()) v.view.webContents.destroy();
    views.clear();
    win = null;
  });
}

function layoutViews() {
  if (!win) return;
  for (const [id, item] of views) {
    const rect = item.rect;
    item.view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    });
  }
}

function sendToUI(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function createView(id, url, rect) {
  if (views.has(id)) removeView(id);

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  views.set(id, { view, rect, url });
  win.setBrowserView(view);
  view.setBounds({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  });
  view.setAutoResize({ width: true, height: true });

  view.webContents.on('did-finish-load', () => {
    injectSiteMode(id);
    sendToUI('mv-loaded', { id, url: view.webContents.getURL() });
  });

  view.webContents.on('did-navigate', () => {
    injectSiteMode(id);
    sendToUI('mv-navigated', { id, url: view.webContents.getURL() });
  });

  view.webContents.on('did-navigate-in-page', () => {
    injectSiteMode(id);
  });

  view.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      sendToUI('mv-error', { id, errorCode, errorDescription, url: validatedURL });
    }
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url);
    return { action: 'deny' };
  });

  view.webContents.loadURL(url);
}

async function injectIntoFrame(frame) {
  const code = `
  (() => {
    const host = location.hostname.replace(/^www\\\\./,'').toLowerCase();
    const isTV = host === 'tvlibreonline.me' || host.endsWith('.tvlibreonline.me');

    if (!isTV) return {changed:false};

    function findVideo() {
      const vids = [...document.querySelectorAll('video')];
      if (!vids.length) return null;
      vids.sort((a,b) => (b.clientWidth*b.clientHeight) - (a.clientWidth*a.clientHeight));
      return vids[0];
    }

    function focusVideo() {
      const video = findVideo();
      if (!video) return false;

      document.documentElement.style.cssText +=
        ';width:100%!important;height:100%!important;overflow:hidden!important;margin:0!important;padding:0!important;';
      document.body.style.cssText +=
        ';width:100%!important;height:100%!important;overflow:hidden!important;margin:0!important;padding:0!important;background:#000!important;';

      // Ocultar todo salvo la cadena de contenedores que lleva al video.
      let keep = new Set();
      let n = video;
      while (n && n !== document.body) {
        keep.add(n);
        n = n.parentElement;
      }
      [...document.body.children].forEach(el => {
        if (!keep.has(el)) el.style.setProperty('display','none','important');
      });

      let p = video.parentElement;
      while (p && p !== document.body) {
        p.style.setProperty('position','absolute','important');
        p.style.setProperty('inset','0','important');
        p.style.setProperty('width','100%','important');
        p.style.setProperty('height','100%','important');
        p.style.setProperty('max-width','none','important');
        p.style.setProperty('max-height','none','important');
        p.style.setProperty('margin','0','important');
        p.style.setProperty('padding','0','important');
        p.style.setProperty('overflow','hidden','important');
        p = p.parentElement;
      }

      video.style.setProperty('position','absolute','important');
      video.style.setProperty('inset','0','important');
      video.style.setProperty('width','100%','important');
      video.style.setProperty('height','100%','important');
      video.style.setProperty('max-width','100%','important');
      video.style.setProperty('max-height','100%','important');
      video.style.setProperty('object-fit','contain','important');
      video.style.setProperty('background','#000','important');
      video.style.setProperty('margin','0','important');
      video.style.setProperty('padding','0','important');
      return true;
    }

    if (focusVideo()) return {changed:true};

    // Algunos reproductores aparecen después de cargar publicidad/scripts.
    if (!window.__mvTVObserver) {
      window.__mvTVObserver = new MutationObserver(() => focusVideo());
      window.__mvTVObserver.observe(document.documentElement, {childList:true, subtree:true});
    }
    window.__mvTVTimer = window.__mvTVTimer || setInterval(focusVideo, 1200);
    return {changed:false,waiting:true};
  })()
  `;
  try { return await frame.executeJavaScript(code, true); } catch { return null; }
}

async function injectSiteMode(id) {
  const item = views.get(id);
  if (!item) return;
  const frames = item.view.webContents.mainFrame.framesInSubtree;
  for (const frame of frames) await injectIntoFrame(frame);
}

function removeView(id) {
  const item = views.get(id);
  if (!item) return;
  try { win.removeBrowserView(item.view); } catch {}
  try { item.view.webContents.destroy(); } catch {}
  views.delete(id);
}

ipcMain.on('mv-create-view', (_e, { id, url, rect }) => {
  if (!win) return;
  createView(id, url, rect);
});

ipcMain.on('mv-remove-view', (_e, { id }) => removeView(id));

ipcMain.on('mv-navigate', (_e, { id, url }) => {
  const item = views.get(id);
  if (!item) return;
  item.url = url;
  item.view.webContents.loadURL(url);
});

ipcMain.on('mv-reload', (_e, { id }) => {
  const item = views.get(id);
  if (item) item.view.webContents.reload();
});

ipcMain.on('mv-open', (_e, { id }) => {
  const item = views.get(id);
  if (item) item.view.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.on('mv-update-rects', (_e, rects) => {
  if (!win) return;
  for (const r of rects) {
    const item = views.get(r.id);
    if (item) {
      item.rect = r.rect;
      item.view.setBounds({
        x: Math.round(r.rect.x),
        y: Math.round(r.rect.y),
        width: Math.max(1, Math.round(r.rect.width)),
        height: Math.max(1, Math.round(r.rect.height))
      });
    }
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
