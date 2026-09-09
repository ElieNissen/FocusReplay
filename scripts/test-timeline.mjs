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
  ).toBe(190);
  await page.screenshot({ path: path.join(root, 'zoom-pause.png'), fullPage: true });
  console.log(
    'PASS: full-day rapid switches, pause gaps, Q/D, stable thumbnails and fixed-height zoom. ' +
      root,
  );
} finally {
  await app.close();
}
