## Context

> 本文件是 Issue #254 的总览与决策摘要。可执行的专题设计、阶段入口条件和验收门禁已拆分到 [design/README.md](./design/README.md)，AI/Reviewer/人工验收流程资产位于 [validation/README.md](./validation/README.md)。发生冲突时，capability spec 定义产品行为，专题设计定义实现约束，阶段设计定义交付顺序。`/Users/xian/markflow-test` 只保存供人使用 MarkFlow 打开的 Markdown 测试文档，不保存项目流程资产或证据。

### 当前基线

本设计以 `feat-v0.1.0@6bfba453` 为代码基线。当前编辑链路为：

```text
read_file(String)
  -> setMarkdown()
  -> Tiptap/ProseMirror document
  -> editor.storage.markdown.getMarkdown()
  -> normalizeImageMarkdown()
  -> write_file(String)
```

Source Mode 会临时创建 CodeMirror 6，WYSIWYG/Source 切换时通过 ProseMirror serializer 与 `setContent()` 全文同步。`documentState.trailingNewlines` 记录打开时的尾部 `\n` 数量，尝试在 serializer 输出末尾补回。

这条链路有三个根本问题：

1. ProseMirror 文档树不表达 Markdown 的全部 concrete syntax/trivia，serializer 必然规范化空行、EOL、marker、fence 等信息。
2. Source 与 WYSIWYG 是两个文本模型，模式切换就是一次有损导入/导出。
3. `normalizeImageMarkdown()` 等保存前全文处理会修改用户未触及区域，和 byte-to-byte 合同直接冲突。

P0 真实桌面人工验收还确认了一个更早的故障：`setMarkdown()` 以进入 ProseMirror 前的文本建立 persisted baseline，却通过 serializer 输出回比 dirty；段内 soft break 被规范化为空格，`normalizeImageMarkdown()` 同时把 CRLF 全文转换为 LF。随后 `setReadOnly(false)` 的 editable update 进入 dirty scheduler，autosave 在零用户 transaction 的情况下周期性写盘。因此“只打开文件”已经可能改变 bytes、mtime 并触发关闭提示。此行为必须在 P0 corrective run 中被机器刻画，并由 P0S 在 legacy 路径止血。

### draft 分支可复用结论

`feat-v0.1.0-draft@1e97c113` 不作为合并基线，只作为设计与代码证据。可复用的部分包括：

- `OriginalSnapshot`：UTF-8 BOM、原始字节 hash、尾部换行、EOL 信息。
- `TextBuffer + LineEndingMap`：CodeMirror 看到统一 `\n` 逻辑文本，保存时恢复每个换行边界的原始 EOL。
- revision-bound `TextPatch` 与 UTF-16/UTF-8 position map。
- CodeMirror `Decoration`/`Widget` Live Preview 原型。
- `SourceSyncController` 的单 in-flight、ack、flush、retry、resync 思路。
- source/session/revision/request identity 检查和 stale async result 丢弃。

不能直接移植的部分包括：

- 从 M0 到 M8 同时迁移 parser、runtime、bridge、UI shell、history、commands、export 和 host 的大范围路线。
- 移除 `tiptap-markdown` 后仍让默认打开链路调用 legacy `setMarkdown()`，造成 Markdown 被当作纯文本团块。
- 把 Rust Render IR 作为 WYSIWYG 能否显示的硬前置，失败时产品只剩源码且缺少清晰降级。
- CodeMirror 与 Core 同时拥有复杂 History/事务语义，增加 pending/undo/rebase 时序风险。
- 以大量单元测试和 checklist 代替真实 Tauri WebView、视觉、IME 与文件 hash 验收。

### 设计约束

- 当前稳定功能必须在迁移期保持可用。
- 数据完整性优先级高于视觉完整度；任何异常都必须回退为同一文本的可编辑源码。
- 新路径不得依赖 ProseMirror serializer、DOM 或 widget 反推保存内容。
- 迁移必须按纵向切片交付，每个切片都能打开、编辑、保存和回滚。
- 初期只承诺 UTF-8 与 UTF-8 BOM；无效 UTF-8 必须只读或拒绝，禁止有损转码覆盖。
- 同一文档在任一时刻只能选择 legacy 或 lossless session 路径，禁止两个 owner 同时写入。

### 路线比较

| 路线 | 未编辑保真 | 编辑后未触及区域保真 | WYSIWYG 成熟度 | 首期风险 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 继续修 ProseMirror serializer | 可继续外挂元数据 | 无法系统保证 | 当前最好 | 补丁持续增长 | 不作为目标架构 |
| Rust 重写 parser、renderer、history、UI | 理论可保证 | 理论可保证 | 需从零建设 | 极高，draft 已暴露集成失败 | 不采用大爆炸重写 |
| CodeMirror Live Preview + 最小 Rust Lossless Core | 可严格保证 | 通过局部 patch 保证 | 逐 construct 演进 | 可按纵向切片控制 | 采用 |

本设计中的“用 Rust”只指文本/字节/session/patch/save 等必须拥有持久化真相的部分；编辑 DOM、selection、IME、decorations 和 widgets 继续由 CodeMirror/TypeScript 负责。

### 开源实现调研：MarkText Muya 与 Vditor

本设计额外以以下源码快照作为交互设计证据，而不是依赖或移植基线：

