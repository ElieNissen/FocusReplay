import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
const root = path.resolve('work', 'windows-smoke-' + Date.now());
await fs.mkdir(root, { recursive: true });
const env = { ...process.env, FOCUS_TEST_DATA: path.join(root, 'profile') };
delete env.FOCUS_E2E;
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  const packaged = process.argv.includes('--packaged');
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve('release/win-unpacked/FocusReplay.exe') } : {}),
    args: packaged ? ['--focus-data-dir=' + path.join(root, 'profile')] : ['.'],
    env,
  });
  const runtime = await app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    profile: app.getPath('userData'),
  }));
  expect(runtime.profile).toBe(path.join(root, 'profile'));
  expect(runtime.packaged).toBe(packaged);
  const page = await app.firstWindow();
  await expect(
    page.getByRole('button', { name: 'Commencer une session', exact: true }),
  ).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setFullScreen(true);
    BrowserWindow.getAllWindows()[0].focus();
  });
  await page.evaluate(() =>
    window.focusReplay.settings({ interval: 10, musicEnabled: false, reminderMinutes: 0 }),
  );
  await page.getByRole('button', { name: 'Commencer une session', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.focusReplay.state().then((s) => s.sessions.at(-1).frames.length),
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.state().then((s) => s.trackingAvailable)), {
      timeout: 20000,
    })
    .toBe(true);
  const result = await page.evaluate(() =>
    window.focusReplay.state().then((s) => ({
      captures: s.sessions.at(-1).frames.length,
      width: s.sessions.at(-1).frames[0].width,
      height: s.sessions.at(-1).frames[0].height,
      bytes: s.sessions.at(-1).frames[0].bytes,
      trackingAvailable: s.trackingAvailable,
      warning: s.warning,
    })),
  );
  expect(result.width).toBeGreaterThan(600);
  expect(result.bytes).toBeGreaterThan(1000);
  expect(result.warning).toBe('');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.state().then((s) => s.systemPaused)))
    .toBe(true);
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.state().then((s) => s.systemPaused)))
    .toBe(false);
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  const exported = path.join(root, 'private-smoke.mp4');
  await app.evaluate(({ dialog, shell }, target) => {
    global.__revealedExport = null;
    shell.showItemInFolder = (file) => {
      global.__revealedExport = file;
    };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, exported);
  await page.evaluate(() =>
    window.focusReplay.export({ fps: 2, height: 720, includeCamera: false }),
  );
  await expect
    .poll(
      () => page.evaluate(() => window.focusReplay.state().then((s) => s.exportState?.status)),
      { timeout: 30000 },
    )
    .toBe('done');
  expect((await fs.stat(exported)).size).toBeGreaterThan(1000);
  expect(await app.evaluate(() => global.__revealedExport)).toBe(exported);
  await app.close();
  app = null;
  // Real desktop samples are private test data, not visual evidence or deliverables.
  await fs.rm(path.join(root, 'profile'), { recursive: true, force: true });
  await fs.rm(exported);
  await fs.writeFile(
    path.join(root, 'result.json'),
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log('Windows capture + foreground tracking + MP4 export PASS. Real samples removed.');
} finally {
  if (app) await app.close();
}
