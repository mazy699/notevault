# NoteVault · AI 文档笔记查看器

统一查看 AI 开发过程产出的 **Markdown**（含 Mermaid 图、公式）与 **HTML** 文档的本地工具。界面类似 Obsidian：左侧目录树，右侧渲染视图；只读为主，支持源码查看与一键复制。

- 需求与方案：[docs/00-需求与总体方案.md](docs/00-需求与总体方案.md)
- 架构设计：[docs/01-架构设计.md](docs/01-架构设计.md)
- UI 设计：[docs/02-UI设计.md](docs/02-UI设计.md)
- 开发记录：[docs/03-开发计划.md](docs/03-开发计划.md)

## 两种使用方式（功能完全一致）

### 方式一：桌面版（免安装）

```
release/NoteVault_<版本>_portable.exe   ← 与同目录 WebView2Loader.dll 一起使用
```

- 双击直接运行，无需安装；依赖系统自带的 WebView2（Windows 10/11 自带）；
- **注意**：exe 需与 `WebView2Loader.dll` 保持同目录（`npm run pack:portable` 已自动放置）；
- 无数字签名：若公司策略拦截无法运行，请使用方式二；
- 所有渲染资源（mermaid / katex / highlight.js）已内嵌，**离线可用**。

### 方式二：Web 版（浏览器访问）

环境要求：Node.js ≥ 20。

```bash
npm install
npm run build      # 类型检查 + 前端 + Web 服务
npm run web        # 启动并自动打开浏览器（仅监听 127.0.0.1:8321）
```

或直接双击 `启动NoteVault-Web版.bat`。

- 启动参数：`--port=8321` 换端口、`--vault=D:\notes` 指定笔记目录、`--open` 自动打开浏览器；
- 首次进入时在顶栏选择笔记目录即可（会记忆，下次自动加载）。

## 功能清单

| 功能 | 说明 |
| --- | --- |
| 目录树 | 多级目录、按类型着色图标、名称过滤、展开/收起 |
| 自动渲染 | `.md` 走 Markdown 管线；`.html` 用浏览器内核 iframe 渲染；图片文件预览 |
| Markdown | GFM 表格/任务列表/脚注、代码高亮（全语言）、KaTeX 公式、内嵌 HTML、Mermaid 图（主题联动） |
| 源码视图 | 渲染/源码一键切换（Ctrl+E），源码带语法高亮与行数信息 |
| 复制 | 顶栏「复制源码」复制全文；每个代码块右上角独立复制按钮 |
| 全文搜索 | 跨整个笔记库（md/html/txt），按文件分组、命中高亮、点击跳转定位 |
| 快速打开 | Ctrl+P 模糊搜索文件名 |
| 多标签页 | 同时打开多个文件，右键关闭其他 |
| 大纲 | Markdown 标题目录，点击跳转、滚动位置跟踪 |
| 相对链接 | 笔记间跳转（含锚点）、图片相对路径解析，类似 Obsidian |
| 自动刷新 | 可选开关：每 4 秒检测外部文件变化并自动更新 |
| 主题 | 深色 / 浅色，全部组件与图表联动 |
| 记忆 | 上次笔记库、最近文件、设置跨启动保存 |

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `Ctrl+P` | 快速打开文件 |
| `Ctrl+Shift+F` | 全文搜索 |
| `Ctrl+B` | 侧栏开关 |
| `Ctrl+E` | 渲染 / 源码切换 |
| `Ctrl+W` | 关闭当前标签 |
| `F5` / `Ctrl+R` | 刷新目录与文件 |

## 目录结构

```
├─ docs/               # 设计文档（需求/架构/UI/开发记录）
├─ samples/            # 示例笔记库（渲染特性测试集，可用软件直接打开）
├─ shared/             # API 契约 + 纯逻辑（Web/Rust 双端共用语义）
├─ src/                # React 渲染层（api 适配层 / stores / components）
├─ web/server.ts       # Web 宿主：零依赖 node:http
├─ src-tauri/          # 桌面宿主：Tauri 2（api 命令 / vault 协议 / 冒烟测试）
├─ scripts/            # 图标生成 / 便携打包
└─ release/            # 便携 exe 输出
```

## 构建与打包

```bash
npm run build                    # 类型检查 + 前端 + Web 服务
npm test                         # 共享逻辑单测
cargo build --release --manifest-path src-tauri/Cargo.toml   # 桌面版（需 Rust）
npm run tauri:smoke              # 桌面版无 UI 冒烟测试（SMOKE_RESULT=...）
npm run pack:portable            # 整理 release/ 便携包
```

## 安全说明

- Web 服务仅监听 `127.0.0.1`，只提供只读命令（无写文件/无进程执行，除显式「浏览器打开」）；
- 所有路径参数经规范化校验，拒绝目录穿越；
- HTML 文件以 sandbox iframe 渲染，内容来源是本机用户自己的文件（与浏览器直接打开本地文件同等信任级别）；
- 隐私：无任何网络上报、无遥测、无自动更新。

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS 4 + zustand + react-markdown + mermaid + KaTeX + highlight.js；Web 宿主零依赖（node:http）；桌面宿主 Tauri 2（Rust）。
