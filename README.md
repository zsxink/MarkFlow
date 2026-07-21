# MarkFlow

> 一款面向写作者与开发者的跨平台所见即所得 Markdown 编辑器。

MarkFlow 让你像编辑富文本一样编写 Markdown。输入内容即可实时渲染，无需额外预览面板。文件始终保存在本地文件系统中，没有云端绑定，也没有私有格式；只需打开一个文件夹即可开始写作。

---

![](assets/markflow-wordmark.png)

## 功能特性

- **所见即所得编辑** —— Markdown 语法实时渲染，体验类似 Typora
- **完整 GFM 支持** —— 标题、粗体、斜体、删除线、行内代码、代码块、引用、列表、任务列表、表格、链接、图片与分割线，并扩展支持 Mermaid / PlantUML 图表渲染
- **图片支持** —— 可通过工具栏插入、剪贴板粘贴、拖拽导入，或手动输入语法；支持本地与网络图片
- **三种内置主题** —— 浅色、深色、护眼棕，一键切换
- **文件树侧边栏** —— 浏览工作区目录结构并管理文件
- **大纲视图** —— 自动提取标题层级，便于快速导航
- **源码模式** —— 可切换到纯文本编辑器直接编辑 Markdown（`Ctrl+/`）
- **专注模式** —— 隐藏工具栏、侧边栏和状态栏，获得无干扰写作体验（`Ctrl+Shift+F`）
- **Mermaid 图表** —— 在代码块中编写 Mermaid 语法并自动渲染
- **PlantUML 图表 / PlantUML** —— 在代码块中编写 PlantUML 语法并自动渲染；右键图表可导出为 SVG、PNG 或复制到剪贴板
- **无障碍支持 / Accessibility** —— 核心 UI 组件具备 ARIA 属性，屏幕阅读器友好
- **右键菜单 / Context Menu** —— 在文件树中右键可新建、重命名、复制、删除文件和文件夹
- **文件拖拽排序 / Drag & Drop** —— 在文件树中拖拽文件或文件夹即可移动至目标目录
- **URL 自动检测 / URL Auto-Detection** —— 输入 URL 即自动转换为可点击链接
- **字体配置 / Font Settings** —— 在设置面板中可自定义编辑器正文字体
- **设置面板** —— 可配置自动保存、字号、行高、代码高亮、图片存储策略等选项
- **外部文件监听** —— 检测其他编辑器对当前文件的修改；检测到外部修改后会暂停自动保存，并在手动保存时确认是否覆盖磁盘内容

---

## 快速开始

### 环境要求

- **Node.js** 18+

- **Rust** 1.70+

- **Linux 依赖**：

  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

### 安装

#### macOS（推荐 — Homebrew）

```bash
brew install zsxink/tap/markflow
```

> **首次使用 Homebrew tap？** 执行上述命令后 Homebrew 会自动添加 `zsxink/tap`，后续更新只需 `brew upgrade markflow`。

#### 从 GitHub Releases 下载

从 [Releases 页面](https://github.com/zsxink/MarkFlow/releases) 下载对应平台的安装包：

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| macOS | `_aarch64.dmg` | 拖入 Applications 文件夹 |
| Windows | `.exe` | NSIS 安装包 |
| Linux | `.AppImage` / `.deb` | 直接运行或安装 |

#### 从源码构建

```bash
git clone https://github.com/zsxink/MarkFlow.git
cd MarkFlow
npm install
```

### 开发运行

```bash
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`：

| 平台 | 输出 |
| --- | --- |
| Windows | `.exe`（NSIS 安装包）、`.msi` |
| macOS | `.dmg`（Apple Silicon） |
| Linux | `.AppImage`、`.deb` |

---

## 使用说明

### 文件管理

- **打开文件夹** —— 点击工具栏按钮选择工作区
- **新建文件** —— 点击工具栏按钮
- **新建文件夹** —— 点击侧边栏底部按钮
- **打开文件** —— 点击文件树中的文件
- **重命名 / 复制 / 删除** —— 在文件上右键操作
- **记住工作区** —— 下次启动时自动恢复上次打开的目录

### 插入图片

支持以下四种方式：

1. **工具栏按钮** —— 点击图片图标，选择本地文件或输入 URL
2. **粘贴** —— 直接粘贴截图或图片（`Ctrl+V`）
3. **拖拽** —— 将图片文件拖入编辑器
4. **手动语法** —— 在源码模式输入 `![alt](path)`

图片存储位置可在设置中配置：工作区 `assets/`、文档级 `assets/`、自定义路径，或不自动处理。

### 快捷键

#### 格式化

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+B` | 加粗 |
| `Ctrl+I` | 斜体 |
| `Ctrl+Shift+S` | 删除线 |
| `` Ctrl+` `` | 行内代码 |
| `Ctrl+K` | 插入链接 |
| `Ctrl+S` | 保存文件 |

#### 视图与导航

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+\` | 切换侧边栏 |
| `Ctrl+/` | 切换源码 / 所见即所得模式 |
| `Ctrl+Shift+F` | 切换专注模式 |

> 在 macOS 上，`Ctrl` 对应 `Cmd`。

### 主题

内置三种主题，可通过工具栏主题按钮或设置面板切换：

| 主题 | 说明 |
| --- | --- |
| **浅色** | 暖白背景，默认主题 |
| **深色** | 适合夜间使用 |
| **护眼棕** | 类纸张色调，减轻视觉疲劳 |

### 设置

可通过工具栏齿轮按钮或状态栏打开设置面板。可配置项包括：

- 自动保存开关与保存间隔
- 字号与行高
- 代码高亮与行号
- 拼写检查与自动换行
- 主题与跟随系统主题
- 图片存储策略与命名方式

设置文件位置：

- **Windows**：`%APPDATA%\MarkFlow\settings.json`
- **macOS / Linux**：`~/.config/MarkFlow/settings.json`

---

## 项目文档

| 文档 | 描述 | 位置 |
| --- | --- | --- |
| 产品规格 | 产品定位、功能清单、验收标准 | `openspec/specs/product-spec.md` |
| 技术架构 | 技术栈、项目结构、架构概览 | `openspec/specs/architecture.md` |
| 技术设计 | 架构细节、组件设计、关键实现 | `openspec/specs/technical-design.md` |
| UI 设计稿 | 像素级 UI 规格 | `openspec/ui-design/SPEC.md` |
| UI 修复记录 | CSS 布局经验与修复清单 | `openspec/specs/ui-fixes-spec.md` |

> `openspec/specs/` 为 canonical spec 来源。

## 许可证

MIT