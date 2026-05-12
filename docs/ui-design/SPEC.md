# MarkFlow — 所见即所得 Markdown 编辑器 · 功能规格

> **原型定位说明**：本设计稿作为视觉/交互参考，原型中的 `markdownToHtml()` 仅用于展示布局效果，不代表实际 Markdown 渲染能力。GFM 语法、表格、任务列表、代码高亮、Mermaid 等功能的技术实现和测试样例见 `docs/technical-design.md`。

> 版本：1.0.0
> 平台：桌面端（macOS / Windows / Linux）
> 目标用户：写作者、开发者
> 设计风格：编辑器 / 杂志风格，温暖克制

---

## 1. 整体布局

采用 CSS Grid 三行两列布局：

```
┌─────────────────────────────────────┐
│             工具栏 (44px)            │
├───────────┬─────────────────────────┤
│  侧边栏    │                         │
│  (240px)  │       编辑区             │
│           │                         │
├───────────┴─────────────────────────┤
│           状态栏 (28px)              │
└─────────────────────────────────────┘
```

CSS 声明：

```css
#app {
  display: grid;
  grid-template-rows: var(--toolbar-h) 1fr var(--statusbar-h);
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  grid-template-areas:
    "toolbar toolbar"
    "sidebar editor"
    "statusbar statusbar";
}
```

- 工具栏：`grid-area: toolbar`，跨两列
- 侧边栏：`grid-area: sidebar`，可折叠至 0 宽度（`#sidebar.collapsed { width: 0 }`）
- 编辑区：`grid-area: editor`，自适应剩余空间
- 状态栏：`grid-area: statusbar`，跨两列

---

## 2. 工具栏

位于页面顶部，高度 44px，左侧对齐，`background: var(--surface)`，底部分隔线 `1px solid var(--border)`。按钮尺寸 34×34px，圆角 6px，hover 显示 `var(--code-bg)` 背景。当前激活按钮使用强调色 (`var(--accent)`) + 浅色背景 (`var(--accent-soft)`)。

### 2.1 侧边栏切换

- ID：`sidebar-toggle`
- 图标：SVG 分栏矩形
- 提示文本：`切换侧边栏 (Ctrl+\)`
- 功能：展开/折叠侧边栏

### 2.2 品牌标识

- 元素：`<span class="toolbar-brand">Mark<span>Flow</span></span>`
- `Flow` 使用强调色 `var(--accent)`
- 字重 600，字号 15px，字间距 -0.02em
- 无交互

### 2.3 文件操作（按钮组）

| 按钮 ID | 图标 | 提示文本 | 功能 |
|---------|------|----------|------|
| `sidebar-open-folder` | SVG 文件袋（无 + 号） | 打开文件夹 | 调用 Tauri `dialog.open()` 选择本地文件夹，递归加载 `.md` 文件 |
| `btn-new` | SVG + | 新建文件 | 弹出新建文件命名对话框 |
| `btn-save` | SVG 软盘 | 保存 (Ctrl+S) | 手动保存当前文件 |
| `btn-settings` | SVG 齿轮 | 设置 | 打开设置模态面板 |

### 2.4 格式化（按钮组）

