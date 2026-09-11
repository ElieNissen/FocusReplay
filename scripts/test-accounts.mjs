import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('work', 'accounts-' + Date.now());
await fs.mkdir(root, { recursive: true });
const origin = 'http://127.0.0.1:9879';
const server = spawn(process.execPath, ['standalone/server.mjs'], {
  cwd: path.resolve('web'),
  env: { ...process.env, PORT: '9879', PUBLIC_ORIGIN: origin, DATA_DIR: path.join(root, 'server') },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let app;
try {
  const invitation = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Independent server did not start')), 15000);
    server.once('error', reject);
    server.once('exit', () => reject(Error('Independent server exited')));
    server.stdout.on('data', (b) => {
      const match = b.toString().match(/Invitation: ([a-f0-9]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  expect((await fetch(origin)).status).toBe(200);
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, FOCUS_E2E: '1', FOCUS_TEST_DATA: path.join(root, 'desktop') },
  });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await page.getByText('Serveur personnalisé', { exact: true }).click();
  await page.getByLabel('Adresse du serveur', { exact: true }).fill(origin);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Pseudo', { exact: true }).fill('fictional-owner');
  await page
    .getByLabel('Mot de passe du compte', { exact: true })
    .fill('A fictional account password');
  await page.getByLabel('Code d’invitation', { exact: true }).fill(invitation);
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).last().click();
  await expect(page.getByLabel('Mot de passe du partage', { exact: true })).toBeVisible();
  await page
    .getByLabel('Mot de passe du partage', { exact: true })
    .fill('A separate viewer password');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('button', { name: 'Activer le partage', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.state().then((s) => s.share.enabled)))
    .toBe(true);
  expect((await fetch(origin + '/api/p/fictional-owner/snapshot')).status).toBe(401);
  await page
    .getByRole('button', { name: 'Arrêter et retirer le replay en ligne', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.focusReplay.state().then((s) => s.share.enabled)))
    .toBe(false);
  console.log(
    'PASS: standalone HTTP server, account creation in desktop UI, separate viewer password, sharing and removal. No connection file and no hosted service used.',
  );
} finally {
  if (app) await app.close();
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
}
