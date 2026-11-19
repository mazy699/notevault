// 生成 src-tauri/icons/icon.ico（内嵌 PNG 的 ICO，32x32 + 256x256）
// 用法：node scripts/gen-icons.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src-tauri", "icons");
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

/** NoteVault 图标：圆角方块渐变底 + 白色书本/N 造型 */
function pixel(x, y, size) {
  const s = size / 256; // 以 256 设计稿为基准缩放
  const px = (v) => v * s;
  // 圆角矩形判定
  const inRounded = (x0, y0, x1, y1, r) => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const pad = px(16);
  const r = px(56);
  if (!inRounded(pad, pad, size - pad, size - pad, r)) return [0, 0, 0, 0];
  // 渐变底：左上亮紫 → 右下深紫
  const t = ((x - pad) / (size - 2 * pad) + (y - pad) / (size - 2 * pad)) / 2;
  let R = Math.round(155 - 45 * t);
  let G = Math.round(138 - 55 * t);
  let B = 255 - Math.round(60 * t);
  // 白色 "N" 书本造型：两竖 + 斜杠
  const nL = px(70), nR = px(186), nT = px(64), nB = px(192), w = px(26);
  const isBar = (bx) => x >= bx && x < bx + w && y >= nT && y < nB;
  // 斜杠：从左竖底到右竖顶的连线区域
  const cx = x - (nL + w) / 2 + (nR - w - nL - w) / 2 * ((nB - y) / (nB - nT));
  const isSlash = x >= nL + w && x < nR - w && y >= nT && y < nB && Math.abs(x - (nL + w + ((nR - w - nL - w) * (nB - y)) / (nB - nT))) < px(17);
  if (isBar(nL) || isBar(nR) || isSlash) {
    R = 255; G = 255; B = 255;
  } else if (x >= nL + w && x < nR - w && y >= nT && y < nB && x < cx) {
    // 斜线过渡区留底色
  }
  return [R, G, B, 255];
}

const png256 = encodePng(256, 256, (x, y) => pixel(x, y, 256));
const png32 = encodePng(32, 32, (x, y) => pixel(x, y, 32));

// 组装 ICO
function makeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type icon
  header.writeUInt16LE(count, 4);
  const dirSize = 16 * count;
  let offset = 6 + dirSize;
  const dirs = [];
  const datas = [];
  for (const { size, data } of entries) {
    const d = Buffer.alloc(16);
    d[0] = size === 256 ? 0 : size;
    d[1] = size === 256 ? 0 : size;
    d[2] = 0; d[3] = 0; // palette
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bits
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    dirs.push(d);
    datas.push(data);
  }
  return Buffer.concat([header, ...dirs, ...datas]);
}

const ico = makeIco([
  { size: 32, data: png32 },
  { size: 256, data: png256 },
]);
const out = path.join(outDir, "icon.ico");
fs.writeFileSync(out, ico);
console.log(`OK ${out} (${ico.length} bytes)`);
