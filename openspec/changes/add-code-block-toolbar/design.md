# Design

## Context

所有 fenced 块由 `src/editor/extensions/code-block.ts` 的 `mermaidCodeBlockExtension()`（CodeBlockLowlight）NodeView 渲染：普通块走 `setCodeBlock()`（`dom.className = 'code-block-view'`，`contentDOM = code`），图表块走 mermaid/plantuml 预览路径。`update()` 对非图表块的语言变化返回 `false` 触发 NodeView 重建（code-block.ts:332）；`stopEvent()` 仅拦图表模式。UI 已定稿原型方案 C「幽灵轻量」（无边框纯文字语言标签 + 幽灵复制按钮，悬停块淡入）。

## Goals / Non-Goals

**Goals:**
- 普通代码块（含无 server 的 plantuml 空源码块等一切走 `setCodeBlock()` 路径的块）右上角幽灵工具条：复制 + 语言下拉。
- 语言切换复用现有 `update()` 重建语义，不改序列化器。
- 样式仅进编辑器侧，三主题 token 化。

**Non-Goals:**
- 不给 mermaid/plantuml 图表预览块加工具条（issue 列为加分项，不做）。
- 不改 lowlight 高亮引擎、不统一两套语言表（CodeMirror 源码模式语言表不动）。
- 不做全局 toast（复制反馈纯按钮内 DOM）。

## Decisions

### D1 工具条挂载点与 DOM 结构

工具条作为 `dom`（`.code-block-view`）的第二个子节点追加在 `pre` 之后（不在 `pre` 内，避免被 `overflow-x: auto` 卷走），CSS 绝对定位于右上角。`setCodeBlock()` 里 `dom.replaceChildren(codeBlockPreEl)` 改为同时挂工具条；切到图表路径时 `dom.replaceChildren(...)` 自然移除工具条，无需额外清理。

结构：`.code-block-view`（新增 `position: relative`）> `pre` + `.code-block-toolbar`（语言按钮 + 复制按钮 + `.code-block-lang-menu` 下拉）。

### D2 工具条逻辑拆分到新文件

`code-block.ts` 现 356 行（已进观察区），塞入工具条构建 + 语言候选 + 事件将超 500 行目标。新建 `src/editor/extensions/code-block-toolbar.ts`：导出 `buildCodeBlockToolbar(options)` 返回工具条元素与 `syncLanguage()` 句柄，语言候选常量 `CODE_BLOCK_LANGUAGES` 与内联 SVG 图标一并放在该文件。editor 层内同目录拆分，无跨模块穿越，无新增依赖。

### D3 复制：无事务 + 剪贴板兜底

`navigator.clipboard.writeText(currentNode.textContent)`（读节点而非 DOM，避免取到高亮 span）；视觉反馈先于剪贴板调用，`try/catch` + `.catch()` 双兜底（沙箱/权限失败不影响 ✓ 反馈，失败走 `logWarn`）。不 dispatch 任何 transaction，天然不弄脏、不进撤销栈。图标 copy ↔ check 内联 SVG（compile-time 常量，非用户数据，符合 safe-dom-construction）。

### D4 语言切换：走 setNodeAttribute，保留 update() 重建语义

下拉选择后 `editor.view.dispatch(tr.setNodeAttribute(pos, 'language', value))`：`pos` 取 `getPos()`（复用 `applyMermaidSource` 的空值保护模式）；「纯文本」选项写 `null`（与 parseMarkdown 的 `token.lang ? ... : null` 对齐）。现有 `update()` 对语言变化返回 `false` → PM 销毁重建 NodeView → 新视图以新语言高亮，无循环（仅实际变化才返回 false）。重建导致块内选区丢失可接受（此时焦点在下拉输入框）。候选表不含 mermaid/plantuml；自定义输入含 `mermaid` 时按现有图表路径自然切换（`update()` 返回 false 重建为图表块）。

### D5 stopEvent / ignoreMutation / 生命周期

`stopEvent` 扩为：`isDiagram() && dom.contains(target)` 之外，`(toolbarEl && toolbarEl.contains(event.target))` 也返回 `true`（拦截按钮点击与下拉输入框的 keydown，防 PM 捕获或误触编辑）。`ignoreMutation` 现有非图表分支已忽略 contentDOM 之外的变异，工具条 DOM 更新（✓ 切换、列表重建）天然被忽略，无需改。下拉的 document 级 mousedown 关闭监听在 `destroy()` 移除（复用现有 handleDocumentMouseDown 挂卸模式，合并进同一监听）。

### D6 样式与主题

全部写 `src/styles/editor.css`，选择器以 `.code-block-view` / `.code-block-toolbar` / `.code-block-lang-menu` 为前缀；颜色只用 `--code-bg/--surface/--border/--fg/--muted/--accent/--accent-soft/--hover/--shadow/--font-code` 等 token（新增 `--hover` 到三主题，图片预览已引用该变量但 variables.css 缺定义——顺手补上，属既有缺口）。导出管线（render/export 模块）不含 `.code-block-view`（已验证零引用），工具条 DOM 与样式不会进导出产物。显隐用 `opacity + pointer-events`（悬停/`.is-open`），不用 `hidden`（#433 教训：hidden 会被 display 覆盖出误报）。

### D7 无障碍

按 ui-aria-attributes 精神：语言按钮 `aria-haspopup="listbox"` + `aria-expanded`，列表 `role="listbox"`/`option` + `aria-selected`，复制按钮 `aria-label`（随状态换「已复制」），图标 `aria-hidden`，Esc 关闭并还焦。

## Risks / Trade-offs

- [语言切换重建 NodeView 丢失块内选区] → 切换动作焦点在下拉上，块内无选区；实测验收。
- [`--hover` token 补定义影响图片预览 hover] → 该按钮 hover 现取不到变量本就无效果，补定义是修复而非回归；三主题各给中性色。
- [happy-dom 无真实剪贴板/布局] → 测试聚焦 DOM 行为（按钮存在、class 切换、attr 更新），剪贴板 mock；悬停淡入不做自动化断言，靠人工验收。
- [下拉在长代码块底部被截断？] → 下拉挂在工具条（块顶部）下方，不受块底影响；编辑器容器 overflow 已有先例（mermaid-popup 正常弹出）。
