# Design: GFM 表格 WYSIWYG 交互增强

## Context

（动机见 proposal.md — Why）现状关键事实：

- `@tiptap/extension-table@3.30.5`（与 `@tiptap/pm` 一起 re-export `prosemirror-tables`）**已安装并在 `editor.init.ts` 中登记**：`MarkdownSafeTable`（`Table.extend`，配置 `resizable: true`）+ `TableRow/TableCell/TableHeader`。Tab/Shift-Tab 单元格导航、列宽拖拽、CellSelection 已由上游插件提供。
- 现有表格**只有解析/序列化能力，没有任何编辑入口**：无输入规则、无工具栏按钮、无右键菜单、无悬停工具条。
- Markdown 往返保真已由 `MarkdownSafeTable.renderMarkdown`（pipe 转义 + 对齐标记 + 列宽对齐）+ `wysiwyg-markdown-round-trip` 规范覆盖，`editor.markdown.admission / eligibility / reconcile` 安全管道在案。
- 新增能力需顺应既有模式：右键菜单必须走 `showContextMenuStatic`（`context-menu` 规范），交互产生的文档走既有安全管道。

## Goals / Non-Goals

**Goals（设计层）：**
- 三条交互入口（输入即表格 / 悬停工具条 / 单元格右键菜单）共享同一套表格结构化编辑命令（来自 `@tiptap/extension-table`），避免重复实现。
- 全部编辑命令走 chainable `editor.chain()...run()`，最终经既有 `serializeMarkdown` + resilience 管道写回，保持无损。

**Non-Goals：** 合并/拆分单元格；列拖拽重排；嵌套表格；HTML 表格导入；源码模式（CodeMirror）表格交互。这些是后续变更的边界，不在此设计内。

## Decisions

### D1：输入即表格用自定义 InputRule（而非上游 tableInputRules）

`prosemirror-tables` 当前版本**不再导出 `tableInputRules`**（已从上游删除，经运行时枚举确认 `Object.keys(require('prosemirror-tables'))` 无 inputRules）。因此：
- 在 `MarkdownSafeTable` 增加 `addInputRules()`，返回一个自定义 `InputRule`，匹配「表头行 + 分隔行 + （可选）数据行」的 GFM 序列。
- 触发方式：用户在行中输入 `| header | … |`，换行输入 `| --- | --- |`，光标在分隔后回车 → 命中规则 → `editor.chain().insertTable(...)` 替换为表格节点。
- 规则只认**完整合法表格**（分隔行列数与表头一致）；否则不转换（符合 spec「非法表格语法不转换」）。
- 备选：`InsertTable` 工具栏网格选择器 —— 被用户否决（选型「输入 Markdown 语法自动转成表格」）。

### D2：悬停工具条用 NodeView 包裹表格（Table `View` 选项）而非独立浮动 DOM

`@tiptap/extension-table` 的 `TableOptions.View` 允许传入自定义 NodeView。采用：
- 自绘 `TableView`：在现有 `prosemirror-tables` 的 `TableView` 外包裹一个 `.table-toolbar-host` 容器，内部渲染悬停工具条（+上方行/− +列/− 删行/删列），通过 `nodeView.onSelectionUpdate` 或 hover/mousemove 事件控制显隐。
- 备选 A：`addNodeView()` 返回 DOM —— table node 是 block content 的容器，用 NodeView 包裹是 `extension-table` 既定的 `View` 机制，更稳；备选 B：独立浮层跟随鼠标 —— 需坐标计算 + 滚动同步 + 泄漏清理，成本高且容易遮挡。选 A。
- 工具条只做**结构化**操作；对齐/表头等更长的菜单放右键（避免工具条过宽，见 D4）。

### D3：单元格右键菜单复用 `showContextMenuStatic` + ProseMirror `handleDOMEvents.contextmenu`

