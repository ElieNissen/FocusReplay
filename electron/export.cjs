const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const { makeSubtitles, safeText } = require('./export-overlay.cjs');
async function exportVideo({
  frames,
  activity = [],
  framePath,
  cameraPath,
  includeCamera = true,
  target,
  fps,
  height,
  tempRoot,
  signal,
  onProgress,
  binary,
}) {
  const jobDir = path.join(tempRoot, randomUUID());
  await fs.mkdir(jobDir, { recursive: true });
  const partial = path.join(path.dirname(target), `.focusreplay-${randomUUID()}.partial.mp4`);
  try {
    // Relative, generated filenames avoid shell/ffconcat interpretation of user paths.
    let list = '',
      cameraList = '';
    const withCamera = includeCamera && frames.some((f) => f.camera);
    const fallbackCamera = frames.find((f) => f.camera);
    for (let i = 0; i < frames.length; i++) {
      const name = `${String(i).padStart(6, '0')}.jpg`;
      try {
        await fs.link(framePath(frames[i].id), path.join(jobDir, name));
      } catch {
        await fs.copyFile(framePath(frames[i].id), path.join(jobDir, name));
      }
      list += `file '${name}'\nduration ${1 / fps}\n`;
      if (withCamera) {
        const camName = `camera-${name}`,
          source = cameraPath((frames[i].camera ? frames[i] : fallbackCamera).id);
        try {
          await fs.link(source, path.join(jobDir, camName));
        } catch {
          await fs.copyFile(source, path.join(jobDir, camName));
        }
        cameraList += `file '${camName}'\nduration ${1 / fps}\n`;
      }
      if (signal.aborted) throw new Error('Export annulé.');
    }
    list += `file '${String(frames.length - 1).padStart(6, '0')}.jpg'\n`;
    await fs.writeFile(path.join(jobDir, 'frames.txt'), list);
    await fs.writeFile(path.join(jobDir, 'labels.ass'), makeSubtitles(frames, fps, activity));
    const width = height === 720 ? 1280 : 1920;
    const screenFilter =
      'scale=1920:740:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:100+(740-ih)/2:color=0x1b1c1c,setsar=1';
    const finishFilter = `subtitles=labels.ass,scale=${width}:${height},format=yuv420p`;
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '1',
      '-i',
      'frames.txt',
    ];
    if (withCamera) {
      cameraList += `file 'camera-${String(frames.length - 1).padStart(6, '0')}.jpg'\n`;
      await fs.writeFile(path.join(jobDir, 'camera.txt'), cameraList);
      const ranges = [];
      frames.forEach((f, i) => {
        if (!f.camera) return;
        const last = ranges.at(-1);
        if (last && last.end === i) last.end = i + 1;
        else ranges.push({ start: i, end: i + 1 });
      });
      // Missing webcam samples must never show a stale picture from another instant.
      const enable = ranges.map((r) => `gte(t,${r.start / fps})*lt(t,${r.end / fps})`).join('+');
      const graph = `[0:v]${screenFilter}[screen];[1:v]scale=384:256:force_original_aspect_ratio=decrease,setsar=1[cam];[screen][cam]overlay=W-w-32:840-h-16:enable='${enable}'[pip];[pip]${finishFilter}[out]`;
      await fs.writeFile(path.join(jobDir, 'filters.txt'), graph);
      args.push(
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        'camera.txt',
        '-filter_complex_script',
        'filters.txt',
        '-map',
        '[out]',
      );
    } else args.push('-vf', `${screenFilter},${finishFilter}`);
    args.push(
      '-r',
      '30',
      '-t',
      String(frames.length / fps),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-an',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      partial,
    );
    await new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: jobDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let error = '',
        pending = '';
      const abort = () => child.kill();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on('data', (data) => {
        pending += data;
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines)
          if (line.startsWith('out_time_us='))
            onProgress(
              Math.min(
                99,
                Math.round((Number(line.split('=')[1]) / 1000000 / (frames.length / fps)) * 100),
              ),
            );
      });
      child.stderr.on('data', (data) => {
        error = (error + data).slice(-2000);
      });
      child.once('error', reject);
      child.once('close', (code) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) reject(new Error('Export annulé.'));
        else if (code !== 0) reject(new Error('Encodage impossible. ' + error));
        else resolve();
      });
    });
    if (signal.aborted) throw new Error('Export annulé.');
    await fs.rename(partial, target);
    onProgress(100);
  } finally {
    // Both targets are generated by this job; never remove a user-selected directory.
    await fs.rm(partial, { force: true }).catch(() => {});
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}
module.exports = { exportVideo, makeSubtitles, safeText };
