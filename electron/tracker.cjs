const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const NAMES = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  Code: 'Visual Studio Code',
  code: 'Visual Studio Code',
  WINWORD: 'Microsoft Word',
  EXCEL: 'Microsoft Excel',
  POWERPNT: 'PowerPoint',
  explorer: 'Explorateur Windows',
  Spotify: 'Spotify',
  Discord: 'Discord',
  slack: 'Slack',
  Teams: 'Microsoft Teams',
  'ms-teams': 'Microsoft Teams',
  electron: 'FocusReplay',
  FocusReplay: 'FocusReplay',
  notepad: 'Bloc-notes',
};
function classify(name, hint = 'unknown') {
  if (['work', 'distraction'].includes(hint)) return hint;
  if (/^(Code|Codex|WINWORD|EXCEL|POWERPNT|figma|notion|devenv|idea64|pycharm64)$/i.test(name))
    return 'work';
  if (/^(steam|EpicGamesLauncher|Battle\.net|vlc|Netflix|TikTok)$/i.test(name))
    return 'distraction';
  return 'unknown';
}
function startTracker(browserHints = true) {
  let name = null,
    last = 0,
    child;
  if (process.platform === 'win32') {
    child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path
          .join(__dirname, 'activity.ps1')
          .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep),
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, FOCUS_BROWSER_HINTS: browserHints ? '1' : '0' },
      },
    );
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const { name: n, hint } = JSON.parse(line);
        name =
          typeof n === 'string'
            ? { app: (NAMES[n] || n).slice(0, 100), category: classify(n, hint) }
            : null;
        last = Date.now();
      } catch {}
    });
    child.on('error', () => {
      name = null;
    });
    child.on('exit', () => {
      name = null;
    });
  }
  return { current: () => (Date.now() - last < 7000 ? name : null), stop: () => child?.kill() };
}
module.exports = { startTracker, classify };
