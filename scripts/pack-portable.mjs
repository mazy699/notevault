// 便携版打包：把 target/release/notevault.exe 复制到 release/ 并附带 Web 版启动脚本
// 用法：node scripts/pack-portable.mjs [--fast]（--fast 跳过构建）
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const version = pkg.version;
const exe = path.join(root, "src-tauri", "target", "release", "notevault.exe");
const outDir = path.join(root, "release");

if (!fs.existsSync(exe)) {
  console.error("未找到桌面版 exe，请先构建：npm run build:renderer && cargo build --release --manifest-path src-tauri/Cargo.toml");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, `NoteVault_${version}_portable.exe`);
fs.copyFileSync(exe, dest);

// 附带 Web 版启动脚本（可选的浏览器使用方式）
const batSrc = path.join(root, "启动NoteVault-Web版.bat");
if (fs.existsSync(batSrc)) fs.copyFileSync(batSrc, path.join(outDir, "启动NoteVault-Web版.bat"));

const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`OK ${dest} (${size} MB)`);