| 按钮 ID | 图标 | 提示文本 | 功能 |
|---------|------|----------|------|
| `btn-bold` | SVG B | 粗体 (Ctrl+B) | `editor.chain().focus().toggleBold().run()` |
| `btn-italic` | SVG I | 斜体 (Ctrl+I) | `editor.chain().focus().toggleItalic().run()` |
| `btn-strike` | SVG S | 删除线 | `editor.chain().focus().toggleStrike().run()` |
| `btn-code` | SVG <> | 行内代码 (Ctrl+\`) | `editor.chain().focus().toggleCode().run()` |

### 2.5 插入（按钮组）

| 按钮 ID | 图标 | 提示文本 | 功能 |
|---------|------|----------|------|
| `btn-h1` | H + 1 | 标题 1 | `editor.chain().focus().toggleHeading({ level: 1 }).run()` |
| `btn-h2` | H + 2 | 标题 2 | `editor.chain().focus().toggleHeading({ level: 2 }).run()` |
| `btn-quote` | SVG 引号 | 引用 | `editor.chain().focus().toggleBlockquote().run()` |
| `btn-link` | SVG 链接 | 链接 (Ctrl+K) | `editor.chain().focus().setLink({ href }).run()` |
| `btn-ul` | SVG 圆点列表 | 无序列表 | `editor.chain().focus().toggleBulletList().run()` |
| `btn-ol` | SVG 数字列表 | 有序列表 | `editor.chain().focus().toggleOrderedList().run()` |
| `btn-hr` | SVG 横线 | 分隔线 | `editor.chain().focus().setHorizontalRule().run()` |
| `btn-codeblock` | SVG 代码块 | 代码块 | `editor.chain().focus().toggleCodeBlock().run()` |

### 2.6 模式切换（按钮组）

| 按钮 ID | 图标 | 提示文本 | 功能 |
|---------|------|----------|------|
| `btn-wysiwyg` | SVG 双书页 | 所见即所得 | 切换到所见即所得模式（默认） |
| `btn-source` | SVG `<>` | 源码模式 (Ctrl+/) | 切换到源码 textarea |
| `btn-focus` | SVG 全屏框 | 专注模式 (Ctrl+Shift+F) | 切换专注模式 |

### 2.7 主题切换

- ID：`btn-theme`
- 位置：工具栏最右侧，`toolbar-spacer` 之后
- 图标：emoji 文字，`<span id="theme-icon">☀️</span>`
- 浅色主题显示 ☀️，深色主题显示 🌙，护眼 Sepia 显示 📖
- 通过 `setTheme()` 函数循环切换（light → dark → sepia → light），更新 `data-theme` 属性和 `theme-icon` 内容

---

## 3. 侧边栏

宽度 240px，`background: var(--bg)`，右侧分隔线 `1px solid var(--border)`。可折叠至 0 宽度，折叠时右侧分隔线隐藏。

### 3.1 标签页

两个标签各占 50% 宽度，文字居中，选中时底部有强调色边框（`2px solid var(--accent)`）：

| 标签 | data-tab | 功能 |
|------|----------|------|
| 文件 | `files` | 文件树浏览器（默认） |
| 大纲 | `outline` | 当前文档的标题层级 |

标签页切换由 `switchSidebarTab(tab)` 函数控制，同时管理：
- 文件树 `#file-tree` 的显示/隐藏
- 大纲树 `#outline-tree` 的显示/隐藏
- 底部操作栏 `#sidebar-footer` 的显示/隐藏（仅文件标签页显示，`display: flex`）

### 3.2 文件标签

- 容器：`<nav id="file-tree">`
- 支持文件夹和文件的层级展示
- 文件夹使用 `tree-folder` + `tree-children` 嵌套结构
- 文件夹默认展开（顶级），带旋转箭头指示（`tree-chevron`，展开时 `rotate(90deg)`）
- 文件选中时左侧有强调色边框（`2px solid var(--accent)`）+ 浅色背景（`var(--accent-soft)`）+ 强调色文字
- 文件支持右键菜单：重命名、复制、删除
- 文件夹图标：SVG 文件袋（无 + 号）
- 文件图标：SVG 文档页

### 3.3 大纲标签

- 容器：`<nav id="outline-tree">`
- 自动提取当前文档所有标题（H1-H6），通过 `editor.querySelectorAll('h1, h2, h3, h4, h5, h6')` 实现
- 按 DOM 顺序排列，支持层级缩进（每级 12px）
- 左侧有级别标签（`outline-level`）：H1/H2/H3...，等宽字体，9px，浅色背景
- 点击标题调用 `heading.scrollIntoView({ behavior: 'smooth', block: 'start' })` 平滑滚动
- 无标题时显示空状态提示：`"当前文档无标题"`
- 编辑内容变化时自动刷新（`editor` 的 `input` 事件触发）

### 3.4 底部操作栏

- ID：`sidebar-footer`
- 仅在"文件"标签页显示（`switchSidebarTab` 控制 `display: flex/none`）
- 上方分隔线 `1px solid var(--border)`
- 水平排列，间距 24px

| 操作 ID | 图标 | 文字 | 功能 |
|---------|------|------|------|
| `sidebar-open-btn` | SVG 文件袋（无 + 号） | 打开文件夹 | 导入本地文件夹中的 .md 文件 |
| `sidebar-newfolder-btn` | SVG 文件袋 + 号 | 新建文件夹 | 创建新文件夹 |

---

## 4. 编辑区

居中布局，最大宽度 720px（`max-width: 720px`），内边距 `56px 48px 120px`。背景 `var(--surface)`。

### 4.1 所见即所得模式

- 元素：`<div id="editor"></div>` (Tiptap 容器)
- 空文档时显示占位文字：`"开始写作 — 输入即所得"`（通过 Tiptap Placeholder 扩展实现）
- 输入即渲染，支持以下 Markdown 语法的实时渲染（通过 Tiptap + GFM 扩展实现）：

| 语法 | 渲染效果 |
|------|----------|
| `# 标题` | H1，2.2em，700 字重，底部有分隔线 |
| `## 标题` | H2，1.7em，600 字重 |
| `### 标题` | H3，1.35em，600 字重 |
| `**粗体**` | 700 字重 |
| `*斜体*` | 斜体 |
| `~~删除线~~` | 删除线 + 次要色 |
| `` `代码` `` | 等宽字体 0.875em，强调色，`var(--code-bg)` 背景，圆角 3px |
| `> 引用` | 左侧 3px 强调色边框，斜体，次要色 |
| `- 列表` | 无序列表，强调色标记 |
| `1. 列表` | 有序列表 |
| `- [x] 任务` | 复选框，可点击（`input[type=checkbox]`） |
| `---` | 水平分隔线 |
| `[文本](url)` | 强调色链接，下划线 |
| ` ``` 代码块 ``` ` | 浅色背景圆角块（8px），等宽字体 13px，1.65 行高，1px 边框 |
| `![alt](url)` | 图片，最大宽度 100%，圆角 6px |

### 4.2 源码模式

- 元素：`<textarea id="source-editor">` 原生 textarea，纯文本编辑原始 Markdown
- 等宽字体（JetBrains Mono / Fira Code / ui-monospace）
- 14px 字号，1.75 行高
- 双向同步机制：
  - WYSIWYG → 源码：`editor.storage.markdown.getMarkdown()` 序列化为 Markdown 字符串，填入 textarea
  - 源码 → WYSIWYG：`editor.commands.setContent(textarea.value)` 将 Markdown 解析为 ProseMirror 节点
- 切换时保留滚动位置和光标（按字符偏移量映射）
- 通过 `#editor.wysiwyg-mode` / `#editor.source-mode` 类控制显示/隐藏

### 4.3 专注模式

- 在 `#app` 上添加 `focus-mode` 类
- 工具栏、侧边栏、状态栏透明度降至 5%（`opacity: 0.05`，`transition: 400ms`）
- 鼠标 hover 时恢复显示（`opacity: 1`）
- 编辑区保持不变

---

## 5. 状态栏

高度 28px，底部固定，`background: var(--bg)`，顶部分隔线，字号 12px，次要色。

| 元素 ID | 位置 | 内容 |
|---------|------|------|
| `word-count` | 左侧 | 当前文档字数（按空格分词） |
| `line-count` | 左侧 | 当前文档行数 |
| `cursor-pos` | 左侧 | `行 X, 列 Y`（基于选区位置计算） |
| `mode-indicator` | 右侧 | 当前模式：所见即所得/源码/专注 |
| `sb-settings` | 右侧 | ⚙️ emoji，点击打开设置 |
| `sb-focus` | 右侧 | ⛶ emoji，点击切换专注模式 |
| `sb-theme` | 右侧 | 🌓 emoji，点击切换主题 |

`sb-spacer` 元素将左侧统计信息和右侧操作按钮分开。

---

## 6. 设置面板

模态对话框（`modal-overlay` + `modal modal-settings`），宽度 680px，左侧竖向标签页 + 右侧内容区的双栏布局。

### 6.1 布局结构

```
┌──────────────────────────────────────┐
│  设置                          ✕     │  ← modal-header
├──────────┬───────────────────────────┤
│  通用     │                           │
│  外观     │      设置内容              │  ← settings-body (flex)
│  编辑器   │                           │
│  快捷键   │                           │
└──────────┴───────────────────────────┘
```

- `.settings-body`：flex 容器
- `.settings-tabs`：左侧竖向排列（`flex-direction: column`），右侧分隔线，`padding-right: 20px`，`margin-right: 24px`
- `.settings-tab`：左对齐，圆角 6px，hover 浅色背景，active 使用强调色 + 浅色背景
- `.settings-panels`：右侧内容区，`flex: 1`，可滚动

### 6.2 通用面板（`panel-general`）

**文件分组：**

| 设置项 ID | 类型 | 默认值 | 说明 |
|-----------|------|--------|------|
| `setting-autosave` | 开关（toggle） | 开启（checked） | 编辑时自动保存到文件系统 |
| `setting-autosave-interval` | 下拉选择 | 10000（10 秒） | 可选 5000/10000/30000/60000 毫秒 |

**编辑器分组：**

| 设置项 ID | 类型 | 默认值 | 说明 |
|-----------|------|--------|------|
| `setting-spellcheck` | 开关 | 开启 | 浏览器拼写检查 |
| `setting-softwrap` | 开关 | 开启 | 自动换行 |

### 6.3 外观面板（`panel-appearance`）

**主题分组：**

- 主题预览：三个色块卡片（`theme-swatch`），每个卡片内含三个颜色方块 + 文字标签
  - 浅色：`#FAFAF8` / `#FFFFFF` / `#B5472A`，标签"浅色"
  - 深色：`#18181B` / `#1F1F23` / `#E8715A`，标签"深色"
  - 护眼 Sepia：`#F4ECD8` / `#FBF8F1` / `#8B6914`，标签"护眼"
  - 选中时边框 `2px solid var(--accent)`
  - ID：`theme-light-preview` / `theme-dark-preview` / `theme-sepia-preview`
- 跟随系统主题（`setting-follow-system`）：开关，自动匹配 OS 深色/浅色模式

**字体与排版分组：**

| 设置项 ID | 类型 | 默认值 | 说明 |
|-----------|------|--------|------|
| `setting-fontsize` | 下拉选择 | 18px | 可选 14/16/18/20/22px |
| `setting-lineheight` | 下拉选择 | 1.7（标准） | 可选 1.5（紧凑）/1.7/1.8（宽松）/2.0（双倍） |

### 6.4 编辑器面板（`panel-editor`）

**Markdown 分组：**

| 设置项 ID | 类型 | 默认值 | 说明 |
|-----------|------|--------|------|
| `setting-livepreview` | 开关 | 开启 | 输入时实时渲染 |
| `setting-codehighlight` | 开关 | 开启 | 代码块语法高亮 |
| `setting-linenumbers` | 开关 | 关闭 | 源码模式下行号 |

**界面分组：**

| 设置项 ID | 类型 | 默认值 | 说明 |
|-----------|------|--------|------|
| `setting-sidebar` | 开关 | 开启 | 启动时显示侧边栏 |
| `setting-tooltips` | 开关 | 开启 | 悬停显示快捷键 |

### 6.5 快捷键面板（`panel-shortcuts`）

两列网格布局（`grid-template-columns: 1fr 1fr`），每行显示操作名称 + 按键组合。

**格式化组：**

| 操作 | 按键 |
|------|------|
| 粗体 | Ctrl + B |
| 斜体 | Ctrl + I |
| 删除线 | Ctrl + Shift + S |
| 行内代码 | Ctrl + \` |
| 链接 | Ctrl + K |
| 保存 | Ctrl + S |

**视图组：**

| 操作 | 按键 |
|------|------|
| 切换侧边栏 | Ctrl + \ |
| 专注模式 | Ctrl + Shift + F |
| 源码模式 | Ctrl + / |
| 新建文件 | Ctrl + N |

底部版本信息：`MarkFlow v1.0.0 · 所见即所得 Markdown 编辑器`

---

## 7. 快捷键列表

### 格式化

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 粗体 |
| `Ctrl+I` | 斜体 |
| `Ctrl+Shift+S` | 删除线 |
| `` Ctrl+` `` | 行内代码 |
| `Ctrl+K` | 插入链接 |
| `Ctrl+S` | 保存 |

### 视图

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+\` | 切换侧边栏 |
| `Ctrl+Shift+F` | 专注模式 |
| `Ctrl+/` | 源码模式 / 所见即所得模式切换 |
| `Ctrl+N` | 新建文件 |

> macOS 上 `Ctrl` 对应 `⌘ (Cmd)`，通过 `e.ctrlKey || e.metaKey` 检测。

---

## 8. 文件管理

### 8.1 本地文件系统

- 所有文件存储在用户选择的本地文件夹中，通过 Tauri 文件系统 API 读写真实的 `.md` 文件
- 文件结构为文件夹嵌套，通过文件系统路径组织
- 每个文件包含完整的文件路径（`path`）、文件名（`name`）、内容（`content`）字段
- 通过 Rust 端 `notify` crate 监听文件系统变化，clean 自动重载，dirty 弹冲突对话框
- 配置文件版本控制：`settings.json` 内含 `version` 字段，版本不匹配时使用默认配置

### 8.2 文件操作

| 操作 | 触发方式 | 实现说明 |
|------|----------|----------|
| 打开文件夹 | 工具栏 `sidebar-open-folder` / 侧边栏 `sidebar-open-btn` | 通过 Tauri dialog API 选择文件夹，递归扫描 `.md` 文件构建文件树 |
| 新建文件 | 工具栏 `btn-new` | 弹出命名对话框，创建后自动打开，写入所选文件夹 |
| 新建文件夹 | 侧边栏 `sidebar-newfolder-btn` | 弹出命名对话框，在所选文件夹下创建新文件夹 |
| 打开文件 | 点击文件树项 | 调用 Rust 命令读取文件内容，加载到编辑器 |
| 保存文件 | 工具栏 `btn-save` / Ctrl+S | 调用 Rust 命令写入文件到磁盘 |
| 重命名 | 右键菜单 | 调用 Rust 命令重命名文件 |
| 复制 | 右键菜单 | 读取内容，写入新文件（名称追加" (副本)"） |
| 删除 | 右键菜单 | 调用 Rust 命令删除文件（需 `confirm()` 确认） |

### 8.3 大纲

- 实时从编辑区 `#wysiwyg-editor` 提取 H1-H6 标题
- 按 DOM 顺序排列，支持层级缩进（H1=0px, H2=12px, H3=24px ...）
- 左侧显示级别标签（`outline-level`）：`H1` / `H2` / `H3` 等
- 点击跳转到对应标题位置（`scrollIntoView({ behavior: 'smooth', block: 'start' })`）
- 编辑内容变化时自动刷新（`input` 事件监听）

---

## 9. 主题系统

### 浅色主题

```css
:root {
  --bg:      #FAFAF8;    /* 暖白背景 */
  --surface: #FFFFFF;    /* 卡片/编辑区 */
  --fg:      #1A1A1A;    /* 正文文字 */
  --muted:   #767676;    /* 次要文字 */
  --border:  #E5E3DF;    /* 边框 */
  --accent:  #B5472A;    /* 强调色（暖红） */
  --accent-soft: rgba(181,71,42,0.10);  /* 强调色浅背景 */
  --code-bg: #F2F0ED;    /* 代码背景 */
  --selection: rgba(181,71,42,0.12);    /* 选区背景 */
  --shadow:  0 4px 24px rgba(0,0,0,0.08);
}
```

### 深色主题

```css
[data-theme="dark"] {
  --bg:      #18181B;
  --surface: #1F1F23;
  --fg:      #E8E8E8;
  --muted:   #71717A;
  --border:  #2E2E33;
  --accent:  #E8715A;    /* 强调色（暖橙红） */
  --accent-soft: rgba(232,113,90,0.15);
  --code-bg: #27272A;
  --selection: rgba(232,113,90,0.18);
  --shadow:  0 4px 24px rgba(0,0,0,0.3);
}
```

切换方式：`document.documentElement.setAttribute('data-theme', theme)`，同时更新配置文件（`~/.config/MarkFlow/settings.json`）和主题图标。

---

## 10. 字体

| 用途 | 字体栈 |
|------|--------|
| 正文/编辑 | `'Newsreader', Georgia, serif` |
| 代码 | `'JetBrains Mono', ui-monospace, monospace` |
| UI 界面 | `'Noto Sans SC', -apple-system, system-ui, sans-serif` |

字体通过 Google Fonts CDN 加载：
- Newsreader（opsz 变量字体，支持 italic，300-700 字重）
- JetBrains Mono（400/500 字重）
- Noto Sans SC（400/500/600 字重）

---

## 11. 交互细节

### 工具栏提示

- 通过 `data-tooltip` 属性 + CSS `:hover::after` 伪元素实现
- `position: absolute`，位于按钮下方 6px
- `var(--fg)` 背景 + `var(--bg)` 文字，圆角 4px，字号 12px
- 白色不换行

### 右键菜单

- 仅在文件树的文件项上触发（`contextmenu` 事件）
- 通过 `showContextMenu(x, y, fileId)` 定位
- 包含三个操作项：重命名、复制、删除
- 删除操作需 `confirm()` 确认
- 点击其他区域自动关闭（`document.addEventListener('click', hideContextMenu)`）

### Toast 提示

- ID：`toast`
- 位置：底部居中偏上（`bottom: 60px`），水平居中
- `var(--fg)` 背景 + `var(--bg)` 文字，圆角 8px
- 自动消失：2 秒（`setTimeout`）
- 用于反馈操作结果：已保存、文件已创建、文件已删除等

### 自动保存

- 编辑内容变化后延迟保存（默认 10 秒，`window._saveTimer`）
- 保存到本地文件系统（通过 Tauri 命令写入磁盘文件）
- 手动保存：`Ctrl+S`

### 新建文件/文件夹对话框

- 共用同一个模态框 `newfile-modal`
- 标题 `newfile-title` 根据操作动态切换："新建文件" / "新建文件夹"
- 输入框 `newfile-name`，支持 Enter 确认、Escape 取消
- 点击遮罩关闭

---

## 12. JavaScript 架构

### 包装方式

整个脚本使用 IIFE 包装，严格模式：

```javascript
(function() {
  'use strict';
  // ...
})();
```

### DOM 工具函数

```javascript
function $(id) { return document.getElementById(id); }
function safe(id, evt, fn) {
  var el = $(id);
  if (el) el.addEventListener(evt, fn);
}
```

`safe()` 函数确保元素不存在时不会抛出错误，所有事件绑定均通过此函数完成。

### 状态管理

全局 `state` 对象存储所有运行时状态：

```javascript
var state = {
  theme: 'light',         // 当前主题
  sidebar: true,           // 侧边栏是否展开
  mode: 'wysiwyg',         // 编辑模式：wysiwyg / source / focus
  focusMode: false,         // 专注模式状态
  sidebarTab: 'files',     // 侧边栏当前标签：files / outline
  files: null,             // 文件树数据（从本地文件系统加载）
  activeFileId: '1',       // 当前打开的文件 ID
  autosave: true,          // 自动保存开关
  autosaveInterval: 10000  // 自动保存间隔（毫秒）
};
```

### 初始化流程（DOMContentLoaded）

1. 设置主题 `setTheme(state.theme)`
2. 恢复侧边栏状态
3. 绑定侧边栏标签页事件
4. 绑定侧边栏操作按钮事件
5. 绑定设置面板事件（按钮、关闭、遮罩点击、标签切换、设置项变更）
6. 绑定工具栏所有按钮事件
7. 绑定新建文件/文件夹对话框事件
8. 绑定右键菜单事件
9. 绑定编辑器事件（input、keyup、click）
10. 绑定键盘快捷键
11. 刷新文件树、打开默认文件、切换到文件标签

### 错误处理

- 文件系统操作全部 `try-catch` 包裹，错误时显示 Toast 提示
- DOM 元素访问通过 `safe()` 或 `if (el)` 防御
- 配置文件版本控制：存储在 `~/.config/MarkFlow/settings.json`，版本不匹配时使用默认配置

---

## 13. 默认示例文档

> ⚠️ **仅设计稿展示用。** 实际产品开发时，`state.files` 应初始化为空数组（`[]`），编辑器应为空文档，不预置任何示例文件。示例文档仅用于设计稿 `index.html` 演示大纲视图等功能的视觉效果。

首次加载时编辑器显示空文档，无预置示例文件。用户通过「打开文件夹」或「新建文件」开始：

| 文件 | 类型 | 内容概要 |
|------|------|----------|
| 快速入门 | file | MarkFlow 使用指南，含 H1/H2/H3 层级标题、列表、引用、代码块、表格 |
| 项目笔记 | folder | 包含设计稿.md（配色方案、任务列表）和会议纪要.md（表格） |
| 阅读清单.md | file | 技术类和文学类书目列表 |

"快速入门"文档包含完整的 Markdown 语法示例，同时为大纲视图提供丰富的标题层级。

**实际开发时的行为：**
- `state.files` 初始化为空数组 `[]`
- 编辑器显示为空文档（`data-placeholder` 占位文字：`"开始写作 — 输入即所得"`）
- 用户通过"打开文件夹"或"新建文件"开始创建内容

---

## 14. 参考实现

完整实现见同目录下的 `index.html`，包含：
- 所有 HTML 结构（工具栏、侧边栏、编辑区、状态栏、设置面板、新建对话框、右键菜单、Toast）
- 内联 CSS 样式（~210 行，含浅色/深色/护眼主题变量）
- 完整 JavaScript 交互逻辑（~570 行，IIFE 包装，严格模式）
- 示例文档内容

> **原型说明：** `index.html` 使用 localStorage 模拟文件持久化，使用 `<input webkitdirectory>` 模拟文件夹选择，仅作视觉与交互演示。生产实现以 Tauri 文件系统 API + Rust 后端方案为准，详见 `docs/technical-design.md`。
