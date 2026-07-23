# html-export Specification

## Purpose
定义自包含 HTML 导出能力，确保导出文档保留当前编辑器主题、内联所有资源，脱离 MarkFlow 后仍可完整显示。

## Requirements

### Requirement: 自包含 HTML 文档
系统 SHALL 生成脱离 MarkFlow 后仍可完整显示的自包含 HTML 文件。输出 SHALL 不依赖 `asset://` 协议、本机绝对路径或外部 CSS/JS 文件。

#### Scenario: 离线环境显示
- **WHEN** 用户在无网络环境下打开导出的 HTML 文件
- **THEN** 文档 SHALL 完整显示所有内容、样式和图片
- **AND** 字体 SHALL 使用内联 woff2 或系统回退字体

#### Scenario: 跨机器一致性
- **WHEN** 用户将导出的 HTML 文件拷贝到另一台机器打开
- **THEN** 内容和样式 SHALL 与源机器上显示一致

### Requirement: 保留编辑器主题
系统 SHALL 在导出 HTML 中保留当前 `data-theme` 属性和对应的 CSS variables，确保 light/dark/sepia 主题在导出文档中生效。

#### Scenario: 导出保留当前主题
- **WHEN** 用户在 dark 主题下导出 HTML
- **THEN** HTML 根元素 SHALL 设置 `data-theme="dark"`
- **AND** `:root` SHALL 声明 dark 主题的 CSS variables

#### Scenario: 主题切换后导出
- **WHEN** 用户从 dark 切换到 sepia 主题后导出 HTML
- **THEN** 导出 HTML SHALL 使用 sepia 主题，不保留 dark 主题痕迹

### Requirement: 文档根容器保留
系统 SHALL 在导出 HTML 中保留 `.ProseMirror` 根容器（而非仅克隆子节点），使编辑器内容样式选择器自然命中。

#### Scenario: 保留 .ProseMirror 根
- **WHEN** 系统创建导出快照
- **THEN** 导出 HTML SHALL 包含 `<div class="ProseMirror" data-theme="...">...</div>` 结构
- **AND** 编辑器中 `.ProseMirror p`、`.ProseMirror h1` 等选择器 SHALL 在导出文档中生效

### Requirement: 内联字体资源
系统 SHALL 在导出 HTML 中内联所需字体（Source Serif 4、Source Han Serif SC 子集），通过 `@font-face` 的 `src: url(data:font/woff2;base64,...)` 声明。

#### Scenario: 字体内联
- **WHEN** 系统生成导出 HTML
- **THEN** `@font-face` SHALL 使用 base64 内联的 woff2 数据
- **AND** 不得引用外部字体文件或网络 URL

#### Scenario: 字体体积控制
- **WHEN** 内联字体
- **THEN** 英文字体（Source Serif 4）内联后 SHALL 不超过 500KB
- **AND** 中文字体子集 SHALL 不超过 5MB

### Requirement: 内联图片和图表
系统 SHALL 在导出 HTML 中将本地图片（asset:// URL）转换为 data URI 内联，将 Mermaid/PlantUML 图表渲染为 PNG 并内联。

#### Scenario: 本地图片内联
- **WHEN** 文档包含 `asset://` 协议的本地图片
- **THEN** 导出 HTML 中该图片 SHALL 使用 `data:image/...;base64,...` 内联

#### Scenario: 图表内联
- **WHEN** 文档包含 Mermaid 或 PlantUML 图表
- **THEN** 导出 HTML 中该图表 SHALL 使用渲染后的 PNG data URI

### Requirement: 不含编辑器交互控件
导出 HTML SHALL 不包含编辑器交互元素（光标、选区、拖拽控件、NodeView 按钮、右键菜单等）。

#### Scenario: 清理编辑器标记
- **WHEN** 系统创建导出快照
- **THEN** 快照 SHALL 移除 `contenteditable`、`draggable`、`.ProseMirror-cursorWrapper`、NodeView 控件元素
- **AND** 导出 HTML 不得包含任何编辑器专用 CSS 类名对应的交互样式

### Requirement: 导出 Ready 协议
系统 SHALL 在导出前等待所有资源就绪：`document.fonts.ready` resolve、所有 `<img>` 的 `decode()` 完成、Mermaid/PlantUML 渲染完成。

#### Scenario: 字体就绪等待
- **WHEN** 导出流程启动
- **THEN** 系统 SHALL 等待 `document.fonts.ready` promise resolve
- **AND** 超过 10 秒 SHALL 超时并继续导出（使用已加载字体）

#### Scenario: 图片就绪等待
- **WHEN** 快照中包含 `<img>` 元素
- **THEN** 系统 SHALL 等待所有图片 `decode()` 完成
- **AND** 加载失败的图片 SHALL 保留原始标签，不阻塞导出
