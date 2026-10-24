# Tasks

## 1. 单块升级校验函数抽取

- [x] 1.1 从 `parseLocalizedMarkdown` 的 token 循环抽出单块安全往返校验为可复用函数（`classifyEligibility` → `parseTipTapMarkdownToDoc` → serialize → 再 parse → `semanticFingerprint` 比对，返回 upgradeable 与解析出的 blocks），`parseLocalizedMarkdown` 改为调用它，并验证既有 `npm test` 中 localized-fallback / roundtrip 相关用例全绿（行为不变）
- [x] 1.2 为抽出的函数补充直接单测（合法表格 upgradeable、畸形表格/含引用定义原文不可 upgradeable、多块内容返回多个 blocks），放入 `src/editor/markdown/__tests__/`，验证 `npm test` 通过

## 2. NodeView 重构：常驻直接编辑 + 防抖自动升级

- [x] 2.1 重构 `RawMarkdown` NodeView：textarea 常驻为可编辑呈现（等宽、无框样式类、`pre-wrap`），单击即聚焦；`editor.isEditable === false` 时只读；title 更新为「直接编辑，符合语法后自动转换」；空内容删除节点逻辑保留；验证更新后的 NodeView 单测（单击聚焦、只读禁用、空值删除）通过
- [x] 2.2 实现防抖升级：`input` 重置 500ms 计时，IME `compositionend` 后才计时；触发时用 1.1 的函数校验 `input.value`，通过则重新取 `getPos()` 并以 `state.doc.nodeAt(pos)` 校验节点仍是本 raw 节点、textarea 值未再变化，再单事务 `tr.replaceWith(pos, pos + nodeSize, ...blocks)`（blocks 经 `Node.fromJSON`/schema 转换，失败放弃）并落点选区；验证「畸形表格补齐 3 列 → 停顿 → 替换为真实表格且一步 undo 回 raw」的测试通过
- [x] 2.3 验证不升级路径：语法仍不合法时保持原文不动、无提示；IME 组合期不触发；undo 回 raw 后仍可继续编辑（对应测试用例通过）

## 3. 视觉与文案

- [x] 3.1 在 `src/styles/editor.css` 新增 `.ProseMirror pre.markflow-raw-markdown` 专属覆盖（无背景/边框/padding/圆角，等宽字体保留），确认特异性高于 `.ProseMirror pre`；NodeView 的常驻 textarea 使用配套类 `markflow-raw-markdown-input`（与 pre 同观感）；验证快照/DOM 结构断言测试通过
- [x] 3.2 `admission.ts` 的 `REASON_LABELS` 中 `'opaque-covered'`（WYSIWYG 局部保留场景的用户可见文案）补充「片段可直接编辑，符合语法后自动转换」引导（`malformed-table` 仅在整篇降级通知展示，不加正文引导以免误导）；验证 admission 文案相关测试更新后通过

## 4. 保存链与整体回归

- [x] 4.1 补充升级后保存证明测试：全部 raw 块升级后 `reconcileSave` 正常分类（safe-edit）、部分升级时 marker 路径仍成立（测试夹具注册 RawMarkdown/OpaqueNode，沿用既有约定），验证 `npm test` 通过
- [x] 4.2 全量回归：`npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs` 全绿
