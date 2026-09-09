const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { phases } = require('./music-config.cjs');
function audioPath(dir, id) {
  if (id === 'legacy') return path.join(dir, 'music.mp3');
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Audio invalide.');
  return path.join(dir, 'music', id + '.mp3');
}
async function importAudio(recorder, phase, source) {
  if (!phases.includes(phase)) throw new Error('Ambiance invalide.');
  if (
    path.extname(source).toLowerCase() !== '.mp3' ||
    (await fs.stat(source)).size > 100 * 1024 * 1024
  )
    throw new Error('Choisissez un MP3 de moins de 100 Mo.');
  return recorder.run(async () => {
    await fs.mkdir(path.join(recorder.dir, 'music'), { recursive: true });
    const id = randomUUID(),
      target = audioPath(recorder.dir, id);
    const previous = recorder.data.localAudio?.[phase];
    const previousMusic = recorder.data.music;
    await fs.copyFile(source, target);
    recorder.data.localAudio ||= {};
    recorder.data.localAudio[phase] = { id, name: path.basename(source).slice(0, 200) };
    recorder.data.music = true;
    try {
      await recorder.save();
    } catch (error) {
      if (previous) recorder.data.localAudio[phase] = previous;
      else delete recorder.data.localAudio[phase];
      recorder.data.music = previousMusic;
      await fs.rm(target, { force: true });
      throw error;
    }
    recorder.changed();
    if (previous)
      await fs.rm(audioPath(recorder.dir, previous.id), { force: true }).catch(() => {});
  });
}
async function removeAudio(recorder, phase) {
  if (!phases.includes(phase)) throw new Error('Ambiance invalide.');
  return recorder.run(async () => {
    const previous = recorder.data.localAudio?.[phase];
    if (!previous) return;
    delete recorder.data.localAudio[phase];
    recorder.data.music = Object.keys(recorder.data.localAudio).length > 0;
    try {
      await recorder.save();
    } catch (error) {
      recorder.data.localAudio[phase] = previous;
      recorder.data.music = true;
      throw error;
    }
    recorder.changed();
    await fs.rm(audioPath(recorder.dir, previous.id), { force: true });
  });
}
module.exports = { audioPath, importAudio, removeAudio };
