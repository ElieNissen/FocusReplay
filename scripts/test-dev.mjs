import { createServer } from 'vite';
import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const source = 'src/App.jsx';
const original = await fs.readFile(source, 'utf8');
const server = await createServer();
let app;
try {
  await server.listen();
  const env = {
    ...process.env,
    FOCUS_DEV_URL: 'http://127.0.0.1:5173/',
    FOCUS_E2E: '1',
    FOCUS_TEST_DATA: path.resolve('work/hmr-' + Date.now()),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'Votre journée', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__hotReloadProbe = 42;
  });
  await fs.writeFile(source, original.replaceAll('Votre journée', 'Votre journée — mise à jour'));
  await expect(
    page.getByRole('heading', { name: 'Votre journée — mise à jour', exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => window.__hotReloadProbe)).toBe(42);
  const watched = Object.keys(server.watcher.getWatched());
  expect(
    watched.filter((directory) => /[\\/](work|outputs|release)([\\/]|$)/.test(directory)),
  ).toEqual([]);
  expect(errors).toEqual([]);
  console.log('PASS: React hot update is visible without reloading the window.');
} finally {
  await fs.writeFile(source, original);
  if (app) await app.close();
  await server.close();
}
