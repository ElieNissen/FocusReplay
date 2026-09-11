import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  { DEFAULTS } = require('../electron/core.cjs');
const root = path.resolve('work', 'day-overview-' + Date.now()),
  profile = path.join(root, 'profile');
await fs.mkdir(path.join(profile, 'captures'), { recursive: true });
const at = new Date();
at.setHours(8, 0, 0, 0);
const start = +at,
  hour = 3600000;
const fixture = path.join(root, 'fictional.jpg');
const generated = spawnSync(
  require('ffmpeg-static'),
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x282c34:s=1280x720',
    '-frames:v',
    '1',
    '-update',
    '1',
    fixture,
  ],
  { windowsHide: true, encoding: 'utf8' },
);
if (generated.status !== 0) throw Error(generated.stderr);
const bytes = await fs.readFile(fixture);
const sessions = [];
for (const [begin, finish] of [
  [0, 4],
  [5, 10],
]) {
  const frames = [],
    activity = [],
    events = [
      { at: start + begin * hour, type: 'start' },
      { at: start + finish * hour, type: 'stop' },
    ];
  if (begin === 0)
    events.push(
      { at: start + 2 * hour, type: 'pause' },
      { at: start + 2.25 * hour, type: 'resume' },
    );
  for (let t = start + begin * hour; t < start + finish * hour; t += 2000) {
    if (begin === 0 && t >= start + 2 * hour && t < start + 2.25 * hour) continue;
    const n = Math.floor((t - start) / 2000),
      app =
        n % 20 === 0
          ? 'Explorateur Windows'
          : Math.floor((t - start) / hour) % 2
            ? 'Brave'
            : 'Notion';
    activity.push({
      from: t,
      to: t + 2000,
      ms: 2000,
      app,
      category: app === 'Notion' ? 'work' : 'unknown',
    });
    if (n % 150 === 0) {
      const id = randomUUID();
      await fs.writeFile(path.join(profile, 'captures', id + '.jpg'), bytes);
      frames.push({
        id,
        at: t,
        app,
        category: 'work',
        width: 1280,
        height: 720,
        bytes: bytes.length,
        display: 'Test',
      });
    }
  }
  sessions.push({
    id: randomUUID(),
    startedAt: start + begin * hour,
    endedAt: start + finish * hour,
    status: 'ended',
    frames,
    activity,
    events,
  });
}
await fs.writeFile(
  path.join(profile, 'state.json'),
  JSON.stringify({ version: 1, settings: { ...DEFAULTS, theme: 'dark' }, sessions }),
);
for (const [i, text] of ['Rédaction', 'Toujours rédaction', 'Fatigue'].entries())
  sessions[0].events.push({
    id: randomUUID(),
    type: 'checkin',
    action: 'answer',
    text,
    at: start + 600000 + i * 10000,
  });
