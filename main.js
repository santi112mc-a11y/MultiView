const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const path = require('path');

let win;
// Un WebContentsView independiente por panel.
// A diferencia de BrowserView, los paneles se administran como hijos separados
// del contentView de la ventana y no se reemplazan entre sí.
const views = new Map();

const TVLIBRE_HOSTS = ['tvlibreonline.me'];
const FORMULA_TIMER_HOSTS = ['formula-timer.com'];

// Dominios/patrones publicitarios comunes. Se usan solo para bloquear
// recursos claramente identificables como publicidad, sin bloquear el stream.
const AD_URL_PATTERNS = [
  /doubleclick\.net/i, /googlesyndication\.com/i, /googleadservices\.com/i,
  /adservice\.google\.com/i, /pagead2\.googlesyndication\.com/i,
  /popads\./i, /popcash\./i, /propellerads\./i, /adnxs\./i,
  /advertising\./i, /adsystem\./i, /adserver\./i, /adserver\./i,
  /banner\./i, /popup\./i, /clickunder/i, /onclickads/i, /exoclick\./i,
  /trafficjunky\./i, /juicyads\./i, /adsterra\./i
];

function looksLikeAdURL(url) {
  const u = String(url || '');
  return AD_URL_PATTERNS.some(re => re.test(u));
}

function hostMatches(host, list) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  return list.some(base => h === base || h.endsWith('.' + base));
}

function isTVLibreURL(url) {
  try { return hostMatches(new URL(url).hostname, TVLIBRE_HOSTS); } catch { return false; }
}

function isFormulaTimerURL(url) {
  try { return hostMatches(new URL(url).hostname, FORMULA_TIMER_HOSTS); } catch { return false; }
}

function clearAllViews() {
  for (const id of [...views.keys()]) removeView(id);
}

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
  win.webContents.on('did-finish-load', () => {
    console.log('MultiView renderer cargado correctamente');
  });

  // Permitir reproducción multimedia sin exigir un click en el reproductor.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'fullscreen'];
    callback(allowed.includes(permission));
  });

  // Filtro global de recursos publicitarios conocidos. No bloquea el video por
  // defecto; solo URLs que coinciden claramente con patrones de anuncios.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: looksLikeAdURL(details.url) });
  });

  win.on('resize', layoutViews);
  win.on('maximize', layoutViews);
  win.on('unmaximize', layoutViews);
  win.on('closed', () => {
    clearAllViews();
    win = null;
  });
}

const PANEL_HEADER_HEIGHT = 42;

function viewBounds(rect) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y + PANEL_HEADER_HEIGHT),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height - PANEL_HEADER_HEIGHT))
  };
}

function layoutViews() {
  if (!win) return;
  for (const [, item] of views) {
    item.view.setBounds(viewBounds(item.rect));
  }
}

