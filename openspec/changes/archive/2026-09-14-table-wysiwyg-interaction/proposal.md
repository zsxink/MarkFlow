# Proposal: GFM 表格 WYSIWYG 交互增强

## Why

MarkFlow 目前已能在 WYSIWYG 中**解析并序列化** GFM 表格（`MarkdownSafeTable` + TableRow/Cell/Header 已登记，`@tiptap/extension-table` 已内置 Tab 导航、列宽拖拽），但从用户视角表格是"只读展示"：没有插入入口，没有增删行列/对齐的交互，寻常用户无法在所见即所得模式下创作或编辑表格。这与路线图「1.2 表格增强」的目标（对标 Typora 表格体验）不符，也是五方向增强里目前唯一"基础能力已就位、交互为零"的缺口。

## What Changes

- **输入即表格**：在 WYSIWYG 模式下键入 GFM 表格语法（`| a | b |` 换行 `| --- | --- |`）后回车，自动落为可编辑表格节点（新增 Table InputRule，`@tiptap/extension-table` 默认未启用 `tableInputRules`）。
- **悬停工具栏**：光标/悬停进入表格时，在表上方显示浮动工具条（加行/加列/删行/删列/对齐/表头行切换）。用户选定核心交互闭环为"悬停工具栏"，对齐 Typora 风格。
- **表格右键菜单**：在单元格内右键弹出表格专用菜单（复用统一 `showContextMenuStatic` API），作为悬停栏的补充入口。
- **对齐持久化**：左/中/右对齐经 `TableCell` 的 `align` 属性写入、序列化为 Markdown 对齐标记行缺失的补充（现有 `MarkdownSafeTable.renderMarkdown` 已处理对齐，验证补齐）。
- **写回无破坏**：所有表格编辑必须通过现有 admission/eligibility/reconcile 安全管道，序列化后不得损坏原始 Markdown（保持 `wysiwyg-markdown-round-trip` 的 GFM 表格往返保真要求）。

不涉及：合并/拆分单元格（选定的核心闭环外）、嵌套表格、HTML 表格导入。

## Capabilities

### New Capabilities
- `table-wysiwyg-interaction`: 定义 WYSIWYG 模式下 GFM 表格的创作交互——输入即表格、悬停工具条、单元格右键菜单、行列增删与对齐编辑，以及编辑结果无损写回 Markdown。

### Modified Capabilities
- `context-menu`: 新增「按节点类型的专用菜单」要求——表格单元格右键菜单作为 `showContextMenuStatic` 的节点专用用例如入规范（现有 context-menu 只规定通用菜单 API/结构/定位交互，未覆盖节点类型化菜单的触发与内容契约）。
- `wysiwyg-markdown-round-trip`: 表格往返保真场景扩展至覆盖交互产生的编辑结果（增删行列/对齐后往返仍保真）——如判定现有 Requirement 已隐含覆盖则不新开需求，避免为凑数造需求。

## Impact

- **代码**：
  - `src/lib/editor.extensions.ts` — `MarkdownSafeTable` 增加 `addInputRules()`（表格输入规则），保持渲染/序列化覆盖。
  - `src/lib/editor.init.ts` — 表格扩展配置（`resizable` / 新输入规则）。
  - 新增 `src/lib/tableHover.ts`（或 `editor.table.ts`）— 悬停工具条逻辑（NodeView 插件或 ProseMirror 插件）。
  - 新增 `src/components/tableContextMenu.ts` — 表格右键菜单（镜像 `mermaidContextMenu.ts` 模式）。
  - `src/styles/editor.css` — 表格悬停工具条与选中态样式。
- **依赖**：`@tiptap/extension-table` **已安装**（3.30.5）且已配置——无新增依赖；可能用到其 `toggleHeader` / `setCellAttribute` 等命令，均在现成包内。
- **测试**：`editor.extensions.test.ts`、`wysiwyg-markdown-round-trip.section3.test.ts`（新增表格交互往返用例）、新增 `tableHover` 单测。
- **不触碰**：源码模式（CodeMirror）表格解析、导出（HTML/DOCX/PDF）表格渲染（`documentExport` / `docxExport` 已覆盖）。