await fs.writeFile(
  path.join(profile, 'state.json'),
  JSON.stringify({ version: 1, settings: { ...DEFAULTS, theme: 'dark' }, sessions }),
);
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, FOCUS_E2E: '1', FOCUS_TEST_DATA: profile },
});
try {
  const page = await app.firstWindow();
  await page.locator('.overview-block').first().waitFor();
  await expect(page.locator('.software-callout')).toHaveCount(0);
  expect(await page.locator('.overview-block').count()).toBeLessThan(16);
  await expect(page.locator('.timeline-gap').getByText('Pause', { exact: true })).toBeVisible();
  await expect(
    page.locator('.timeline-gap').getByText('Hors session', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(root, 'full-day.png'), fullPage: true });
  await page.getByRole('slider', { name: 'Curseur de la timeline' }).fill(String(start + hour));
  const before = await page.locator('.timestamp strong').textContent();
  await page.keyboard.press('d');
  await expect(page.locator('.timestamp strong')).not.toHaveText(before);
  await page.keyboard.press('q');
  await expect(page.locator('.timestamp strong')).toHaveText(before);
  await page
    .getByRole('slider', { name: 'Curseur de la timeline' })
    .fill(String(start + 2.1 * hour));
  await expect(page.locator('.preview-gap')).toHaveText('Pause');
  await page.evaluate(() => {
    window.__firstThumbnail = document.querySelector('.filmstrip img');
  });
  await page.getByRole('slider', { name: 'Zoom de la timeline' }).fill('4');
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => document.querySelector('.filmstrip img') === window.__firstThumbnail),
  ).toBe(true);
  expect(
    await page.locator('.timeline-inner').evaluate((e) => e.getBoundingClientRect().height),
  ).toBe(224);
  await page.screenshot({ path: path.join(root, 'zoom-pause.png'), fullPage: true });
  await page
    .getByRole('button', { name: 'Masquer cette capture dans le partage', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Masqué en ligne · original local', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.privacy-badge')).toBeVisible();
  for (const [width, height] of [
    [860, 680],
    [1440, 980],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, [width, height]) =>
        BrowserWindow.getAllWindows()[0].setSize(width, height),
      [width, height],
    );
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => ({
      lane: document.querySelector('.overview-lane').getBoundingClientRect().bottom,
      total: document.querySelector('.time-totals').getBoundingClientRect().bottom,
      viewport: innerHeight,
      selection: getComputedStyle(document.body).userSelect,
    }));
    expect(layout.lane).toBeLessThan(layout.viewport);
    expect(layout.total).toBeLessThan(layout.viewport);
    expect(layout.selection).toBe('none');
    await page.screenshot({ path: path.join(root, 'workspace-' + width + '.png') });
  }
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  await expect(page.locator('.profile-calendar span')).toHaveCount(364);
  await page.getByLabel('Sites', { exact: true }).fill('mail.example');
  await page.getByRole('button', { name: 'Masquer dans Sites', exact: true }).click();
  await expect(page.getByRole('button', { name: 'mail.example', exact: true })).toBeVisible();
  const state = await page.evaluate(() => window.focusReplay.state());
  expect(state.settings.privateDomains).toEqual(['mail.example']);
  expect(state.settings.shareEnabled).toBe(false);
  expect(Object.values(state.activityDays).some((ms) => ms > 0)).toBe(true);
  await page.screenshot({ path: path.join(root, 'profile-dark.png'), fullPage: true });
  await page.evaluate(() => window.focusReplay.settings({ theme: 'light' }));
  await page.screenshot({ path: path.join(root, 'profile-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toute la journée', exact: false }).click();
  await page.getByRole('slider', { name: 'Zoom de la timeline' }).fill('1');
  await expect(page.locator('.timeline-note')).toHaveCount(1);
  await page.locator('.timeline-note').click();
  await expect(
    page
      .getByRole('region', { name: 'Repères sélectionnés' })
      .getByText('Fatigue', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fermer les repères' }).click();
  await page.screenshot({ path: path.join(root, 'workspace-light.png') });
  await page.evaluate(() => window.focusReplay.settings({ widget: true }));
  await page.getByRole('button', { name: 'Commencer une session', exact: true }).click();
  await expect.poll(() => app.windows().some((w) => w.url().endsWith('#widget'))).toBe(true);
  const widget = app.windows().find((w) => w.url().endsWith('#widget'));
  await widget.getByRole('button', { name: 'Pause', exact: true }).click();
  await widget.getByRole('button', { name: '1 h', exact: true }).waitFor();
  await widget.screenshot({ path: path.join(root, 'widget-pause.png') });
  await widget.getByRole('button', { name: '1 h', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.focusReplay.state().then((s) => s.sessions.find((s) => !s.endedAt)?.status),
      ),
    )
    .toBe('paused');
  const remaining = await page.evaluate(() =>
    window.focusReplay.state().then((s) => s.pauseTimer.endsAt - Date.now()),
  );
  expect(remaining).toBeGreaterThan(3590000);
  await page.getByRole('button', { name: 'Toute la journée', exact: false }).click();
  await page.getByRole('slider', { name: 'Curseur de la timeline' }).fill(String(start));
  await widget.getByRole('button', { name: 'Reprendre', exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole('slider', { name: 'Curseur de la timeline' })
        .evaluate((e) => e.value === e.max),
    )
    .toBe(true);
  await widget.getByRole('button', { name: 'Terminer la session', exact: true }).click();
  console.log(
    'PASS: full-day rapid switches, pause gaps, Q/D, stable thumbnails and fixed-height zoom. ' +
      root,
  );
} finally {
  await app.close();
}
