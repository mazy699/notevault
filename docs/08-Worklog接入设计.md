# 08 · Worklog 接入设计（工作日志工作台）

> 目标：把独立的 WorkLog 工具（`D:\code\ai\zcode\tool`，v0.2.2 main 分支）作为一个
> 工作台并入 NoteVault，省开两个软件；原功能/UI/数据全部保留。
> 本设计适用于两个分支：
> - `feature/worklog-asis`：原样接入（功能、UI、SQLite 存储全部保持）
> - `feature/worklog-unified`：在 asis 基础上统一 UI 风格（功能不变，存储仍为 SQLite）

## 1. 可行性结论

| 维度 | 结论 |
| --- | --- |
| 技术栈 | 完全对齐：React 19 / Vite 8 / Tailwind 4 / TS 7 / zustand 5 / vitest 5 |
| 前端 | Worklog 页面/组件（~30 文件）可直接复用，仅入口与 API 绑定需改造 |
| 数据层 | Worklog 数据层本身是 **TypeScript + sql.js（SQLite WASM）**（Electron/Web 版），与具体壳解耦，可整体移植 |
| 桌面宿主 | 不需要在 Rust 侧引入任何 SQL 依赖：sql.js 在 WebView 前端运行，宿主只做字节读写 |
| 旧数据 | 直接读 `%APPDATA%/worklog/worklog.db`（与独立 Worklog 完全相同文件），自动生效 |
| 结论 | **可行，且不需要重写任何业务逻辑** |

## 2. 架构

```
NoteVault 前端（Web / Tauri WebView 共用）
├─ src/worklog/            ← Worklog 工作台（懒加载 chunk）
│  ├─ data/                数据层：sql.js + 全部业务规则（原样移植，62 单测）
│  ├─ pages/ components/   原 UI（原样移植）
│  ├─ api/client.ts        call() → DataService.dispatch（前端直连，无 IPC）
│  ├─ api/host.ts          宿主桥：WlPersist（文件）+ AI fetch 垫片 + 导出保存
│  └─ WorklogWorkbench    外壳：QueryClient + sql.js 懒加载 + 主题作用域
└─ 契约新增 7 个命令        wl_db_load / wl_db_save / wl_aux_read / wl_aux_write
                            / wl_backup / wl_data_info / wl_ai_proxy
```

**设计要点**

1. **sql.js 运行在前端**：Web 与 Tauri 共用同一份数据层 TS 代码；
   宿主只提供"读整库字节 / 写整库字节 / 附属文件 / 备份 / 数据目录"文件命令。
   好处：Rust 零 SQL 依赖（gnullvm 工具链无 C 编译器风险）、双宿主行为天然一致。
2. **数据目录与独立 Worklog 共用**：`%APPDATA%/worklog/worklog.db`
   （`WORKLOG_DATA_DIR` 可覆盖，与 Worklog 原语义一致）。旧数据无需任何迁移。
3. **写盘策略**：保持原语义——每个写操作后整库落盘（串行写盘链 + 宿主原子写
   tmp→rename），备份轮转保留 10 份。
4. **AI 周报**：请求经宿主 `wl_ai_proxy` 代理（Web=node fetch；Tauri=ureq
   native-tls），规避 WebView/浏览器 CORS；数据层 `fetchImpl` 注入点复用原
   `chatCompletion` 的可测试设计（原 ai.test.ts 9 项保持）。
5. **样式隔离**：原 `index.css` 的 `html[data-theme="dark"]` 全量改为
   `.wl-root[data-theme="dark"]`（83 处），body/滚动条/`.md-body` 同样作用域化。
   Worklog 自带深浅主题与 NoteVault 全局主题互不影响。
6. **CSP 修复**：Tauri `script-src` 增加 `'wasm-unsafe-eval'`（允许 WebAssembly
   编译，仍禁止 eval）——Web 端不受此限制，桌面端实测发现的必要配置。
7. **全局快捷键隔离**：NoteVault 的 Ctrl+P/Shift+F/B/E/W/R 仅在读取工作台生效，
   不与工作日志内部快捷键冲突。

## 3. 存储方案决策（分支 B 重点）

**结论：分支 B 继续使用 SQLite，不改为 JSON。**

理由：
1. Worklog 的数据模型是关系型 + 大量聚合口径（周矩阵行收录规则、实际占用天数
   `COUNT(DISTINCT entry_date)`、累计投入、工作日/节假日回溯、AI 周报统计）。
   这些逻辑全部以 SQL 实现在 `data/*.ts`（约 4400 行 + 62 单测）。改为 JSON
   需要重写全部查询逻辑，等于重做数据层，违背"主要功能不变"的验收底线。
2. 密码库选 JSON 的前提是"单表、无关系、导出即存储"；Worklog 是 8 张表、有外键
   与迁移（user_version 0001→0008），二者场景相反。
3. SQLite 单文件（72KB）本身就是最好的备份/迁移单元，且与独立 Worklog、
   旧版 Electron/Tauri/Web 三形态天然兼容；改 JSON 反而新增"旧库迁移"负担。

**旧数据迁移**：无需迁移——直接读取原 `worklog.db`；首次打开自动执行
schema 迁移（0001→0008，向前兼容），与独立 Worklog 打开同一文件的行为一致。

## 4. 验收矩阵（分支 A 实测记录）

| 项 | 结果 |
| --- | --- |
| 单元测试 | **124/124**（NoteVault 62 + Worklog 迁移 62） |
| 桌面冒烟 | **29/29**（新增 wl 文件层 4 项；原有 25 项不回归） |
| Web：旧库自动读取 | 周视图/月视图/任务/待办箱/晨会/笔记/设置/日详情全部显示历史数据 ✓ |
| Web：写路径 | 快速新建任务+今日记录 → 落盘（SQLite 文件含新任务）→ 刷新后仍在 ✓ |
| Web：主题 | Worklog 深色仅作用于 `.wl-root`，NoteVault 外壳不变 ✓ |
| Web：其他工作台 | 读取/对比/密码三工作台功能正常 ✓ |
| 桌面：CSP 问题 | 首次实测发现 wasm 被 CSP 拦截 → 修复 `'wasm-unsafe-eval'` 后正常 ✓ |
| 桌面：工作台渲染 | 默认工作台临时切到工作日志实测：旧数据渲染完整 ✓ |

## 5. 目录与版本

- 分支 A 版本号 0.7.0，产物输出 `release/asis/`（portable/setup/web zip/checksums）
- 分支 B 同版本号，产物输出 `release/unified/`
- 两个分支均**不合并 main、不发布 Release**，待人工确认后由用户决定
