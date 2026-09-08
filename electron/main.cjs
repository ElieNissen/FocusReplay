const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen,
  nativeImage,
  powerMonitor,
  Tray,
  Menu,
  Notification,
  dialog,
  shell,
  protocol,
  net,
  nativeTheme,
} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { Recorder, selectFrames } = require('./core.cjs');
const { startTracker } = require('./tracker.cjs');
const { exportVideo } = require('./export.cjs');
const { exportName } = require('./export-overlay.cjs');

const testMode = !app.isPackaged && process.env.FOCUS_E2E === '1';
const devUrl =
  !app.isPackaged && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(process.env.FOCUS_DEV_URL || '')
    ? process.env.FOCUS_DEV_URL
    : null;
const customDataDir = app.commandLine.getSwitchValue('focus-data-dir');
if (customDataDir) app.setPath('userData', path.resolve(customDataDir));
else if (!app.isPackaged && process.env.FOCUS_TEST_DATA)
  app.setPath('userData', path.resolve(process.env.FOCUS_TEST_DATA));
app.setName('FocusReplay');
if (process.platform === 'win32') app.setAppUserModelId('app.focusreplay.desktop');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (devUrl)
  process.on('message', (message) => {
    if (message?.type === 'focus-dev-restart') app.quit();
  });
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'focusmedia',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
let main,
  widget,
  tray,
  recorder,
  tracker,
  timer,
  quitting = false,
  closing = false,
  exportJob = null,
  exportCompletion = null,
  exportState = null,
  lastReminder = 0,
  lastNudge = 0;
let cameraConsent = false,
  cameraPending = null;
const dataDir = () => app.getPath('userData');
const safe =
  (fn) =>
  (...args) =>
    Promise.resolve(fn(...args)).catch((e) => {
      if (recorder) {
        recorder.warning = e.message || 'Une opération a échoué.';
        recorder.changed();
      }
    });
