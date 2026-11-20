# NoteVault v0.1.0

统一查看 AI 开发过程产出的 **Markdown**（含 Mermaid 图、公式）与 **HTML** 文档的本地工具。
左侧目录树 + 右侧渲染视图，类似 Obsidian；只读为主，支持源码查看与一键复制。

## 下载与使用

### 桌面版（免安装，推荐）

下载以下 **两个文件**，放在**同一个目录**里，双击 exe 即可运行：

| 文件 | 说明 |
| --- | --- |
| `NoteVault_0.1.0_portable.exe` | 主程序（约 9.2 MB） |
| `WebView2Loader.dll` | 必需依赖，必须与 exe 同目录 |

- 需系统自带 WebView2（Windows 10/11 默认已安装）；
- 无数字签名：若公司安全策略拦截，请用下面的 Web 版；
- 所有渲染资源（Mermaid / KaTeX / 代码高亮）已内嵌，**完全离线可用**。

### Web 版（浏览器访问，零安装）

需要本机已有 Node.js ≥ 20：

```bash
npm install
npm run build
npm run web          # 启动并自动打开浏览器，仅监听 127.0.0.1:8321
```

或双击 `启动NoteVault-Web版.bat`（需在源码目录运行，脚本已包含在仓库中）。

## 功能亮点

- **Markdown 完整渲染**：GFM 表格/任务列表/脚注、Mermaid 图（流程/时序/甘特/饼图）、KaTeX 公式、内嵌 HTML、代码高亮
- **HTML 文件**：浏览器内核 iframe 渲染（交互脚本保真），可一键在系统浏览器打开
- **源码与复制**：渲染↔源码一键切换（Ctrl+E），代码块独立复制按钮，全文一键复制
- **检索**：跨库全文搜索（分组/高亮/跳转定位）、Ctrl+P 模糊快速打开、最近文件
- **阅读体验**：多标签页、标题目录大纲、笔记间相对链接跳转（含锚点）、深浅双主题
- **自动刷新**：可选开关，外部文件改动 4 秒内自动更新
- **快捷键**：`Ctrl+P` 打开 / `Ctrl+Shift+F` 搜索 / `Ctrl+B` 侧栏 / `Ctrl+E` 源码 / `Ctrl+W` 关标签 / `F5` 刷新

## 性能

| 指标 | 数值 |
| --- | --- |
| 首屏加载 JS | 826 KB（渲染栈按需加载） |
| 首屏渲染 | 164 ms |
| 桌面版内存 | 约 416 MB（其中约 330 MB 为 WebView2 内核基线） |
| Web 宿主进程 | 约 38 MB |

详见 `docs/04-性能与资源占用.md`。

## 安全设计

- Web 服务仅监听 `127.0.0.1`，校验 Host/Origin（防 DNS rebinding 与 CSRF）
- Markdown 内嵌 HTML 经 `rehype-sanitize` 消毒，脚本无法执行
- HTML 文件以 sandbox iframe 渲染，与主应用隔离
- 所有文件路径经规范化校验，拒绝目录穿越；符号链接一律跳过
- 无网络上报、无遥测、无自动更新

## 文档

- `docs/00-需求与总体方案.md` — 需求与验收清单
- `docs/01-架构设计.md` — 双宿主架构与 API 契约
- `docs/02-UI设计.md` — 界面与交互设计规范
- `docs/03-开发计划.md` — 分阶段开发记录与审查修复清单
- `docs/04-性能与资源占用.md` — 实测性能数据与优化说明
- `samples/` — 示例笔记库，覆盖全部渲染特性（可用本软件直接打开）

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS 4 + zustand + react-markdown + Mermaid + KaTeX + highlight.js
Web 宿主零依赖（node:http）｜桌面宿主 Tauri 2（Rust）

## 已知限制

- 目录树未做虚拟化，上万文件的超大笔记库在过滤时可能有卡顿
- HTML 沙箱内无法使用 localStorage（需要完整环境时请用「浏览器打开」）
- 便携版需与 `WebView2Loader.dll` 同目录（框架运行时依赖）
