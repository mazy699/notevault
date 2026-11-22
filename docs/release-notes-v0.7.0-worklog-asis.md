# NoteVault v0.7.0（分支 feature/worklog-asis）

**原样接入 WorkLog 工作台**：把独立的 WorkLog 工作日志工具并入 NoteVault，
活动栏新增第 4 个工作台"工作日志"。功能、UI、存储形态全部保持原样，
自动读取原有 WorkLog 数据（同一 `%APPDATA%/worklog/worklog.db`）。

## 新增

- **工作日志工作台**（活动栏日历图标）：
  - 周视图（简化甘特/时间窗/节假日/今天列）、月视图、晨会、待办箱、任务、笔记、设置；
  - 日详情侧栏（统计 + 按任务分组记录 + 当天笔记 + 快速补记）；
  - AI 周报（OpenAI 兼容协议，配置与历史保留）、演示数据、节假日导入、备份/导出/导入；
  - 原 Worklog 的深/浅主题完整保留（工作台内独立切换，不影响 NoteVault 全局主题）。
- **数据自动继承**：直接读写 `%APPDATA%/worklog/worklog.db`（可用 `WORKLOG_DATA_DIR`
  覆盖），首次打开自动执行 schema 迁移（0001→0008 向前兼容），与独立 WorkLog 无缝共用。
- **数据层**：sql.js（SQLite WASM）在前端运行，Web 与桌面双宿主共用同一份 TypeScript
  数据层（原 62 项数据层单测全部随迁）；宿主仅新增 7 个文件级命令
  （读/写整库、附属文件、备份轮转、数据目录、AI 代理）。

## 修复（接入过程中实测发现）

- Tauri CSP 禁止 WebAssembly 编译导致桌面端工作台无法加载 →
  `script-src` 增加 `'wasm-unsafe-eval'`（仍禁止 eval）；
- NoteVault 全局快捷键（Ctrl+P 等）串到工作日志 → 限定仅读取工作台生效。

## 兼容性

- 原 WorkLog 软件可继续使用同一数据文件；两边同开时以最后写入为准（与 WorkLog
  自身的 Electron/Tauri/Web 多形态共用行为一致）。
- NoteVault 读取/对比/密码工作台不受影响。

## 构建产物（本地，未发布）

- `release/asis/NoteVault_0.7.0_portable.exe` + `WebView2Loader.dll`（免安装）
- `release/asis/NoteVault_0.7.0_setup.exe`（安装版）
- `release/asis/NoteVault_0.7.0_web.zip`（Web 版）
- `release/asis/checksums.txt`

## 验证

- 单测 124/124、桌面冒烟 29/29、TypeScript 全量通过；
- Web 实测：旧数据全页面读取、快速新建+今日记录落盘并刷新保持、
  主题隔离、其他三个工作台回归；
- 桌面实测：CSP 修复后工作日志工作台正常渲染旧数据。
