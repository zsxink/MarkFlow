## Why

issue #291：`README.en.md` 在源码模式切换到 WYSIWYG 时未通过准入，只提示「往返校验未通过」并停留在源码模式。根因是 `@tiptap/markdown` v3 的序列化器在行内代码与其他 mark 相邻时会丢失或移动字符（如 `` `` Ctrl+` `` ``、结尾带空格的 `` `# ` ``），导致重新解析后的语义指纹与原文不一致。按现行策略，任何一个块的往返差异都会把**整篇文档**判为 `source-only`——用户既看不到可视化结果，也无法针对局部问题编辑。当前 `wysiwyg-markdown-reconciliation` 规范正是这样规定的，本变更要把它调整为「局部保留 + 有证明才可编辑保存」。

## What Changes

- **修复上游序列化器（根因修复）**：新增 `patches/@tiptap+markdown+3.30.5.patch`（`@tiptap/markdown` 已由 main 固定为 3.30.5，本变更不改动依赖声明）；补丁让行内代码按其内容生成足够长的围栏并施加 CommonMark 空格填充（内容含 `` ` `` 时用更长的反引号串，首尾为空格的代码内容按规范加空格），使 `` `` Ctrl+` `` ``、`` `# ` ``、`` ` leading` `` 等可无损往返。
- **新增块级字面量回退**：新增 `src/lib/editor.markdown.fallback.ts`。`RawMarkdown` atom 节点（`markflowRawMarkdown`）逐字节承载无法安全表示的原文块；`parseLocalizedMarkdown` 逐块解析，仅把「独立解析后无法被语义指纹证明等价」的块降为字面量 atom，其余标题、列表、表格、围栏代码仍走正常的 MarkFlow 扩展。CRLF 通过偏移映射保留（Marked 词法分析会把 CRLF 归一为 LF）；Marked 不产出 token 的引用式定义（如 `[ref]: /url`）作为间隙文本成为原始块。
- **宽松化准入失败策略**：`decideAdmission` 在资格拒绝 / 覆盖 / 往返失败时调用新增的 `admitLocalized`，而非一律退回 `source-only`。`admitLocalized` 必须自证：本地序列化（随机 nonce 标记 `MARKFLOWRAW<nonce>SLOT<n>END` 隔离字面量块）后的重解析指纹必须等于编辑器当前指纹，且 opaque 恢复完整，才会创建会话；否则仍退回 `source-only`。`too-large` 仍直接 `source-only`。
- **保存路径**：`MarkdownSession` 新增 `localizedFallback` 标志；该会话的保存走本地化序列化器（标记绝不落盘），并在保存边界对候选重新做「可重解析回当前指纹」的证明。`runSaveBoundary` 在 `localizedFallback` 会话下不再对已含原始字的候选做图片 URL 归一化（避免改写字面量正文）。
- **安全边界不变**：`reconcile()` 的分类逻辑保持不变——候选为 null、源版本过期、opaque 不一致、意外变更或语义不匹配仍返回 `conflict`；Source 仍能看到完整原文。
- **BREAKING（策略层面）**：往返校验失败不再把整篇文档强制降级为 `source-only`；改为「仅保留受影响块为字面量 + 有证明才允许编辑与保存」。

## Capabilities

### New Capabilities

（无新增能力；本变更调整的是既有规范的行为契约。）

### Modified Capabilities

- `wysiwyg-markdown-reconciliation`: 收紧为「局部保留 + 有证明才可编辑」策略。资格拒绝 / 转换失败 / 往返校验失败时不再一律要求整篇 `source-only`，而是 MUST 先尝试局部字面量保留，并且只有在本地化往返被证明无损后才创建可编辑 WYSIWYG 会话；无法证明时仍 MUST 阻止不安全保存并保留完整原文。同时把「资格门禁」的 source-only 语义收窄到 `too-large` 等无法局部化的情况。
- `wysiwyg-markdown-round-trip`: 把「与其他 mark 相邻或首尾含空格的行内代码」纳入 MUST 无损往返的受支持边界（由序列化器补丁保证），并明确此类字符级差异 MUST NOT 被当作可接受的规范化，也 MUST NOT 触发整篇降级。

## Impact

- **影响代码**：
  - `patches/@tiptap+markdown+3.30.5.patch`（新增；`package.json` 未改动，版本已固定）
  - `src/lib/editor.markdown.fallback.ts`（新增，`RawMarkdown` / `parseLocalizedMarkdown` / `serializeLocalizedMarkdown` / `containsRawMarkdown`）
  - `src/lib/editor.markdown.opaque.integration.ts`（新增 `admitLocalized`，保存边界接入本地化序列化）
  - `src/lib/editor.markdown.admission.ts`（`decideAdmission` 失败策略与原因码文案）
  - `src/lib/editor.markdown.types.ts`（`localizedFallback` 标志）、`src/lib/editor.save.reconcile.ts`（本地化候选跳过图片归一化）
  - `src/lib/editor.init.ts`、`src/lib/editor.markdown.adapter.ts`（注册与可序列化类型）
  - `src/lib/editor.markdown.fingerprint.ts`（移除「行内代码尾随空格不可往返」的旧注释/决策）
  - `src/lib/editor.extensions.ts`（图片序列化回退到 `assetToOriginalMap`）
- **测试**：`editor.markdown.codespan.test.ts`（新增）、`editor.admission.test.ts`、`editor.admission-ui.test.ts`、`wysiwyg-markdown-roundtrip.section3.test.ts` 更新。
- **依赖**：`@tiptap/markdown` 固定 3.30.5，补丁随仓库分发；无新增运行时依赖。
- **不受影响**：磁盘上的 Markdown 格式、导出、剪贴板契约不变；内部 nonce 标记永不出现在保存结果中。
