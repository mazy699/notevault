// 生成 PWA 图标（192/512 PNG，纯 Node PNG 编码）
// 用法：node scripts/gen-pwa-icons.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, pixelFn) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * (1 + w * 4) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** NoteVault 图标：紫渐变圆角底 + 白色 N + 右下书本角标 */
function pixel(x, y, size) {
  const s = size / 512;
  const px = (v) => v * s;
  const inRounded = (x0, y0, x1, y1, r) => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const pad = px(32);
  const rad = px(112);
  if (!inRounded(pad, pad, size - pad, size - pad, rad)) return [0, 0, 0, 0];
  const t = ((x - pad) / (size - 2 * pad) + (y - pad) / (size - 2 * pad)) / 2;
  let R = Math.round(122 - 40 * t);
  let G = Math.round(108 - 50 * t);
  let B = Math.round(240 - 60 * t);
  // 白色 N（居中）
  const nL = px(150), nR = px(362), nT = px(128), nB = px(384), w = px(52);
  const isBar = (bx) => x >= bx && x < bx + w && y >= nT && y < nB;
  const slashX = nL + w + ((nR - w - nL - w) * (nB - y)) / (nB - nT);
  const isSlash = x >= nL + w && x < nR - w && y >= nT && y < nB && Math.abs(x - slashX) < px(34);
  if (isBar(nL) || isBar(nR) || isSlash) {
    R = 255; G = 255; B = 255;
  }
  return [R, G, B, 255];
}

for (const size of [192, 512]) {
  const png = encodePng(size, size, (x, y) => pixel(x, y, size));
  const out = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`OK ${out} (${png.length} bytes)`);
}
