import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = await fs.mkdtemp(path.resolve('work/replay-fixture-'));
const server = spawn(process.execPath, ['standalone/server.mjs'], {
  cwd: path.resolve('web'),
  windowsHide: true,
  env: { ...process.env, PORT: '8794', PUBLIC_ORIGIN: 'http://127.0.0.1:8794', DATA_DIR: dir },
  stdio: 'ignore',
});
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch('http://127.0.0.1:8794/api/account/options')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const start = new Date().setHours(10, 0, 0, 0);
  const frames = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    at: start + i * 60000,
    app: 'Éditeur',
    day: new Date(start).toLocaleDateString('en-CA'),
    available: true,
    cameraAvailable: true,
    screenMode: 'blurred',
    cameraMode: 'visible',
  }));
  await page.route('**/api/p/fixture/snapshot', (r) =>
    r.fulfill({
      json: {
        frames: [
          {
            ...frames[0],
            id: 'yesterday',
            at: start - 86400000,
            day: new Date(start - 86400000).toLocaleDateString('en-CA'),
          },
          ...frames,
        ],
        syncedAt: Date.now(),
        status: 'recording',
        sessions: [],
        days: [],
        gaps: [{ from: start + 240000, to: start + 360000, label: 'Pause' }],
        overview: [
          { from: start, to: start + 240000, app: 'Éditeur', category: 'work' },
          { from: start + 360000, to: start + 660000, app: 'Navigateur', category: 'unknown' },
        ],
      },
    }),
  );
  const requests = new Map();
  await page.route('**/api/p/fixture/images?**', async (r) => {
    const form = new FormData();
    for (const key of new URL(r.request().url()).searchParams.getAll('item')) {
      requests.set(key, (requests.get(key) || 0) + 1);
      form.append(
        key,
        new Blob(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#34385a"/><text x="50" y="80" fill="white" font-size="28">Session fictive</text></svg>',
          ],
          { type: 'image/svg+xml' },
        ),
        'capture.svg',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    const response = new Response(form);
    return r.fulfill({
      contentType: response.headers.get('content-type'),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  await page.goto('http://127.0.0.1:8794/?profile=fixture');
  await page.getByRole('button', { name: 'Lire le replay', exact: true }).waitFor();
  await page.locator('.replay-camera canvas').waitFor();
  assert.equal(
    Number(await page.getByRole('slider', { name: 'Timeline du replay' }).getAttribute('min')),
    start,
    'Today excludes yesterday',
  );
  await page.getByRole('button', { name: 'Image précédente' }).click();
  await page.locator('h1').click();
  await page.keyboard.press('q');
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Pause du replay' }).waitFor();
  await page.getByRole('button', { name: 'Pause du replay' }).click();
  await page.getByRole('slider', { name: 'Vitesse de lecture' }).focus();
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('slider', { name: 'Vitesse de lecture' }).inputValue(), '8');
  await page.getByRole('slider',{name:'Timeline du replay'}).focus();
  await page.keyboard.press('Home');
  const began=Date.now();
  await page.getByRole('button',{name:'Lire le replay',exact:true}).click();
  await page.getByRole('button',{name:'Pause du replay'}).waitFor();
  await page.getByRole('button',{name:'Lire le replay',exact:true}).waitFor({timeout:5000});
  assert.ok(Date.now()-began<4000,'Buffered playback completes 12 frames at 8 fps without per-frame network waits');
  assert.equal(Number(await page.getByRole('slider',{name:'Timeline du replay'}).inputValue()),frames.at(-1).at);
  const stableCanvas=await page.locator('.screen > .replay-surface canvas').elementHandle();
  await page.getByRole('button',{name:'Image précédente'}).click();
  await page.getByRole('button',{name:'Image suivante'}).click();
  assert.ok(await stableCanvas.evaluate(el=>el.isConnected),'The preview canvas survives frame changes without remounting');
  await page.locator('.replay-timeline-scroll').hover();
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(220);
  assert.ok(
    Number(await page.getByRole('slider', { name: 'Zoom de la timeline' }).inputValue()) > 1,
  );
  assert.ok(await page.locator('.replay-camera canvas').count());
  assert.ok(await page.locator('.replay-gap').count());
  await page.locator('.replay-timeline-scroll').evaluate((e) => (e.scrollLeft = 0));
  const strip = await page.locator('.filmstrip').boundingBox();
  await page.mouse.move(strip.x + 20, strip.y + 20);
  await page.mouse.down();
  await page.mouse.move(strip.x + strip.width * 0.5, strip.y + 20, { steps: 8 });
  await page.mouse.up();
  const seek = Number(await page.getByRole('slider', { name: 'Timeline du replay' }).inputValue());
  assert.ok(Math.abs(seek - (start + 330000)) < 30000);
  await page.getByRole('slider', { name: 'Zoom de la timeline' }).focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  const anchor = await page.locator('.replay-playhead').boundingBox(),
    viewport = await page.locator('.replay-timeline-scroll').boundingBox();
  assert.ok(
    Math.abs(anchor.x - (viewport.x + viewport.width / 2)) < 8,
    'Zoom stays centered on playhead',
  );
  await page.keyboard.press('Home');
  await page.screenshot({ path: 'work/web-buffer-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'work/web-buffer-mobile.png', fullPage: true });
  await page.waitForTimeout(500);
  assert.ok(
    [...requests.values()].every((n) => n === 1),
    'Preview, thumbnails and playback share one fetch per image',
  );
  assert.ok(
    ![...requests.keys()].some((k) => k.includes('yesterday')),
    'Yesterday is not preloaded',
  );
  assert.deepEqual(errors, []);
  console.log('Web replay: keyboard, speed, wheel zoom, camera and pause cells passed.');
} finally {
  await browser?.close();
  server.kill();
}
