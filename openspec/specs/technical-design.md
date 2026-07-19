# MarkFlow 技术设计文档

> 版本：2.1.0 ｜ 状态：已发布 ｜ 更新日期：2026-07-19
> 技术栈：Rust + Tauri v2 + TypeScript
>
> 详细架构见 [architecture.md](architecture.md)

---

<!-- 架构总览、技术栈与项目结构已迁移至 architecture.md，保留本注释仅维护历史行号。 -->

<!--
┌─────────────────────────────────────────────────────────────┐
│                    MarkFlow 客户端                           │
│                                                             │
│  ┌─────────────────┐           ┌──────────────────────────┐ │
│  │   Tauri 前端     │◄─────────►│    Tauri 后端 (Rust)     │ │
│  │  (WebView)       │  IPC      │                         │ │
│  │                  │           │  ┌──────────────────┐  │ │
│  │  ┌───────────┐   │           │  │   命令处理器       │  │ │
│  │  │  UI 组件   │   │           │  │  - file_*        │  │ │
│  │  │ (Vanilla)  │   │           │  │  - settings_*    │  │ │
│  │  └──────┬─────┘   │           │  └────────┬─────────┘  │ │
│  │         │         │           │           │            │ │
│  │  ┌──────▼──────┐  │           │  ┌────────▼─────────┐  │ │
│  │  │ Tiptap 编辑器│  │           │  │    核心模块        │  │ │
│  │  │ (ProseMirror)│  │           │  │  ┌────────────┐  │  │ │
│  │  │             │  │           │  │  │  文件系统   │  │  │ │
│  │  │ + GFM 扩展  │  │           │  │  │  模块       │  │  │ │
│  │  │ + hljs     │  │           │  │  └────────────┘  │  │ │
│  │  │ + mermaid  │  │           │  │  ┌────────────┐  │  │ │
│  │  └────────────┘  │           │  │  │  文件监听   │  │  │ │
│  │                   │           │  │  │  模块       │  │  │ │
│  └───────────────────┘           │  │  └────────────┘  │  │ │
│                                  │  │  ┌────────────┐  │  │ │
│                                  │  │  │  配置管理   │  │  │ │
│                                  │  │  │  模块       │  │  │ │
│                                  │  │  └────────────┘  │  │ │
│                                  │  └──────────────────┘  │ │
│                                  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
-->

<!--

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 桌面框架 | Tauri v2 | 跨平台桌面应用框架，使用系统 WebView |
| 前端框架 | Tiptap (ProseMirror) | 节点化 WYSIWYG 编辑器 |
| 构建工具 | Vite | 快速开发构建 |
| 源码编辑 | CodeMirror v6 | 源码模式编辑器 |
| 代码高亮 | highlight.js + lowlight | 代码块语法高亮 |
| 图表渲染 | Mermaid | Mermaid 图表渲染 |
| 文件监听 | notify | Rust 文件系统监听 |
| 配置文件 | serde_json | Rust JSON 序列化 |
-->

<!--

