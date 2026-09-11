const { BrowserWindow } = require('electron');
let viewer;
async function openProfileViewer(origin) {
  const target = new URL(origin);
  if (
    target.protocol !== 'https:' &&
    !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
  )
    throw Error('Adresse du site invalide.');
  if (viewer && !viewer.isDestroyed()) viewer.close();
  const w = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 420,
    title: 'FocusReplay · Profils',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#191b1e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'focus-profile-viewer',
    },
  });
  viewer = w;
  w.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  w.webContents.session.setPermissionCheckHandler(() => false);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const allow = (event, url) => {
    if (new URL(url).origin !== target.origin) event.preventDefault();
  };
  w.webContents.on('will-navigate', allow);
  w.webContents.on('will-redirect', allow);
  w.once('ready-to-show', () => {
    if (!w.isDestroyed()) w.show();
  });
  w.on('closed', () => {
    if (viewer === w) viewer = null;
  });
  try {
    await w.loadURL(target.origin);
  } catch {
    if (!w.isDestroyed()) w.destroy();
    throw Error('Impossible de joindre le site. Réessayez lorsque la connexion est disponible.');
  }
}
module.exports = { openProfileViewer };
