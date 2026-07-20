## Context

目前 PlantUML 图表在 ProseMirror NodeView 中通过 `plantuml-lazy.ts` 渲染为 SVG，渲染结果保存在 NodeView 闭包变量 `renderedSvg` 中，但右键菜单被 `editor.extensions.ts:351` 的条件 `if (!renderedSvg || !isMermaid()) return;` 拦截，导致 PlantUML 完全无法触发导出交互。

Mermaid 已有完整实现：`mermaidContextMenu.ts` 提供 4 项菜单（另存为 SVG、另存为 PNG、复制 SVG、复制 PNG），后端对应 `save_mermaid_svg_export` / `save_mermaid_png_export` 两个 Tauri command。SVG→PNG 转换函数（`svgToPngBlob`、`blobToBase64` 等）内联在 `mermaidContextMenu.ts` 中。

## Goals / Non-Goals

**Goals:**
- PlantUML 图表上右键弹出菜单，支持「另存为 SVG」「另存为 PNG」「复制 SVG」「复制 PNG」
- 与 Mermaid 的导出体验一致（菜单项名称、操作行为、错误提示风格一致）
- 复用现有的统一右键菜单 API `showContextMenuStatic()`

**Non-Goals:**
- 不改动文档级导出（HTML/Word/PDF）。`exportRenderedDocument` 已有 `renderedRoot.innerHTML` 机制，PlantUML 的 SVG 已作为内联 SVG 存在于 DOM 中，文档导出无需特殊处理
- 不改动 PlantUML 渲染管线本身
- 不改动 Rust 后端的 Tauri command 结构（复用现有保存对话框 API）

## Decisions

### Decision 1: 创建独立的 `plantumlContextMenu.ts`，不直接复用 Mermaid 模块

- **方案 A（采用）**：新建 `plantumlContextMenu.ts`，复制 Mermaid 的菜单模板，但将 SVG/PNG 操作函数提取到共享的 `plantumlContextMenu.helpers.ts` 中
- **方案 B**：直接在 Mermaid 菜单模块中增加条件分支处理两种图表
- **理由**：两种图表的 SVG 来源和上下文不同（Mermaid 的导出文件名用 `getMermaidExportBaseName()`，PlantUML 也需要自己的命名策略），且职责分离更清晰。未来如果任意一种图表的导出逻辑变化，不会影响另一种

### Decision 2: SVG→PNG 转换函数不与 Mermaid 共享

- 当前 `mermaidContextMenu.ts` 中的 `svgToPngBlob`、`blobToBase64`、`copySvg`、`copyPng` 是纯函数，没有 Mermaid 特异性
- **选择**：在 `plantumlContextMenu.ts` 中复制一份（而非提取到共享模块），因为：
  - 这些函数很短且稳定，复制避免了重构风险（改动 Mermaid 功能时不破坏 PlantUML）
  - 如果未来需要统一提取，可以单独做一次重构
  - PlantUML 的导出实现保持自包含，便于测试和修改

### Decision 3: 保存操作用 Tauri command `save_mermaid_svg_export` / `save_mermaid_png_export` 的现有实现

- Rust 端的 `save_mermaid_svg_export` 和 `save_mermaid_png_export` 本质是通用操作：打开保存对话框 → 写入文件 → 返回 boolean
- 函数名虽包含 "mermaid" 但实现是通用的
- **选择**：从 `storage.ts` 导出为新的别名 `savePlantUmlSvgExport` / `savePlantUmlPngExport`（或直接重用现有函数）
- 后续可以重构 Rust 端重命名为通用函数名，但当前改动范围最小

### Decision 4: 修改 `editor.extensions.ts` 右键条件

当前第 351 行：`if (!renderedSvg || !isMermaid()) return;`
改为：`if (!renderedSvg) return;`，然后在 PlantUML 的路径下调用 `showPlantUmlContextMenu` 替代 `showMermaidContextMenu`

### Decision 5: `plantumlContextMenu.helpers.ts` 包含的文件名工具

- `getPlantUmlExportBaseName()` 放在 `editor.state.ts` 中（与 `getMermaidExportBaseName()` 并列）
- 使用文档文件名（不含扩展名）加 `-plantuml` 后缀作为默认导出名

## Risks / Trade-offs

- **[风险] 复制 `svgToPngBlob` 等函数导致重复代码**
  → 可接受：每个函数 <30 行，纯函数，稳定不变。未来可统一提取重构
- **[风险] Tauri command 名为 `save_mermaid_*` 但被 PlantUML 使用**
  → 仅前端调用名问题，后端逻辑完全通用。可在后续 PR 中重命名
- **[风险] 巨型 SVG 导出 PNG 时 Canvas 限制**
  → 复用 `validatePngCanvasSize`（已限制最大 8192×8192 和 33M 像素），PlantUML 图通常小于此限制