const send = (channel, payload) => {
  for (const w of [main, widget]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
};
function icon() {
  const size = 32,
    bytes = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const ring =
        Math.abs(Math.hypot(x - 15.5, y - 15.5) - 9) < 2 ||
        (x >= 14 && x <= 18 && y >= 12 && y <= 20);
      bytes[i] = ring ? 236 : 72;
      bytes[i + 1] = ring ? 241 : 100;
      bytes[i + 2] = ring ? 250 : 220;
      bytes[i + 3] = 255;
    }
  return nativeImage.createFromBitmap(bytes, { width: size, height: size });
}
function secureWindow(w) {
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.session.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(
      wc === main?.webContents &&
        permission === 'media' &&
        cameraConsent &&
        recorder.active?.status === 'recording' &&
        !recorder.systemPaused &&
        details.mediaTypes?.length > 0 &&
        details.mediaTypes.every((t) => t === 'video'),
    ),
  );
  w.webContents.session.setPermissionCheckHandler(
    (wc, permission, _origin, details) =>
      wc === main?.webContents &&
      permission === 'media' &&
      cameraConsent &&
      recorder.active?.status === 'recording' &&
      !recorder.systemPaused &&
      details.mediaType === 'video',
  );
}
function showMain() {
  main.show();
  main.focus();
}
function createMain() {
  main = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: '#191b1e',
    title: 'FocusReplay',
    icon: icon(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  secureWindow(main);
  if (devUrl) main.loadURL(devUrl);
  else main.loadFile(path.join(__dirname, '../dist/index.html'));
  main.once('ready-to-show', () => main.show());
  main.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      main.hide();
    }
  });
}
function updateWidget() {
  const enabled = recorder.data.settings.widget && recorder.active;
  if (!enabled) {
    if (widget && !widget.isDestroyed()) widget.destroy();
    widget = null;
    return;
  }
  if (widget && !widget.isDestroyed()) return;
  const bounds = screen.getPrimaryDisplay().workArea;
  widget = new BrowserWindow({
    width: 380,
    height: 74,
    x: bounds.x + bounds.width - 400,
    y: bounds.y + 20,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#191b1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  secureWindow(widget);
  widget.setContentProtection(true);
  if (devUrl) widget.loadURL(devUrl + '#widget');
  else widget.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'widget' });
}
function updateTray() {
  const s = recorder.active;
  tray.setToolTip(
    `FocusReplay · ${s ? (s.status === 'paused' || recorder.systemPaused ? 'En pause' : 'Capture active') : 'Prêt'}`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir FocusReplay', click: showMain },
      { type: 'separator' },
      ...(s
        ? [
            {
              label: s.status === 'paused' ? 'Reprendre' : 'Pause',
              click: safe(() => recorder.pause()),
            },
            { label: 'Terminer la session', click: safe(() => recorder.stop()) },
          ]
        : [{ label: 'Commencer une session', click: safe(startSession) }]),
      { type: 'separator' },
      { label: 'Quitter (arrête la capture)', click: () => app.quit() },
    ]),
  );
}
async function captureScreen(settings) {
  if (testMode) {
    const width = 1280,
      height = 720,
      pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const line = x > 260 && x < 1020 && y > 180 && y < 560 && y % 48 < 10;
        const side = x < 220;
        pixels[i] = line ? 128 : side ? 65 : 235;
        pixels[i + 1] = line ? 142 : side ? 60 : 239;
        pixels[i + 2] = line ? 158 : side ? 56 : 243;
        pixels[i + 3] = 255;
      }
    return {
      bytes: nativeImage.createFromBitmap(pixels, { width, height }).toJPEG(70),
      display: 'Écran de test',
      width,
      height,
    };
  }
  const displays = screen.getAllDisplays();
  const display = settings.displayId
    ? displays.find((d) => String(d.id) === settings.displayId)
    : screen.getPrimaryDisplay();
  if (!display)
    throw new Error('L’écran choisi est déconnecté. Choisissez un écran dans les réglages.');
  const targetWidth = Math.min(
    settings.width,
    Math.round(display.size.width * display.scaleFactor),
  );
  const targetHeight = Math.round((targetWidth * display.size.height) / display.size.width);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: targetWidth, height: targetHeight },
    fetchWindowIcons: false,
  });
  const source = sources.find((s) => s.display_id === String(display.id));
  if (!source || source.thumbnail.isEmpty())
    throw new Error('Capture indisponible pour cet écran. Réessayez ou changez d’écran.');
  const image = source.thumbnail.resize({ width: targetWidth });
  const dimensions = image.getSize();
  return {
    bytes: image.toJPEG(settings.quality),
    display: `Écran ${displays.indexOf(display) + 1}`,
    ...dimensions,
  };
}
async function capture(settings) {
  const at = Date.now();
  const [shot, webcam] = await Promise.all([
    captureScreen(settings),
    settings.cameraEnabled && cameraConsent ? requestCamera() : Promise.resolve(null),
  ]);
  return { ...shot, at, camera: webcam?.bytes ? webcam : null, cameraWarning: webcam?.error || '' };
}
function requestCamera() {
  if (!main || main.isDestroyed() || !cameraConsent || !recorder.active || recorder.systemPaused)
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const timeout = setTimeout(() => {
      if (cameraPending?.id === requestId) {
        cameraPending = null;
        resolve({
          error: 'Caméra indisponible pour cette capture. L’écran continue d’être enregistré.',
        });
      }
    }, 5000);
    cameraPending = {
      id: requestId,
      done: (result) => {
        clearTimeout(timeout);
        cameraPending = null;
        resolve(result);
      },
    };
    main.webContents.send('focus:camera-request', requestId);
  });
}
function stopCamera() {
  cameraPending?.done(null);
  send('focus:camera-stop');
}
async function startSession() {
  const id = await recorder.start();
  if (!testMode && !tracker) tracker = startTracker(recorder.data.settings.browserHints);
  lastReminder = Date.now();
  lastNudge = Date.now();
  await recorder.tick();
  return id;
}
function notify(title, body) {
  if (testMode) return;
  const fallback = () =>
    tray?.displayBalloon({ title, content: body, icon: icon(), noSound: true });
  if (!Notification.isSupported()) return fallback();
  const notification = new Notification({ title, body, icon: icon(), silent: true });
  notification.on('click', showMain);
  notification.on('failed', fallback);
  notification.show();
}
function bind(name, handler) {
  ipcMain.handle('focus:' + name, (event, ...args) => {
    if (
      ![main?.webContents, widget?.webContents].includes(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error('Origine non autorisée.');
    return handler(...args);
  });
}
function exportChanged(value) {
  exportState = value;
  send('focus:export', value);
}
async function beginExport(options = {}) {
  options = { fps: 2, height: 1080, ...options };
  if (exportJob) throw new Error('Un export est déjà en cours.');
  if (
    !Number.isInteger(options.fps) ||
    options.fps < 1 ||
    options.fps > 8 ||
    ![720, 1080].includes(options.height)
  )
    throw new Error('Réglages d’export invalides.');
  if (options.day && !/^\d{4}-\d{2}-\d{2}$/.test(options.day)) throw new Error('Date invalide.');
  for (const key of ['from', 'to'])
    if (options[key] != null && (!Number.isFinite(options[key]) || options[key] < 0))
      throw new Error('Plage invalide.');
  const controller = new AbortController();
  exportJob = controller;
  let frames = [];
  let activity = [];
  try {
    const previewFrames = selectFrames(recorder.data.sessions, options);
    if (!previewFrames.length) throw new Error('Aucune capture dans cette sélection.');
    const selected =
      testMode && process.env.FOCUS_TEST_EXPORT
        ? { filePath: process.env.FOCUS_TEST_EXPORT }
        : await dialog.showSaveDialog(main, {
            title: 'Exporter le replay',
            defaultPath: path.join(
              app.getPath('videos'),
              exportName(previewFrames, Boolean(options.sessionId)),
            ),
            filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }],
          });
    if (!selected.filePath || selected.canceled) {
      exportJob = null;
      return null;
    }
    const target = selected.filePath.endsWith('.mp4')
      ? selected.filePath
      : selected.filePath + '.mp4';
    if (
      path
        .resolve(target)
        .toLowerCase()
        .startsWith(path.resolve(dataDir()).toLowerCase() + path.sep)
    )
      throw new Error('Choisissez un dossier hors des données temporaires de FocusReplay.');
    await recorder.run(async () => {
      frames = selectFrames(recorder.data.sessions, options);
      const sessionIds = new Set(frames.map((f) => f.sessionId));
      activity = recorder.data.sessions
        .filter((s) => sessionIds.has(s.id))
        .flatMap((s) => s.activity)
        .filter(
          (a) =>
            a.to >= frames[0]?.at &&
            (!options.day || new Date(a.from).toLocaleDateString('en-CA') === options.day),
        )
        .map((a) => ({ ...a }));
      for (const f of frames) recorder.pins.add(f.id);
    });
    if (!frames.length) throw new Error('Aucune capture dans cette sélection.');
    exportChanged({ status: 'running', progress: 0, count: frames.length });
    const binary = require('ffmpeg-static').replace(
      'app.asar' + path.sep,
      'app.asar.unpacked' + path.sep,
    );
    exportCompletion = exportVideo({
      frames,
      activity,
      framePath: (id) => recorder.framePath(id),
      cameraPath: (id) => recorder.cameraPath(id),
      includeCamera: options.includeCamera !== false,
      target,
      fps: options.fps,
      height: options.height,
      tempRoot: path.join(dataDir(), 'export-temp'),
      signal: controller.signal,
      binary,
      onProgress: (progress) =>
        exportChanged({ status: 'running', progress, count: frames.length }),
    })
      .then(() => {
        exportChanged({ status: 'done', progress: 100, name: path.basename(target), target });
        if (!testMode) shell.showItemInFolder(target);
      })
      .catch((e) =>
        exportChanged({
          status: controller.signal.aborted ? 'cancelled' : 'error',
          message: controller.signal.aborted ? 'Export annulé.' : e.message,
        }),
      )
      .finally(() => {
        for (const f of frames) recorder.pins.delete(f.id);
        exportJob = null;
      });
    return true;
  } catch (e) {
    for (const f of frames) recorder.pins.delete(f.id);
    exportJob = null;
    throw e;
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => main && showMain());
  app
    .whenReady()
    .then(async () => {
      await fs.mkdir(dataDir(), { recursive: true });
      // Export staging is private, generated by this application and safe to clear after a crash.
      await fs.rm(path.join(dataDir(), 'export-temp'), { recursive: true, force: true });
      recorder = new Recorder({
        dir: dataDir(),
        now: () => Date.now(),
        capture,
        activity: () =>
          testMode ? { app: 'Éditeur de test', category: 'work' } : tracker?.current(),
        idle: () => (testMode ? 0 : powerMonitor.getSystemIdleTime()),
      });
      await recorder.init();
      cameraConsent = recorder.data.settings.cameraEnabled;
      protocol.handle('focusmedia', async (request) => {
        try {
          const url = new URL(request.url);
          let file;
          if (url.hostname === 'capture') {
            const id = url.pathname.slice(1);
            if (!recorder.hasFrame(id)) return new Response('Capture expirée', { status: 404 });
            file = recorder.framePath(id);
          } else if (url.hostname === 'camera') {
            const id = url.pathname.slice(1);
            if (!recorder.data.sessions.some((s) => s.frames.some((f) => f.id === id && f.camera)))
              return new Response('Photo expirée', { status: 404 });
            file = recorder.cameraPath(id);
          } else if (url.hostname === 'music' && recorder.data.music && url.pathname === '/track')
            file = path.join(dataDir(), 'music.mp3');
          else return new Response('Introuvable', { status: 404 });
          return await net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
        } catch {
          return new Response('Introuvable', { status: 404 });
        }
      });
      createMain();
      tray = new Tray(icon());
      tray.on('double-click', showMain);
      updateTray();
      recorder.on('change', (state) => {
        if (!recorder.active || recorder.active.status === 'paused' || recorder.systemPaused)
          stopCamera();
        if (
          (!recorder.active || recorder.active.status === 'paused' || recorder.systemPaused) &&
          tracker
        ) {
          tracker.stop();
          tracker = null;
        } else if (
          recorder.active?.status === 'recording' &&
          !recorder.systemPaused &&
          !testMode &&
          !tracker
        )
          tracker = startTracker(recorder.data.settings.browserHints);
        send('focus:change', state);
        updateTray();
        updateWidget();
      });
      recorder.on('break-ended', (reward) => {
        notify(
          'Pause terminée',
          `${reward.name} : le temps prévu est écoulé. Reprenez quand vous êtes prêt.`,
        );
        send('focus:break-ended', { name: reward.name });
      });
      bind('state', () => ({ ...recorder.snapshot(), exportState, version: app.getVersion() }));
      bind('screens', () =>
        screen.getAllDisplays().map((d, i) => ({
          id: String(d.id),
          name: `Écran ${i + 1} · ${d.size.width} × ${d.size.height}`,
        })),
      );
      bind('start', startSession);
      bind('pause', () => {
        stopCamera();
        return recorder.pause();
      });
      bind('stop', () => {
        stopCamera();
        return recorder.stop();
      });
      bind('pauseFor', (minutes) => {
        stopCamera();
        return recorder.pauseFor(minutes);
      });
      bind('settings', async (settings) => {
        const hints = recorder.data.settings.browserHints;
        if (settings.cameraEnabled === false) {
          cameraConsent = false;
          stopCamera();
        }
        if (settings.cameraEnabled === true && !cameraConsent)
          throw new Error('Autorisez d’abord la caméra dans les réglages.');
        await recorder.settings(settings);
        if (!testMode && hints !== recorder.data.settings.browserHints) {
          tracker?.stop();
          tracker =
            recorder.active?.status === 'recording' && !recorder.systemPaused
              ? startTracker(recorder.data.settings.browserHints)
              : null;
        }
        nativeTheme.themeSource = recorder.data.settings.theme;
      });
      bind('allowCamera', async () => {
        cameraConsent = true;
        await recorder.settings({ cameraEnabled: true });
      });
      bind('cameraFrame', (result) => {
        if (!cameraPending || result?.requestId !== cameraPending.id) return;
        if (!cameraConsent || recorder.active?.status !== 'recording' || recorder.systemPaused)
          return cameraPending.done(null);
        if (
          typeof result.jpeg !== 'string' ||
          result.jpeg.length > 2000000 ||
          !result.jpeg.startsWith('data:image/jpeg;base64,')
        )
          return cameraPending.done({
            error:
              'Caméra non disponible (' +
              ([
                'NotAllowedError',
                'NotReadableError',
                'NotFoundError',
                'InvalidStateError',
                'AbortError',
              ].includes(result.error)
                ? result.error
                : 'capture non prête') +
              '). Vérifiez la caméra par défaut et son autorisation dans Windows.',
          });
        const image = nativeImage.createFromDataURL(result.jpeg);
        const size = image.getSize();
        if (image.isEmpty() || size.width > 1280 || size.height > 1280)
          return cameraPending.done({ error: 'Image caméra invalide.' });
        cameraPending.done({ bytes: image.toJPEG(65), at: Date.now() });
      });
      bind('saveReward', (value) => recorder.saveReward(value));
      bind('deleteReward', (id) => recorder.deleteReward(id));
      bind('redeemReward', (id) => {
        stopCamera();
        return recorder.redeemReward(id);
      });
      bind('finishBreak', () => recorder.finishBreak());
      bind('pickMusic', async () => {
        const selected =
          testMode && process.env.FOCUS_TEST_MUSIC
            ? { filePaths: [process.env.FOCUS_TEST_MUSIC] }
            : await dialog.showOpenDialog(main, {
                title: 'Choisir la musique de démarrage',
                properties: ['openFile'],
                filters: [{ name: 'Musique MP3', extensions: ['mp3'] }],
              });
        if (!selected.filePaths?.length) return;
        const file = selected.filePaths[0];
        const stat = await fs.stat(file);
        if (stat.size > 100 * 1024 * 1024) throw new Error('Choisissez un MP3 de moins de 100 Mo.');
        await recorder.run(async () => {
          await fs.copyFile(file, path.join(dataDir(), 'music.mp3'));
          recorder.data.music = true;
          await recorder.save();
          recorder.changed();
        });
      });
      bind('removeMusic', () =>
        recorder.run(async () => {
          recorder.data.music = false;
          await fs.rm(path.join(dataDir(), 'music.mp3'), { force: true });
          await recorder.save();
          recorder.changed();
        }),
      );
      bind('deleteSession', (id) => recorder.deleteSession(id));
      bind('deleteFrame', (id) => recorder.deleteFrame(id));
      bind('export', beginExport);
      bind('cancelExport', () => exportJob?.abort());
      bind('openExport', () => {
        if (exportState?.status === 'done') shell.showItemInFolder(exportState.target);
      });
      bind('openData', () => shell.openPath(dataDir()));
      bind('showMain', showMain);
      powerMonitor.on(
        'lock-screen',
        safe(() => {
          stopCamera();
          return recorder.systemPause(true);
        }),
      );
      powerMonitor.on(
        'suspend',
        safe(() => {
          stopCamera();
          return recorder.systemPause(true);
        }),
      );
      powerMonitor.on(
        'unlock-screen',
        safe(() => recorder.systemPause(false)),
      );
      powerMonitor.on(
        'resume',
        safe(() => recorder.systemPause(powerMonitor.getSystemIdleState(300) === 'locked')),
      );
      timer = setInterval(
        safe(async () => {
          await recorder.tick();
          const s = recorder.active,
            settings = recorder.data.settings,
            now = Date.now();
          if (s?.status === 'recording' && !recorder.systemPaused) {
            if (
              settings.reminderMinutes &&
              now - lastReminder >= settings.reminderMinutes * 60000
            ) {
              notify('FocusReplay', 'Ta session continue. Toujours sur ce que tu voulais faire ?');
              lastReminder = now;
            }
            const last = s.activity.at(-1);
            if (
              settings.distractionReminder &&
              last?.category === 'distraction' &&
              last.ms >= 60000 &&
              now - lastNudge > 600000
            ) {
              notify(
                'Un détour ?',
                `${last.app} semble lié à une distraction. À toi de voir si c’est le bon moment.`,
              );
              lastNudge = now;
            }
          }
        }),
        2000,
      );
      nativeTheme.themeSource = recorder.data.settings.theme;
    })
    .catch((e) => {
      dialog.showErrorBox('FocusReplay', e.message);
      quitting = true;
      app.quit();
    });
  app.on('before-quit', (e) => {
    if (quitting) return;
    e.preventDefault();
    if (closing) return;
    closing = true;
    clearInterval(timer);
    tracker?.stop();
    stopCamera();
    exportJob?.abort();
    Promise.allSettled([recorder?.stop(), exportCompletion]).finally(() => {
      quitting = true;
      app.quit();
    });
  });
  app.on('window-all-closed', () => {});
}
