# 前端架构代码地图

> 纯 TypeScript + 原生 DOM，无框架（无 React/Vue/Svelte）

## 技术栈

- **编辑器引擎**：Tiptap v2（基于 ProseMirror）— WYSIWYG 模式
- **源码编辑器**：CodeMirror 6 — 源码模式
- **构建工具**：Vite 5
- **Markdown 序列化**：tiptap-markdown（ProseMirror ↔ Markdown 双向转换）
- **语法高亮**：highlight.js + lowlight
- **图表渲染**：Mermaid 11
- **Tauri 前端 API**：@tauri-apps/api v2 + plugin-dialog / plugin-fs / plugin-shell

## 目录结构

```
src/
├── main.ts              # 应用入口，初始化所有模块
├── lib/                 # 核心逻辑层
│   ├── editor.ts        # Tiptap 编辑器初始化、扩展配置、WYSIWYG/源码切换
│   ├── editor.helpers.ts # 代码块行号计算（computeVisualLineNumbers）
│   ├── storage.ts       # Tauri IPC 封装（invoke 调用 Rust 命令）
│   ├── theme.ts         # 主题初始化（亮/暗模式切换）
│   ├── imageUtils.ts    # 图片粘贴/拖拽/网络图片下载处理
│   ├── mermaid.ts       # Mermaid 图表渲染封装
│   ├── pathUtils.ts     # 路径工具（解析相对路径、获取文件名）
│   ├── urlDecorationPlugin.ts # ProseMirror 插件：纯文本 URL 视觉装饰
│   └── logger.ts        # 前端日志（调用后端 log_frontend_event）
├── components/          # UI 组件层（原生 DOM 操作）
│   ├── toolbar.ts       # 工具栏（格式化按钮、模式切换）
│   ├── sidebar.ts       # 侧边栏（文件列表/大纲切换、文件打开/保存）
│   ├── fileTree.ts      # 文件树（workspace 管理、文件增删改）
│   ├── outline.ts       # 大纲面板（标题导航）
│   ├── statusbar.ts     # 状态栏（字数/行数/光标位置）
│   ├── settings.ts      # 设置面板（编辑器配置）
│   ├── menu.ts          # 菜单系统
│   ├── toast.ts         # 消息提示
│   ├── contextMenu.ts   # 右键菜单基础组件
│   ├── linkDialog.ts    # 链接编辑对话框
│   ├── newFileDialog.ts # 新建文件对话框
│   ├── imageContextMenu.ts    # 图片右键菜单
│   └── mermaidContextMenu.ts  # Mermaid 图表右键菜单（导出 SVG/PNG）
├── utils/
│   └── keyboard.ts      # 全局快捷键绑定
└── styles/
    ├── variables.css     # CSS 变量（主题色、间距）
    └── main.css          # 全局样式
```

## 启动流程

1. `main.ts` → DOMContentLoaded 事件触发
2. 依次初始化：Theme → Sidebar → Menu → StatusBar → Settings → **Editor** → Toolbar → Keyboard
3. 轮询 `take_cli_file` 获取命令行文件路径（macOS RunEvent 可能延迟）
4. 无 CLI 文件则 `restoreWorkspace()` 恢复上次工作区
5. 注册 `file-changed` 监听（来自 Rust 文件监视器）
6. 启动自动保存定时器

## 编辑器架构

### Tiptap 扩展配置
- **StarterKit**（排除 codeBlock）：基础文本格式
- **CustomLink**：禁用 paste rules，强制 `[text](url)` 序列化格式
- **BlockImage**：自定义 NodeView，支持加载失败提示
- **mermaidCodeBlockExtension**：CodeBlockLowlight 扩展，Mermaid 语言特殊处理（预览/编辑切换）
- **Table** 系列：表格支持
- **TaskList/TaskItem**：任务列表
- **Markdown**：tiptap-markdown 双向转换
- **imageSrcResolver**：ProseMirror 插件，相对路径图片 → asset:// 协议转换
- **imageBubble**：图片点击弹出编辑面板

### 双模式切换
- WYSIWYG 模式：Tiptap/ProseMirror 编辑器
- 源码模式：原生 `<textarea>` + 行号 gutter
- `switchToSource()` / `switchToWysiwyg()`：内容在两个编辑器间同步

## 数据流

```
用户输入 → Tiptap Editor → onUpdate 回调 → documentState.dirty 标记
                                ↓
         editor.storage.markdown.getMarkdown() → replaceAssetUrlsWithOriginal()
                                ↓
         normalizeImageMarkdown() → 标准化图片换行
                                ↓
         saveActiveDocument() → invoke('write_file') → Rust 写入磁盘
```

## 前后端 IPC 通信

`storage.ts` 封装了所有 `invoke()` 调用，是前后端的唯一桥梁：
- 文件操作：read_file, write_file, create_file, delete_path, rename_path, copy_file
- 目录操作：read_dir_recursive, read_single_dir
- 工作区：set_workspace, get_workspace
- 设置：load_settings, save_settings
- 图片：read_file_as_base64, write_file_from_base64, fetch_remote_image_as_base64, download_image
- 导出：save_mermaid_svg_export, save_mermaid_png_export, save_image_export
- 窗口：open_file_in_new_window, take_cli_file, take_pending_file
- 历史：add_recent_file, add_recent_folder, clear_recent_history
