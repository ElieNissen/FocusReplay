import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
const dir = path.resolve('work', 'browser-domain-' + Date.now());
let browser;
try {
  browser = await chromium.launchPersistentContext(dir, {
    channel: 'msedge',
    headless: false,
    args: ['--force-renderer-accessibility'],
  });
  await browser.route('https://focusreplay.example.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>FocusReplay domain test</title><h1>Browser domain test</h1>',
    }),
  );
  const page = await browser.newPage();
  await page.goto('https://focusreplay.example.com/private-page?do-not-store=this');
  // Target only the known fixture window. This tests the production reader without
  // competing with the user's foreground window while they continue working.
  const source = (await fs.readFile('electron/activity.ps1', 'utf8'))
    .split('while ($true)')[0]
    .replace('$handle = [ForegroundApp]::GetForegroundWindow()', '$handle = $focusFixtureHandle')
    .replace(' -and [ForegroundApp]::GetForegroundWindow() -eq $handle', '');
  const script = path.join(dir, 'read-fixture.ps1');
  await fs.writeFile(
    script,
    source +
      '\n$focusFixtureHandle = (Get-Process msedge | Where-Object { $_.MainWindowTitle -like "FocusReplay domain test*" } | Select-Object -First 1).MainWindowHandle\nif (!$focusFixtureHandle) { throw "Fixture window unavailable" }\nGet-BrowserDomain\n',
  );
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
    {
      env: { ...process.env, FOCUS_BROWSER_DOMAINS: '1' },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe('focusreplay.example.com');
  console.log('PASS: Edge address-bar domain detected; no path/query returned.');
} finally {
  await browser?.close();
  await fs.rm(dir, { recursive: true, force: true });
}
