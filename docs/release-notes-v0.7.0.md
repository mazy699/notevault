# NoteVault v0.7.0

**工作日志工作台上线**：独立的 WorkLog 工具正式并入 NoteVault，成为活动栏第 4 个工作台。
不用再开两个软件——周排期、每日记录、晨会、待办、任务、笔记、AI 周报全部在 NoteVault 里。

## 新增：工作日志工作台（统一风格版）

- **完整功能**：周视图（简化甘特/时间窗/节假日/今天列）、月视图、晨会复盘、待办箱、
  任务管理（类型/优先级/状态机/预估 vs 实际）、笔记、日详情侧栏（统计+分组记录+
  当天笔记+快速补记）、AI 周报（OpenAI 兼容，配置/测试/历史）、演示数据、
  节假日导入、备份（保留 10 份）/JSON 导出导入；
- **UI 融入 NoteVault**：同款品牌顶栏（分段页签 + 图标按钮）、紫色主色调、
  设计令牌配色；深浅主题跟随 NoteVault 全局切换，风格完全统一；
- **数据自动继承**：直接读写 `%APPDATA%/worklog/worklog.db`（可用 `WORKLOG_DATA_DIR`
  覆盖），与独立 WorkLog 共用同一文件，旧数据零迁移；schema 迁移（0001→0008）
  向前兼容；
- **存储保持 SQLite**：Worklog 为 8 张表 + 外键 + 大量 SQL 聚合口径（周矩阵、
  工作日、统计），评估后不改 JSON（详见 docs/08 §3），旧数据无需转换。

## 架构

- Worklog 数据层（TypeScript + sql.js/SQLite WASM，原 45 项业务规则测试随迁）
  运行在前端，Web 与桌面共用同一份代码；
- 双宿主仅新增 7 个文件级命令（整库读写/附属文件/备份/数据目录/AI 代理），
  Rust 端零 SQL 依赖；AI 请求经宿主代理规避 CORS；
- 工作台按需懒加载（33KB chunk + sql.js WASM 首次进入才加载），不影响首屏。

## 修复

- Tauri CSP 禁止 WebAssembly 编译 → `script-src` 增加 `'wasm-unsafe-eval'`；
- 工作台样式全局泄漏（body/滚动条）→ 全部收敛到 `.wl-root`；
- NoteVault 全局快捷键（Ctrl+P 等）限定仅读取工作台生效，不与工作日志冲突。

## 下载

| 文件 | 用途 |
| --- | --- |
| `NoteVault_0.7.0_setup.exe` | **安装版**（NSIS 向导，无需管理员权限） |
| `NoteVault_0.7.0_portable.exe` + `WebView2Loader.dll` | **免安装便携版**（两个文件放同一目录） |
| `NoteVault_0.7.0_web.zip` | **Web 版发布包**（解压后双击启动 bat；需 Node.js 18+） |
| `checksums.txt` | SHA256 校验和 |

## 验证

- 单测 **124/124**（NoteVault 62 + Worklog 迁移 62）、桌面冒烟 **29/29**、
  TypeScript 全量通过；
- Web：旧数据全页面读取、快速新建+今日记录落盘并刷新保持、主题跟随全局、
  其他三个工作台回归正常；
- 桌面（Tauri）：统一顶栏/深色主题跟随/旧数据渲染实测通过；
- AI 周报 mock 端到端：测试连接、四节周报生成、历史入库。
