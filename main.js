const { app, BaseWindow, WebContentsView, ipcMain, session } = require('electron');
const path = require('path');

let win = null;
let uiView = null;
const panels = new Map();

const PANEL_HEADER = 42;
const TV_HOSTS = ['tvlibreonline.me'];
const FORMULA_HOSTS = ['formula-timer.com'];
const AD_HOST_PARTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adservice.google.com', 'adnxs.com', 'exoclick.com', 'popads.net',
  'popcash.net', 'propellerads.com', 'trafficjunky.com', 'juicyads.com',
  'onclickalgo.com', 'adsterra.com', 'mgid.com', 'outbrain.com'
];

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function hostMatches(url, hosts) {
  try {
    const host = normalizeHost(new URL(url).hostname);
    return hosts.some(base => host === base || host.endsWith(`.${base}`));
  } catch {
    return false;
  }
}

function isTV(url) { return hostMatches(url, TV_HOSTS); }
function isFormula(url) { return hostMatches(url, FORMULA_HOSTS); }

function looksLikeAd(url) {
  try {
    const u = new URL(url);
    const host = normalizeHost(u.hostname);
    const pathAndQuery = `${u.pathname}${u.search}`.toLowerCase();
    if (AD_HOST_PARTS.some(part => host === part || host.endsWith(`.${part}`))) return true;
    if (/(^|[.\/_-])(ad|ads|adserver|advert|advertising|banner|popup|popunder)([.\/_-]|$)/i.test(`${host}${u.pathname}`)) return true;
    if (/(popunder|popup|clickunder|doubleclick|googlesyndication|adservice)/i.test(pathAndQuery)) return true;
    return false;
  } catch {
    return false;
  }
}

function configureSession(ses) {
  if (!ses || ses.__mvConfigured) return;
  ses.__mvConfigured = true;

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'fullscreen');
  });

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // Block only URLs that are clearly advertising endpoints. Media/CDN URLs are left alone.
    callback({ cancel: looksLikeAd(details.url) });
  });
}

function destroyPanel(id) {
  const item = panels.get(id);
  if (!item) return;
  try { win?.contentView.removeChildView(item.view); } catch {}
  try { item.view.webContents.close(); } catch {}
  panels.delete(id);
}

function destroyAllPanels() {
  for (const id of [...panels.keys()]) destroyPanel(id);
}

function mainFrameNavigationAllowed(item, destinationURL) {
  if (!destinationURL) return false;
  if (looksLikeAd(destinationURL)) return false;
  if (isTV(item.url || item.view.webContents.getURL())) {
    // TVLibre must keep the top-level panel on TVLibre. Its iframes/resources can still load.
    return isTV(destinationURL);
  }
  return true;
}

function protectPanel(item) {
  const wc = item.view.webContents;
  if (wc.__mvProtected) return;
  wc.__mvProtected = true;
  configureSession(wc.session);

  wc.setWindowOpenHandler(({ url }) => {
    send('mv-popup-blocked', { id: item.id, url });
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, destinationURL) => {
    if (!mainFrameNavigationAllowed(item, destinationURL)) {
      event.preventDefault();
      send('mv-popup-blocked', { id: item.id, url: destinationURL });
    }
  });

  wc.on('will-redirect', (event, destinationURL) => {
    if (!mainFrameNavigationAllowed(item, destinationURL)) {
      event.preventDefault();
      send('mv-popup-blocked', { id: item.id, url: destinationURL });
    }
  });

  wc.on('will-frame-navigate', (event, details) => {
    // Only block ad URLs at iframe/frame level. Never block legitimate CDN frames by default.
    if (looksLikeAd(details.url)) {
      event.preventDefault();
      send('mv-popup-blocked', { id: item.id, url: details.url });
    }
  });

  wc.on('content-bounds-updated', event => {
    // A remote page must not resize/move the MultiView window.
    event.preventDefault();
  });

  wc.on('did-finish-load', () => {
    const current = panels.get(item.id);
    if (!current) return;
    current.url = wc.getURL() || current.url;
    applyZoom(current);
    if (isTV(current.url)) injectTVMode(current);
    send('mv-loaded', { id: current.id, url: current.url });
  });

  wc.on('did-navigate', (_event, url) => {
    const current = panels.get(item.id);
    if (!current) return;
    current.url = url || current.url;
    applyZoom(current);
    if (isTV(current.url)) injectTVMode(current);
    send('mv-navigated', { id: current.id, url: current.url });
  });

  wc.on('did-navigate-in-page', () => {
    const current = panels.get(item.id);
    if (current && isTV(current.url)) injectTVMode(current);
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) send('mv-error', { id: item.id, errorCode, errorDescription, url: validatedURL });
  });

  wc.on('render-process-gone', (_event, details) => {
    send('mv-error', { id: item.id, errorCode: details?.exitCode, errorDescription: `Render process ended: ${details?.reason || 'unknown'}` });
  });
}

function send(channel, data) {
  if (uiView && !uiView.webContents.isDestroyed()) uiView.webContents.send(channel, data);
}

function zoomForURL(url) { return isFormula(url) ? 0.55 : 1; }

function applyZoom(item) {
  try {
    item.view.webContents.setZoomFactor(item.zoom);
    send('mv-zoom', { id: item.id, zoom: item.zoom });
  } catch {}
}

function setPanelZoom(id, value) {
  const item = panels.get(id);
  if (!item) return { ok: false, error: `No existe el panel ${id}.` };
  item.zoom = Math.max(0.25, Math.min(2, Number(value) || 1));
  applyZoom(item);
  return { ok: true, zoom: item.zoom };
}

