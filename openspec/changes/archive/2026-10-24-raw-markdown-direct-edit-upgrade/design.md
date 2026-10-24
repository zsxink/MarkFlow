# Design

## Context

`markflowRawMarkdown`（`src/editor/markdown/fallback.ts`）是 admission 局部保留路径产出的 block 级原子节点：NodeView 渲染 `<pre class="markflow-raw-markdown">`（无专属 CSS，命中 `.ProseMirror pre` 代码块外观），编辑入口挂在 `dblclick`，`input` 回调仅 `setNodeMarkup` 更新 `source`。单块「能否安全转换」的判定逻辑已存在于 `parseLocalizedMarkdown` 的 token 循环（`classifyEligibility` → `parseTipTapMarkdownToDoc` → `manager.serialize` → 再 parse → `semanticFingerprint` 比对）。保存链靠 `serializeLocalizedMarkdown` 的 marker 隔离证明 + `verifyRawMarkdownSplice` 的字节级校验；`session.localizedFallback` 一旦置 true 不回退。

## Goals / Non-Goals

**Goals:**

- 保留片段观感对齐源码模式（无框等宽），交互对齐源码模式（单击即编辑）。
- 编辑停顿后自动升级为真实块，升级是单个 undo 步骤。
- 保存证明链零改动兼容。

**Non-Goals:**

- 不改 admission 决策、`classifyEligibility` 阈值或降级路径。
- 不做整篇重校验；升级校验只针对单块字符串。
- 不处理「真实块又被改坏降级回原文」——WYSIWYG 块本就允许自由编辑，保存时由 reconcile 兜底。
- 不动 `serializeLocalizedMarkdown` / `verifyRawMarkdownSplice` / `reconcileSave` 的实现。

## Decisions

### 1. 视觉：序列化路径保留 `pre` 标签 + 专属 CSS 覆盖，不改 `renderHTML` 元素类型

`renderHTML`（剪贴板/HTML 导出序列化路径）继续输出 `pre[data-markflow-raw]`，在 `editor.css` 新增 `.ProseMirror pre.markflow-raw-markdown` 覆盖（`background: none; border: none; padding: 0; border-radius: 0`，保留等宽字体与 `pre-wrap`）。屏幕上的 NodeView 按决策 2 用常驻 textarea，配同观感的 `markflow-raw-markdown-input` 样式类。
**备选**：序列化也改用 `div` 承载。否决：`parseHTML` 规则、剪贴板/HTML 导出序列化路径都以 `pre[data-markflow-raw]` 为往返载体，换元素要动 parse 规则且引入旧文档兼容问题；CSS 覆盖零风险达成同一观感，打印/导出路径同步生效。

### 2. 编辑：textarea 常驻替换 pre 展示（可编辑态），只读时退回只读展示

NodeView 内不再「pre 显示 + 隐藏 textarea 双击切换」，而是常驻一个承载同一原文的 textarea 作为可编辑呈现（`white-space: pre-wrap`、等宽、无边框样式），`editor.isEditable === false` 时 `readOnly`。单击即聚焦（textarea 自带行为，`stopEvent` 放行其上的事件即可）。空内容删除节点的既有逻辑保留。
**备选**：保留 pre、单击切换显示。否决：两套元素同步状态易闪烁、丢选区；单一 textarea 常驻与 CodeMirror 源码模式的「所见即所编辑」一致。title 文案更新为「直接编辑，符合语法后自动转换」。

### 3. 升级校验：抽出 `verifySingleBlockUpgrade(editor, source)` 复用 token 级证明

把 `parseLocalizedMarkdown` 中单 token 的 `classifyEligibility` → parse → serialize → 再 parse → fingerprint 比对抽成可复用纯函数（放 fallback.ts 或独立模块），返回 `{ upgradeable: boolean; blocks?: JSONContent[] }`。`parseLocalizedMarkdown` 改为调用它，行为不变（有既有测试守护）。NodeView 防抖回调用它判定。
**理由**：两处判定必须同一套语义，否则「编辑时升级了、重开文档又降级」的不一致。

### 4. 触发时机：500ms 防抖，`compositionend` 后才计时；undo/redo 与只读不触发

- `input` 事件重置计时器；处于 IME composition（`compositionstart`→`compositionend` 之间）时挂起，`compositionend` 后重新计时。
- 升级替换用单个 `tr.replaceWith(pos, pos + nodeSize, ...blocks)`（`blocks` 由 `parseTipTapMarkdownToDoc` 的 doc content 而来，须经 `editor.schema` 校验——用 `ProseMirror` 的 `Node.fromJSON` 逐个转换，失败则放弃升级保持原文）。
- 替换后 `setTextSelection` 落点到替换内容之后（或首块内），避免选区悬空。
- `getPos()` 在事务后失效：校验与替换前重新取 pos，并比对节点仍为该 raw 节点（`state.doc.nodeAt(pos)` 校验），不匹配则放弃本次升级。

### 5. 升级事务与历史

`replaceWith` 不设 `addToHistory: false`，天然并入 undo；一次 dispatch 即一步 undo。undo 回到 raw 节点后 NodeView 重建，textarea 从 `node.attrs.source` 恢复，继续可编辑。
**风险**：用户在防抖窗口内连续输入，校验通过的旧内容替换掉正在输入的新内容。缓解：防抖回调触发时比对 `input.value` 与升级所用 source 一致才 dispatch；不一致则跳过（下次防抖会再校验）。

### 6. 保存链兼容（论证，不改动）

升级后文档不含 raw 节点时：`serializeLocalizedMarkdown` 的 `sources` 为空、`verifyRawMarkdownSplice(candidate, [])` 恒真，`reconcileSave` 的 `candidateFp` 走 `editorFp` 分支，正常分类。部分升级（仍有其他 raw 块）时走既有 marker 路径，升级块已序列化为正常 Markdown 参与往返证明。`session.localizedFallback` 保持 true（不回退），不影响正确性——`reconcileSave` 对含 raw 的文档本就走 localized 分支，全升级后走该分支但 sources 为空。

## Risks / Trade-offs

- [防抖窗口内输入竞态] → 升级 dispatch 前比对 textarea 当前值与校验所用 source，不一致放弃本次。
- [undo 穿越升级出现中间态] → 单事务 `replaceWith` 保证一步 undo；NodeView `update`/重建路径已有既有测试。
- [textarea 与节点 source 不同步] → 单一数据流：`input` → `setNodeMarkup`（既有）；`update(next)` 同步回 textarea；外部（undo）变更经 `update` 落地。
- [旧测试依赖 dblclick/hidden textarea 行为] → 更新既有 NodeView 测试为单击/常驻 textarea 语义。
- [`parseHTML` 的 `priority: 1000` 与 `pre` 专属 CSS 覆盖被 `.ProseMirror pre` 高特异性命中] → 覆盖选择器用 `.ProseMirror pre.markflow-raw-markdown` 保证特异性高于通用规则。

## Migration Plan

纯前端行为变更，无数据迁移。回滚即还原该 PR；文档内容本身不受影响（raw 节点 `source` 属性与序列化格式均未变）。

## Open Questions

（无）
