const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const { domainOnly } = require('./sites.cjs');
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
  if (
    /^(Code|Visual Studio Code|Codex|Cursor|Windsurf|WINWORD|Microsoft Word|EXCEL|Microsoft Excel|POWERPNT|PowerPoint|figma|notion|obsidian|devenv|idea64|pycharm64|webstorm64|rider64|blender|photoshop|illustrator|afterfx|resolve|WindowsTerminal|powershell|pwsh|Acrobat|AcroRd32|soffice|swriter|scalc)$/i.test(
      name,
    )
  )
    return 'work';
  if (/^(steam|EpicGamesLauncher|Battle\.net|vlc|Netflix|TikTok)$/i.test(name))
    return 'distraction';
  return 'unknown';
}
function startTracker(browserHints = true, browserDomains = false) {
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
        env: {
          ...process.env,
          FOCUS_BROWSER_HINTS: browserHints ? '1' : '0',
          FOCUS_BROWSER_DOMAINS: browserDomains ? '1' : '0',
        },
      },
    );
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const { name: n, hint, domain } = JSON.parse(line);
        name =
          typeof n === 'string'
            ? {
                app: (NAMES[n] || n).slice(0, 100),
                category: classify(n, hint),
                domain: browserDomains ? domainOnly(domain) : '',
              }
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
