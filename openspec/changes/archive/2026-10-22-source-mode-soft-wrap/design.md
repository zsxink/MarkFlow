# Design

## Context

See [proposal.md](proposal.md) for motivation and scope (Issue #328). 源码模式基于 CodeMirror 6，实例由 `src/lib/editor.source.ts` 的 `createSourceEditor()` 创建，模块级 `currentView` 持有唯一活动实例；`src/lib/editor.ts` 的 `enterSourceMode()` 在进入源码模式时创建、`switchToWysiwyg()` 时通过 `destroySourceEditor()` 销毁。

当前运行时配置有两个已验证的 Compartment：`readOnlyCompartment`（`setSourceReadOnly()`，由 `sidebar.fileops.ts` 调用）和 `highlightCompartment`（`setSourceHighlight()`，由 `settings.ts` 的 `applyRuntimeSettings()` 调用）。而 `EditorView.lineWrapping` 是**裸扩展**，在 `createSourceEditor()` 的 `extList` 中被无条件加入。

关键事实（已核对源码）：

- `EditorView.lineWrapping` 的实现是 `EditorView.contentAttributes.of({ class: 'cm-lineWrapping' })`，即纯 CSS class，无状态机，因此可以被 Compartment 自由 reconfigure。
- 关闭时无需额外 CSS：`@codemirror/view` baseTheme 已给 `.cm-scroller` 设 `overflowX: auto`、给 `.cm-content` 设 `white-space: pre`；开启时由 baseTheme 的 `.cm-lineWrapping`（`white-space: break-spaces; overflow-wrap: anywhere; flex-shrink: 1`）提供折行。
- `src/styles/editor.css` 中 `.source-editor-wrapper .cm-*` 覆盖规则不含 `white-space` / `overflow-x`，不存在样式冲突。
- `src/components/settings.ts` 既有的 `softWrap` 运行时应用写的是 `#source-editor`（textarea，CM6 迁移后恒为 `null`）与 `.ProseMirror`。前者是死代码，后者对 WYSIWYG 有效、必须保留。

## Goals / Non-Goals

**Goals:**
- `softWrap` 单一来源决定两种编辑模式的换行行为。
- 运行时切换不重建 CM6 实例，保留光标、选区、滚动位置。
- 与既有的 readOnly / highlight Compartment 互不干扰。
- 无 CM6 实例时切换设置安全，并让下次创建按最新值渲染。
- 用最小改动覆盖，无新增依赖、无 CSS 改动。

**Non-Goals:**
- 不让 `softWrap` 影响导出（HTML/PDF/DOCX）或代码块内部排版。
- 不合并 `softWrap` 与 `codeWordWrap`（后者是代码块内部换行，走 `applyCodeBlockSettings()` 的 class 方案）。
- 不复活 `#source-editor` textarea 路径，也不在本次清理 `settings.test.ts` 对该 textarea 的既有断言。
- 不引入 e2e 用例（P0 用单测覆盖；e2e 作为后续增强）。

## Decisions

1. **用 Compartment 而非条件扩展。** `softWrapCompartment.of(enabled ? EditorView.lineWrapping : [])` 让运行时 `reconfigure` 成为可能。备选方案「按设置决定是否把 `EditorView.lineWrapping` 放进 `extList`」被否决：运行时没有 effect 可 reconfigure，切换只能销毁重建 view，会重置 `programmaticUpdate`、frontmatter 装饰、焦点与滚动位置，并违反 `settings-code-highlight` 已确立的「切换即时生效、无需重新加载编辑器」契约。

2. **setter 内部登记状态，创建时复用该状态。** 新增模块级 `let softWrapEnabled = true`，`setSourceSoftWrap()` 先更新它再（若有 view）dispatch；`createSourceEditor()` 用 `softWrapEnabled` 而非重新读 `getCachedSettings()`。备选方案「setter 只 dispatch、创建时再读 settings」被否决：会出现两条取值路径（用户刚切换但 `saveSettings` 尚未落盘/缓存未刷新的竞态），单测也无法确定性断言。默认值 `true` 与 `DEFAULT_SETTINGS.softWrap = true` 对齐。

3. **设置下发放在 `applyRuntimeSettings()`，与 `setSourceHighlight()` 并列。** 该函数已由 `hydrateSettingsUI()`（打开面板）和 `persistSettingsFromUI()`（每次切换）调用，幂等且不需要新增 store 订阅。备选方案「放进 `applyCodeBlockSettings()`」被否决：那个函数在 `editor.init.ts` 里管理 WYSIWYG 代码块的 class 与行号 gutter，语义上是「代码块」而不是「编辑器整体换行」。

4. **不新增 CSS。** 依赖 `@codemirror/view` baseTheme 的既有规则；只在 `src/styles/editor.css` 出现白名单外的 `white-space`/`overflow-x` 覆盖时才需要补类。当前不存在，因此改样式属于多余动作。

5. **测试锚定公开 getter 与 DOM class。** `EditorView.lineWrapping` 是公开 getter（返回 `heightOracle.lineWrapping`），配合 `.cm-lineWrapping` class 断言可同时覆盖状态层与渲染层；再用 `getSourceView()` 引用相等证明实例未被重建。备选方案「截图或测量行高」在 happy-dom 下不可行。

6. **模块级状态在测试间必须复位。** `destroySourceEditor()` 只销毁 view，不重置 `softWrapEnabled`；因此测试 `afterEach` 需显式 `setSourceSoftWrap(true)`，否则用例之间会互相污染。

## Risks / Trade-offs

- **[Risk]** 关闭换行后 CM6 的宽度测量/高度预估变化，可能出现行高或装饰位置异常 → **Mitigation:** `lineWrapping` 会直接更新 `heightOracle`，属 CM6 原生支持的热切换；单测断言 `view.lineWrapping` 翻转，手测覆盖 frontmatter、引用、表格、超长链接几类行。
- **[Risk]** 三个 Compartment 的 `reconfigure` 顺序导致「互相覆盖」的错觉 → **Mitigation:** 每个 Compartment 是独立 key，`reconfigure` 只替换自身 facet；新增专门的规范场景与单测断言三者独立。
- **[Risk]** `.cm-lineWrapping` 与 `.ProseMirror` 的 `white-space: pre-wrap` 语义差异导致两模式折行宽度观感不一致 → **Mitigation:** 本次不追求像素级对齐；源码模式折行宽度由编辑区宽度决定，与变更前一致，不构成回归。
- **[Risk]** 用户关闭换行后长行横向滚动，可能与 `.editor-area` 的 `justify-content: center` + `max-width: 1080px` 组合产生观感问题 → **Mitigation:** 手测宽行文档；如确有布局问题，再单独提案处理，不在本次混入。
- **[Trade-off]** 保留死代码 `#source-editor` 的样式写入 → 本次不清理，避免扩大 diff；清理需同步改 `settings.test.ts` 的既有断言，属独立事项。
