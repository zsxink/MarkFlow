# Design

## Context

`src/styles/editor.css` 的任务列表样式段（`.ProseMirror ul[data-type="taskList"]` 一族）已按 `task-list-wysiwyg` 规范约束：布局只通过样式实现、不碰 Tiptap 扩展与转换链路、样式不外溢到普通列表。Tiptap TaskItem 在 `li` 上输出 `data-checked="true|false"`，勾选切换由 NodeView 原地更新该属性。样式契约由 `src/__tests__/task-list-styles.test.ts` 守护。主题 token 在 `--fg`（正文）/ `--muted`（弱化前景）体系内。

## Goals / Non-Goals

**Goals:**

- 已勾选任务项正文用主题弱化前景色，与未勾选项拉开视觉层次
- 纯 CSS、零 JS、主题 token 化，样式契约测试同步扩展

**Non-Goals:**

- 不加删除线（保持文本完整可读，issue 中标注「需确认」，本变更选择不加）
- 不改源码模式（CodeMirror）配色
- 不改复选框本身样式、不改导出（PDF/HTML）中任务列表配色（导出走独立主题链路，不在本范围）

## Decisions

1. **选择器：`.ProseMirror ul[data-type="taskList"] li[data-checked="true"]` 的正文容器（`li > div > p`）设 `color: var(--muted)`。**
   与现有段落选择器 `li > div > p` 同构，只按 `data-checked` 收窄；作用域限定在任务列表内，天然不外溢。备选「在 `li[data-checked]` 上整体设 color 再让复选框 label 继承覆盖」会波及 label/复选框颜色，影响面更大，不取。

2. **用 `--muted` 而非硬编码灰色或新增 token。**
   `--muted` 是既有主题体系中的弱化前景 token，明暗主题各自定义，直接满足主题兼容要求；新增 token 会引入两套主题的维护成本。

3. **勾选即时性完全依赖 NodeView 更新 `data-checked` 属性，CSS 属性选择器自动命中，无 JS 参与。**
   与现有复选框点击行为一致，无额外风险。

4. **样式契约测试扩展 `src/__tests__/task-list-styles.test.ts`。**
   沿用该文件既有断言方式（对 editor.css 源文本的选择器/声明断言），新增：已勾选正文命中 `var(--muted)`、未勾选正文仍为 `var(--fg)`、不出现硬编码颜色。

## Risks / Trade-offs

- [风险] 选区高亮 / 拼写下划线在弱化色上对比不足 → 选区与下划线由浏览器/主题独立着色，验收场景「编辑仍可读」由 e2e 截图与人工确认兜底；若不足再调 token，不影响结构
- [权衡] `li > div > p` 以外的正文路径（如嵌套列表标题外的其他块）颜色不弱化 → 嵌套任务列表自身仍是 `ul[data-type=taskList]`，其项同样命中；非段落块（如代码块）保持原色是预期行为，避免过度弱化
