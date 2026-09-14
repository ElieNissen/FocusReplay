const { createHash } = require('node:crypto');
const slots = ['publicScreen', 'publicCamera', 'profileScreen', 'profileCamera'];
function mediaId(id, key, mode) {
  const h = createHash('sha256')
    .update(id + ':v1:' + key + ':' + mode)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
function mediaPlan(frame, policy, hasCamera) {
  if (frame.private) return {};
  return Object.fromEntries(
    slots
      .filter(
        (k) => ['visible', 'blurred'].includes(policy[k]) && (!k.endsWith('Camera') || hasCamera),
      )
      .map((k) => [k, { id: mediaId(frame.id, k, policy[k]), mode: policy[k], available: false }]),
  );
}
function encodeMedia(nativeImage, bytes, mode, camera = false) {
  let image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty?.()) throw Error('Image illisible.');
  // Destroy spatial detail before transmission. Never ship a sharp image behind CSS blur.
  if (mode === 'blurred')
    image = image.resize({ width: 12, quality: 'good' }).resize({ width: 640, quality: 'best' });
  for (const width of [camera ? 480 : 800, 640, 480, 320, 160]) {
    const jpeg = image.resize({ width }).toJPEG(mode === 'blurred' ? 35 : 45);
    if (jpeg.length <= 12000) return jpeg;
  }
  throw Error('Image trop volumineuse pour le partage.');
}
module.exports = { mediaPlan, mediaId, encodeMedia };
