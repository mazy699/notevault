# AGENTS.md · NoteVault 开发协作约定

> 本文件供后续 AI 开发者与人类协作者遵循；规则优先于个人习惯。
> NoteVault：本地 AI 文档查看器（Markdown/Mermaid/HTML/代码）+ 对比 + 密码 + 工作日志，
> 双宿主（Web 版 node:http / 桌面版 Tauri 2），同一前端、同一命令契约。

## 1. 开发流程（强制，不得绕过）

1. **禁止直接在 `main` 分支开发新功能或修复**（包括文档/配置类改动），`main` 只接受合并。
2. 从 `main` 最新提交拉特性分支，命名：`feature/<短主题>`、`fix/<短主题>`、`docs/<短主题>`。
3. 在特性分支完成开发并自测，至少通过：
   - `npx tsc --noEmit`（零错误）
   - `npx vitest run`（全部通过）
   - 涉及 Rust/宿主：`cd src-tauri && cargo run -- --smoke`（全部通过）
   - 涉及 UI：Web 与桌面端按需实测（含深浅主题截图目检）与既有工作台回归
4. 提交并推送特性分支，`gh pr create --base main --head <分支>` 提交 MR/PR，
   说明中写清：变更内容、验证结果、影响面。
5. `gh pr merge <PR号> --merge` 合并到 `main`；合并后本地执行
   `git fetch origin && git reset --hard origin/main` 对齐。
6. **只有合并进 `main` 之后才允许打包与发布**：
   版本号 bump → 全量门禁 → `npx tauri build` → 打包产物 → `gh release create`。
   Release 发布需用户明确确认后执行。

## 2. 常用命令

| 用途 | 命令 |
| --- | --- |
| 前端构建（typecheck+renderer+node） | `npm run build` |
| 单元测试 | `npx vitest run` |
| 桌面冒烟（34 项） | `cd src-tauri && cargo run -- --smoke` |
| Rust 单测 | `cd src-tauri && cargo test --lib` |
| 桌面 release 构建 | `npx tauri build` |
| 便携包 / Web 包 | `node scripts/pack-portable.mjs` / `node scripts/pack-web.mjs` |
| Web 后台服务启停 | `启动NoteVault-Web版.bat` / `关闭NoteVault-Web版.bat` |
| Web 重新构建并启动（最新代码） | `重新构建并启动NoteVault-Web版.bat`（可选 `--no-open`） |

Release 资产固定包含：portable exe、setup exe、web zip、WebView2Loader.dll、checksums.txt。

## 3. 架构与双宿主一致性

- 前端与两个宿主共用唯一契约 `shared/types.ts` 的 `COMMANDS`；
  新增命令必须**三处登记**：`shared/types.ts`、`src/api/client.ts`、双宿主路由
  （`web/server.ts` 与 `src-tauri/src/api.rs`），行为、参数、返回结构一致。
- Git 等外部命令一律参数数组调用（防注入），路径参数需做存在性校验。
- 数据文件双宿主同路径/同格式（如 `%APPDATA%/notevault/*`、worklog 共用库）；
  写盘用临时文件 + rename 原子写，备份/轮转规则双端一致。
- UI 复用设计令牌（`src/index.css` 的 CSS 变量）与既有组件样式，深浅主题必须同时验证。
- 工作台为懒加载 chunk（读取/对比/密码/工作日志/常用语），不得把重依赖塞进首屏。

## 4. 质量底线

- 测试全绿、TypeScript 零错误是提交前提；涉及危险操作（删除/覆盖）先确认再执行。
- UI 改动需在深浅两套主题下截图目检，并回归其他工作台不受影响。
- 不提交构建产物（`release/`、`dist/`、`out-web/`、`node_modules/` 已忽略）；
  `.wl-testdata/` 为本地测试数据，禁止提交真实用户数据。
- 破坏性/对外操作（发布 Release、强推、删除远程分支）必须先获得用户确认。
