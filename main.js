const { app, BrowserWindow, session } = require('electron');
const path = require('path');

let win = null;

// Bloqueo conservador de publicidad/popups. Se aplica a las sesiones de los webviews.
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
    return BLOCKED_HOST_PARTS.some(x => host.includes(x)) ||
      /(?:^|[._/-])(ads?|adserver|advert|banner|popup|popunder)(?:[._/-]|$)/i.test(host + u.pathname) ||
      /(?:popunder|popup|adservice|doubleclick)/i.test(pathAndQuery);
  } catch { return false; }
}

function configureSession(ses) {
  if (ses.__mvConfigured) return;
  ses.__mvConfigured = true;
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // No bloquear documentos principales por nombre de dominio de TVLibre.
    callback({ cancel: looksLikeAd(details.url) });
  });
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
