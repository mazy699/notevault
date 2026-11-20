// 发布打包：整理 release/ 目录
//  - 便携版 exe（免安装） + WebView2Loader.dll
//  - NSIS 安装包（若已构建）
//  - SHA256 校验和文件（checksums.txt，供 IT 白名单/完整性校验）
// 用法：node scripts/pack-portable.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const version = pkg.version;
const target = path.join(root, "src-tauri", "target", "release");
const exe = path.join(target, "notevault.exe");
const dll = path.join(target, "WebView2Loader.dll");
const setup = path.join(target, "bundle", "nsis", `NoteVault_${version}_x64-setup.exe`);
const outDir = path.join(root, "release");

if (!fs.existsSync(exe)) {
  console.error("未找到桌面版 exe，请先构建：npm run build:renderer && cargo build --release --manifest-path src-tauri/Cargo.toml");
  process.exit(1);
}
if (!fs.existsSync(dll)) {
  console.error("未找到 WebView2Loader.dll（与 exe 同目录必需），请确认 cargo build 已完成");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const artifacts = [];

// 1. 便携版
const portableName = `NoteVault_${version}_portable.exe`;
fs.copyFileSync(exe, path.join(outDir, portableName));
artifacts.push(portableName);
// 2. WebView2Loader.dll
fs.copyFileSync(dll, path.join(outDir, "WebView2Loader.dll"));
artifacts.push("WebView2Loader.dll");
// 3. NSIS 安装包（若已构建）
if (fs.existsSync(setup)) {
  const setupName = `NoteVault_${version}_setup.exe`;
  fs.copyFileSync(setup, path.join(outDir, setupName));
  artifacts.push(setupName);
} else {
  console.warn("提示：未找到 NSIS 安装包（npx tauri build 可生成），仅打包便携版");
}

// 4. SHA256 校验和（供 IT 白名单/完整性校验）
const checksums = artifacts.map((name) => {
  const buf = fs.readFileSync(path.join(outDir, name));
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  return `${hash}  ${name}`;
});
fs.writeFileSync(path.join(outDir, "checksums.txt"), checksums.join("\n") + "\n");

// 5. Web 版启动脚本
const batSrc = path.join(root, "启动NoteVault-Web版.bat");
if (fs.existsSync(batSrc)) fs.copyFileSync(batSrc, path.join(outDir, "启动NoteVault-Web版.bat"));

console.log(`OK release/（v${version}）:`);
for (const name of [...artifacts, "checksums.txt"]) {
  const size = fs.existsSync(path.join(outDir, name)) ? (fs.statSync(path.join(outDir, name)).size / 1024 / 1024).toFixed(2) + " MB" : "?";
  console.log(`  ${name}  ${size}`);
}
console.log("注意：便携版 exe 需与 WebView2Loader.dll 保持同目录。");
