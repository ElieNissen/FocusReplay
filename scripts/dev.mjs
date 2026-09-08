import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import { createServer } from 'vite';

// Real capture with a separate development profile; nothing starts recording automatically.
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server.listen();
const env = {
  ...process.env,
  FOCUS_DEV_URL: 'http://127.0.0.1:5173/',
  FOCUS_TEST_DATA: process.env.FOCUS_TEST_DATA || path.resolve('work/dev-profile'),
};
delete env.ELECTRON_RUN_AS_NODE;
let child,
  stopping = false,
  restartRequested = false,
  debounce;
const launch = () => {
  child = spawn(electron, ['.'], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env,
    windowsHide: true,
  });
  child.on('error', (error) => {
    console.error(error.message);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (restartRequested && !stopping) {
      restartRequested = false;
      launch();
    } else shutdown(code || 0);
  });
};
const watcher = watch('electron', { recursive: true }, (_event, name) => {
  if (!name || !/\.(cjs|ps1)$/.test(name)) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (stopping || restartRequested || !child?.connected) return;
    console.log('Desktop code changed. Saving the session and restarting…');
    restartRequested = true;
    child.send({ type: 'focus-dev-restart' });
  }, 300);
});
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(debounce);
  watcher.close();
  if (child?.connected) child.send({ type: 'focus-dev-restart' });
  await server.close();
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
console.log(
  'FocusReplay dev: live interface updates; desktop changes restart safely. Private profile: work/dev-profile.',
);
launch();
