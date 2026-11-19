// 便携版打包：把 target/release/notevault.exe + WebView2Loader.dll 复制到 release/
// 用法：node scripts/pack-portable.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const version = pkg.version;
const exe = path.join(root, "src-tauri", "target", "release", "notevault.exe");
const dll = path.join(root, "src-tauri", "target", "release", "WebView2Loader.dll");
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
fs.copyFileSync(exe, path.join(outDir, `NoteVault_${version}_portable.exe`));
fs.copyFileSync(dll, path.join(outDir, "WebView2Loader.dll"));

// 附带 Web 版启动脚本（可选的浏览器使用方式）
const batSrc = path.join(root, "启动NoteVault-Web版.bat");
if (fs.existsSync(batSrc)) fs.copyFileSync(batSrc, path.join(outDir, "启动NoteVault-Web版.bat"));

const size = (fs.statSync(path.join(outDir, `NoteVault_${version}_portable.exe`)).size / 1024 / 1024).toFixed(1);
console.log(`OK release/ (${size} MB exe + WebView2Loader.dll)`);
console.log("注意：便携版 exe 需与 WebView2Loader.dll 保持同目录。");
