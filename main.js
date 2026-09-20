const { app, BrowserWindow, session, webFrameMain } = require('electron');
const path = require('path');

let win = null;
const panelState = new Map();

const TV_HOST = 'tvlibreonline.me';
const FORMULA_HOST = 'formula-timer.com';

const BLOCKED_AD_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'adnxs.com',
  'exoclick.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'trafficjunky.com',
  'juicyads.com',
  'onclickalgo.com',
  'adsterra.com',
  'mgid.com',
  'outbrain.com'
];

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function urlHost(url) {
  try { return normalizeHost(new URL(url).hostname); } catch { return ''; }
}

function isHost(url, base) {
  const host = urlHost(url);
  return host === base || host.endsWith(`.${base}`);
}

function isTV(url) { return isHost(url, TV_HOST); }
function isFormula(url) { return isHost(url, FORMULA_HOST); }

function looksLikeAd(url) {
  try {
    const u = new URL(url);
    const host = normalizeHost(u.hostname);
    const path = `${u.pathname}${u.search}`.toLowerCase();

    if (BLOCKED_AD_HOSTS.some(part => host === part || host.endsWith(`.${part}`))) return true;
    if (/(^|[._/\-])(adserver|advertising|popunder|popup|clickunder|banner)([._/\-]|$)/i.test(`${host}${u.pathname}`)) return true;
    if (/(doubleclick|googlesyndication|googleadservices|adservice|popunder|clickunder|popup)/i.test(path)) return true;

    return false;
  } catch {
    return false;
  }
}

function send(channel, data) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, data); } catch {}
  }
}

function stripFrameRestrictions(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (
      lower === 'x-frame-options' ||
      lower === 'content-security-policy' ||
      lower === 'content-security-policy-report-only'
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function configureSession() {
  const ses = session.defaultSession;
  if (ses.__mvConfigured) return;
  ses.__mvConfigured = true;

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'fullscreen');
  });

  // Stop known ad/redirect endpoints before they load.
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ cancel: looksLikeAd(details.url) });
  });

  // The app uses sandboxed iframes. For embedded remote pages, remove only
  // frame-blocking response headers so sites such as Formula Timer can load.
  ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    if (details.resourceType === 'subFrame') {
      callback({ responseHeaders: stripFrameRestrictions(details.responseHeaders) });
      return;
    }
    callback({ responseHeaders: details.responseHeaders });
  });
}

function topPanelFrame(frame) {
  if (!frame) return null;
  let current = frame;
  while (current && current.parent) {
    if (current.parent === win.webContents.mainFrame) {
      const name = current.name || '';
      if (name.startsWith('mv-panel-')) return current;
      return null;
    }
    current = current.parent;
  }
  return null;
}

function panelIdFromFrame(frame) {
  const top = topPanelFrame(frame);
  if (!top) return null;
  return top.name.slice('mv-panel-'.length);
}

function getPanelFrame(id) {
  if (!win || win.isDestroyed()) return null;
  const name = `mv-panel-${id}`;
  return win.webContents.mainFrame.framesInSubtree.find(frame => frame.name === name) || null;
}

function getPanel(id) {
  return panelState.get(id) || null;
}

async function applyZoomToFrame(frame, zoom) {
  if (!frame || frame.isDestroyed()) return;
  const safeZoom = Math.max(0.25, Math.min(2, Number(zoom) || 1));
  const code = `(() => {
    const z = ${JSON.stringify(safeZoom)};
    document.documentElement.style.setProperty('zoom', z);
    return z;
  })()`;
  try { await frame.executeJavaScript(code, false); } catch {}
}

async function applyTVMode(frame) {
  if (!frame || frame.isDestroyed()) return;
  const code = `(() => {
    const host = location.hostname.replace(/^www\\./, '').toLowerCase();
    if (host !== 'tvlibreonline.me' && !host.endsWith('.tvlibreonline.me')) return false;

    const findVideo = () => [...document.querySelectorAll('video')]
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0] || null;

    const focus = () => {
      const video = findVideo();
      if (!video) return false;

      document.documentElement.style.setProperty('width', '100%', 'important');
      document.documentElement.style.setProperty('height', '100%', 'important');
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.body.style.setProperty('width', '100%', 'important');
      document.body.style.setProperty('height', '100%', 'important');
      document.body.style.setProperty('overflow', 'hidden', 'important');
      document.body.style.setProperty('margin', '0', 'important');
      document.body.style.setProperty('padding', '0', 'important');
      document.body.style.setProperty('background', '#000', 'important');

      const keep = new Set();
      let n = video;
      while (n && n !== document.body) { keep.add(n); n = n.parentElement; }

      for (const child of [...document.body.children]) {
        if (!keep.has(child)) child.style.setProperty('display', 'none', 'important');
      }

      let p = video.parentElement;
      while (p && p !== document.body) {
        p.style.setProperty('position', 'absolute', 'important');
        p.style.setProperty('inset', '0', 'important');
        p.style.setProperty('width', '100%', 'important');
        p.style.setProperty('height', '100%', 'important');
        p.style.setProperty('max-width', 'none', 'important');
        p.style.setProperty('max-height', 'none', 'important');
        p.style.setProperty('overflow', 'hidden', 'important');
        p.style.setProperty('margin', '0', 'important');
        p.style.setProperty('padding', '0', 'important');
        p = p.parentElement;
      }

      video.style.setProperty('position', 'absolute', 'important');
      video.style.setProperty('inset', '0', 'important');
      video.style.setProperty('width', '100%', 'important');
      video.style.setProperty('height', '100%', 'important');
      video.style.setProperty('max-width', '100%', 'important');
      video.style.setProperty('max-height', '100%', 'important');
      video.style.setProperty('object-fit', 'contain', 'important');
      video.style.setProperty('background', '#000', 'important');
      video.style.setProperty('margin', '0', 'important');
      video.style.setProperty('padding', '0', 'important');
      return true;
    };

    if (focus()) return true;
    if (!window.__mvTvObserver) {
      window.__mvTvObserver = new MutationObserver(() => focus());
      window.__mvTvObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.__mvTvTimer = window.__mvTvTimer || setInterval(focus, 1200);
    return false;
  })()`;
  try { await frame.executeJavaScript(code, true); } catch {}
}