- 在表格编辑插件中加入 `props.handleDOMEvents.contextmenu(view, event)`：命中 `td/th` 时 `preventDefault + stopPropagation`，弹出表格专用菜单。这与 `imageBubblePlugin`（`editor.image.bubble.ts`）既有的 Image contextmenu 模式一致，且排在 `main.ts:41` 的 document 级 `preventDefault` **之前**生效（editor DOM 的事件先于 document 传播）。
- 菜单内容：上方/下方插行、左侧/右侧插列、删行、删列、删表 + 分隔 + 左/中/右对齐 + 表头行切换。
- 作用域解析：用 `getActiveTableCell`（或遍历 `CellSelection`）确定触发单元格的行/列，命令作用于该行/列。

### D4：对齐用 `setCellAttribute` + `MarkdownSafeTable` 既有对齐序列化

- `TableCell` 上游已定义 `align` attribute（parseHTML 读取 `style.text-align` / markdown 对齐标记），`setCellAttribute('align', value)` 命令现成。
- 对齐操作：选中单元格所在**列** → 对该列所有单元格 `setCellAttribute('align', …)`；`MarkdownSafeTable.renderMarkdown` 已把列对齐写出为 `:---  :---:  ---:` 标记行，无需改序列化（验证补齐 round-trip 已新增对齐场景）。
- 这是对齐持久化的闭环：attribute → ProseMirror doc → renderMarkdown → GFM 对齐标记 → 重解析回 attribute。

### D5：无新增依赖

`@tiptap/extension-table`、`@tiptap/pm/tables`（prosemirror-tables）、`showContextMenuStatic` 均已就位；所需命令（insertTable/addRow/…/setCellAttribute/toggleHeaderRow）全在现有包内。**不引入** `@tiptap/extension-table` 外的任何依赖。

## Risks / Trade-offs

- **[D1 自定义 InputRule 误触发]** 正则过宽会把普通 `|` 排版文本转成表格 → 规则严格限定「表格头后接分隔行再回车」，且仅在有分隔行形式（`| --- |`）时匹配；用现有语料在测试中断言不误转（`editor.eligibility.test` 的 malformed-table 用例对齐）。
- **[D2 悬停工具条遮挡单元格]** 工具条固定置于表上方，`display:none` 由 hover/selection 精确控制 → CSS `z-index` 位于 `.ProseMirror` 之上、`pointer-events` 只在工具条内；位置随表格 boundingRect 刷新。
- **[D3 与 document contextmenu 冲突]** 系统默认 `main.ts` document 级 `contextmenu` 会 `preventDefault` → 表格菜单在 editor 内部自行处理并 `stopPropagation`，浏览器默认菜单永不出现；image 模式已验证此写法。
- **[交互编辑破坏往返]** 增删列/对齐后序列化可能产出非法表格 → 所有编辑后进入既有 admission/reconcile；spec 新增「交互编辑后的表格往返保真」场景作为回归门禁，测试覆盖删除中间列、对齐、表头切换。
- **[tableEditing 与现有编辑插件叠加]** extension-table 自带 `tableEditing`/`columnResizing` 插件 → 不重复添加，仅补 NodeView 与 keymap/InputRule，避免插件重复造成行为冲突。

## Migration Plan

- 纯前端能力新增，无数据迁移、无 schema 变更（表格 node 已在 schema 内）。
- 分阶段合并：先 D1 输入规则 + 单测；再 D3 右键菜单；最后 D2 悬停工具条（最高 UI 成本）。每步独立可回滚（删除对应扩展配置即还原）。
- 回归：`npm test` + `npm run tauri dev` 手工验证表格编辑 → 切源码 → 切回，源码无损。

## Open Questions

- 悬停工具条的视觉形态（按钮图标集/分组）与 `tableEditing` 原生 CellSelection 高亮叠加的观感，实现时按编辑器视觉调优 —— 不改变 spec/approach/任务分解，可延后。
- 右键菜单是否在光标位于表格任意处仍显示「删除表格」（scope 到整表）—— 属实现细节，默认展示，可延后定夺。