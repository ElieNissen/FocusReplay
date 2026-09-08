import fs from 'node:fs/promises';
import zlib from 'node:zlib';
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    size = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
const size = 256,
  scan = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const i = y * (size * 4 + 1) + 1 + x * 4;
    const ring = Math.abs(Math.hypot(x - 127.5, y - 127.5) - 72) < 11;
    const play = x > 108 && x < 160 && Math.abs(y - 128) < (160 - x) * 0.58;
    const round =
      (x < 36 && y < 36 && Math.hypot(x - 36, y - 36) > 36) ||
      (x > 219 && y < 36 && Math.hypot(x - 219, y - 36) > 36) ||
      (x < 36 && y > 219 && Math.hypot(x - 36, y - 219) > 36) ||
      (x > 219 && y > 219 && Math.hypot(x - 219, y - 219) > 36);
    scan[i] = ring || play ? 251 : 205;
    scan[i + 1] = ring || play ? 242 : 93;
    scan[i + 2] = ring || play ? 230 : 57;
    scan[i + 3] = round ? 0 : 255;
  }
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(scan)),
  chunk('IEND', Buffer.alloc(0)),
]);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await fs.mkdir('build', { recursive: true });
await fs.writeFile('build/icon.ico', Buffer.concat([ico, png]));
await fs.writeFile('build/icon.png', png);