```
markflow/
├── src/                          # 前端源代码
│   ├── main.ts                   # 前端入口
│   ├── styles/
│   │   ├── main.css              # 主样式
│   │   └── variables.css         # CSS 变量定义 (light/dark/sepia)
│   ├── components/
│   │   ├── toolbar.ts            # 工具栏组件
│   │   ├── sidebar.ts            # 侧边栏组件
│   │   ├── editor.ts             # 编辑器组件（含 WYSIWYG + 源码模式切换）
│   │   ├── statusbar.ts          # 状态栏组件
│   │   ├── settings.ts           # 设置面板组件
│   │   ├── fileTree.ts           # 文件树组件
│   │   ├── outline.ts            # 大纲组件
│   │   ├── contextMenu.ts        # 右键菜单组件
│   │   ├── toast.ts              # Toast 提示组件
│   │   ├── menu.ts               # 菜单组件
│   │   ├── imageContextMenu.ts   # 图片右键菜单
│   │   ├── mermaidContextMenu.ts  # Mermaid 右键菜单
│   │   ├── linkDialog.ts         # 链接编辑对话框
│   │   └── newFileDialog.ts      # 新建文件对话框
│   ├── lib/
│   │   ├── editor.ts             # Tiptap 编辑器配置
│   │   ├── storage.ts            # 文件系统操作封装（Tauri IPC）
│   │   ├── imageUtils.ts         # 图片存储、路径解析、粘贴逻辑
│   │   ├── mermaid.ts            # Mermaid 配置
│   │   ├── theme.ts              # 主题管理
│   │   ├── pathUtils.ts          # 路径工具函数
│   │   └── logger.ts             # 前端日志
│   ├── utils/
│   │   ├── dom.ts                # DOM 工具函数
│   │   └── keyboard.ts           # 快捷键处理
│   └── commands/
│       └── editor-commands.ts    # 编辑器命令封装
├── src-tauri/                    # Rust 后端源代码
│   ├── src/
│   │   ├── main.rs               # Tauri 入口
│   │   ├── lib.rs                # 库入口，命令注册
│   │   ├── commands/
│   │   │   ├── files.rs          # 文件操作命令
│   │   │   └── settings.rs       # 设置命令
│   │   ├── fs/
│   │   │   ├── watcher.rs        # 文件监听
│   │   │   └── tree.rs           # 文件树构建
│   │   ├── config/
│   │   │   └── settings.rs       # Settings 结构体与持久化
│   │   ├── logger.rs             # 日志配置
│   │   ├── paths.rs              # 路径工具函数
│   │   └── state.rs              # 应用状态管理
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/             # Tauri v2 权限配置
├── openspec/                     # 规范文档（canonical）
│   ├── specs/                    #   - 产品规格、架构、技术设计、UI 修复
│   ├── ui-design/                #   - UI 设计稿
│   └── changes/                  #   - 变更追踪
├── .codegraph/                   # CodeGraph 代码知识图谱（gitignored）
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```
-->

## 1. 前端模块详细设计

### 1.1 UI 组件架构

采用组件化 Vanilla TypeScript，每个 UI 区域为一个独立模块：

```
App
├── Toolbar
│   ├── Brand (品牌标识)
│   ├── FileActions (文件操作按钮组)
│   ├── FormatActions (格式化按钮组)
│   ├── InsertActions (插入按钮组)
│   ├── ModeActions (模式切换按钮组)
│   └── ThemeToggle (主题切换)
├── Sidebar
│   ├── Tabs (文件/大纲 标签切换)
│   ├── FileTree (文件树)
│   │   ├── TreeFolder (文件夹节点，含 data-path)
│   │   ├── TreeFile (文件节点，含 data-path)
│   │   ├── InlineRename (内联重命名)
│   │   ├── InlineCreate (内联新建)
│   │   └── MouseDrag (拖拽移动)
│   └── OutlineTree (大纲树)
├── EditorArea
│   ├── WYSIWYGEditor (所见即所得编辑器)
│   └── SourceEditor (源码编辑器，CodeMirror)
├── StatusBar
│   ├── Stats (字数/行数/光标)
│   └── Actions (设置/专注/主题按钮)
├── SettingsModal
│   ├── GeneralPanel
│   ├── AppearancePanel
│   ├── EditorPanel
│   └── ShortcutsPanel
├── ContextMenu
│   ├── RenameAction
│   ├── DuplicateAction
│   └── DeleteAction
└── Toast
```

### 1.2 状态管理

使用简单的全局状态对象 + 事件驱动更新：

```typescript
interface AppState {
  theme: 'light' | 'dark' | 'sepia';
  sidebar: { collapsed: boolean; tab: 'files' | 'outline' };
  editor: { mode: 'wysiwyg' | 'source'; content: string; fileId: string | null };
  workspace: { path: string | null; tree: FileNode[] };
  settings: Settings;
  ui: { contextMenu: ContextMenuState | null; settingsOpen: boolean };
}
```