function sendToUI(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function defaultZoomForURL(url) {
  return isFormulaTimerURL(url) ? 0.55 : 1;
}

function applyPageZoom(item) {
  if (!item || item.view.webContents.isDestroyed()) return;
  const currentURL = item.view.webContents.getURL() || item.url || '';
  try {
    // Conservamos el zoom elegido por el usuario al navegar dentro del mismo panel.
    // Al cargar una URL nueva, se usa el zoom inicial apropiado para ese sitio.
    if (typeof item.zoom !== 'number') item.zoom = defaultZoomForURL(currentURL);
    item.view.webContents.setZoomFactor(item.zoom);
    sendToUI('mv-zoom', { id: item.id, zoom: item.zoom });
  } catch {}
}

function setViewZoom(id, zoom) {
  const item = views.get(id);
  if (!item || item.view.webContents.isDestroyed()) return { ok:false, error:`No existe el panel ${id}.` };
  const value = Math.max(0.25, Math.min(2, Number(zoom) || 1));
  item.zoom = Math.round(value * 100) / 100;
  item.view.webContents.setZoomFactor(item.zoom);
  sendToUI('mv-zoom', { id, zoom:item.zoom });
  return { ok:true, zoom:item.zoom };
}

function createView(id, url, rect) {
  if (views.has(id)) removeView(id);

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  views.set(id, { view, rect, url, zoom: defaultZoomForURL(url) });
  win.contentView.addChildView(view);
  view.setBounds(viewBounds(rect));
  view.webContents.on('did-finish-load', () => {
    applyPageZoom(views.get(id));
    injectSiteMode(id);
    sendToUI('mv-loaded', { id, url: view.webContents.getURL() });
  });

  view.webContents.on('did-navigate', () => {
    applyPageZoom(views.get(id));
    injectSiteMode(id);
    sendToUI('mv-navigated', { id, url: view.webContents.getURL() });
  });

  // Evita que TVLibre o sus iframes naveguen hacia páginas de publicidad.
  const blockTVAdNavigation = (event, destinationURL) => {
    const currentURL = view.webContents.getURL();
    if (isTVLibreURL(currentURL) && (!isTVLibreURL(destinationURL) || looksLikeAdURL(destinationURL))) {
      event.preventDefault();
      sendToUI('mv-popup-blocked', { id });
    }
  };

  view.webContents.on('will-navigate', (event, destinationURL) => blockTVAdNavigation(event, destinationURL));
  view.webContents.on('will-frame-navigate', (event, details) => blockTVAdNavigation(event, details.url));
  view.webContents.on('will-redirect', (event, destinationURL) => blockTVAdNavigation(event, destinationURL));

  view.webContents.on('did-navigate-in-page', () => {
    injectSiteMode(id);
  });

  view.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      sendToUI('mv-error', { id, errorCode, errorDescription, url: validatedURL });
    }
  });

  view.webContents.on('render-process-gone', (_e, details) => {
    sendToUI('mv-error', { id, errorCode: details?.exitCode, errorDescription: `Render process ended: ${details?.reason || 'unknown'}` });
  });

  view.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) sendToUI('mv-error', { id, errorDescription: `${message} (${sourceId}:${line})` });
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    // Nunca abrir popups/publicidad en otra navegación del mismo panel.
    sendToUI('mv-popup-blocked', { id });
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

      // Ocultar elementos publicitarios comunes dentro de la propia página.
      const adSelector = [
        '[id*="advert" i]','[id*="banner" i]','[id*="popup" i]','[class*="advert" i]',
        '[class*="banner" i]','[class*="popup" i]','[class*="popunder" i]',
        'iframe[src*="doubleclick" i]','iframe[src*="googlesyndication" i]',
        'iframe[src*="adsystem" i]','iframe[src*="popads" i]'
      ].join(',');
      document.querySelectorAll(adSelector).forEach(el => el.style.setProperty('display','none','important'));

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
  try { win.contentView.removeChildView(item.view); } catch {}
  try { item.view.webContents.destroy(); } catch {}
  views.delete(id);
}

ipcMain.handle('mv-ping', () => ({ ok: true, message: 'MultiView IPC OK' }));

ipcMain.handle('mv-create-view', async (_e, data) => {
  try {
    if (!win || win.isDestroyed()) throw new Error('La ventana principal no está disponible.');
    const { id, url, rect } = data || {};
    if (!id) throw new Error('Falta el ID del panel.');
    if (!url) throw new Error('Falta la URL.');
    createView(id, url, rect);
    return { ok: true, id, url };
  } catch (error) {
    sendToUI('mv-ui-error', { message: error?.message || String(error) });
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('mv-remove-view', async (_e, { id }) => {
  try { removeView(id); return { ok: true }; }
  catch (error) { return { ok: false, error: error?.message || String(error) }; }
});

ipcMain.handle('mv-go-back', (_e, { id }) => {
  const item = views.get(id);
  if (!item) return { ok: false, error: `No existe el panel ${id}.` };
  if (item.view.webContents.canGoBack()) {
    item.view.webContents.goBack();
    return { ok: true };
  }
  return { ok: false, error: 'No hay una página anterior.' };
});

ipcMain.handle('mv-clear-all', () => {
  clearAllViews();
  return { ok: true };
});

ipcMain.handle('mv-navigate', async (_e, { id, url }) => {
  try {
    const item = views.get(id);
    if (!item) throw new Error(`No existe el panel ${id}.`);
    item.url = url;
    await item.view.webContents.loadURL(url);
    return { ok: true };
  } catch (error) {
    sendToUI('mv-ui-error', { message: error?.message || String(error) });
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('mv-set-zoom', (_e, { id, zoom }) => {
  try { return setViewZoom(id, zoom); }
  catch (error) { return { ok:false, error:error?.message || String(error) }; }
});

ipcMain.handle('mv-reload', (_e, { id }) => {
  const item = views.get(id);
  if (!item) return { ok: false, error: `No existe el panel ${id}.` };
  item.view.webContents.reload();
  return { ok: true };
});

ipcMain.handle('mv-update-rects', (_e, rects) => {
  if (!win || win.isDestroyed()) return { ok: false, error: 'Ventana no disponible.' };
  for (const r of Array.isArray(rects) ? rects : []) {
    const item = views.get(r.id);
    if (!item || !r.rect) continue;
    item.rect = r.rect;
    item.view.setBounds(viewBounds(r.rect));
  }
  return { ok: true };
});

process.on('uncaughtException', (error) => {
  sendToUI('mv-ui-error', { message: `Error de Electron: ${error?.stack || error}` });
});

process.on('unhandledRejection', (error) => {
  sendToUI('mv-ui-error', { message: `Error de promesa: ${error?.stack || error}` });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
