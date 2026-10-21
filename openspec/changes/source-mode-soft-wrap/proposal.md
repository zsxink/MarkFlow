# Proposal

## Why

设置面板的「自动换行」（`softWrap`）当前只对所见即所得视图生效。源码模式（CodeMirror 6）在 `src/lib/editor.source.ts` 中无条件写入 `EditorView.lineWrapping`，因此关闭该设置后源码模式仍然软换行——设置项承诺的行为与用户实际看到的不一致（Issue #328，原话记录在 `.claude/memory/source-mode-line-wrapping.md`）。这是本仓库中成本最低、可感知度最高的功能缺口：同一 Compartment 范式（`highlightCompartment` + `setSourceHighlight()`）已经在同一文件内验证可用。

## What Changes

- 源码编辑器新增软换行 Compartment，把 `softWrap` 映射到 CodeMirror 的 `EditorView.lineWrapping`。
- `softWrap === false` 时源码模式长行不折行、由 `.cm-scroller` 横向滚动；`softWrap !== false`（默认）时保持现有折行表现，不产生回归。
- 设置面板切换「自动换行」时对已打开的源码编辑器即时生效，且不销毁/重建 CM6 实例（保留光标、选区、滚动位置）。
- 编辑器的软换行取值在无 CM6 实例时也记录，保证下次进入源码模式按最新设置渲染。
- 设置项补充说明文字，明确该开关同时作用于所见即所得与源码模式。
- 不修改 `codeWordWrap`（代码块自动换行，独立设置项与独立插件路径）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `codemirror-source-editor`: 新增「源码模式自动换行跟随 `softWrap` 设置」要求，含开启、关闭、即时切换、未打开源码编辑器时切换四个场景。

## Impact

- 生产代码：`src/lib/editor.source.ts`（新增 Compartment 与 `setSourceSoftWrap()`）、`src/components/settings.ts`（运行时应用 + 设置项描述）。
- 测试：`src/lib/editor.source.test.ts` 新增 Compartment 用例。
- 样式：无 CSS 改动——关闭换行后由 `@codemirror/view` baseTheme 的 `.cm-scroller { overflow-x: auto }` 与 `.cm-content { white-space: pre }` 提供横向滚动，开启时由 `.cm-lineWrapping` 提供折行。
- 依赖、API、数据格式、Rust 侧：无变更。
- 不改动 `settings-code-highlight` 的现有要求：`applyCodeBlockSettings()` 负责的是 `codeHighlight`/`codeLineNumbers`/`codeWordWrap`，本次设置下发走 `applyRuntimeSettings()`，与该函数无关。
- 不做的事：不复活已废弃的 `#source-editor` textarea 路径；不把 `softWrap` 扩展到导出/其他视图。
