# MarkFlow 技术架构

> 版本：2.1.0 ｜ 状态：已发布 ｜ 更新日期：2026-07-19
>
> 技术栈、项目结构与核心架构设计。
>
> 详细设计见 [technical-design.md](technical-design.md)

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                       MarkFlow 客户端                        │
│                                                             │
│  ┌─────────────────┐        IPC        ┌──────────────────┐ │
│  │ Tauri 前端       │◄─────────────────►│ Tauri 后端 (Rust)│ │
│  │ (系统 WebView)   │                    │                  │ │
│  │                 │                    │ 命令处理器       │ │
│  │ UI 组件          │                    │ · file_*         │ │
│  │ ProseMirror      │                    │ · settings_*     │ │
│  │ (Tiptap) 编辑器  │                    │                  │ │
│  │ CodeMirror 源码  │                    │ 文件系统/监听     │ │
│  │ Mermaid 渲染     │                    │ 配置与应用状态    │ │
│  └─────────────────┘                    └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 桌面框架 | Tauri v2 | 跨平台原生桌面应用，使用系统 WebView |
| 前端语言 | TypeScript | UI 逻辑与编辑器编排 |
| 编辑器引擎 | ProseMirror (Tiptap) | 节点化 WYSIWYG 编辑，Markdown 双向同步 |
| 源码编辑 | CodeMirror v6 | 源码模式编辑 |
| 构建工具 | Vite | 开发服务器与生产构建 |
| 后端 | Rust | 文件 I/O、文件监听、配置管理 |
| 代码高亮 | highlight.js + lowlight | 代码块语法高亮 |
| 图表 | Mermaid | 将 mermaid 代码块渲染为 SVG |
| 文件监听 | notify | 递归文件系统变更检测 |
| HTTP 请求 | reqwest | 网络图片下载 |

---

## 项目结构

目录分层、每层职责边界、允许的依赖方向与测试分离要求由
[source-layering](source-layering/spec.md) 定义，文件大小/命名/错误处理等硬性约束由
[code-standards](code-standards/spec.md) 定义，两者均由 `scripts/check-layering.mjs` 在 CI 中强制。
本节只给出概览，冲突时以两份规范为准。

```
markflow/
├── src/                          # 前端源码 (TypeScript + CSS)
│   ├── main.ts                   # 入口与唯一装配点（含 registerUiPorts）
│   ├── types/                    # 跨模块共享类型，无运行时依赖
│   ├── utils/                    # 无副作用纯函数（不 import DOM/Tauri）
│   ├── infra/                    # IPC/storage、logger、error、store、调度器、UI 端口
│   │   ├── images/               #   图片管道（naming/settings/draft/core）
│   │   └── ui-ports.ts           #   引擎层回调注入端口
│   ├── editor/                   # 编辑器引擎（barrel: index.ts）
│   │   ├── markdown/             #   Markdown 桥接、准入、对账、opaque 会话
│   │   └── extensions/           #   Tiptap 节点/扩展拆分
│   ├── render/                   # 内容渲染（barrel: index.ts）
│   ├── export/                   # 导出（barrel: index.ts）
│   │   └── theme/                #   导出主题令牌
│   ├── ui/                       # 组件与交互
│   │   ├── file-tree/            #   aria/dom/render/loader/events/state/inline/dragdrop
│   │   ├── sidebar/              #   index/fileops/conflict
│   │   ├── settings/             #   panel/fields/markup
│   │   └── documents/            #   多标签会话与 hooks
│   ├── __tests__/                # 根级集成测试
│   ├── __fixtures__/             # 仅测试使用的 fixture/helper
│   └── styles/                   # 布局、组件、编辑器与主题样式
├── src-tauri/                    # Rust 后端源码
│   ├── src/
│   │   ├── main.rs               # Tauri 应用入口
│   │   ├── lib.rs                # 库入口，命令注册
│   │   ├── commands/
│   │   │   ├── files/            # paths/atomic/entry/crud/dialogs
│   │   │   ├── images/           # storage/pending/io/commands
│   │   │   ├── export/           # PDF 与二进制导出
│   │   │   ├── settings/
│   │   │   └── files_meta.rs, files_pagination.rs
│   │   ├── net/                  # url/dns/redirect/magic/redact/fetch（http.rs 为门面）
│   │   ├── fs/                   # watcher/ignore（tests 子模块文件）
│   │   ├── menu/                 # mod/native/recent/dispatch
│   │   ├── config/settings.rs    # Settings 结构体与持久化
│   │   ├── logger.rs, paths.rs, state.rs, error.rs
│   │   └── */tests.rs            # 各模块同目录测试子模块（生产文件不含内联测试）
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置
│   └── capabilities/             # Tauri v2 权限声明
├── scripts/check-layering.mjs    # 分层/行数/测试分离门禁
├── openspec/                     # OpenSpec 规范与变更追踪
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

依赖方向（单向，不可反转）：`types ← utils ← infra ← editor/render/export ← ui ← main`。
`editor`/`render`/`export` 需要用户可见能力时走 `src/infra/ui-ports.ts` 的注入端口，不得 import `ui`。

---

## 架构设计

### 前后端通信

前端通过 Tauri IPC 调用 Rust 命令。所有文件操作、设置读写、二进制 I/O 均通过 `invoke()` 调用 Rust 端的 `#[tauri::command]` 函数。