function allowPanelNavigation(id, destinationURL) {
  const panel = getPanel(id);
  if (!panel) return false;

  if (looksLikeAd(destinationURL)) return false;

  if (isTV(panel.url)) {
    // TVLibre gets to stay on TVLibre. This stops ad landings from replacing the panel.
    return isTV(destinationURL);
  }

  return true;
}

function installNavigationGuards() {
  const wc = win.webContents;

  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  wc.on('will-frame-navigate', (event, details) => {
    if (details.isMainFrame) {
      if (!String(details.url || '').startsWith('file://')) event.preventDefault();
      return;
    }

    const id = panelIdFromFrame(details.frame);
    if (!id) {
      if (looksLikeAd(details.url)) event.preventDefault();
      return;
    }

    if (!allowPanelNavigation(id, details.url)) {
      event.preventDefault();
      send('mv-status', { message: 'Publicidad/redirección bloqueada.' });
    }
  });

  wc.on('will-redirect', (event, details) => {
    if (details.isMainFrame) {
      event.preventDefault();
      return;
    }

    const id = panelIdFromFrame(details.frame);
    if (id && !allowPanelNavigation(id, details.url)) {
      event.preventDefault();
      send('mv-status', { message: 'Redirección publicitaria bloqueada.' });
    }
  });

  wc.on('did-frame-navigate', (_event, url, _code, _text, _isMainFrame, frameProcessId, frameRoutingId) => {
    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (!frame) return;
    const id = panelIdFromFrame(frame);
    if (!id) return;

    const top = topPanelFrame(frame);
    const panel = getPanel(id);
    if (!panel || !top) return;

    if (top === frame || frame === top) {
      panel.url = url || panel.url;
      applyZoomToFrame(top, panel.zoom).catch(() => {});
    }

    if (isTV(panel.url)) applyTVMode(frame).catch(() => {});
  });

  wc.on('did-frame-finish-load', (_event, _isMainFrame, frameProcessId, frameRoutingId) => {
    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (!frame) return;
    const id = panelIdFromFrame(frame);
    if (!id) return;

    const panel = getPanel(id);
    const top = topPanelFrame(frame);
    if (!panel || !top) return;

    if (frame === top) applyZoomToFrame(top, panel.zoom).catch(() => {});
    if (isTV(panel.url)) applyTVMode(frame).catch(() => {});
  });

  wc.on('did-navigate-in-page', (_event, url, isMainFrame, frameProcessId, frameRoutingId) => {
    if (isMainFrame) return;
    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (!frame) return;
    const id = panelIdFromFrame(frame);
    if (!id) return;
    const panel = getPanel(id);
    if (!panel) return;
    const top = topPanelFrame(frame);
    if (frame === top) {
      panel.url = url || panel.url;
      applyZoomToFrame(top, panel.zoom).catch(() => {});
    }
    if (isTV(panel.url)) applyTVMode(frame).catch(() => {});
  });

  wc.on('content-bounds-updated', event => event.preventDefault());
}

function createWindow() {
  configureSession();

  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080a0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  installNavigationGuards();
  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('closed', () => {
    panelState.clear();
    win = null;
  });
}

ipcMain.handle('mv-go-back', async (_event, { id }) => {
  const frame = getPanelFrame(id);
  if (!frame) return { ok: false, error: 'No se encontró el panel.' };
  try {
    await frame.executeJavaScript('history.back()', true);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('mv-reload-frame', (_event, { id }) => {
  const frame = getPanelFrame(id);
  if (!frame) return { ok: false, error: 'No se encontró el panel.' };
  try { frame.reload(); return { ok: true }; }
  catch (error) { return { ok: false, error: error?.message || String(error) }; }
});

ipcMain.handle('mv-set-zoom', async (_event, { id, zoom }) => {
  const panel = getPanel(id);
  if (!panel) return { ok: false, error: 'No se encontró el panel.' };
  panel.zoom = Math.max(0.25, Math.min(2, Number(zoom) || 1));
  const frame = getPanelFrame(id);
  if (frame) await applyZoomToFrame(frame, panel.zoom);
  return { ok: true, zoom: panel.zoom };
});

ipcMain.handle('mv-clear-frame', (_event, { id }) => {
  panelState.delete(id);
  return { ok: true };
});

ipcMain.handle('mv-clear-all', () => {
  panelState.clear();
  return { ok: true };
});

ipcMain.on('mv-register-panel', (_event, { id, url, zoom }) => {
  if (!id) return;
  panelState.set(id, {
    url: String(url || ''),
    zoom: Math.max(0.25, Math.min(2, Number(zoom) || 1))
  });
});

process.on('uncaughtException', error => send('mv-ui-error', { message: `Error de Electron: ${error?.stack || error}` }));
process.on('unhandledRejection', error => send('mv-ui-error', { message: `Error de promesa: ${error?.stack || error}` }));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (!win) createWindow();
});
