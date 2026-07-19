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

```
markflow/
├── src/                          # 前端源码 (TypeScript + CSS)
│   ├── main.ts                   # 入口
│   ├── styles/                   # 布局、组件、编辑器与主题样式
│   │   ├── app.css
│   │   ├── components.css
│   │   ├── editor.css
│   │   ├── sidebar.css
│   │   ├── toolbar.css
│   │   └── variables.css         # CSS 自定义属性 (light/dark/sepia)
│   ├── components/
│   │   ├── toolbar.ts            # 顶部工具栏
│   │   ├── sidebar.ts            # 侧边栏容器
│   │   ├── statusbar.ts          # 底部状态栏
│   │   ├── settings.ts           # 设置面板
│   │   ├── fileTree*.ts          # 文件树协调、状态、懒加载与拖放
│   │   ├── outline.ts            # 文档大纲提取
│   │   ├── contextMenu.ts        # 右键菜单
│   │   ├── toast.ts              # 提示通知
│   │   ├── newFileDialog.ts      # 新建文件/文件夹对话框
│   │   └── ui/                   # 可复用上下文菜单、对话框与模态框
│   ├── lib/
│   │   ├── editor*.ts            # ProseMirror (Tiptap) 编辑器、扩展与序列化
│   │   ├── imageUtils.ts         # 图片存储、路径解析、粘贴逻辑
│   │   ├── pathUtils.ts          # 路径工具函数
│   │   ├── storage.ts            # Tauri IPC 文件系统封装
│   │   ├── theme.ts              # 主题切换逻辑
│   │   ├── mermaid*.ts           # Mermaid 图表渲染与懒加载
│   │   └── store.ts              # 全局状态存储
│   ├── types/                    # 编辑器、文件树、设置与事件类型
│   └── utils/
│       ├── dom.ts                # DOM 工具
│       └── keyboard.ts           # 快捷键处理
├── src-tauri/                    # Rust 后端源码
│   ├── src/
│   │   ├── main.rs               # Tauri 应用入口
│   │   ├── lib.rs                # 库入口，命令注册
│   │   ├── commands/
│   │   │   ├── files.rs          # 文件操作命令
│   │   │   └── settings.rs       # 设置读写命令
│   │   ├── fs/                   # 文件监听与忽略规则
│   │   ├── config/
│   │   │   └── settings.rs       # Settings 结构体与持久化
│   │   ├── logger.rs             # 日志配置
│   │   ├── paths.rs              # 路径工具函数
│   │   ├── state.rs              # 应用状态管理
│   │   ├── error.rs              # 应用错误类型
│   │   └── http.rs               # 网络图片下载
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置
│   └── capabilities/             # Tauri v2 权限声明
├── openspec/                     # OpenSpec 规范与变更追踪
│   ├── specs/                    #   - 产品规格、架构、技术设计等
│   ├── ui-design/                #   - UI 设计稿
│   └── changes/                  #   - 变更追踪
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 架构设计

### 前后端通信

前端通过 Tauri IPC 调用 Rust 命令。所有文件操作、设置读写、二进制 I/O 均通过 `invoke()` 调用 Rust 端的 `#[tauri::command]` 函数。

### 编辑器架构

- **Tiptap** 基于 ProseMirror，以节点树表示文档结构
- **tiptap-markdown** 扩展负责 Markdown 的双向序列化
- **自定义 ProseMirror 插件**：
  - `imageSrcResolverPlugin` — 将相对路径转换为 Tauri asset protocol URL
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
| tiptap-markdown | Markdown 双向序列化 |
| codemirror | 源码模式编辑器 |
| lowlight + highlight.js | 代码高亮 |
| mermaid | 图表渲染 |
