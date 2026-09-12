import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DEFAULTS, dayKey } = require('../electron/core.cjs');
const ffmpeg = require('ffmpeg-static');
const root = path.resolve('work', 'e2e-' + Date.now());
const profile = path.join(root, 'profile');
await fs.mkdir(path.join(profile, 'captures'), { recursive: true });
const run = (args) => {
  const r = spawnSync(ffmpeg, args, { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || 'ffmpeg failed');
  return r;
};
const fixture = path.join(root, 'fictional.jpg');
run([
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'color=c=0xf3f0e9:s=1280x720',
  '-vf',
  "drawbox=x=0:y=0:w=220:h=720:color=0x292e36:t=fill,drawbox=x=270:y=90:w=930:h=540:color=0xffffff:t=fill,drawtext=text='DEMONSTRATION':x=306:y=135:fontsize=22:fontcolor=0xb95937,drawtext=text='A quiet space to think':x=306:y=210:fontsize=44:fontcolor=0x292e36,drawtext=text='Fictional content for automated testing':x=306:y=285:fontsize=24:fontcolor=0x626c78,drawbox=x=306:y=355:w=740:h=8:color=0xd8d9dc:t=fill,drawbox=x=306:y=387:w=630:h=8:color=0xd8d9dc:t=fill,drawbox=x=306:y=419:w=695:h=8:color=0xd8d9dc:t=fill,drawbox=x=306:y=451:w=480:h=8:color=0xd8d9dc:t=fill",
  '-frames:v',
  '1',
  '-update',
  '1',
  fixture,
]);
const fakeCamera = path.join(root, 'camera.y4m');
run([
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=640x360:rate=10',
  '-t',
  '2',
  '-pix_fmt',
  'yuv420p',
  fakeCamera,
]);
const music = path.join(root, 'tone.mp3');
run([
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=2',
  '-q:a',
  '8',
  music,
]);
const bytes = await fs.readFile(fixture),
  now = Date.now(),
  startedAt = now - 45 * 60000,
  sessionId = randomUUID();
const frames = [];
for (let i = 0; i < 24; i++) {
  const id = randomUUID();
  await fs.writeFile(path.join(profile, 'captures', id + '.jpg'), bytes);
  frames.push({
    id,
    at: startedAt + i * 60000,
    app: i < 14 ? 'Visual Studio Code' : i < 19 ? 'Netflix' : 'Google Chrome',
    category: i < 14 ? 'work' : i < 19 ? 'distraction' : 'unknown',
    display: 'Écran de démonstration',
    width: 1280,
    height: 720,
    bytes: bytes.length,
  });
}
const activity = frames.map((f) => ({
  from: f.at,
  to: f.at + 60000,
  ms: 60000,
  app: f.app,
  category: f.category,
}));
const briefStart = activity[10].from;
activity.splice(
  10,
  1,
  { from: briefStart, to: briefStart + 2000, ms: 2000, app: 'Terminal', category: 'work' },
  { from: briefStart + 2000, to: briefStart + 4000, ms: 2000, app: 'Firefox', category: 'unknown' },
  {
    from: briefStart + 4000,
    to: briefStart + 60000,
    ms: 56000,
    app: 'Visual Studio Code',
    category: 'work',
  },
);
await fs.writeFile(
  path.join(profile, 'state.json'),
  JSON.stringify({
    version: 1,
    settings: { ...DEFAULTS, interval: 10 },
    music: false,
    sessions: [
      {
        id: sessionId,
        startedAt,
        endedAt: now - 20 * 60000,
        status: 'finished',
        lastSeen: now - 20 * 60000,
        frames,
        activity,
        events: [{ at: startedAt, type: 'start' }],
      },
    ],
  }),
);
const env = {
  ...process.env,
  FOCUS_E2E: '1',
  FOCUS_TEST_DATA: profile,
  FOCUS_TEST_EXPORT: path.join(root, 'replay.mp4'),
  FOCUS_TEST_MUSIC: music,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
try {
  app = await electron.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-video-capture=' + fakeCamera,
      '.',
    ],
    env,
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await expect(page.getByRole('heading', { name: 'Votre journée', exact: true })).toBeVisible();
  await expect(page.locator('.filmstrip img').first()).toBeVisible();
  await page.locator('.image-surface img').evaluate((img) => img.decode());
  await expect(page.locator('.software-callout')).toHaveCount(0);
  await page.locator('.overview-block[title*="Firefox"]').first().click();
  await expect(
    page.locator('.group-breakdown').getByText('Terminal', { exact: true }),
  ).toBeVisible();
  await page.locator('.group-breakdown button').filter({ hasText: 'Firefox' }).click();
  await page
    .getByRole('combobox', { name: 'Classement · Firefox', exact: true })
    .selectOption('work');
  await expect
    .poll(() =>
      page.evaluate(() => window.focusReplay.state().then((s) => s.settings.appRules.firefox)),
    )
    .toBe('work');
  await page.getByRole('button', { name: 'Fermer le classement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plein écran', exact: true })).toHaveCount(0);
  const alignment = await page.evaluate(() => {
    const p = document.querySelector('.play-button').getBoundingClientRect();
    const t = document.querySelector('.transport').getBoundingClientRect();
    return Math.abs(p.x + p.width / 2 - t.x - t.width / 2);
  });
  expect(alignment).toBeLessThan(2);
  await page.screenshot({ path: path.join(root, 'replay-dark.png'), fullPage: true });
  await page.getByRole('slider', { name: 'Curseur de la timeline' }).fill(String(frames[5].at));
  await expect(page.locator('.timestamp span')).toHaveText('6 / 24');
  await page.getByRole('button', { name: 'Capture suivante', exact: true }).click();
  await expect(page.locator('.timestamp span')).toHaveText('7 / 24');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Arrêter la lecture', exact: true })).toBeVisible();
  await expect(page.locator('.timestamp span')).not.toHaveText('7 / 24');
  await page.getByRole('button', { name: 'Arrêter la lecture', exact: true }).click();
  await page.getByRole('slider', { name: 'Vitesse de lecture' }).fill('3');
  await page.locator('.timeline-scroll').hover();
  await page.mouse.wheel(0, -180);
  await expect
    .poll(() => page.getByRole('slider', { name: 'Zoom de la timeline' }).inputValue().then(Number))
    .toBeGreaterThan(1);
  await page.getByRole('slider', { name: 'Zoom de la timeline' }).fill('1');
  await page.getByRole('button', { name: 'Passer au thème clair' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(root, 'replay-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  expect(
    await page.evaluate(() => window.focusReplay.state().then((s) => s.settings.cameraEnabled)),
  ).toBe(false);
  const blocked = await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await page.getByRole('checkbox', { name: 'Ajouter une photo caméra aux captures' }).click();
  await expect(page.getByText('Autoriser les photos de votre caméra ?')).toBeVisible();
  expect(
    await page.evaluate(() => window.focusReplay.state().then((s) => s.settings.cameraEnabled)),
  ).toBe(false);
  await page.getByRole('button', { name: 'Autoriser les photos caméra', exact: true }).click();
  await page.getByRole('button', { name: 'Choisir un MP3', exact: true }).click();
  await expect(page.getByText('tone.mp3', { exact: true })).toBeVisible();
  const introPreview = page.getByRole('button', {
    name: 'Écouter · Au début de la session',
    exact: true,
  });
  await introPreview.click();
  await expect.poll(() => page.locator('audio').evaluate((a) => !a.paused)).toBe(true);
  await expect.poll(() => page.locator('audio').evaluate((a) => a.ended && !a.loop)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.musicState().then((s) => s.playing)))
    .toBe(false);
  for (const phase of ['launch', 'session'])
    await page.evaluate((phase) => window.focusReplay.pickMusic(phase), phase);
  const audioIds = await page.evaluate(() =>
    window.focusReplay.state().then((s) => Object.values(s.localAudio).map((a) => a.id)),
  );
  expect(new Set(audioIds).size).toBe(3);
  await app.evaluate(async ({ app }) => {
    const { createRequire } = process.getBuiltinModule('module');
    const req = createRequire(app.getAppPath() + '/package.json');
    const { Spotify } = req('./electron/spotify.cjs');
    globalThis.originalSpotifyMethods = {
      status: Spotify.prototype.status,
      search: Spotify.prototype.search,
      playlists: Spotify.prototype.playlists,
      request: Spotify.prototype.request,
    };
    Spotify.prototype.status = function () {
      return { connected: true, libraryAccess: true, redirect: 'http://127.0.0.1:43827/callback' };
    };
    Spotify.prototype.search = async function () {
      return {
        items: [
          {
            uri: 'spotify:track:' + 'a'.repeat(22),
            name: 'Focus test track',
            subtitle: 'Test artist',
            image: '',
          },
        ],
        more: false,
      };
    };
    Spotify.prototype.playlists = async function () {
      return {
        items: [
          {
            uri: 'spotify:playlist:' + 'b'.repeat(22),
            name: 'My test playlist',
            subtitle: 'Test owner',
            image: '',
          },
        ],
        more: false,
      };
    };
    Spotify.prototype.request = async function () {
      return { devices: [] };
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await page.getByRole('checkbox', { name: 'À l’ouverture', exact: true }).check();
  const launch = page
    .locator('.music-slot')
    .filter({ has: page.getByRole('checkbox', { name: 'À l’ouverture', exact: true }) });
  await launch.getByRole('button', { name: 'Spotify', exact: true }).click();
  await launch.getByRole('button', { name: 'Titres aléatoires', exact: true }).click();
  await launch
    .getByRole('textbox', { name: 'Rechercher un titre · À l’ouverture', exact: true })
    .fill('focus');
  await launch.getByRole('button', { name: 'Ajouter · Focus test track', exact: true }).click();
  await launch.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(
    launch.getByRole('button', { name: 'Retirer · Focus test track', exact: true }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'Pendant la session', exact: true }).check();
  const soundtrack = page
    .locator('.music-slot')
    .filter({ has: page.getByRole('checkbox', { name: 'Pendant la session', exact: true }) });
  await soundtrack.getByRole('button', { name: 'Spotify', exact: true }).click();
  await soundtrack.getByRole('button', { name: 'Une playlist', exact: true }).click();
  await soundtrack.getByRole('button', { name: 'Ajouter · My test playlist', exact: true }).click();
  await soundtrack.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'music-picker.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'À l’ouverture', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Pendant la session', exact: true }).uncheck();
  await app.evaluate(async ({ app }) => {
    const { createRequire } = process.getBuiltinModule('module');
    Object.assign(
      createRequire(app.getAppPath() + '/package.json')('./electron/spotify.cjs').Spotify.prototype,
      globalThis.originalSpotifyMethods,
    );
  });
  await page.screenshot({ path: path.join(root, 'settings-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retour au replay', exact: true }).click();
  await page.getByRole('button', { name: 'Commencer une session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay.state().then((s) => s.sessions.find((x) => !x.endedAt)?.status),
      ),
    )
    .toBe('recording');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay
          .state()
          .then((s) => s.sessions.find((x) => !x.endedAt)?.frames.length || 0),
      ),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.focusReplay
            .state()
            .then((s) => s.sessions.find((x) => !x.endedAt)?.frames.some((f) => f.camera) || false),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await expect(page.locator('.camera-pip img')).toBeVisible();
  await page.screenshot({ path: path.join(root, 'camera-pip.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toute la journée', exact: false }).click();
  await page.getByRole('slider', { name: 'Curseur de la timeline' }).fill(String(frames[2].at));
  const reviewed = await page.locator('.timestamp strong').textContent();

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.focusReplay
            .state()
            .then((s) => s.sessions.find((x) => !x.endedAt)?.frames.length || 0),
        ),
      { timeout: 16000 },
    )
    .toBeGreaterThan(1);

  expect(await page.locator('.timestamp strong').textContent()).toBe(reviewed);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: '2 min', exact: true }).click();
  const before = await page.evaluate(() =>
    window.focusReplay.state().then((s) => s.sessions.find((x) => !x.endedAt).frames.length),
  );
  await page.waitForTimeout(11000);
  expect(
    await page.evaluate(() =>
      window.focusReplay.state().then((s) => s.sessions.find((x) => !x.endedAt).frames.length),
    ),
  ).toBe(before);
  await page.evaluate(() => {
    window.__chimeNotes = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.__chimeNotes++;
      return create.apply(this, args);
    };
  });
  const endsAt = await page.evaluate(() =>
    window.focusReplay.state().then((s) => s.pauseTimer.endsAt),
  );
  await app.evaluate((_, at) => {
    global.__realFocusNow = Date.now;
    Date.now = () => at + 100;
  }, endsAt);
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.state().then((s) => s.pauseTimer.notified)))
    .toBe(true);
  await expect.poll(() => page.evaluate(() => window.__chimeNotes)).toBe(3);
  await app.evaluate(() => {
    Date.now = global.__realFocusNow;
    delete global.__realFocusNow;
  });
  expect(
    await page.evaluate(() =>
      window.focusReplay.state().then((s) => s.sessions.find((x) => !x.endedAt).status),
    ),
  ).toBe('paused');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, 'pause-ended.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reprendre', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay.state().then((s) => s.sessions.find((x) => !x.endedAt)?.status),
      ),
    )
    .toBe('recording');
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.focusReplay
            .state()
            .then((s) => s.sessions.find((x) => !x.endedAt).frames.filter((f) => f.camera).length),
        ),
      { timeout: 16000 },
    )
    .toBeGreaterThan(before);
  // Exercise the actual isolated overlay, its restricted IPC and persisted reasons.
  const openPrompt = async () => {
    await expect
      .poll(() => page.evaluate(() => window.focusReplay.checkinState().then((s) => s.busy)))
      .toBe(false);
    const opened = app.waitForEvent('window');
    expect(await page.evaluate(() => window.focusReplay.checkinPreview())).toBe(true);
    const overlay = await opened;
    await overlay.getByRole('heading', { name: 'Sur quoi tu travailles ?' }).waitFor();
    return overlay;
  };
  let overlay = await openPrompt();
  const denied = await overlay.evaluate(() =>
    window.focusReplay.start().then(
      () => false,
      () => true,
    ),
  );
  expect(denied).toBe(true);
  await overlay.getByRole('textbox', { name: 'Votre réponse' }).fill('Préparer une maquette');
  await overlay.screenshot({ path: path.join(root, 'checkin-work.png') });
  await overlay.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay
          .state()
          .then((s) => s.sessions.find((x) => !x.endedAt).events.at(-1).text),
      ),
    )
    .toBe('Préparer une maquette');
  overlay = await openPrompt();
  await expect(overlay.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible();
  await overlay.screenshot({ path: path.join(root, 'checkin-repeat.png') });
  const repeatedClosed = overlay.waitForEvent('close');
  await overlay.getByRole('button', { name: 'Toujours sur « Préparer une maquette »' }).click();
  await repeatedClosed;
  overlay = await openPrompt();
  await expect(overlay.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible();
  const reasonWindow = app.waitForEvent('window');
  await overlay.getByRole('button', { name: 'J’ai arrêté de travailler', exact: true }).click();
  const reason = await reasonWindow;
  await expect(reason.getByText('Pourquoi tu t’es arrêté ?', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.focusReplay.state().then((s) => s.sessions.find((x) => !x.endedAt).status),
    ),
  ).toBe('paused');
  await reason.getByRole('button', { name: 'Fatigue', exact: true }).click();
  await reason.screenshot({ path: path.join(root, 'checkin-reason.png') });
  expect(await reason.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await reason.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay
          .state()
          .then((s) => s.sessions.find((x) => !x.endedAt).events.at(-1).text),
      ),
    )
    .toBe('Fatigue');
  await page.locator('.timeline-note').last().click();
  await expect(page.locator('.marker-detail').getByText('Fatigue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Commencer une session', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.camera-status')).toHaveText('Caméra autorisée');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay.state().then((s) => s.sessions.some((x) => !x.endedAt)),
      ),
    )
    .toBe(false);
  await page.getByRole('button', { name: 'Pauses & récompenses', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Activer les récompenses' }).click();
  await expect(page.getByRole('checkbox', { name: 'Activer les récompenses' })).toBeChecked();
  await expect(page.getByText('min de travail disponibles', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nom de la récompense' }).fill('Une promenade');
  await page.getByRole('spinbutton', { name: 'Durée de la récompense' }).fill('15');
  await page.getByRole('spinbutton', { name: 'Minutes de travail nécessaires' }).fill('30');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Une promenade', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'rewards.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retour au replay', exact: true }).click();
  await page.getByRole('button', { name: 'Exporter en MP4', exact: true }).click();

  await expect(page.getByText('Vidéo prête : replay.mp4')).toBeVisible({ timeout: 90000 });
  const mp4 = await fs.stat(path.join(root, 'replay.mp4'));
  expect(mp4.size).toBeGreaterThan(1000);
  run([
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    path.join(root, 'replay.mp4'),
    '-frames:v',
    '1',
    '-update',
    '1',
    path.join(root, 'export-frame.png'),
  ]);
  run([
    '-hide_banner',
    '-loglevel',
    'error',
    '-sseof',
    '-0.2',
    '-i',
    path.join(root, 'replay.mp4'),
    '-frames:v',
    '1',
    '-update',
    '1',
    path.join(root, 'export-camera-frame.png'),
  ]);

  await page.getByRole('button', { name: 'Passer au thème sombre' }).click();
  await page.waitForTimeout(250);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(920, 760));
  await page.screenshot({ path: path.join(root, 'small-window.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1640, 1060));
  await page.screenshot({ path: path.join(root, 'wide-window.png'), fullPage: true });
  expect(errors).toEqual([]);
  await app.close();
  app = null;
  await fs.writeFile(
    path.join(root, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'scrub',
          'transport',
          'dark-light',
          'mp3-import-play',
          'one-click-start',
          'background-capture',
          'stable-review-cursor',
          'pause-resume-stop',
          'timed-pause-chime-and-manual-resume',
          'camera-consent-and-repeated-photos',
          'camera-pip-export',
          'custom-rewards',
          'mp4-export-decode',
          'small-wide-layout',
          'no-renderer-errors',
        ],
        day: dayKey(now),
      },
      null,
      2,
    ),
  );
  console.log('E2E PASS. Evidence: ' + root);
} catch (e) {
  if (page) {
    await page.screenshot({ path: path.join(root, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(
      'UI:',
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
      'Errors:',
      errors,
    );
  }
  throw e;
} finally {
  if (app) await app.close();
}
