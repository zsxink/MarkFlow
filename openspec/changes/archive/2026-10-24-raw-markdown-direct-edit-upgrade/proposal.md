# Proposal

## Why

WYSIWYG 中无法无损转换的保留片段（`markflowRawMarkdown` 原子节点）目前呈现为灰色代码框、必须双击才能编辑、改对了语法也不会重新渲染，用户在所见即所得模式下无法自行修复内容，与源码模式的观感和交互割裂（issue #394）。

## What Changes

- 保留片段视觉去代码框化：不再命中 `.ProseMirror pre` 代码块外观，改为无背景框、无边框、无额外 padding 的等宽字体展示，观感与源码模式一致。
- 直接编辑：去掉双击门槛，单击保留片段即可进入编辑（textarea 常驻或单击聚焦），只读模式下维持禁用；节点 title 文案同步更新。
- 语法合法后自动重渲染：编辑防抖（约 500ms，IME `compositionend` 之后触发）后对该块运行单块准入校验（复用 `parseLocalizedMarkdown` 的 token 级校验逻辑：`classifyEligibility` → parse → serialize → `semanticFingerprint` 往返证明），通过则在单个事务内把原子节点替换为解析出的真实块；不通过则保持原文静默不动。
- 提示文案补充「可直接编辑修复」引导（`REASON_LABELS`）。
- 保存证明链兼容性已论证无需改动：升级后块不再携带 `source`，`verifyRawMarkdownSplice(candidate, [])` 恒真，`reconcileSave` 走 safe-edit。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `wysiwyg-markdown-reconciliation`: 字面量块（保留片段）的编辑交互从「双击进入临时 textarea」改为「单击直接编辑」，并新增「编辑停顿后单块准入校验通过则自动升级为真实 WYSIWYG 块（单事务替换、可 undo）」的行为要求；同时补充字面量块视觉与源码模式一致（不呈现代码框）的呈现要求。

## Impact

- `src/editor/markdown/fallback.ts`：RawMarkdown NodeView 重构（常驻编辑、防抖校验、升级事务）；单块校验逻辑从 `parseLocalizedMarkdown` 抽出可复用函数。
- `src/styles/editor.css`：新增 `markflow-raw-markdown` 专属样式覆盖 `.ProseMirror pre` 通用外观。
- `src/editor/markdown/admission.ts`：`REASON_LABELS` 文案微调。
- 保存链（`opaque/integration.ts`、`serializeLocalizedMarkdown`、`verifyRawMarkdownSplice`）：不改动，靠既有不变式兼容（升级后 raw 列表为空）。
- 测试：`localized-fallback.test.ts` 附近补充 NodeView 直接编辑、升级事务与 undo、升级后保存证明的用例。
