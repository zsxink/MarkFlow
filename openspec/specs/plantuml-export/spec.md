# plantuml-export Specification

## Purpose
定义 PlantUML 图表的右键导出菜单，允许用户将已渲染的 PlantUML 图表保存为 SVG 或 PNG 文件，或复制 SVG 源码和 PNG 图像到剪贴板。

## Agent Context
- **源码入口：** `src/components/plantumlContextMenu.ts`、`src/components/plantumlContextMenu.helpers.ts`
- **调用端：** `src/lib/editor.extensions.ts`（NodeView 右键事件）
- **依赖规范：** `plantuml-render`、`context-menu`、`editor-bottom-spacer`、`safe-dom-construction`
- **不变量：** 仅当 PlantUML 渲染成功（`renderedSvg` 非空）时才显示菜单；导出操作不会修改编辑器内容；SVG→PNG 转换不改变原始 SVG 数据。
- **验证：** `npm test`；`npx openspec validate plantuml-export --strict`

## Requirements

### Requirement: PlantUML 右键菜单入口
系统 SHALL 在 PlantUML 图表成功渲染后，用户右键点击图表时显示右键菜单。菜单项包括「图片另存为 SVG」「图片另存为 PNG」「复制 SVG」「复制 PNG」四项。

每个菜单项的回调 SHALL 捕获异常并通过 `showToast` 显示用户可理解的中文错误信息。

#### Scenario: 右键已渲染的 PlantUML 图表弹出菜单
- **WHEN** 用户右键点击一个已成功渲染的 PlantUML 图表
- **THEN** 系统 SHALL 弹出包含四项目的右键菜单
- **THEN** 菜单定位、关闭行为和样式 SHALL 遵循 `context-menu` 规范的统一约定

#### Scenario: 渲染失败时不显示导出菜单
- **WHEN** 用户右键点击一个渲染失败的 PlantUML 图表（`renderedSvg` 为空）
- **THEN** 系统 SHALL NOT 弹出导出菜单（保持现有的 NodeView 默认行为：编辑源码）

### Requirement: 另存为 SVG
系统 SHALL 在用户选择「图片另存为 SVG」时，打开原生保存对话框，默认文件名为 `{文档名}-plantuml.svg`，并将当前渲染的 SVG 内容写入文件。

#### Scenario: SVG 导出成功
- **WHEN** 用户选择「图片另存为 SVG」并在保存对话框中确认路径
- **THEN** 系统 SHALL 将 SVG 内容写入选定文件
- **THEN** 系统 SHALL 通过 `showToast` 显示「SVG 已保存」

#### Scenario: 用户取消 SVG 保存
- **WHEN** 用户在「图片另存为 SVG」的保存对话框中取消
- **THEN** 系统 SHALL 不写入任何文件且不显示错误或成功提示

### Requirement: 另存为 PNG
系统 SHALL 在用户选择「图片另存为 PNG」时，将 SVG 渲染到 Canvas 上转换为 PNG Blob，再通过 Tauri 原生保存对话框写入 `.png` 文件。

#### Scenario: PNG 导出成功
- **WHEN** 用户选择「图片另存为 PNG」并在保存对话框中确认路径
- **THEN** 系统 SHALL 将 SVG 转换为 PNG 并写入选定文件
- **THEN** 系统 SHALL 通过 `showToast` 显示「PNG 已保存」

#### Scenario: SVG 尺寸无效导致 PNG 转换失败
- **WHEN** SVG 的 width/height/viewBox 均为空或无效
- **THEN** 系统 SHALL 使用图片自然尺寸（`naturalWidth`/`naturalHeight`）作为备选
- **THEN** 若所有尺寸均无效，SHALL 使用 `1x1` 作为最小尺寸

#### Scenario: PNG 尺寸超出 Canvas 限制
- **WHEN** SVG 尺寸超过 `MAX_PNG_CANVAS_DIMENSION`（8192）或像素总数超过 `MAX_PNG_CANVAS_PIXELS`（33,554,432）
- **THEN** 系统 SHALL 提示用户「图片尺寸过大，无法导出 PNG」
- **THEN** 系统 SHALL NOT 写入文件

### Requirement: 复制 SVG
系统 SHALL 在用户选择「复制 SVG」时，将 SVG 源码写入系统剪贴板，优先使用 Clipboard API 写入 `image/svg+xml` 和 `text/plain` 两种格式，失败时降级为 `writeText`。

#### Scenario: 通过 Clipboard API 复制 SVG
- **WHEN** 浏览器支持 `ClipboardItem` 且 `navigator.clipboard.write` 可用
- **THEN** 系统 SHALL 同时写入 `image/svg+xml` 和 `text/plain` MIME 类型

#### Scenario: 降级为纯文本复制
- **WHEN** `ClipboardItem` 不可用但 `navigator.clipboard.writeText` 可用
- **THEN** 系统 SHALL 将 SVG 作为纯文本写入剪贴板

#### Scenario: 复制成功显示提示
- **WHEN** SVG 复制成功
- **THEN** 系统 SHALL 通过 `showToast` 显示「SVG 已复制」

### Requirement: 复制 PNG
系统 SHALL 在用户选择「复制 PNG」时，将 SVG 转换为 PNG Blob，通过 Clipboard API 写入 `image/png` 到系统剪贴板。

#### Scenario: 通过 Clipboard API 复制 PNG
- **WHEN** 用户选择「复制 PNG」且 `ClipboardItem` 和 `navigator.clipboard.write` 均可用
- **THEN** 系统 SHALL 将 PNG Blob 以 `image/png` MIME 类型写入剪贴板

#### Scenario: 复制 PNG 成功显示提示
- **WHEN** PNG 复制成功
- **THEN** 系统 SHALL 通过 `showToast` 显示「PNG 已复制」

#### Scenario: 环境不支持复制 PNG
- **WHEN** `ClipboardItem` 或 `navigator.clipboard.write` 不可用
- **THEN** 系统 SHALL 提示用户「当前环境不支持复制 PNG」

### Requirement: 默认导出文件名
系统 SHALL 为 PlantUML 导出文件提供默认文件名，格式为 `{文档名}-plantuml`（如 `readme-plantuml.svg`），选用当前活动文档的文件名（不含扩展名）。

#### Scenario: 有活动文档
- **WHEN** 编辑器有打开的活动文档（`activeFilePath` 非空）
- **THEN** 默认文件名为 `{文档名}-plantuml`，其中文档名为 `getFileName(activeFilePath)` 去掉扩展名的部分

#### Scenario: 无活动文档
- **WHEN** 编辑器无打开的活动文档
- **THEN** 默认文件名为 `plantuml-diagram-plantuml`
