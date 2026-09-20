const { app, BrowserWindow, session } = require('electron');
const path = require('path');

let win = null;

const BLOCKED_HOST_PARTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adservice.google.com', 'adnxs.com', 'exoclick.com', 'popads.net',
  'popcash.net', 'propellerads.com', 'trafficjunky.com', 'juicyads.com',
  'onclickalgo.com', 'adsterra.com', 'bet365', '1xbet', 'casino'
];

function looksLikeAd(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathAndQuery = (u.pathname + u.search).toLowerCase();
    return BLOCKED_HOST_PARTS.some(x => host === x || host.endsWith('.' + x) || host.includes(x)) ||
      /(?:^|[._/-])(ads?|adserver|advert|banner|popup|popunder)(?:[._/-]|$)/i.test(host + u.pathname) ||
      /(?:popunder|popup|adservice|doubleclick)/i.test(pathAndQuery);
  } catch { return false; }
}

function isTVLibre(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'tvlibreonline.me' || host.endsWith('.tvlibreonline.me');
  } catch { return false; }
}

function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}

function configureSession(ses) {
  if (!ses || ses.__mvConfigured) return;
  ses.__mvConfigured = true;

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ cancel: looksLikeAd(details.url) });
  });
}

function protectWebContents(contents) {
  if (!contents || contents.__mvProtected) return;
  contents.__mvProtected = true;
  configureSession(contents.session);

  // Nunca permitir que un panel cree una ventana externa/popup.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Bloqueo real en el proceso principal. El preventDefault de
  // <webview>.will-navigate en el renderer no es suficiente.
  contents.on('will-navigate', (event, navigationUrl) => {
    if (looksLikeAd(navigationUrl)) {
      event.preventDefault();
      return;
    }

    const current = contents.getURL();
    // TVLibre debe permanecer dentro de TVLibre en su navegación principal.
    // Sus recursos/iframes siguen pudiendo cargar normalmente.
    if (isTVLibre(current) && !isTVLibre(navigationUrl) && !sameOrigin(current, navigationUrl)) {
      event.preventDefault();
    }
  });

  contents.on('will-frame-navigate', (event, navigationUrl, isInPlace, isMainFrame) => {
    if (looksLikeAd(navigationUrl)) {
      event.preventDefault();
      return;
    }

    if (isMainFrame) {
      const current = contents.getURL();
      if (isTVLibre(current) && !isTVLibre(navigationUrl) && !sameOrigin(current, navigationUrl)) {
        event.preventDefault();
      }
    }
  });
}

app.on('web-contents-created', (_event, contents) => {
  // Captura BrowserWindow y <webview> antes de que puedan abrir popups.
  protectWebContents(contents);
});

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
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  configureSession(session.defaultSession);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
