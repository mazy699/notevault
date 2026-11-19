// 生成示例 PNG 图片（纯 Node 实现 PNG 编码，无第三方依赖）
// 用法：node scripts/gen-assets.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "samples", "assets");
fs.mkdirSync(outDir, { recursive: true });

const W = 320, H = 160;

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

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// 像素：底色浅灰 + 渐变圆角卡片 + 文字区色带（模拟 logo）
function pixel(x, y) {
  // 背景
  let r = 247, g = 248, b = 250;
  // 圆角矩形卡片 (20,30)-(140,130)
  const inCard = x >= 20 && x < 140 && y >= 30 && y < 130;
  if (inCard) {
    const t = (x - 20) / 120;
    r = Math.round(139 + (90 - 139) * t);
    g = Math.round(123 + (70 - 123) * t);
    b = Math.round(255 + (200 - 255) * t);
    // 白色小卡片 (45,52)-(115,108)
    if (x >= 45 && x < 115 && y >= 52 && y < 108) {
      r = 255; g = 255; b = 255;
      // 色带
      const bars = [[62, 46], [74, 90], [86, 80], [98, 66]];
      bars.forEach(([yy, ww], i) => {
        if (y >= yy && y < yy + 5 && x >= 52 && x < 52 + ww) {
          const c = i === 0 ? [139, 123, 255] : i === 1 ? [201, 194, 242] : i === 2 ? [201, 194, 242] : [228, 225, 247];
          [r, g, b] = c;
        }
      });
    }
  }
  return [r, g, b];
}

// 组装 RGBA 原始数据（每行前加 filter byte 0）
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  for (let x = 0; x < W; x++) {
    const [r, g, b] = pixel(x, y);
    const o = y * (1 + W * 4) + 1 + x * 4;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(outDir, "logo.png");
fs.writeFileSync(out, png);
console.log(`OK ${out} (${png.length} bytes)`);
