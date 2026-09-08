import fs from 'node:fs/promises';
await fs.mkdir('licenses', { recursive: true });
for (const [from, to] of [
  ['node_modules/ffmpeg-static/ffmpeg.exe.LICENSE', 'FFmpeg-GPL-3.0.txt'],
  ['node_modules/ffmpeg-static/ffmpeg.exe.README', 'FFmpeg-build-information.txt'],
  ['node_modules/ffmpeg-static/LICENSE', 'ffmpeg-static-LICENSE.txt'],
  ['node_modules/react/LICENSE', 'React-MIT.txt'],
  ['node_modules/lucide-react/LICENSE', 'Lucide-ISC.txt'],
])
  await fs.copyFile(from, 'licenses/' + to);
