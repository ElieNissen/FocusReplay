const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

function assTime(seconds) {
  const c = Math.round(seconds * 100);
  return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`;
}
function safeText(text) {
  return String(text)
    .replace(/[\\{}\r\n]/g, ' ')
    .slice(0, 240);
}
function makeSubtitles(frames, fps) {
  const header =
    '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,28,&H00F4F1ED,&H00F4F1ED,&H00302C29,&H00302C29,0,0,0,0,100,100,0,0,1,0,0,7,32,32,24,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  return (
    header +
    frames
      .map((f, i) => {
        const d = new Date(f.at);
        const stamp = d.toLocaleString('fr-FR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const previous = frames[i - 1];
        const paused =
          previous &&
          (f.sessionId !== previous.sessionId ||
            f.at - previous.at > (previous.interval || 60) * 1800 ||
            (f.events || []).some(
              (e) =>
                ['pause', 'system-pause', 'capture-error'].includes(e.type) &&
                e.at > previous.at &&
                e.at <= f.at,
            ));
        const text = `FocusReplay   |   ${stamp}   |   ${safeText(f.app)}${paused ? '   |   Après une interruption' : ''}`;
        return `Dialogue: 0,${assTime(i / fps)},${assTime((i + 1) / fps)},Default,,0,0,0,,${text}`;
      })
      .join('\n')
  );
}
async function exportVideo({
  frames,
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
    await fs.writeFile(path.join(jobDir, 'labels.ass'), makeSubtitles(frames, fps));
    const width = height === 720 ? 1280 : 1920;
    const screenFilter =
      'scale=1920:992:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:88+(992-ih)/2:color=0x211f1d,setsar=1';
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
      const graph = `[0:v]${screenFilter}[screen];[1:v]scale=384:216:force_original_aspect_ratio=decrease,pad=392:224:(ow-iw)/2:(oh-ih)/2:color=0xf3ece4,setsar=1[cam];[screen][cam]overlay=W-w-32:H-h-32:enable='${enable}'[pip];[pip]${finishFilter}[out]`;
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