- [MarkText/Muya `e52106f`](https://github.com/marktext/marktext/tree/e52106fd1cdcbd33c1258b7b0cdc7013c4c5d86c/packages/muya/src)（2026-07-27）；当前 Muya 实际位于 `packages/muya/src/`，不再是旧版的 `src/muya/`。
- [Vditor `a1302b0`](https://github.com/Vanessa219/vditor/tree/a1302b04941569e55fb22be9fe4ac801a891b808/src/ts)（2026-08-11）。

两者都实现了成熟的 Markdown 编辑交互，但都不是 byte-preserving source editor：Muya 使用 `contenteditable DOM + Block Tree + JSON state`，Vditor 使用三套 `contenteditable DOM + Lute 转换器`。因此本节只吸收交互不变量，不把其 DOM/state/serializer 作为 MarkFlow 的正文真相。

#### MarkText/Muya 的实现模型

Muya 把编辑器拆成四个相互映射的层：

```text
Markdown import/export
        ↕ MarkdownToState / ExportMarkdown
JSON block state + ot-json1 operations
        ↕ block tree update/rebuild
Block/Content object tree
        ↕ renderer + native Range mapping
contenteditable DOM
```

关键机制和对 MarkFlow 的启示如下：

| 关注点 | Muya 实现证据 | 可吸收结论 | 不可照搬部分 |
| --- | --- | --- | --- |
| Block 拆分 | `block/base/treeNode.ts`、`parent.ts`、`content.ts` 建树；`block/base/format.ts::enterHandler` 拆分文本；`paragraphContent/index.ts` 处理 list/quote/fence/table 等上下文 | Enter/Backspace 必须先识别结构上下文；列表、引用、脚注等需要按“最小结构闭包”更新 | 大量 UI block mutation 和 DOM 重建会造成双真相，且不能保存 concrete syntax trivia |
| Inline token | `inlineRenderer/lexer.ts::tokenizer` 产生带 source range 的 token；renderer 根据 cursor/token range 选择 `MU_GRAY` 或 `MU_HIDE` | marker 是否隐藏必须由 source range 与 selection/composition 相交关系决定 | 不使用整块 `innerHTML` 重写、DOM class 隐藏或 DOM offset 作为 source offset |
| Selection | `selection/TextSelection.ts` 在 DOM Range 与 `block path + offset + direction` 间映射；重建后按 path 找新 block；图片/表格使用独立 selection 类型 | selection 必须可序列化、可经过一次 transform 映射，并带 direction/affinity；原子 widget 需要显式 selection 语义 | 不能持久化 DOM node/block object reference；path 在树重建后也只能作为 fallback |
| Source↔WYSIWYG cursor | `selection/offsetCursor.ts` 与 `muya.ts::setCursorByOffset/getCursorOffset` 通过 sentinel 注入、parse、serialize 定位 | recovery 路径应可验证 cursor 映射，而非静默跳到文首 | sentinel 需要两次 parse/serialize，会被规范化；不能作为正常模式切换路径 |
| Paste | `clipboard/paste.ts` 先冻结 clipboard/selection，再区分 code/table literal、HTML、Markdown、图片和跨块结构，最后作为一次语义操作插入 | MIME/context 分类、先删除 selection、一次 transaction、literal context 和结构 seam 都值得采用 | HTML→Markdown→JSON state 不是无损转换；不可让 paste 触发全文 parse/serialize |
| Undo/Redo | `history/index.ts` 对 JSON op 求逆，保存 selection，并按 input kind 打断/合并；异常时以 authoritative state 重建 | History entry 应携带 selection before/after；paste、Enter、结构命令、bulk replace 必须有明确 group boundary | 不把 UI block JSON op 或固定 1 秒计时合并作为 Core 真相；不再造第二套 Rust History |

Muya 最重要的反例在 `state/markdownToState.ts` 与 `state/stateToMarkdown.ts`：导入会重造 ATX marker、trim HTML、合并文本、重新 escape table，导出再从 JSON state 生成 Markdown。这可以提供语义一致性，却无法满足“编辑正文后未触及字节不变”。

#### Vditor 的实现模型

Vditor 明确区分三种模式，但三者不是同一文本 surface：

```text
SV contenteditable DOM   ─┐
IR contenteditable DOM   ─┼─ getMarkdown() ─ Markdown ─ Lute ─ 新模式 DOM
WYSIWYG contenteditable ─┘
```

`toolbar/EditMode.ts` 切换模式时先调用 `getMarkdown()`，随后分别调用 `Md2VditorIRDOM`、`Md2VditorDOM` 或 `SpinVditorSVDOM` 全量生成目标 DOM；`markdown/getMarkdown.ts` 则从各模式 DOM 重新转换 Markdown。这正是 MarkFlow 必须避免的全文 round-trip。

| 关注点 | Vditor 实现证据 | 可吸收结论 | 不可照搬部分 |
| --- | --- | --- | --- |
| Block 拆分/局部更新 | `wysiwyg/input.ts`、`ir/input.ts` 找当前 block；列表提升到顶层 list，并将脚注/引用定义纳入重绘闭包，再交给 Lute `Spin*DOM` | 局部解析边界不能只取光标所在段落；要包含会影响语义的关联结构 | `outerHTML` 送 parser 再替换 block 会改变 node identity，也会规范化 Markdown |
| Inline 显隐 | IR/SV 保留 marker DOM；`ir/expandMarker.ts` 展开活动 marker；WYSIWYG render block 使用 source/preview siblings，`showCode.ts` 在编辑时切回源码 | “非活动时投影、活动时显示可编辑源码”是 Live Preview 的正确交互原则 | 不建立 source sibling 与 preview sibling 两份可编辑内容；widget/decoration 只是同一 CM doc 的投影 |
| Selection | `util/selection.ts` 在重绘前插入 `<wbr>`，重绘后恢复原生 Range；另有按 DOM `textContent.length` 扫描的 position fallback | 任何会替换投影节点的操作都必须先保存 selection，并在新 revision 上映射/恢复 | DOM 字符计数不是 Markdown UTF-16/source byte 坐标，`wbr`/ZWSP 也不能进入正文或 History |
| Enter/Backspace | `wysiwyg/processKeydown.ts`、`ir/processKeydown.ts`、`sv/processKeydown.ts` 以及 `util/fixBrowserBehavior.ts` 对 list/table/quote/code/task/HR 等逐类处理 | Enter/Backspace 不是浏览器默认输入，而是一组按 context 决策、可单测的结构命令 | 不复制浏览器特例堆；CodeMirror command 应输出确定的 source `ChangeSpec` |
| Paste | `util/fixBrowserBehavior.ts` 拦截默认 paste，区分 HTML/plain/file/code，sanitize 后转换为相应模式 DOM，并恢复 selection | clipboard 分类、安全清洗、code literal、文件上传和一次用户意图应形成独立管线 | 不使用 `execCommand`、DOM 插入或每次 paste 后 `Spin*DOM` 作为正文生成器 |
| Undo/Redo | `undo/index.ts` 为三模式分别保存 `innerHTML` 的 diff-match-patch 栈，undo 后重建 DOM/preview/selection | composition/paste 需要可预测的 grouping，恢复时必须同时恢复 selection | DOM-string History 对 renderer 变化敏感、模式间分裂、整根替换；MarkFlow 必须继续使用单一 CM History |

#### 对 MarkFlow 的最终取舍

调研不会改变“CodeMirror Live Preview + 最小 Rust Lossless Core”的主方向，反而进一步限定了它：

1. **Block/CST 只提供结构和 source ranges，不拥有第二份正文。** 初期使用 CodeMirror/Lezer 的本地树；需要跨块闭包或复杂语法时，Core 可返回 revision-bound ranges/edit plan。任何 AST/IR 都可重建，不能反向全文序列化覆盖文本。
2. **Inline marker 只由 Decoration 投影。** 默认先弱化；只有通过 selection、IME、clipboard、accessibility 门禁的 cohort 才允许 replace/hide。活动 token、相邻 composition 和结构命令目标必须揭示源码。
3. **Selection 以 CodeMirror UTF-16 positions 为交互基准。** 每个 transaction 用 `ChangeDesc` 映射 selection/affinity；跨 Core bridge 时显式转为 UTF-8/source byte range。DOM node、block object、`wbr`、sentinel 均不得成为正常路径状态。
4. **Enter/Backspace 是 command matrix，不是 DOM 修复。** router 根据 selection、syntax context、line/block boundary 与 construct owner 选择 source transaction；无法安全判定时执行 CodeMirror 原生文本语义或揭示源码，绝不猜测后全文 normalize。
5. **Paste 是有类型的一次 transaction。** 先同步冻结 selection 和 MIME payload；code/raw/table-cell 等 literal context 直接插文本；HTML 走显式 sanitize/convert preview；file/image 走资源事务；最终只提交一个或一组有明确 History boundary 的局部 source changes。
6. **Undo/Redo 只有 CodeMirror History。** 普通输入按 CM 合并语义；paste、Enter、结构命令、widget commit 和 bulk replace 显式设置边界。Undo/Redo 产生普通局部 patch，同步给 Core；Core 不维护竞争的 UI History。
7. **Projection 的局部更新按结构闭包失效。** 文本 change 先通过 syntax tree/source map 计算受影响的 block closure，再只重算可见范围；如果 closure/range 不可信，则扩大到 source fallback，而不是使用 rendered DOM 猜正文。

这意味着目标不是复刻 Muya/Vditor 的 contenteditable WYSIWYG，而是复刻它们成熟的交互感受，同时由 CodeMirror transaction 和 Rust byte session 消除其 DOM round-trip 的数据风险。

#### ChatGPT 桌面版/Codex 的公开证据边界

用户报告的观察版本为 ChatGPT Desktop `26.803.61601`（Powered by Codex & OWL）。[OpenAI Developers](https://developers.openai.com/) 公开描述 ChatGPT、Work 与 Codex 的产品能力，但截至本设计复核日，没有公开该桌面版 Markdown/文档编辑 surface 的源码、依赖清单、正文模型、selection mapping、History 或保存协议。因此：

| 可作为证据 | 不可作为证据 |
| --- | --- |
| 在指定版本上用合成内容观察 selection、Enter/Backspace、paste、Undo/Redo、源码标记显隐、导出结果 | 因界面观感相似就声称内部使用 CodeMirror/ProseMirror/contenteditable |
| 官方公开产品文档明确说明的用户能力 | 以“Codex 是执行者”或模型自述推断 OpenAI 私有实现 |
| 可重复的黑盒输入、步骤、版本和输出 artifact | 无法取得原始文件 bytes 时宣称 ChatGPT 已证明 byte-to-byte 保存 |

P0 可建立 `ChatGPT Desktop black-box observation` 行为矩阵，作为交互启发而非架构依据。观察必须标注 `Observed`、`Officially documented` 或 `Inference`；Inference 不得进入 MarkFlow 的 MUST 合同。除非将来出现可核验官方源码/技术文档，否则本方案的技术选型只以 MarkFlow 当前代码、draft 代码证据、CodeMirror/Rust 官方能力和固定 SHA 开源实现为依据。

## Goals / Non-Goals

**Goals:**

- 未编辑文件不发生写入；若显式保存，输出与输入 byte-to-byte 相同。
- 在正文任意位置编辑后，文末空行以及所有未触及 byte spans 保持原字节。
- Source 与 Live Preview 使用同一个 CodeMirror document、selection、scroll、composition 和 History。
- Rust Core confirmed snapshot 是保存与冲突判断的唯一真相；CodeMirror 是低延迟 optimistic mirror。
- 所有编辑入口产生局部 patch，不进行隐式全文格式化。
- Live Preview 的失败只影响投影，不影响输入、保存或源码访问。
- 默认编辑面在发布支持矩阵内达到 Typora 式体验：非活动 marker 隐藏，活动 construct 原地揭示源码，富块在同一文档流内编辑。
- 在移除 ProseMirror 前，用真实桌面证据证明 P6/P7 的 marker、IME、selection、图片、表格、图表和回退合同达到发布水平。

**Non-Goals:**

- 首期支持任意历史编码或无效 UTF-8 的可写编辑。
- 复制 Typora 的内部实现或一次覆盖 Typora 全部扩展语法；体验对齐与发布支持矩阵必须和功能全量复制分开表述。
- 为了“Rust 化”重写 DOM、CSS、图片解码、Mermaid 或系统文件 API。
- 首期把 Undo/Redo owner 移入 Rust；单一 CodeMirror surface 已能提供跨模式单一 History。
- 首期实现多人协作、跨窗口实时协同或 CRDT。
- 一次性删除全部 ProseMirror/Tiptap 代码。
- 自动规范化 Markdown；格式化只能作为用户明确调用、显示 diff 且可 Undo 的独立命令。

## Decisions

### 1. 从当前分支渐进迁移，不合并 draft

新实现从当前 `feat-v0.1.0` 拆出小模块和 feature flag，只按需参考 draft 的算法、测试和 DTO。每个被移植模块都需要重新适配当前调用链并重新验证，不能以 draft 测试通过作为证据。

选择原因：当前分支保留可工作的 Markdown 渲染和既有功能；draft 与当前基线已在 498 个左右文件上发生大规模分叉，直接 merge/cherry-pick 会把已知失败路径和无关架构迁移一并带回。

替代方案：

- 继续在 draft 上修：恢复速度可能快，但无法证明哪些功能回归来自哪一层。
- 继续修 ProseMirror serializer：无法表达 concrete syntax，不满足编辑后的保真合同。

### 2. Rust Core 保存字节真相，CodeMirror 保存交互真相

文档状态分为两层：

```text
Rust LosslessDocumentSession              CodeMirror EditorSurfaceBinding
----------------------------------         --------------------------------
original bytes + hash                      logical LF text (optimistic)
BOM + per-newline EOL map                  selection / viewport / composition
confirmed logical text                     decorations / widgets
confirmed revision                         CodeMirror History
persisted revision                         pending transaction mirror
file identity                              mode compartments
```

Core 的职责是确认文本、保存字节、revision、external identity 和 patch 校验。CodeMirror 的职责是即时输入、选区、IME、viewport、Live Preview 与单一 Undo/Redo。

这样不需要在第一阶段解决 Core History 的 pending/Undo/rebase 状态机；Undo/Redo 只是 CodeMirror 产生的另一组局部 transaction，经同一 patch 管线同步到 Core。

替代方案：让 Core 同时拥有 History。长期可行，但不是 byte fidelity 的前提，会显著扩大首批风险面。

### 3. 原始字节与逻辑文本分离

Core 打开文件时直接读取 `Vec<u8>`，生成：

```rust
struct OriginalSnapshot {
    bytes_hash: ContentHash,
    byte_len: usize,
    bom: BomKind,
    encoding: EncodingKind,
    trailing_newlines: usize,
    line_endings: LineEndingMap,
}

struct LosslessDocumentSession {
    original: OriginalSnapshot,
    buffer: TextBuffer,          // logical UTF-8, newline = \n
    revision: Revision,
    persisted_revision: Revision,
    file_identity: FileIdentity,
}
```

CodeMirror 只接收逻辑 LF 文本。Core 保留每个换行边界的 `LF/CRLF/CR` 类型；局部替换时：

- 未被替换的换行边界保留原类型；
- paste 中显式 CRLF/CR 按输入保留；
- 新插入的普通 `\n` 优先继承被替换边界，其次右邻、左邻、最后使用文档主导 EOL；
- paste/drop 必须在 CodeMirror 归一化前通过 transaction annotation 传递逐换行 `Explicit LF/CRLF/CR`；其余新增换行传递 `Inherit`；
- BOM 不进入 CodeMirror，保存时由 Core 恢复；
- 文末空行就是 buffer 中的真实换行边界，不使用旁路计数补回正文。

无编辑时，Core 可直接返回原始 bytes；发生编辑后从 TextBuffer + LineEndingMap 生成 bytes。两条路径都必须通过 hash/golden test。

### 4. 精确定义 byte-to-byte 合同

“保真”分两级，不能只用“看起来一样”验收：

#### L0：无编辑保真

- 打开、模式切换、预览、自动保存 tick 和关闭不得改变文件。
- 干净文档不得写盘，mtime 保持不变。
- 用户显式要求保存干净文档时，若产品仍执行写入，payload 必须与原 bytes 完全一致。

#### L1：编辑后未触及区域保真

对每个已确认 patch `replace(old[start..end], inserted)`：

- patch 前 `old[..start]` 与 patch 后对应前缀逐字节一致；
- patch 前 `old[end..]` 与 patch 后对应后缀逐字节一致；
- 多 patch 场景通过操作日志/position transform 追踪存活原始 spans；
- 只有 replacement range、显式语义命令声明的相邻 range，以及新增 bytes 可以变化。

例如编辑 `哈哈哈` 时，尾部 `\n\n` 不在 patch range 内，保存后必须保持原字节。用户在文末主动增加或删除换行时，patch range 才覆盖该边界。

### 5. 使用 revision-bound 局部 patch，同一时刻单 in-flight

CodeMirror transaction 提取 UTF-16 `from/to/insert`，交给 `EditorSurfaceBinding`：

```text
CM transaction
  -> local optimistic document immediately updated
  -> frame batch
  -> one in-flight apply_text_patch(baseRevision, transactionId, changes)
  -> Core validates UTF-16 boundaries and maps to logical UTF-8 byte ranges
  -> atomic apply or reject
  -> ack(confirmedRevision)
```

规则：

- patch 必须有唯一 transaction ID，retry 幂等；
- 多 change 从后向前应用，拒绝重叠和非法 Unicode boundary；
- save、切换文档、reload、close 前必须 `flush()`；
- retry 穷尽、stale revision 或 session mismatch 后进入 blocked/degraded，禁止保存旧 snapshot；
- resync 以 Core confirmed text 为基线，重放仍有效的本地 pending changes；不能静默丢弃用户输入。

首期队列只允许单 in-flight，避免同时 ack 造成 revision 乱序。

### 6. 一个文档只创建一个 CodeMirror EditorView

Lossless path 打开时创建 `EditorSurfaceBinding`，直到文档关闭才销毁。Source/Live Preview 通过 compartments 重配置：

```text
base compartment       markdown language, input, selection, history
mode compartment       source decorations | live-preview projection
theme compartment      light/dark/sepia
readOnly compartment   editable state
projection compartment per-construct extensions/widgets
```

模式切换不得替换全文、销毁 EditorView 或调用 ProseMirror；selection、scroll、focus、pending patches 和 History 必须保持。当前 `editor.ts` 暂时保留 facade，逐步把 outline、stats、toolbar、keyboard、autosave 和 export 的读取改到 active binding，避免一次修改所有消费者。

### 7. Live Preview 终态使用 CodeMirror 本地语法树

Live Preview 的基本可用性不得依赖一次 Rust IPC 成功。第一批 heading、strong、emphasis、strike、inline code、link、blockquote、list 和 fence 使用 `@codemirror/lang-markdown`/Lezer 可见区语法树生成 decorations：

- 输入后同一 transaction 内即可更新；
- backend render 失败不会使 Markdown 退化为纯文本团块；
- 所有投影都覆盖同一 CodeMirror source，不改变 document text。

P4A 已通过 [parser/source-map ADR](./adr/adr-parser-source-map-render-ir.md) 冻结 `SPIKE_COMPLETE_NO_CORE_IR`：Lezer 是本 change 唯一受信 source-map，Core Render IR 不进入产品、flag、协议、E2E 或发布声明。Table、FrontMatter、image、diagram 等复杂构造由 local ranges 与 source-backed widget protocol 实现；范围不可信时精确回退源码。

每个 construct 只能有一个 projection owner：`local`、`widget` 或 `source-fallback`。父子构造可以在声明的 editable slot 中嵌套，但同一 construct identity/range 不得同时叠加两套 owner。未来若重新引入 `core` owner，必须满足 ADR 的重议条件并建立新的 change/ADR，本 change 不预留可被误开启的运行时路径。

### 8. Marker 先弱化，P6 统一按 cohort 隐藏

首个可用版本只做语义样式和 marker 弱化。P4B 建立 owner、visibility resolver、atomic/navigation、clipboard、a11y 与真实 IME 共用底座，但不输出 hidden；P6 是唯一 marker hiding 交付阶段。隐藏使用 `Decoration.replace`，相同 source range 通过 `EditorView.atomicRanges` 提供确定边界，禁止 CSS 零宽 marker。

状态统一为 `visible/dimmed/hidden/revealed`；composition 是强制 reveal 或冻结安全投影的条件。Plain-text clipboard、save、History 和 accessibility descriptor 读取 CodeMirror/Core source range，不依赖 rendered DOM `textContent`。

P6 逐 cohort 开启：

1. heading + strong；
2. emphasis + strike + inline code；
3. link/autolink/reference；
4. quote + list/task；
5. fence/thematic break。

每个 cohort 必须先通过：selection、Home/End、Shift+Arrow、Select All、clipboard、CJK/Japanese composition、emoji boundary、空 construct、input rule、Undo 落点、viewport 重建和 Source fallback。失败的 construct 回到 dimmed/source fallback，不影响其他 construct 发布。

### 9. 保存只接受 Core confirmed payload

新保存流程：

```text
save intent
  -> flush EditorSurfaceBinding
  -> verify no blocked/pending patch
  -> optional resource preflight (no saveOperationId, no durable receipt)
  -> image transaction returns explicit document patch
  -> apply patch through CodeMirror + flush
  -> allocate fresh saveOperationId for final confirmed revision
  -> Core prepare_save(finalRevision, expectedFileIdentity, saveOperationId)
  -> Host guarded_atomic_write(payload, expectedFileIdentity, saveOperationId)
  -> Core commit/reconcile(saveOperationId, revision, newFileIdentity)
```

约束：

- `getMarkdown()` 不得作为 lossless save 输入；
- `normalizeImageMarkdown()` 不得出现在打开、模式切换、dirty 或保存路径；
- 图片路径迁移必须生成可审查的局部 patch，先应用到同一 CodeMirror/Core session，再写图片和文档；
- 外部文件 identity 至少包含 path canonical identity、mtime、size 与 content hash；不匹配时自动保存跳过，交互保存进入冲突流程；
- 保存成功只清除该 revision 的 dirty；写盘期间产生的新编辑保持 dirty。
- identity 校验与替换必须在同一个 Host guarded-write command 内完成；不得在前端分成“先 stat、后 write”两个调用；
- 每次保存使用幂等 `saveOperationId` 和 durable receipt，响应丢失后必须 reconcile，不能把应用自身成功写盘误判为外部修改。
- resource preflight 不生成 payload/receipt/operation ID；任何资源 patch 改变 revision 后，只为最终 confirmed payload 分配全新的 `saveOperationId`。同一 ID 绝不跨 payload/revision 复用。

### 10. Dirty 与 autosave 使用 revision，不比较规范化字符串

状态定义：

```text
dirty = local optimistic doc differs from confirmed persisted state
     = pendingChanges > 0
       OR confirmedRevision != persistedRevision
```

自动保存仅在 dirty、not blocked、not saving、no unresolved external conflict 时触发。自动保存先 flush；flush 或 identity 校验失败只记录一次可恢复状态，不得写入旧 revision。干净 tick 不写盘也不改变 mtime。

### 11. Feature flags 只控制入口和投影，不产生双真相

建议 flags：

- `losslessCoreSession`：按文档选择 legacy 或 lossless 打开链路；默认关闭到 Slice 1 验收完成。
- `codemirrorLivePreview`：在 lossless session 内开启投影；关闭时仍是同一 CodeMirror Source surface。
- `livePreview.<construct>`：逐 construct projection 开关。
- `livePreview.<construct>.hidden`：P6 visibility 开关；关闭只回到 dimmed，不关闭 construct。
- `livePreview.<widget>`：P4B/P7 rich widget 开关；关闭回到 local/source fallback。
- `legacyProseMirror`：仅供尚未迁移用户主动回退；一旦某文档由 lossless session 打开，当前会话内不得切到 PM owner。

flag 组合必须写入日志和 E2E evidence。回滚 Live Preview 只能退到 CodeMirror Source，不能退到 ProseMirror serializer 保存。

### 12. Parser 不阻塞保真主链

byte fidelity 只依赖 TextBuffer、EOL map、position map 和 patch，不依赖 Markdown parser。Parser spike 单独比较：

- CodeMirror Lezer markdown tree；
- draft 的 ParseIndex；
- `markdown-rs`、`pulldown-cmark` 或其他候选；
- 必要时“语义 parser + MarkFlow concrete source map”组合。

淘汰线：

- CJK/emoji/escape/nested/malformed 的 source/content/marker ranges 必须能回切精确 source；
- unknown/malformed 不得阻止打开、编辑和保存；
- parser 不得通过 serializer 重建未编辑文本；
- viewport query 和局部 invalidation 有可复现数据；
- license、维护状态和 binary 增量可接受。

Spike 没有胜者时，Live Preview 继续使用 CodeMirror 本地树，复杂 construct 保留源码；不得阻塞 Slice 1/2。

### 13. Unknown、错误和异步失败采用 exact source fallback

投影状态至少包含：`source`、`projecting`、`rendered`、`composing`、`stale`、`degraded`、`disposed`。

任何 parser error、IR identity mismatch、widget timeout、unsafe URL 或 unsupported construct 都必须：

- 保留原始 Markdown 文本可见可编辑；
- 只清除失败 range 的 decoration/widget；
- 不改变 dirty、revision 或保存 payload；
- 提供非重复的状态提示和 Retry；
- 记录 identity 和错误码，不记录完整文档内容。

### 14. ProseMirror 最后删除

ProseMirror/Tiptap 的删除条件不是“CodeMirror 页面能打开”，而是：

- lossless path 默认开启并经过稳定观察；
- P6 发布必达 cohorts 已达到 hidden-preview；
- P7 发布支持矩阵中的 task/image/table/diagram 等目标已达到，非必达项已准确声明 fallback；
- 常用输入/工具栏/图片/链接/列表/代码块能力已迁移；
- Source/Live Preview 切换、autosave、external reload、export 均不读取 PM；
- canonical fixtures 和真实桌面测试通过；
- PM fallback 使用率与阻塞问题达到退出阈值；
- 独立 reviewer 复核并批准。

删除时同时移除 `getMarkdown()/setMarkdown()` 持久化职责、serializer、`trailingNewlines` 元数据和隐藏 PM DOM；保留与导出有关的独立 Markdown renderer 时必须明确其只读职责。

## Architecture and Data Flow

```text
                         ┌──────────────────────────────┐
disk bytes ──open───────▶│ LosslessDocumentSession     │
                         │ snapshot / buffer / revision │
                         │ EOL map / file identity      │
                         └──────────────┬───────────────┘
                                        │ logical LF text
                                        ▼
                         ┌──────────────────────────────┐
                         │ EditorSurfaceBinding         │
                         │ one CodeMirror EditorView    │
                         │ optimistic text + history    │
                         └───────┬──────────────┬───────┘
                                 │              │
                          CM transactions       │ viewport/selection
                                 │              ▼
                                 │     ┌────────────────────┐
                                 │     │ Live Preview       │
                                 │     │ local tree + IR    │
                                 │     │ decorations/widgets│
                                 │     └────────────────────┘
                                 ▼
                         patch queue / flush
                                 │
                                 ▼
                         Core confirmed revision
                                 │
                         prepare_save(bytes)
                                 │
                                 ▼
                         Host guarded_atomic_write
```

### Bridge 最小 API

```text
open_lossless_document(path)
  -> sessionId, documentId, revision, logicalText, sizeClass, fileIdentity

apply_text_patch(bindingGeneration, sessionId, documentId, transactionId,
                 baseRevision, utf16ChangesWithEolProvenance, selectionAfter)
  -> revision, selectionAfter

get_confirmed_snapshot(sessionId)
  -> revision, logicalText, fileIdentity

prepare_document_save(sessionId, documentId, expectedRevision,
                      expectedFileIdentity, saveOperationId)
  -> revision, payloadHash, payloadBytes/base64 or opaque guarded-save token

guarded_atomic_write(saveOperationId, expectedFileIdentity, payload/token)
  -> durable write receipt, newFileIdentity

commit_document_save(sessionId, documentId, saveOperationId,
                     revision, writeReceipt)

reconcile_document_save(sessionId, documentId, saveOperationId)
  -> NotWritten | WrittenAndCommitted | WrittenNeedsCommit | Conflict

reload_lossless_document(sessionId, expectedState)
close_lossless_document(sessionId)

get_render_blocks(...)  // 后续增强，不是打开/保存前置
```

大文件 payload 不应长期通过 JSON base64 往返；Slice 1 可先使用受限 payload 验证合同，随后在同一 Tauri command 内由 Runtime 取得 Core bytes 并原子写盘，避免复制和 IPC 膨胀。

## Current-to-Target Mapping

| 当前基线位置 | 当前职责/问题 | 目标迁移 |
| --- | --- | --- |
| `src/lib/editor.ts` | `getMarkdown/setMarkdown`、PM↔CM 全文模式切换、尾换行补偿 | 收敛为 active `EditorSurfaceBinding` facade；不生成保存正文 |
| `src/lib/editor.source.ts` | Source 时临时创建 CM6 | 演进为文档级唯一 EditorView 与 compartments |
| `src/lib/editor.state.ts` | `lastPersistedMarkdown`、`trailingNewlines`、revision | 文档真相迁入 Core session；前端仅保留 binding/UI 状态 |
| `src/lib/editor.serializer.ts` | 图片/换行 normalize 与 PM fallback serializer | 退出持久化路径；只读 export 或显式格式化命令另行保留 |
| `src/components/sidebar.fileops.ts` | 前端取得全文字符串、图片准备、写盘、dirty 清理 | SaveCoordinator：flush → Core payload → resource tx → atomic bytes → commit |
| `src/lib/storage.ts` | `read_file/write_file(String)` | session bridge + bytes atomic save；普通导出 API 可继续存在 |
| `src-tauri/src/commands/files.rs` | `read_to_string`、string atomic write | Host 读取 bytes、file identity、guarded atomic write/receipt/recovery；业务状态不放 files command |
| toolbar/keyboard/image | Source 和 PM 两套路由 | 单一 CodeMirror command router/transaction |
| outline/stats/export | 按 mode 从 CM 或 PM 读取 | active binding 或同 revision Core snapshot |

### draft 参考映射

| draft 证据 | 处理方式 |
| --- | --- |
| `markflow-core/src/document/snapshot.rs` | 参考 BOM/hash/EOL 扫描；重新按本规范补齐原始 bytes 与 file identity 合同 |
| `markflow-core/src/document/text_buffer.rs`、`line_ending_map.rs` | 优先精选移植并重新做 Mixed EOL/L1 property tests |
| `position_map.rs`、`patch.rs`、`session.rs` | 参考显式坐标、原子 patch、revision/idempotency；裁掉首期无关 History/semantic commands |
| `src/lib/SourceSyncController.ts` | 参考单 in-flight/flush/retry/resync；常量和状态机必须重新基准验证 |
| `src/editor-adapter/codemirror/wysiwygRenderExtension.ts` | 只参考 decoration/widget/identity；发布投影改为本地 Lezer ranges，不移植 Core IR 路径 |
| `docs/superpowers/specs/2026-07-31-core-backed-open-newline-design.md` | 保留“Core session 唯一正文来源”；修正打开链必须依赖 Core Render IR 的风险 |
| `.workbuddy/issue-246-overview.md` | 作为“移除 parser 但未切默认挂载导致只显示源码”的反例与 E2E 用例来源 |
| `docs/markflow-core-phase2/*` | 吸收输入完整性、stale identity 和证据分层；不沿用 119 项/15 阶段的交付粒度 |

## Migration Plan

### Slice 0：现状刻画与不可回归门禁

只建立证据，不改变默认编辑器：

- 固定当前基线、flags、日志与测试环境；
- 建立 canonical byte fixtures 和 hash harness；
- 用 serializer characterization 证明当前 PM 路径在正文编辑后会改写未触及 bytes；
- 用 autosave 开启的真实产品生命周期 characterization 证明零编辑打开是否 dirty/写盘，记录 save count、mtime/hash 与 soft-break/EOL/tail 分项 diff；
- 冻结 byte contract、UTF-16/UTF-8 mapping、EOL inheritance 和 file identity ADR；
- 建立真实 Tauri dispatcher contract test，禁止只 mock `invoke`。

退出条件：测试能稳定抓住 #189 无效场景和零编辑写盘；AI 与完整人工步骤一致；设计中的 L0/L1 合同可机器验证。P0 Go 只表示失败刻画可信，不表示 legacy 产品通过。

### Slice 0S：Legacy 零编辑写盘安全止血

P0 Go 后建立独立安全 child change：

- programmatic hydration、read-only/editable 同步不产生 user revision；
- legacy dirty 临时改为用户 transaction/revision 驱动，不再用 PM serializer 字符串回比；
- autosave 与最终 write 入口都有 clean-session guard；
- 干净文档显式 Save 跳过写盘；
- 将 P0 零编辑 failing lifecycle 转为默认长期绿色回归；
- 不扩大 `trailingNewlines`，不声称解决编辑后的 L1，不阻塞 P1A Core 独立开发。

退出条件：autosave 实际开启、等待两个 tick后 save count=0、dirty=false、无关闭提示，全部 L0 fixture 的 hash/length/mtime 不变；一个真实用户 edit 仍能进入 dirty。任何继续提供 legacy 默认路径的发布构建必须先通过 P0S。

### Slice 1：Lossless Core + CodeMirror Source 纵向切片

在 `losslessCoreSession` flag 后实现：

- 最小 Core snapshot/TextBuffer/EOL map/patch/session；
- open/apply/flush/save/reload/close bridge；
- 复用当前 CodeMirror 编辑器，接入 transaction pipeline；
- Core bytes 原子保存、revision dirty、external identity；
- Source 模式完成打开—正文编辑—保存—重开闭环。

默认 WYSIWYG 仍走 legacy，lossless flag 仅用于开发/验收；同一文档会话不得跨 owner。

退出条件：全部 byte fixtures 在无编辑和正文编辑后通过；自动保存和外部冲突不破坏字节。

### Slice 2：单一 CodeMirror Surface + 基础 Live Preview

- lossless 文档打开即创建唯一 EditorView；
- Source/Live Preview 使用 compartments 切换；
- 本地 Lezer 实现 heading、strong、emphasis、inline code、link、quote、list、fence 的样式和 marker 弱化；
- projection 按 syntax/source range 失效；list、quote、reference、footnote 等使用最小结构闭包，不用 DOM node identity 追踪正文；
- selection 始终由 CodeMirror position/direction/affinity 表达，并通过 transaction mapping 保持；marker reveal 不从 rendered DOM 反算 selection；
- outline、stats、statusbar 读取 active binding；
- 模式切换 100 次验证 bytes、selection、scroll、focus、dirty 和 History。

退出条件：真实 WYSIWYG 页面按 Markdown 语义显示，而不是只断言“有文本”；render 失败仍可编辑保存。

### Slice 3：保存主链与常用编辑能力切换

- lossless path 成为默认打开/保存；
- toolbar、keyboard、paste、image insert、link/list/code commands 全部 dispatch CodeMirror transaction；
- Enter/Backspace 使用可测试的 context command matrix，paste 使用 MIME/context 分类并作为单一用户意图提交；
- CodeMirror History 是跨 Source/Live Preview 的唯一 History，结构命令、paste、composition 和 widget commit 有明确 group boundary；
- 图片资源事务改为显式局部 Markdown patch；
- autosave、reload、external conflict、save-as、new file 完成迁移；
- ProseMirror 仅保留显式 legacy flag，不能参与默认保存。

退出条件：canonical workflow、图片生命周期、Undo/Redo、CJK IME 和跨模式 E2E 通过。

### Slice 4A/4B：Parser 决策、投影交互底座与轻量 Widgets

- 完成 parser/source-map spike；
- 已记录 `SPIKE_COMPLETE_NO_CORE_IR`；后续阶段只允许 local ranges/widget/source fallback，不再保留 Core IR 实现分支；
- P4B 建立 visibility/atomic/selection/clipboard/IME harness、owner registry 与 widget protocol；
- 实现 task、code fence controls、FrontMatter safe projection 与 raw HTML policy；
- marker 保持 visible/dimmed，image、table、diagram 进入 P7。

退出条件：共用 interaction substrate 单独记录 `P4B-SUBSTRATE-GO`；轻量 widgets 各自记录 item Go/No-Go。Substrate 的 desktop semantic、selection、真实 IME、a11y、security 和回滚证据不得被单项 widget 代替。

### Slice 6：Typora 式基础 Markdown 编辑

- 使用 replacing decoration + atomic source range 隐藏 marker；
- 统一 `visible/dimmed/hidden/revealed` 状态与 construct-specific reveal；
- 按 heading/inline/link/quote-list/fence cohorts 交付；
- 补空构造、nested selection、Select All、input rule、composition 和 Undo 落点；
- 每项独立 projection/hidden flag、证据、Reviewer 与人工默认决定。

退出条件：发布必达基础 constructs 达到 hidden-preview；Normal/Large 真桌面手感、IME、keyboard、a11y 和 byte gates 通过。

### Slice 7：富块编辑与发布支持矩阵

- 收口 task/fence/FrontMatter/raw HTML；
- 实现 inline image、GFM table、Mermaid/PlantUML source-backed widgets；
- 表格结构操作声明 affected ranges 并验证 surviving bytes；
- 图表执行 sandbox、offline/timeout/cancel、CSP/SSRF/SVG sanitize；
- 生成并签署正交 construct 支持矩阵，分列 scope、maturity、default、配置条件、尺寸降级与证据；image/table 在 Normal/Large 默认 ON。

退出条件：所有 release-scope 必达项达到目标 maturity 和 default state；失败均能回最小源码范围；资源/安全/selection/byte gates 通过。

### Slice 5：最终发布、观察与 legacy 清理（最后执行）

- 三平台验证、性能和安全回归；
- 冻结同一 release candidate 进行稳定观察；
- 审计所有 PM/Tiptap、serializer 和 normalize 调用；
- 独立 agent 复核后删除 legacy；
- sync specs、archive change 并运行全部 archive gate。

退出条件：P6/P7 产品目标已验收，产品不再有 ProseMirror 文档真相或 serializer 保存路径。

### 单分支持续实施规则

Program Owner 决定 Issue #254 从当前分支 `test/issue-255-lossless-byte-contract` 持续实施 P0 corrective、P0S、P1A–P7，并在最后执行 P5 完成，不再为后续 Slice 新建 Issue、branch、OpenSpec child change 或阶段 PR。现有 P0 child change 保留，后续产品实现、阶段设计、任务与证据统一由 umbrella change 管理。

单分支必须保留阶段隔离：每个 Slice 记录 start/end commit、flags、fixtures、自动化结果、真实桌面证据、Reviewer、人工验收、rollback 和未完成项；前一阶段未 Go 时可以在同分支准备明确允许并行的代码，但不得启用、宣称或验收后续阶段。P4B cohort/widget 仍使用独立 feature flag、evidence run 和 Go/No-Go，只是不再创建独立 Git/OpenSpec 容器。

## Verification Strategy

### Canonical byte fixtures

至少覆盖：

- UTF-8、UTF-8 BOM；
- LF、CRLF、CR、Mixed EOL；
- 文末 0/1/2/3 个换行；
- 文中连续空行；
- CJK、emoji、combining marks、RTL；
- `-/*/+` 列表、不同有序 marker 与缩进；
- 反引号/波浪线 fence、不同 fence 长度、代码块首尾空行；
- FrontMatter 注释、顺序、引号；
- HTML comment/raw HTML；
- inline/reference link、image、escaped syntax；
- malformed/unknown Markdown；
- 1/10/50 MiB 大文档。

### 必测工作流

1. 打开后不编辑，等待 autosave，关闭：hash/mtime 不变。
2. 显式保存干净文件：payload hash 与输入一致。
3. 在正文中插入一个 ASCII/CJK/emoji 字符：未触及前缀、后缀和文末空行原字节一致。
4. 主动增删文末空行：只改变对应尾部 range。
5. Source/Live Preview 切换 100 次后保存：bytes 不变。
6. 输入后 patch pending 时保存/切换/关闭：flush 后不丢不重。
7. 写盘期间继续输入：已保存 revision 正确，新输入仍 dirty。
8. 外部进程修改文件后 autosave：不覆盖，进入冲突流程。
9. 中文/日文/韩文 composition：不丢字、一次 Undo、保存 bytes 正确。
10. Local projection descriptor 异常与 async widget timeout/stale/错误：最小范围回源码且仍可编辑，保存不受影响。
11. P6 每个 hidden cohort：inactive 隐藏、active reveal、空构造可发现、Select All/drag/Arrow/Home/End/Backspace/Delete 无 trap，plain-text copy 含 source。
12. P7 image/table/task/diagram：一次操作一次 transaction/Undo，未触及 bytes 不变，失败/离线/unsafe 精确回源码。

### 证据层级

- Core unit/property/golden：字节、patch、EOL、Unicode、revision。
- Bridge integration：真实 Tauri dispatcher 参数、错误码、session lifecycle。
- Adapter unit：transaction extraction、compartments、decorations、selection、stale cleanup。
- Desktop semantic E2E：真实 WebView 中的 Markdown 语义 class/widget、保存回读和 hash。
- Visual/IME/platform：截图、视频、环境、输入法和 commit SHA。
- Observation：同一候选版本的稳定使用记录。

只有后层通过才能声明产品完成；`openspec planning complete`、单测通过或代码存在均不等于 WYSIWYG 可用。

## Risks / Trade-offs

- [Risk] CodeMirror Live Preview 的编辑质感短期不如 ProseMirror。  
  → Mitigation：P4B 先冻结交互底座，P6/P7 按 construct 验收；P5 只在 Typora 支持矩阵通过后删除 legacy。

- [Risk] `Decoration.replace` + atomic ranges 造成不可见 caret、selection trap 或 IME 中断。
  → Mitigation：单一 ADR、source-based clipboard/a11y、空构造 placeholder、真实 WebView IME 与完整导航矩阵；失败回 dimmed。

- [Risk] 富块视觉可用但局部 source patch 改写未触及 bytes。
  → Mitigation：widget 只能返回声明 affected ranges 的 CM transaction；table/image 每个操作运行 surviving-span golden。

- [Risk] UTF-16、UTF-8 byte 和 source EOL 三套坐标错位。  
  → Mitigation：集中 PositionMap；所有 boundary 使用 property tests；DTO 明确坐标单位，禁止裸 `number` 混用。

- [Risk] optimistic CodeMirror 与 Core confirmed revision 分叉。  
  → Mitigation：单 in-flight、幂等 transaction、flush barrier、blocked 状态和可验证 resync；blocked 时禁止保存。

- [Risk] parent/child local projection 与 widget 对相交 range 产生重复 decoration。
  → Mitigation：construct identity 粒度 owner registry；parent 显式让出 child range/editable slot；最小 source-fallback range 压制内部投影，handoff 在单一状态更新中完成。

- [Risk] Mixed EOL 在跨行替换时“未触及”边界定义含糊。  
  → Mitigation：冻结 replacement range 与 EOL inheritance ADR；golden test 精确声明每个新增/复用边界。

- [Risk] 图片保存前路径迁移需要修改 Markdown。  
  → Mitigation：资源事务返回显式局部 patch，先进入 CM History/Core revision，再原子提交资源与文档；禁止字符串全文 normalize。

- [Risk] feature flags 造成组合爆炸。  
  → Mitigation：只支持文档入口、Live Preview、construct projection、construct hidden 与 rich widget 分层；CI 固定受支持组合和回滚链。

- [Risk] 大文件 Core/CM 双份文本占用内存。  
  → Mitigation：先测真实峰值；viewport-only projection；后续再评估 rope/piece table 和同进程 save，不能用牺牲保真换性能。

- [Risk] 迁移长期停在双编辑器状态。  
  → Mitigation：每个 Slice 有删除清单和退出日期；默认切换后收集 legacy 使用率；Slice 5 独立 cleanup gate。

- [Trade-off] 首期保留 CodeMirror History，而不是 Core History。  
  → 收益是显著降低输入和 Undo 时序风险；代价是跨客户端共享 History 延后，但当前桌面单 surface 不需要该能力。

- [Trade-off] Live Preview 使用前端本地 Lezer parser。
  → 收益是即时渲染、同 revision ranges 和无 IPC 单点故障；代价是无法可靠映射的复杂语义必须保持 source fallback，不能猜测性重写。

## Open Questions

以下问题必须在相应 Slice 开工前通过 ADR/spike 冻结，不允许实现中临时决定：

1. Core crate 采用从 draft 精选移植，还是在 `src-tauri` 内先建最小独立模块后再抽 crate？倾向直接独立 `markflow-core`，但 Slice 1 应限制模块数量。
2. 大 payload 保存由 Core 返回 bytes/base64，还是 Runtime 在同一 Rust 进程内持有 session 并直接原子写盘？倾向后者，需明确 Core/Host 边界测试方式。
3. FileIdentity 是否必须从第一版包含 content hash，还是 mtime+size 快速检查后按需 hash？数据安全倾向保存前 hash。
4. CodeMirror transaction batching 的窗口、队列和 timeout 应以现有桌面测量确定，不能沿用 draft 常量而无基准。
5. P7 的 table/image/diagram 哪些操作可由受信 Lezer local ranges 完成；P4A 已选择 `SPIKE_COMPLETE_NO_CORE_IR` 时，无法证明 affected ranges 的操作必须保持 source fallback。
6. 非 UTF-8 文件的产品行为：拒绝打开、只读显示或显式转码副本。禁止静默 replacement character 后覆盖。
7. Save As 是否保留原 BOM/EOL，还是以用户配置生成新文件；倾向“已有文件继承原格式，新文件使用显式默认”。
8. Export 是否直接读取 Core confirmed snapshot，还是先保持现有只读 renderer；必须保证 export 不反向修改正文。
