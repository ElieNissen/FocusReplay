import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const root = path.resolve('release/win-unpacked');
const installer = path.resolve('release', `FocusReplay-${pkg.version}-Setup.exe`);
if (process.platform !== 'win32') throw Error('Windows is required to verify Authenticode trust.');
for (const file of [
  installer,
  path.join(root, 'FocusReplay.exe'),
  path.join(root, 'resources/app.asar'),
]) {
  if (!fs.existsSync(file)) throw Error('Missing release artifact: ' + path.basename(file));
}
const script = `
$ErrorActionPreference = 'Stop'
$files = @(Get-Item -LiteralPath $env:FOCUS_VERIFY_INSTALLER) + @(Get-ChildItem -LiteralPath $env:FOCUS_VERIFY_ROOT -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.ps1') })
$failed = @()
foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  if ($signature.Status -ne 'Valid') { $failed += $file.Name + ': ' + $signature.Status }
  elseif ($file.Name -match '^FocusReplay.*\\.exe$' -and !$signature.TimeStamperCertificate) { $failed += $file.Name + ': missing timestamp' }
}
if ($failed.Count) { $failed | ForEach-Object { Write-Output $_ }; exit 1 }
Write-Output ('Verified Authenticode trust for ' + $files.Count + ' release files.')
`;
// Windows PowerShell must resolve its own modules, not inherit PowerShell 7's module paths.
const environment = { ...process.env, FOCUS_VERIFY_ROOT: root, FOCUS_VERIFY_INSTALLER: installer };
for (const key of Object.keys(environment))
  if (key.toLowerCase() === 'psmodulepath') delete environment[key];
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  env: environment,
  windowsHide: true,
  encoding: 'utf8',
  timeout: 120000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.error || result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  throw Error('Release verification failed. Do not publish this installer.');
}