状态更新通过 `Object.assign(state, patch)` + 事件触发实现。各个组件订阅 `statechange` 事件响应更新。

### 1.3 编辑器架构

**Tiptap/ProseMirror 核心原理：**

文档结构 ≠ HTML 渲染。Markdown 语法单元映射为"节点"（Node），编辑操作直接修改节点树。

**Tiptap 核心流程：**

```
用户输入 → ProseMirror 事务 → 节点更新 → 渲染更新
                                       ↕
                              Markdown 序列化（双向同步）
```

**Tiptap 配置要点：**

- TipTap StarterKit（不含 codeBlock，改用 CodeBlockLowlight）
- TaskList + TaskItem（支持嵌套）
- Table + TableRow + TableCell + TableHeader（支持可调整列宽）
- CodeBlockLowlight（highlight.js + lowlight）
- Markdown 扩展（tiptap-markdown 负责双向序列化）

**Markdown 双向同步：**

```typescript
// 加载文件
editor.commands.setContent(markdownContent);

// 保存文件
const markdown = editor.storage.markdown.getMarkdown();
await invoke('write_file', { path, content: markdown });
```

### 1.4 源码模式

使用 CodeMirror v6 替代原生 textarea。通过编辑器 DOM 的切换实现 WYSIWYG ↔ Source 模式切换，保持文件状态不变。

### 1.5 Mermaid 集成

渲染流程：代码块识别 → 检测 `language-mermaid` → 提取内容 → `mermaid.render()` → 替换为 SVG。

前端的 `renderMermaidBlocks()` 函数扫描所有 mermaid 代码块，异步渲染 SVG，并在内容变化时重新渲染。

### 1.6 主题系统

**CSS 变量架构**：`variables.css` 定义 `:root`（浅色）、`[data-theme="dark"]`、`[data-theme="sepia"]` 三组变量。通过设置 `document.documentElement.dataset.theme` 切换主题，所有组件通过 CSS 变量响应变化。

---

## 2. Rust 后端模块与 IPC 接口

### 2.1 命令接口

#### 文件操作命令

```rust
#[tauri::command] async fn read_file(path: String) -> Result<String, String>;
#[tauri::command] async fn write_file(path: String, content: String) -> Result<(), String>;
#[tauri::command] async fn create_file(path: String, content: Option<String>) -> Result<(), String>;
#[tauri::command] async fn create_dir(path: String) -> Result<(), String>;
#[tauri::command] async fn rename_path(from: String, to: String) -> Result<(), String>;
#[tauri::command] async fn delete_path(path: String) -> Result<(), String>;
#[tauri::command] async fn copy_file(from: String, to: String) -> Result<(), String>;
#[tauri::command] async fn read_dir_recursive(path: String) -> Result<Vec<FileEntry>, String>;
#[tauri::command] async fn read_single_dir(path: String) -> Result<Vec<FileEntry>, String>;
#[tauri::command] async fn set_workspace(path: String) -> Result<(), String>;
#[tauri::command] async fn get_workspace() -> Result<Option<String>, String>;
```

`read_single_dir` 是非递归目录读取，仅返回目录的直接子项，用于文件树的外科手术式 DOM 更新。

#### 文件监听命令

```rust
#[tauri::command] async fn start_file_watcher(path: String) -> Result<(), String>;
#[tauri::command] async fn stop_file_watcher() -> Result<(), String>;
```

#### 设置命令

```rust
#[tauri::command] fn get_settings() -> Result<Settings, String>;
#[tauri::command] fn update_settings(settings: Settings) -> Result<(), String>;
```

### 2.2 文件监听模块

使用 `notify` crate 监听文件系统变化。Watcher 实例绑定到 AppHandle，随应用生命周期管理。

**关键实现：**

