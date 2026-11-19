# Mermaid 图表示例

AI 工具产出的 Markdown 中最常见的图就是 Mermaid。本文用于验证 NoteVault 的 Mermaid 渲染（主题联动、多类型）。

## 1. 流程图（flowchart）

```mermaid
flowchart TD
    A([开始]) --> B{需求类型?}
    B -->|功能开发| C[排期开发]
    B -->|线上问题| D[紧急修复]
    B -->|调查排查| E[分析定位]
    C --> F[拆分任务]
    D --> G[热修复 + 复盘]
    E --> H[输出调查报告]
    F --> I([进入开发])
    G --> I
    H --> I
```

## 2. 时序图（sequence）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant F as 前端(NoteVault)
    participant S as Node 服务
    participant FS as 文件系统
    U->>F: 点击左侧文件
    F->>S: POST /api/fs_read
    S->>FS: 读取文件内容
    FS-->>S: UTF-8 文本
    S-->>F: FileContent
    F-->>U: 渲染 Markdown / HTML
```

## 3. 甘特图（gantt）

```mermaid
gantt
    title NoteVault 开发排期
    dateFormat YYYY-MM-DD
    section 设计
    需求与架构文档   :done, a1, 2026-11-19, 1d
    UI 设计         :done, a2, after a1, 1d
    section 开发
    Web 版核心      :active, b1, after a2, 3d
    渲染增强        :b2, after b1, 2d
    检索与交互      :b3, after b2, 2d
    section 发布
    Tauri 打包      :c1, after b3, 2d
    终审与交付      :c2, after c1, 1d
```

## 4. 饼图（pie）

```mermaid
pie showData title AI 产出文档类型分布
    "Markdown" : 78
    "HTML" : 15
    "其他" : 7
```

## 5. 状态图（state）

```mermaid
stateDiagram-v2
    [*] --> 未打开
    未打开 --> 渲染中: 点击文件
    渲染中 --> 渲染完成: 解析成功
    渲染中 --> 错误: 解析失败
    错误 --> 渲染中: 重试
    渲染完成 --> 源码视图: Ctrl+E
    源码视图 --> 渲染完成: Ctrl+E
    渲染完成 --> [*]
```

> 提示：切换深色/浅色主题时，以上图表会跟随主题重新渲染。
