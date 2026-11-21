/**
 * 打包 Web 版发布 zip：dist（前端构建）+ out-web（宿主服务）+ 启停脚本 + 使用说明。
 * 输出 release/NoteVault_<version>_web.zip
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const version = pkg.version;
const stage = join(root, "release", `NoteVault_${version}_web`);
const zipPath = join(root, "release", `NoteVault_${version}_web.zip`);

for (const need of ["dist/index.html", "out-web/web/server.js"]) {
  if (!existsSync(join(root, need))) {
    console.error(`缺少构建产物 ${need}，请先执行 npm run build`);
    process.exit(1);
  }
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// 前端 + 宿主
cpSync(join(root, "dist"), join(stage, "dist"), { recursive: true });
cpSync(join(root, "out-web"), join(stage, "out-web"), { recursive: true });

// 启停脚本（bat 已是 CRLF）
for (const bat of ["启动NoteVault-Web版.bat", "关闭NoteVault-Web版.bat"]) {
  cpSync(join(root, bat), join(stage, bat));
}

const readme = `NoteVault ${version} · Web 版使用说明
==========================================

【运行要求】
- Windows 10/11，需安装 Node.js 18 及以上（已在 Node 22 验证）。
  检测方法：命令行执行 node -v。

【启动 / 关闭】
1. 双击"启动NoteVault-Web版.bat"：
   服务在后台运行（关闭命令行不影响服务），就绪后自动打开浏览器
   http://127.0.0.1:8321
2. 不使用时双击"关闭NoteVault-Web版.bat"结束后台服务。
3. 端口被占用时可先关闭占用程序；默认端口 8321，可用环境变量
   NOTEVAULT_WEB_PORT 覆盖（两个 bat 需同时保持一致，默认即可）。

【安装为本地应用（PWA）】
浏览器打开页面后，点顶栏"安装应用"（需 Chrome/Edge 支持），
即可获得独立窗口的本地应用，无需保留浏览器标签。

【数据位置（与桌面版共用）】
- 设置：%APPDATA%\\notevault\\settings.json
- 密码库：%APPDATA%\\notevault\\passwords.json
  可在密码工作台导出 JSON/CSV/Markdown 备份或迁移。

【首次使用】
顶栏点击"samples 13 个文件"处选择你的笔记目录（Web 版需输入绝对路径，
如 D:\\notes），即可浏览 Markdown / HTML / 代码文件。
`;
writeFileSync(join(stage, "使用说明.txt"), readme, "utf-8");

// 压缩（PowerShell Compress-Archive）
const ps = `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zipPath}' -Force`;
execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });

const { statSync } = await import("node:fs");
const kb = (statSync(zipPath).size / 1024).toFixed(1);
console.log(`OK ${zipPath} (${kb} KB)`);
