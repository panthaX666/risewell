// Draws the Risewell app icon (sunrise over hills) and writes PNGs to /icons.
// No dependencies: pixels are computed directly and encoded with node:zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const C = { top: hex('#FFC247'), mid: hex('#FF8A4C'), low: hex('#FF7A85'), glow: hex('#FFE9A0'), sun: hex('#FFF3C4'), hill: hex('#E4572E'), hill2: hex('#B93A5A'), ink: hex('#2B1B3D') };

function colorAt(u, v) {
  const t = Math.min(1, v * 0.85 + u * 0.15);
  let c = t < 0.55 ? lerp(C.top, C.mid, t / 0.55) : lerp(C.mid, C.low, (t - 0.55) / 0.45);
  const d = Math.hypot(u - 0.5, v - 0.57);
  if (d < 0.34) c = lerp(c, C.glow, 0.45);
  if (d < 0.25) c = C.sun;
  // face
  if (Math.hypot(u - 0.445, v - 0.54) < 0.02 || Math.hypot(u - 0.555, v - 0.54) < 0.02) c = C.ink;
  const s = Math.hypot(u - 0.5, v - 0.565);
  if (v > 0.585 && s > 0.052 && s < 0.07) c = C.ink;
  if (v > 0.75 + 0.045 * Math.sin(u * Math.PI * 1.7 + 0.4)) c = C.hill;
  if (v > 0.86 + 0.03 * Math.sin(u * Math.PI * 2.2 + 1.6)) c = C.hill2;
  return c;
}

const TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const SS = 3, raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        acc = acc.map((v, i) => v + c[i]);
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [192, 512, 180, 48]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size));
  console.log(`icons/icon-${size}.png`);
}