### 编辑器架构

- **Tiptap** 基于 ProseMirror，以节点树表示文档结构
- `@tiptap/markdown` v3 提供 Markdown parse/stringify 扩展；生产序列化经统一 bridge 管理。
- **自定义 ProseMirror 插件**：
  - `imageSrcResolverPlugin` — 将相对路径转换为 Tauri asset protocol URL
- `imageUtils.ts` — 统一图片存储、路径解析、命名和草稿生命周期
- `files_image.rs` — 图片专用 IPC 命令（写入、复制、下载、暂存、迁移、清理）
  - `imageBubblePlugin` — 点击图片弹出路径编辑气泡
- **DOM 级事件处理**：图片粘贴/拖拽通过 `paste`/`drop` 事件监听实现

### 图片渲染

1. Markdown 中的相对路径存储在 ProseMirror 节点的 `src` 属性中
2. `imageSrcResolverPlugin` 的 `appendTransaction` 将其转换为 `convertFileSrc()` 生成的 asset protocol URL
3. 模块级 `assetToOriginalMap` 记录 `assetUrl → originalPath` 映射
4. 保存时 `getMarkdown()` 将 asset URL 替换回原始路径

### 文件监听

Rust 端使用 `notify` crate 递归监听工作区目录。变更事件通过 Tauri `emit` 发送到前端。前端维护一个 suppress 集合，在自身写入文件前将路径加入集合，避免自身保存触发"外部修改"提示。

### 主题系统

CSS 变量架构：`variables.css` 定义三组主题变量（`[data-theme="light"]`、`[data-theme="dark"]`、`[data-theme="sepia"]`），通过切换 `data-theme` 属性实现主题切换。

---

## 配置

### Rust 关键依赖

| 依赖 | 用途 |
|------|------|
| tauri | 桌面框架 |
| serde / serde_json | 序列化 |
| notify | 文件监听 |
| dirs | 平台目录路径 |
| base64 | 图片二进制编码 |
| reqwest | HTTP 图片下载 |

### 前端关键依赖

| 依赖 | 用途 |
|------|------|
| @tiptap/core + 扩展 | WYSIWYG 编辑器 |
| @tiptap/markdown v3 | Markdown parse/stringify 扩展，转换由统一 bridge 管理 |
| codemirror | 源码模式编辑器 |
| lowlight + highlight.js | 代码高亮 |
| mermaid | 图表渲染 |
