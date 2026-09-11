import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('work', 'web-account-ui-' + Date.now());
await fs.mkdir(root, { recursive: true });
const origin = 'http://localhost:9881';
const server = spawn(process.execPath, ['standalone/server.mjs'], {
  cwd: path.resolve('web'),
  env: {
    ...process.env,
    PORT: '9881',
    PUBLIC_ORIGIN: origin,
    OPEN_REGISTRATION: 'true',
    DATA_DIR: path.join(root, 'server'),
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server timeout')), 15000);
    server.once('error', reject);
    server.stdout.on('data', (b) => {
      if (b.toString().includes('Invitation:')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByLabel('Code d’invitation de ce serveur')).toHaveCount(0);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('demo@example.test');
  await page.getByLabel('Pseudo', { exact: true }).fill('demo-profile');
  await page.getByLabel('Mot de passe', { exact: true }).fill('A fictional password 123');
  await page.screenshot({ path: path.join(root, 'signup.png') });
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour, demo-profile' })).toBeVisible();
  if (requests.some((u) => u.includes('/api/p/me/')))
    throw Error('Homepage must not load personal default profile');
  await page.getByRole('link', { name: 'Mon profil' }).click();
  await expect(page.getByText('Aucune session partagée pour le moment.')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByLabel('Mot de passe du partage')).toBeVisible();
  await page.goto(origin);
  await page.getByLabel('E-mail ou identifiant').fill('DEMO@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('A fictional password 123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour, demo-profile' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'mobile-account.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  console.log(
    'PASS: shared homepage, no invitation, email signup/login, own private profile, logout, mobile layout. Screenshots: ' +
      root,
  );
} finally {
  await browser?.close();
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
}
