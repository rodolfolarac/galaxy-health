/**
 * Gera os ícones PNG do app (sem dependências): fundo de nebulosa e a
 * estrela ✦ do Galaxy.   npm run icons
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number, maskable: boolean) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = size / 2;
  // Estrela de 4 pontas: |x|^p + |y|^p <= r^p com p < 1 dá as pontas finas.
  const starR = size * (maskable ? 0.3 : 0.36);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const nx = (x - c) / size;
      const ny = (y - c) / size;
      const d = Math.hypot(nx + 0.12, ny + 0.15);
      const d2 = Math.hypot(nx - 0.2, ny - 0.18);
      // Fundo: vazio + nuvem violeta e magenta.
      let r = 7 + 90 * Math.max(0, 1 - d * 2.2) + 110 * Math.max(0, 1 - d2 * 2.6);
      let g = 6 + 30 * Math.max(0, 1 - d * 2.2) + 20 * Math.max(0, 1 - d2 * 2.6);
      let b = 15 + 200 * Math.max(0, 1 - d * 2.2) + 120 * Math.max(0, 1 - d2 * 2.6);

      const sx = Math.abs(x - c) / starR;
      const sy = Math.abs(y - c) / starR;
      const v = Math.pow(sx, 0.55) + Math.pow(sy, 0.55);
      if (v <= 1) {
        const t = Math.min(1, (1 - v) * 6); // borda suave
        r = r * (1 - t) + 236 * t;
        g = g * (1 - t) + 233 * t;
        b = b * (1 - t) + 255 * t;
      } else {
        // Brilho em volta da estrela.
        const glow = Math.max(0, 1 - Math.hypot(x - c, y - c) / (starR * 1.4)) * 0.35;
        r += 166 * glow;
        g += 120 * glow;
        b += 255 * glow;
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = Math.min(255, r);
      raw[i + 1] = Math.min(255, g);
      raw[i + 2] = Math.min(255, b);
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/icon-192.png', png(192, false));
fs.writeFileSync('public/icon-512.png', png(512, false));
fs.writeFileSync('public/icon-maskable-512.png', png(512, true));
console.log('Ícones gerados em public/.');
