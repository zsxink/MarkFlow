# Design

## Context

见 proposal.md - Why。需要补充的实现约束：

- 准入与保存共用一条权威安全路径：资格门禁 → opaque 占位 → 三方对账（`editor.markdown.admission.ts`、`editor.markdown.opaque.integration.ts`、`editor.markdown.reconcile.ts`）。`reconcile()` 是纯分类器，安全保证集中在此，本变更不改动其判定逻辑。
- 语义指纹（`editor.markdown.fingerprint.ts`）是「未登记的差异即不安全」的唯一判据；它只承认显式列入 `CANONICALIZATIONS` 的差异。
- `@tiptap/markdown` 固定为 3.30.5，仓库通过 patch-package 承载补丁（安装后 `postinstall` 应用）。
- Marked 词法分析会先归一化 CRLF，且不产出引用式定义（`[ref]: /url`）的 token（作为 token 间隙文本出现）。

## Goals / Non-Goals

**Goals:**
- 在根因层消除行内代码的字符级往返损失（而不是把它声明为安全规范化）。
- 让「无法安全往返的块」不再导致整篇文档失去可视化，同时不削弱任何安全保证。
- 保存候选必须可被独立证明：重解析为编辑器当前语义，内部标记不落盘。

**Non-Goals:**
- 不新增用户可见的编辑能力（局部字面量块是保留载体，不是新的富文本语法）。
- 不放宽 `reconcile()` 的冲突判定，不新增「安全规范化」条目。
- 不处理与本 issue 无关的 `too-large` 场景，其仍为 `source-only`。
- 不做 HTML 原文的富渲染；局部字面量块中的 HTML 始终作为文本呈现。

## Decisions

### D1: 根因优先——补丁修序列化器，而非声明规范化

行内代码的损失发生在 `@tiptap/markdown` 的 `MarkdownManager` 序列化行内节点时：它按通用 mark 开关处理 `code` mark，导致内容与相邻 mark 交互时字符被移动。补丁在通用 mark 处理**之前**先渲染代码文本：按内容最长反引号串生成更长的围栏，并按 CommonMark 施加首尾空格填充；同时只移除 `code` mark，使加粗/链接等外层 mark 仍能正常包裹代码跨度。

- **替代方案（否）**：把「行内代码尾随空格」加入 `CANONICALIZATIONS`。该差异改变了代码内容本身，声明为等价会削弱 no-loss 保证，且会让真正的字符丢失被静默吞掉。已在 `editor.markdown.fingerprint.ts` 移除该旧决策注释。

### D2: 失败策略从「整篇 source-only」改为「局部字面量保留 + 自证」

`decideAdmission` 的失败分支统一走 `admitLocalized`：

1. 若 opaque 渲染成功，复用其 sentinel 源与登记表；否则以原文为源，并用 `scanOpaqueSpans` 收集需逐字节保留的 span。
2. `parseLocalizedMarkdown` 逐块解析：每个 Marked 块先用资格分类器判定；只有「独立解析成功 **且** 其序列化结果可被语义指纹证明等价」的块才展开为正常节点，其余成为 `RawMarkdown` atom（`markflowRawMarkdown`）。
3. 载入编辑器后立即自证：本地化序列化的重解析指纹 MUST 等于编辑器当前指纹，且 opaque 恢复 MUST 完整；否则返回失败，回退 `source-only`。
4. 证明通过才创建 `MarkdownSession` 并置 `session.localizedFallback = true`。

`too-large` 无局部化意义，直接 `source-only`。**BREAKING**：策略层面不再把往返失败一律视为整篇不可编辑。

### D3: 保存证明与内部标记的隔离

局部字面量块的内容本身可能包含看似合法但会与相邻块融合的 Markdown 语法。为保证「保留字面量」在序列化时不被语法消费，`serializeLocalizedMarkdown` 在内存中给每个 raw 块一个随机 nonce 标记 `MARKFLOWRAW<nonce>SLOT<n>END`：

- nonce 由 `crypto.getRandomValues` 生成，且循环直到该标记不出现在作者的文档 JSON 中（防碰撞）。
- 序列化后按标记的**精确出现位置**回填原文，并只移除渲染器生成的块分隔空行；若回填后仍残留标记，或某标记出现不止一次，则抛错，该候选永不产生。
- 保存边界用 `verificationDoc`（把标记还原为原文后的文档）计算语义指纹，与编辑器当前指纹比较；一致才允许写入。

因此内部标记**永不落盘**，且保存前仍有一次独立的「可重解析回当前语义」证明。

### D4: 逐字节保留作者字符

- **CRLF**：`parseLocalizedMarkdown` 在词法分析前记录归一化偏移映射，块文本从**原始**字符串切片，故 raw 块保留 CRLF。
- **引用式定义**：Marked 不产出其 token，它们落在 token 间隙；间隙中非空白的文本作为原始块保留，不丢失。
- **相邻不吞并**：`findRawBlock` 在源文中定位被保留的块时排除代码区域，并要求边界为整行，避免与围栏代码示例或相邻文本误配。`serializeLocalizedMarkdown` 也据此只删除渲染器生成的块分隔换行。

### D5: 保存路径按会话分流，不触碰字面量正文

`runSaveBoundary` 对 `localizedFallback` 会话的候选跳过图片 URL 归一化（`replaceAssetUrlsWithOriginal` / `normalizeImageMarkdown`）——字面量块内的图片语法不在编辑器模型中，作为普通文本替换可能改写字面量。`reconcileSave` 对本地化会话使用 `serializeLocalizedMarkdown` 的验证文档指纹，替代基于 opaque 重渲染的指纹路径。

### D6: 会话标志在内容变化时升级

即使文档最初完全受支持，用户仍可能把一个含原始字面量的片段粘贴进文档。`reconcileSave` 在每次保存边界检查 `containsRawMarkdown(editor.getJSON())`，一旦存在即把会话升级为 `localizedFallback`，从而改用本地化证明路径。

## Risks / Trade-offs

- **补丁与上游漂移** → `@tiptap/markdown` 固定 3.30.5；补丁文件随仓库分发，升级版本时必须重做补丁并跑代码跨度回归。
- **标记碰撞** → nonce 随机且带「不出现在作者 JSON」检查，回填时校验唯一性，冲突即拒绝保存（fail-closed）。
- **局部字面量块削弱可视化体验** → 这是有意的权衡：只对无法证明安全的块降级，其余内容仍可编辑；块内双击可就地编辑原文。
- **`containsRawMarkdown` 每次保存遍历文档** → 文件规模有限（`too-large` 走 source-only），成本可接受；不改变语义判定。
- **本地化序列化抛错** → 包装在 try/catch 中，序列化失败绝不产生写入候选（保持 `candidate === null` → `conflict`）。

## Migration Plan

- 无数据迁移。补丁经 `postinstall` 应用；CI 与本地安装需重跑 `npm install` 以生成补丁后的 `node_modules`。
- 回退：删除 `patches/` 与补丁依赖、移除 `RawMarkdown` 注册并让 `decideAdmission` 失败分支回到 `source-only`。Source 模式与原始 Markdown 读写始终可用，回退不影响磁盘格式。

## Open Questions

（无。实现已完成于 issue #291 分支，规格与设计仅作事后记录。）
