# NoteVault v0.7.0（分支 feature/worklog-unified）

**统一风格版 Worklog 工作台**：在 asis 原样接入的基础上，把工作日志工作台的
UI 风格与布局统一到 NoteVault 设计体系——功能完全不变，数据存储仍为 SQLite
（与独立 WorkLog 共用 `%APPDATA%/worklog/worklog.db`，旧数据自动读取）。

## UI 统一（功能不变）

- **顶栏统一**：原 WorkLog 头部（蓝底"记"字 logo + 文字导航 + 红底快速新建）
  替换为 NoteVault 同款顶栏：品牌（N NoteVault）+ 分段页签（周视图/月视图）+
  右侧图标按钮（晨会/待办箱/任务/笔记/设置）+ 快速新建 ghost 按钮；
- **主题统一**：移除工作台内独立的深/浅色切换，深浅主题跟随 NoteVault 全局
  主题（状态栏切换），两边再也不会出现"外壳浅色、内容深色"的割裂；
- **配色统一**：蓝色系主色（按钮/选中态/链接/焦点框）映射为 NoteVault 紫色
  `--accent`；灰阶文字/边框/面板映射到 `--text/--border/--bg-panel` 令牌，
  深浅两套主题自动适配；
- **控件统一**：输入框/下拉/按钮圆角与边框对齐 NoteVault 风格；
- 原 Worklog 的状态色（排期蓝/排查橙/运维绿/紧急红、优先级色点）保留语义。

## 存储决策（保留 SQLite，不迁移 JSON）

评估结论：Worklog 数据为 8 张表 + 外键 + 大量 SQL 聚合口径（周矩阵、实际天数、
工作日回溯、周报统计），改 JSON 需重写约 4400 行数据层与全部查询，违背
"功能不变"底线；SQLite 单文件本身即最佳备份单元，且与独立 WorkLog 全形态互通。
故继续使用 SQLite，**无需任何旧数据转换**；schema 迁移（0001→0008）随打开自动执行。
详见 `docs/08-Worklog接入设计.md` §3。

## 修复

- 工作台样式全局泄漏（`body` 背景/滚动条未作用域化，会影响 NoteVault 全局样式）→
  全部收敛到 `.wl-root`；
- 继承 asis 分支的全部修复（Tauri CSP `'wasm-unsafe-eval'`、快捷键隔离等）。

## 构建产物（本地，未发布）

- `release/unified/NoteVault_0.7.0_portable.exe` + `WebView2Loader.dll`
- `release/unified/NoteVault_0.7.0_setup.exe`
- `release/unified/NoteVault_0.7.0_web.zip`
- `release/unified/checksums.txt`

## 验证

- 单测 124/124；Web 实测：旧数据读取、六个页面、日详情抽屉、深/浅主题并跟随全局、
  其他三个工作台回归；桌面产物同源构建。
