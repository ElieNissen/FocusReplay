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
  await page.screenshot({ path: path.join(root, 'replay-dark.png'), fullPage: true });
  await page.getByRole('slider', { name: 'Curseur de la timeline' }).fill(String(frames[5].at));
  await expect(page.locator('.timestamp span')).toHaveText('6 / 24');
  await page.getByRole('button', { name: 'Capture suivante', exact: true }).click();
  await expect(page.locator('.timestamp span')).toHaveText('7 / 24');
  await page.getByRole('button', { name: 'Lire le replay', exact: true }).click();
  await expect(page.locator('.timestamp span')).not.toHaveText('7 / 24');
  await page.getByRole('button', { name: 'Arrêter la lecture', exact: true }).click();
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
  await expect(page.getByText('Musique de démarrage prête')).toBeVisible();
  await page.getByRole('button', { name: 'Écouter un extrait', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => !a.paused)).toBe(true);
  await page.getByRole('button', { name: 'Arrêter l’écoute', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'settings-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retour au replay', exact: true }).click();
  await page.getByRole('button', { name: 'Commencer une session', exact: true }).click();
  await expect(page.getByText('Capture active', { exact: true })).toBeVisible();
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
  await expect(page.getByText('Capture active', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByText('Caméra autorisée', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pauses & récompenses', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Activer les points' }).click();
  await expect(page.getByRole('checkbox', { name: 'Activer les points' })).toBeChecked();
  await page.getByRole('spinbutton', { name: 'Points gagnés par heure' }).fill('120');
  await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nom de la récompense' }).fill('Une promenade');
  await page.getByRole('spinbutton', { name: 'Durée de la récompense' }).fill('15');
  await page.getByRole('spinbutton', { name: 'Coût de la récompense' }).fill('30');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Une promenade', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'rewards.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retour au replay', exact: true }).click();
  await page.getByRole('button', { name: 'Exporter en MP4', exact: true }).click();
  await page.getByRole('button', { name: 'Créer le MP4', exact: true }).click();
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
  await page.getByRole('button', { name: 'Fermer l’export', exact: true }).click();
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