function panelBounds(rect) {
  // Renderer coordinates map directly to BaseWindow content coordinates because uiView
  // fills win.contentView. The native web view starts below the HTML controls.
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height - PANEL_HEADER));
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y + PANEL_HEADER),
    width,
    height
  };
}

function layoutPanel(item) {
  try { item.view.setBounds(panelBounds(item.rect)); } catch {}
}

function layoutAll() {
  if (!win) return;
  const [width, height] = win.getContentSize();
  if (uiView) uiView.setBounds({ x: 0, y: 0, width, height });
  for (const item of panels.values()) layoutPanel(item);
}

function injectTVMode(item) {
  const code = `
    (() => {
      const host = location.hostname.replace(/^www\\./,'').toLowerCase();
      const isTV = host === 'tvlibreonline.me' || host.endsWith('.tvlibreonline.me');
      if (!isTV) return false;
      const findVideo = () => [...document.querySelectorAll('video')]
        .sort((a,b)=>(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0] || null;
      const focus = () => {
        const video = findVideo();
        if (!video) return false;
        document.documentElement.style.cssText += ';width:100%!important;height:100%!important;overflow:hidden!important;margin:0!important;padding:0!important;';
        document.body.style.cssText += ';width:100%!important;height:100%!important;overflow:hidden!important;margin:0!important;padding:0!important;background:#000!important;';
        const keep = new Set();
        let n = video;
        while (n && n !== document.body) { keep.add(n); n = n.parentElement; }
        for (const el of [...document.body.children]) if (!keep.has(el)) el.style.setProperty('display','none','important');
        let p = video.parentElement;
        while (p && p !== document.body) {
          p.style.setProperty('position','absolute','important');
          p.style.setProperty('inset','0','important');
          p.style.setProperty('width','100%','important');
          p.style.setProperty('height','100%','important');
          p.style.setProperty('max-width','none','important');
          p.style.setProperty('max-height','none','important');
          p.style.setProperty('overflow','hidden','important');
          p.style.setProperty('margin','0','important');
          p.style.setProperty('padding','0','important');
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
        return true;
      };
      if (focus()) return true;
      if (!window.__mvTVObserver) {
        window.__mvTVObserver = new MutationObserver(() => focus());
        window.__mvTVObserver.observe(document.documentElement, {childList:true,subtree:true});
      }
      window.__mvTVTimer = window.__mvTVTimer || setInterval(focus, 1200);
      return false;
    })()
  `;
  try { item.view.webContents.executeJavaScript(code, true).catch(() => {}); } catch {}
}

function createPanel(id, url, rect) {
  destroyPanel(id);

  const partition = `persist:mv-${id}`;
  const ses = session.fromPartition(partition);
  configureSession(ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  const item = { id, view, rect, url, zoom: zoomForURL(url) };
  panels.set(id, item);
  win.contentView.addChildView(view);
  layoutPanel(item);
  protectPanel(item);
  view.webContents.loadURL(url);
  return item;
}

function createUI() {
  uiView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.contentView.addChildView(uiView);
  layoutAll();
  uiView.webContents.loadFile(path.join(__dirname, 'index.html'));
  uiView.webContents.on('did-finish-load', () => layoutAll());
}

function createWindow() {
  win = new BaseWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080a0d'
  });

  createUI();
  win.on('resize', layoutAll);
  win.on('maximize', layoutAll);
  win.on('unmaximize', layoutAll);
  win.on('closed', () => {
    destroyAllPanels();
    try { uiView?.webContents.close(); } catch {}
    uiView = null;
    win = null;
  });
}

ipcMain.handle('mv-ping', () => ({ ok: true, message: 'MultiView IPC OK' }));

ipcMain.handle('mv-create-view', async (_event, data) => {
  try {
    if (!win || !uiView) throw new Error('La ventana principal no está disponible.');
    const { id, url, rect } = data || {};
    if (!id || !url || !rect) throw new Error('Faltan datos del panel.');
    createPanel(id, url, rect);
    return { ok: true, id, url };
  } catch (error) {
    send('mv-ui-error', { message: error?.message || String(error) });
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('mv-remove-view', (_event, { id }) => {
  destroyPanel(id);
  return { ok: true };
});

ipcMain.handle('mv-clear-all', () => {
  destroyAllPanels();
  return { ok: true };
});

ipcMain.handle('mv-go-back', (_event, { id }) => {
  const item = panels.get(id);
  if (!item) return { ok: false, error: `No existe el panel ${id}.` };
  if (item.view.webContents.canGoBack()) {
    item.view.webContents.goBack();
    return { ok: true };
  }
  return { ok: false, error: 'No hay una página anterior.' };
});

ipcMain.handle('mv-reload', (_event, { id }) => {
  const item = panels.get(id);
  if (!item) return { ok: false, error: `No existe el panel ${id}.` };
  item.view.webContents.reload();
  return { ok: true };
});

ipcMain.handle('mv-set-zoom', (_event, { id, zoom }) => setPanelZoom(id, zoom));

ipcMain.handle('mv-update-rects', (_event, rects) => {
  for (const r of Array.isArray(rects) ? rects : []) {
    const item = panels.get(r.id);
    if (!item || !r.rect) continue;
    item.rect = r.rect;
    layoutPanel(item);
  }
  return { ok: true };
});

process.on('uncaughtException', error => send('mv-ui-error', { message: `Error de Electron: ${error?.stack || error}` }));
process.on('unhandledRejection', error => send('mv-ui-error', { message: `Error de promesa: ${error?.stack || error}` }));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (!win) createWindow();
});