- 启动：前端调用 `start_file_watcher` → 创建工作区目录递归监听
- 事件分发：通过 `app_handle.emit("file-changed", payload)` 推送到前端
- 路径标准化：Windows 反斜杠统一转换为正斜杠

**Watcher 事件抑制：**

前端在执行自操作前，将相关路径加入 `suppressPaths` 集合。监听器检查事件路径是否被抑制，若是则跳过文件树刷新，由外科手术式 DOM 操作处理。

### 2.3 文件树架构

采用**外科手术式 DOM 更新**策略，避免全量重建导致的文件夹折叠状态丢失。

**四个核心函数：**

| 函数 | 用途 |
| --- | --- |
| `insertEntryIntoTree` | 创建/复制后插入节点 |
| `removeEntryFromTree` | 删除后移除节点 |
| `renameEntryInTree` | 重命名后更新节点 |
| `refreshFileTree` | 外部变更时全量重建（保留展开状态） |

**鼠标拖拽移动：**

由于 Tauri WebView2 不支持 HTML5 Drag API，使用原生鼠标事件实现。mousedown → mousemove（ghost 元素跟随）→ mouseup（执行移动）。

### 2.4 配置管理

配置文件存储在 `~/.config/MarkFlow/settings.json`。

核心配置项：theme、font_size、line_height、spellcheck、soft_wrap、autosave、autosave_interval 等。

默认配置在 Rust 端通过 `impl Default for Settings` 定义。

### 2.5 安全设计

- **CSP 策略**：限制脚本仅同源，禁止 `unsafe-eval`，图片仅允许 `data:` 和 `blob:`
- **文件访问限制**：仅能访问用户通过对话框授权的文件夹
- **路径校验**：自定义 Rust 命令对传入路径做 `canonicalize()` + `starts_with` 校验，拒绝符号链接逃逸和越权访问
- **Mermaid SVG Sanitization**：禁止脚本标签、事件属性、外部资源加载

---

## 3. Tauri v2 配置

### 3.1 tauri.conf.json

- 窗口默认 1200×800，最小 800×600
- CSP 允许 `asset:` 和 `http://asset.localhost` 作为图片来源
- dev: `http://localhost:1420`，build: `../dist`

### 3.2 权限配置

核心权限：`core:default`、`dialog:default`、`fs:default` 及其细分操作。

动态工作区权限：dialog 选择文件夹后自动获得读写权限。自定义 Rust 命令自行校验路径合法性。

---

## 4. 构建与发布

> 实际配置以 `.github/workflows/release.yml` 和 `Cargo.toml` / `package.json` 为准。

- **触发条件**：推送 `v*` 标签
- **平台矩阵**：macOS（x86_64 + aarch64）、Ubuntu、Windows
- **产物格式**：Windows: .exe/.msi, macOS: .dmg, Linux: .AppImage/.deb

---

## 5. 关键实现细节

### 5.1 文件树排序

文件夹在前、文件在后，各自按名称字母排序。

### 5.2 编辑器状态管理

```
CLEAN ↔ DIRTY
- 内容变化 → DIRTY
- 保存后 → CLEAN
- 外部修改：CLEAN 自动重载，DIRTY 弹冲突对话框
```

### 5.3 行号计算

源码模式行号采用视觉行号：`charsPerLine = Math.floor(codeWidth / charWidth)`，`visualLines = Math.ceil(textLength / charsPerLine)`。

---

## 6. 测试策略

| 类型 | 范围 |
| --- | --- |
| 单元测试 | Rust 命令、前端工具函数 |
| 集成测试 | Tauri 命令、文件系统操作 |
| E2E 测试 | Playwright 覆盖关键用户流程 |
| 手动测试 | 按产品规格验收清单 |

---

## 7. 未来扩展预留

- **插件系统**：解析器、渲染器、主题预留扩展点
- **国际化**：前端架构预留多语言接口
- **云同步**：文件操作已抽象为接口，支持添加远程后端
