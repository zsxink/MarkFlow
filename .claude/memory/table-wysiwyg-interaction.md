---
name: table-wysiwyg-interaction
description: 表格 WYSIWYG 交互（边界插入句柄/右键菜单/对齐）交付时的类型与样式陷阱——TableView 无 destroy/第三参、tables.css 未引入需自补 selectedCell、光标入格位置、hidden 显式 display
metadata:
  type: project
---

# GFM 表格 WYSIWYG 交互交付陷阱（issue #262）

输入即表格的 InputRule 陷阱见 [[table-wysiwyg-input-rule]]；本文补交互层的坑：

**1. `prosemirror-tables` 的 `TableView` 类型很窄。** `.d.ts` 只声明 `constructor(node, defaultCellMinWidth)` + `update(node)` + `ignoreMutation(record)`，**没有 `destroy()`、不接受第三参 `view`**。自绘 `TableHandleView` 包它时：`new TableView(node, cellMinWidth)`（view 自己持有）、`ignoreMutation` 收 `ViewMutationRecord`（`@tiptap/pm/view` 导出，不是 `MutationRecord`——mutation 可能是 `{type:'selection'}`）、destroy 只清自身监听器，别调 `inner.destroy`。

**2. `tables.css` 根本没进 bundle。** `@tiptap/extension-table` 不带 style 入口，`prosemirror-tables/style/tables.css` 也没有任何 import 链（可 `grep -o "selectedCell\|column-resize-handle" dist/assets/*.css` 验证为 0）。后果：CellSelection 的 `.selectedCell:after` 覆盖层、列宽拖拽 handle 全无样式——需在 `editor.css` 用主题 token 自补 `background: var(--accent-soft)` + `pointer-events:none` + `td/th { position: relative }` 作为定位容器。

**3. 光标放入单元格的位置语义。** TableMap 偏移相对表格内容起点 `tableStart`（表在 doc 首子时 = 1）。单元格 abs = `tableStart + map.map[row*width+col]`，但那是**表行/表元外层**：`cellAbs` 是 tableRow、`+1` 是 tableCell、`+2` 才是 cell 内 paragraph——`setTextSelection(cellAbs+1)` 会踩「TextSelection endpoint not pointing into a node with inline content」告警（无害但脏 stderr）。命令（deleteColumn/对齐）从段落进也能定位到表。

**4. `align` 属性解析/序列化闭环已通。** TableCell/Header 的 `createAlignAttribute` parseHTML 读 `style.text-align || align`，`renderMarkdown` 已把列对齐写成 `:--- / :---: / ---:`，Marked 重解析回 attribute——往返保真（`columnAligns(table)` 可断言逐列 align）。对齐操作 = 列选区 `CellSelection.colSelection(topAbs, bottomAbs)` + `setCellAttribute('align', …)`。

**5. `toggleHeaderRow` 是 deprecated 逻辑。** `prosemirror-tables` 的 `toggleHeaderRow = toggleHeader("row", { useDeprecatedLogic:true })`，首次切换**整行都设 tableHeader**（不是只首行）。测试只能断言「重解析后首单元格是 tableHeader + 分隔行合法」，别断言「数据行保持 tableCell」。

**6. css-layout 规则在句柄 rails 上同样生效。** `.table-left-handles`/`.table-top-handles` 是 `display:flex` 的自绘 rail，必须补 `[hidden] { display:none }` 才看得出显隐；rail 与句柄按钮绝对定位在 `.table-handle-host`（`position:relative`）padding 边缘，`z-index:151` 高于 `.selectedCell:after`(2)、别遮挡单元格内容。句柄按钮是普通 `<button>`，需 `pointerdown` 时 `preventDefault()` 避免夺焦/触发 PM 鼠标逻辑。

**7. `resizable: true` 是自定义 View 生效的前提。** `@tiptap/extension-table` 只在 `resizable: true` 时经 `columnResizing({ View })` 接线自定义 NodeView（factory `(node, defaultCellMinWidth, view)`）；`TableHandleView` 构造函数收第三参 `view`（编辑器视图，供句柄命令 `this.view.dispatch`）。关掉 `resizable` 会让 `View` 选项整体失效、列宽拖拽 handle 消失。

**8. 句柄命令的作用域锚点：`getCellAt` + `CellSelection`。** 行句柄 `addRowAfter` 需先把选区锚到目标行某格——`this.host.querySelectorAll('tr')[r]` 取 DOM、`view.posAtDOM` + `cellAround`（parent=`tableRow`、nodeAfter=`tableCell`）构造 `CellSelection($around,$around)` 再 `addRowAfter(state,dispatch)`。列句柄分界线 b：`b===0` 锚 col0 用 `addColumnBefore`、`b>=1` 锚 col b-1 用 `addColumnAfter`。`getBoundingClientRect` 在 happy-dom 下全 0，句柄几何定位在测试里只能断言 DOM 形态，不能断言像素。

**9. 句柄「只显示当前行/列」由 host `mousemove` 驱动，不是 `mouseenter`。** 解析 `event.target.closest('td,th')` 得行列，`reveal(row,col)` 里遍历 rail 内全量句柄逐按钮设 `hidden`（只有 `data-row==row` / `data-col==col` 的可见），并重新定位：行句柄 `top = tr.bottom - hostRect.top`（左外侧下端）、列句柄 `left = th.right - hostRect.left`（顶部右上角）。`mouseleave` 隐藏时**必须同时把按钮逐个 `hidden=true`**，否则按钮内部残留可见态（rail 虽然隐藏，但查 `!btn.hidden` 会误判可见）；`update()` 重建 rails 时先存当前可见句柄的 row/col、重建后再 `reveal` 回来。

关联：[[table-wysiwyg-input-rule]]、[[troubleshooting-tiptap-markdown-serializer]]。