// Genereert app-iconen (PNG) zonder externe dependencies — diagonale indigo→violet
// gradient met een witte cirkel in het midden. Output naar public/.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.cwd(), "public");
fs.mkdirSync(OUT, { recursive: true });

// CRC32 (PNG-chunks)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
// indigo #5b6cff -> violet #8b5cf6
const C1 = [0x5b, 0x6c, 0xff];
const C2 = [0x8b, 0x5c, 0xf6];

function makePNG(size) {
  const cx = size / 2, cy = size / 2;
  const r = size * 0.30;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size); // diagonale gradient
      let r8 = lerp(C1[0], C2[0], t), g8 = lerp(C1[1], C2[1], t), b8 = lerp(C1[2], C2[2], t);
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) {
        // zachte witte cirkel met lichte anti-alias rand
        const edge = Math.min(1, (r - d) / 2);
        r8 = lerp(r8, 255, edge); g8 = lerp(g8, 255, edge); b8 = lerp(b8, 255, edge);
      }
      raw[o++] = r8; raw[o++] = g8; raw[o++] = b8;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  fs.writeFileSync(path.join(OUT, name), makePNG(size));
  console.log("wrote", name, size);
}
