## Context

MarkFlow 已完成第一期 Core 重构的主要架构工作：

- `markflow-core` 持有 Markdown 文本、revision、ParseIndex、StyleMap、edit commands、History、table/frontmatter models、Render IR 和 Export IR。
- Runtime 管理 session、patch、save、conflict、Host context 和跨文档隔离。
- CodeMirror 是 Core-backed Source/WYSIWYG 的文本镜像。
- ProseMirror serializer、整篇模式同步和保存真相职责已经移除。

当前产品仍未达到 Typora 级体验，主要原因不是 Core 文档真相缺失，而是 Editor Adapter 和产品验收不完整：

- Tauri 直接命令参数 casing 未经过真实 invoke contract test，Render IR 请求可在运行时失败。
- WYSIWYG render failure 被静默降级为源码。
- 当前 marker 只设置 `opacity: 0.38`，没有 fold/replace/atomic ranges。
- Source/WYSIWYG 通过销毁和重建 CodeMirror 切换，selection、viewport 和 projection 生命周期分裂。
- 工具栏和快捷键只在 `mode === source` 时走 Core，Core WYSIWYG 可回落到隐藏 ProseMirror。
- patch ack 更新 session revision，但没有驱动 WYSIWYG projection refresh。
- Render IR 缺少 block marker ranges、嵌套结构和多数结构化 block。
- inline parsing 是有限字符串扫描，不能作为完整 CommonMark/GFM 编辑语义。
- CodeMirror basic setup 和 Core 同时持有 History 能力。
- IME、selection、clipboard、结构化 widget 和真实 GUI/视觉门禁未闭环。

本设计将二期定义为独立产品工程。第一期“文档真相迁移完成”是输入条件，不再作为 WYSIWYG 产品完成证据。

## Goals / Non-Goals

**Goals:**

- 以 `markflow-core + CodeMirror + Editor Adapter` 实现接近 Typora 的 Markdown 所见即所得体验。
- Source 和 WYSIWYG 使用同一个 EditorView、Markdown document、Core session、History 和 patch pipeline。
- 支持非活动语法 marker 隐藏、活动上下文局部揭示和完整 Source Mode。
- 提供可直接编辑的表格、图片、Task List、代码块、FrontMatter 和图表 widget。
- 保证输入、IME、selection、clipboard、Undo/Redo 和模式切换的数据完整性。
- 保持原始 Markdown、StyleMap、EOL、fence、列表和表格格式的 lossless 行为。
- 在普通、大型和超大型文档中维持明确性能预算和安全降级。
- 用真实桌面、视觉、IME、平台和观察证据决定产品是否完成。

**Non-Goals:**

- 不复刻 Typora 的品牌、私有 UI、专有导出实现或未公开内部行为。
- 不把 HTML DOM、CodeMirror decorations、widget draft 或 Solid store 作为第二文档真相。
- 不重新引入 ProseMirror serializer、DOM save 或整篇 Markdown 同步。
- 不允许结构化 widget 绕过 Core command 直接编辑 Markdown。
- 不在没有 source-range 和 lossless 证据时把未知语法强制转换成结构化 UI。
- 不以单元测试、静态检查或文档归档代替真实 GUI 产品验收。

## Decisions

### 1. Core 与编辑视图的职责

替换关系固定为：

```text
ProseMirror document/serializer/history semantics
  -> markflow-core

ProseMirror contenteditable/rendering/input surface
  -> CodeMirror + Editor Adapter + structured widgets
```

Core 负责：

- confirmed Markdown text、revision、document/session identity；
- concrete syntax/semantic model、ParseIndex、StyleMap；
- semantic commands、History、lossless patch；
- table/frontmatter/image/diagram models；
- Render IR、diagnostics、search、save/export inputs。

CodeMirror/Adapter 负责：

- optimistic text input；
- selection、viewport、scroll、composition；
- mode extension configuration；
- decorations、folds、replacement、atomic ranges；
- widget lifecycle、focus、clipboard、accessibility；
- confirmed projection reconciliation。

选择该边界是因为 DOM 与输入法属于平台视图问题，而 lossless Markdown、History 和语义命令属于 Core 问题。把两者混入任意一侧都会重新产生双文档真相。

### 2. 单一 EditorView 与模式重配置

活动文档只创建一个 CodeMirror EditorView。通过 Compartment 或等效机制配置：

```text
baseCompartment
  line wrapping, read-only, theme, font, selection, update listeners

sourceCompartment
  line numbers, full syntax, source folding, search, bracket matching

previewCompartment
  semantic projection, marker folding, widgets, active-context reveal

inputCompartment
  Core command keymap, composition handling, clipboard, transaction policy
```

模式切换只执行 extension reconfigure：

```text
Source -> WYSIWYG:
  flush/revision barrier
  enable previewCompartment
  disable source-only presentation

WYSIWYG -> Source:
  preserve same document
  disable projection replacements/widgets
  enable full source presentation
```

EditorView 只在文档关闭、窗口销毁或不可恢复的 binding replacement 时销毁。

未选择“每种模式独立 EditorView”，因为它会复制 selection、viewport、history、pending state 和 extension lifecycle，并重新引入全文同步。

### 3. 双层投影

输入路径不能等待 Tauri IPC，因此采用两层投影：

```text
CodeMirror local syntax tree
  -> optimistic projection
  -> same-frame visual response

Core confirmed syntax + Render IR
  -> semantic projection
  -> reconcile optimistic state
```

本地层只负责可安全推断的视觉状态：

- 当前行 Markdown token；
- 简单 inline delimiter；
- composition 邻域；
- 失效范围的临时 source fallback。

Core 层负责：

- 完整嵌套语义；
- lossless marker/content ranges；
- table/frontmatter/image/diagram widget descriptors；
- diagnostics、安全策略和 confirmed identity。

本地投影不是文档真相，也不能提交结构化命令。Core 响应匹配后替换 optimistic projection；不匹配时丢弃。

未选择“所有渲染都等待 Core IPC”，因为输入、composition 和光标移动需要同步反馈，且 patch ack 与 render response 存在不可避免的异步窗口。

### 4. 生产 Markdown parser 与 concrete syntax

现有 scanner 和 inline string search 保留为基线，但不能直接扩展为二期完整语义。R0 必须完成 parser spike，比较至少：

- `markdown-rs` 生产依赖；
- `pulldown-cmark` 加 lossless source map；
- tree-sitter Markdown；
- 现有 ParseIndex + 专用 concrete syntax layer。

统一评分：

- CommonMark/GFM coverage；
- UTF-8 byte 和 UTF-16 range 准确性；
- delimiter、trivia、EOL、fence、indent、table padding 保留；
- 嵌套和错误恢复；
- 增量/viewport 能力；
- 1/10/50 MiB 性能和内存；
- licensing、binary size、维护活跃度；
- unknown syntax fallback。

最终模型必须同时提供：

```text
source range
content range
marker ranges
children
semantic kind
style/trivia
stable block identity
fallback reason
```

若候选 parser 无法保存 concrete syntax，则采用“语义 parser + lossless token/source map”的组合，不用 serializer 重建 Markdown。

### 5. Render IR v2

Render IR v2 是 versioned projection contract，建议核心结构：

```rust
pub struct RenderDocumentV2 {
    pub schema_version: u32,
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub request_id: String,
    pub source_hash: String,
    pub viewport: UiRange,
    pub invalidated_ranges: Vec<UiRange>,
    pub blocks: Vec<RenderBlockV2>,
    pub size_class: DocumentSizeClass,
}

pub struct RenderBlockV2 {
    pub id: BlockId,
    pub parent_id: Option<BlockId>,
    pub kind: RenderBlockKind,
    pub source_range: UiRange,
    pub content_range: UiRange,
    pub marker_ranges: Vec<UiRange>,
    pub children: Vec<BlockId>,
    pub tokens: Vec<RenderToken>,
    pub widget: Option<WidgetDescriptor>,
    pub fallback: Option<FallbackDescriptor>,
}

pub struct RenderToken {
    pub kind: RenderTokenKind,
    pub source_range: UiRange,
    pub content_range: UiRange,
    pub marker_ranges: Vec<UiRange>,
    pub target: Option<String>,
}
```

所有 UI range 使用 UTF-16；Core 内部继续使用 byte offset，并通过 revision-bound PositionMap 转换。

v1 和 v2 在迁移窗口并存；frontend 声明 `max_schema_version`。v2 稳定并经过 GUI gate 后移除 v1。

### 6. Projection state machine

每个 editor binding 持有：

```text
idle
  -> loading
  -> optimistic
  -> rendered

loading/optimistic/rendered
  -> composing
  -> optimistic/rendered

loading/optimistic/rendered
  -> stale
  -> loading

loading/optimistic/rendered/stale
  -> degraded
  -> loading/rendered
```

状态字段：

```text
sessionId
documentId
localGeneration
confirmedRevision
projectedRevision
latestRequestId
viewport
sourceHash
compositionRange
degradationReason
```

render response 必须同时匹配 session、document、confirmed revision、latest request、source hash 和 binding generation。

失败策略：

- 保留 CodeMirror text 和输入；
- 清除不安全的旧 projection；
- 显示一次性 degradation bar；
- 提供 retry 和 Source Mode；
- 不回落到 ProseMirror；
- 日志包含稳定错误码和 routing identity。

### 7. Patch ack 与 projection refresh

当前 `markPatchAcked` 只更新 module state。二期改为：

```text
CodeMirror transaction
  -> SourceSyncController batch
  -> apply_text_patch
  -> Core ack revision N
  -> revisionConfirmedEffect(N, transactionId, affectedRanges)
  -> invalidate old projection
  -> request Render IR N
  -> apply if identity matches
```

规则：

- docChanged 后先 map decorations through transaction；
- 不能证明 range 安全时立即移除该 projection；
- ack 后必须触发 refresh，不依赖下一次键入或滚动；
- 新 ack 取消旧 revision render；
- resync 使用独立 annotation，不进入用户 History；
- viewport request 去重 key 包含 binding generation、revision、viewport 和 source hash。

### 8. Marker folding 与 active reveal

使用组合机制：

- `Decoration.mark`：语义字体、颜色和背景；
- `Decoration.replace`：隐藏 marker 或替换成可操作表示；
- fold/atomic ranges：保护被隐藏 source 的光标行为；
- `ViewPlugin`：根据 selection、viewport、composition 计算 active context；
- `transactionFilter`/input handler：处理跨隐藏边界的删除和输入。

基本策略：

| Element | Inactive | Active |
| --- | --- | --- |
| heading | hide `#` + spacing | reveal heading prefix |
| strong/emphasis/strike | hide delimiters | reveal local delimiters |
| inline code | hide backticks | reveal delimiters near cursor |
| link | show label only | reveal destination editor |
| quote | render quote rail | reveal current line prefix |
| list | render bullet/number | reveal current item prefix |
| task | checkbox widget | reveal source on command |
| code fence | code panel + language | reveal fence via source action |
| image | replacement widget | edit popover/source reveal |
| table | grid widget | cell editing/source reveal |
| FrontMatter | form/summary | form or source submode |
| diagram | rendered widget | source editor/diagnostics |

composition range 及其邻近 marker 禁止 replace；selection 穿越范围时使用 stable mapping，不改变 CodeMirror document positions。

### 9. Command Router 与单一 History

新增统一 `EditorCommandRouter`：

```text
toolbar/menu/shortcut/widget/input rule
  -> resolve active Core surface
  -> read CodeMirror selection
  -> build Core command or patch transaction
  -> Runtime/Core
  -> patch result + selectionAfter + history metadata
  -> CodeMirror apply
```

路由依据 `isCoreSurfaceMounted()` 和 binding identity，不依据 `mode === source`。

CodeMirror 独立 History extension 从产品配置移除。所有用户操作设置：

```text
transactionId
historyGroup
historyLabel
selectionBefore
selectionAfter
compositionId
source
```

History group 至少包括：

- typing burst；
- IME composition；
- paste/drop；
- semantic format command；
- table structural command；
- asset transaction；
- FrontMatter command；
- diagram source commit。

Undo/Redo 从任意模式、菜单或 widget 都调用 Core，并返回确定 selection。

Pending revision protocol：

- 每个本地 transaction 在进入 CodeMirror mirror 时取得单调递增 `transactionId`；
- patch、semantic command、Undo 和 Redo 共享同一 ordered command stream；
- 若 Undo/Redo 或依赖 confirmed selection 的命令到达时仍有 pending patch，Router 必须先等待有界 revision barrier，或把 pending `transactionId` 作为 Core 命令前置条件；
- barrier 超时或失败不得改写 mirror、selection 或 History，只进入可恢复的 syncing/degraded state；
- 必测输入后 ack 前立即 Undo、连续 Undo/Redo、ack/Undo 交错和 resync/Undo 交错。

### 10. IME、selection 与 clipboard

IME：

- compositionstart 记录 range 和 compositionId；
- compositionupdate 只更新 optimistic mirror，冻结相交 replacement；
- compositionend 形成一个 Core transaction；
- ack/resync 不得移动 active composition；
- blur/cancel 有确定提交或取消规则。

Selection：

- folded markers 使用 position-preserving decoration；
- widget 维护 source anchor 和 before/after text anchor；
- Shift+Arrow、Home/End、mouse drag、select all 跨 widget 有 fixture；
- Source reveal 精确选择 source range。

Clipboard MIME：

```text
application/x-markflow-markdown
text/html
text/plain
Files
```

内部粘贴优先 MarkFlow Markdown payload；外部 HTML 经过 sanitizer 和 deterministic Markdown conversion；图片/files 进入 asset transaction；plain text 保持文本语义。copy 不把屏幕阅读器 fallback 或隐藏 marker 重复写入可见文本。

### 11. Structured widget architecture

每个 widget 实现统一接口：

```typescript
interface StructuredWidget {
  identity: {
    sessionId: string;
    documentId: string;
    revision: number;
    blockId: string;
  };
  sourceRange: UiRange;
  mount(host: HTMLElement): void;
  update(descriptor: WidgetDescriptor): boolean;
  focus(entry: WidgetFocusEntry): void;
  commit(command: CoreEditorCommand): Promise<void>;
  revealSource(): void;
  destroy(): void;
}
```

widget draft 使用 `sessionId + documentId + revision + blockId` 隔离，不进入 store 的文档真相。

表格：

- Core 提供 cell ranges、row role、alignment、StyleMap；
- widget 提供 ARIA grid、Tab/Shift+Tab、方向键；
- cell edit 局部 patch；
- row/column structural command 允许重写 table block；
- unsupported table 退回 source。

图片：

- Host 解析安全 asset URL；
- resource transaction 负责 prepare/commit/rollback；
- widget 负责 preview、alt/title/path、replace、copy/delete/retry；
- broken image 不丢 source。

代码块：

- fence 不可见，code content 仍是 CodeMirror text；
- language selector 通过 Core command；
- 内部语言高亮 lazy load；
- 保留 fence/EOL/trailing newline。

FrontMatter：

- safe model 显示结构化表单；
- unsafe model 显示 diagnostics + source；
- form opening/closing 不改文本。

图表：

- sandboxed renderer；
- cancellable request；
- stale identity drop；
- error widget + source reveal；
- 大文档按需渲染。

### 12. Performance model

Normal `<= 1 MiB`：

- 全量 block index；
- viewport projection + generous overscan；
- visible widget 自动渲染。

Large `> 1 MiB && <= 10 MiB`：

- viewport + 2,000 UTF-16 overscan；
- widgets lazy；
- diagnostics/search idle；
- 禁止全文 widget。

Huge `> 10 MiB`：

- Source 和 WYSIWYG 入口都保留；
- WYSIWYG 使用严格 viewport；
- table/diagram/image 自动 widget 可按策略关闭；
- degradation bar 说明限制；
- 输入和保存不受 projection 失败阻塞。

预算：

- local CodeMirror commit p95 `<= 16 ms`；
- normal confirmed projection p95 `<= 50 ms`；
- large confirmed projection p95 `<= 100 ms`；
- mode reconfigure p95 `<= 50 ms`；
- 10 MiB 文档可输入、滚动、保存、切 Source；
- scroll 和 selection 不因异步 widget 发生无界 layout shift。

### 13. Security and accessibility

安全：

- raw HTML 默认 inert；
- diagram 使用 sandbox 和 timeout；
- URL protocol allowlist；
- SVG、data、javascript、event handler 按策略拒绝；
- local asset 必须经过 Host capability 和 path containment；
- widget payload 有大小、数量和生命周期预算；
- DOM 使用结构化 API，不插入不可信 HTML。

无障碍：

- 每个 widget 有 role、accessible name、focus state；
- 键盘可进入、操作、提交、取消和退出；
- screen reader 不朗读重复 hidden source；
- Source Mode 永远可达；
- reduced motion/high contrast/zoom 200% 可用。

### 14. Testing architecture

Core：

- CommonMark/GFM/concrete syntax fixtures；
- source/content/marker ranges；
- nested blocks；
- StyleMap；
- commands/History；
- Unicode/UTF-16；
- table/frontmatter/diagram/image models；
- 1/10/50 MiB benchmarks。

Adapter：

- real request lifecycle；
- optimistic/confirmed reconciliation；
- ack-driven refresh；
- decoration mapping/removal；
- folds/replace/atomic ranges；
- composition；
- selection/clipboard；
- widget lifecycle/focus；
- Source/WYSIWYG reconfigure。

Bridge：

- real Tauri dispatcher invoke；
- every registered command casing；
- DTO compatibility；
- cancellation/stale/session/window errors。

Desktop E2E：

- canonical Markdown fixture；
- semantic DOM/widget assertions；
- marker visibility；
- commands/History；
- save disk bytes；
- mode switching；
- A/B session；
- degraded recovery；
- logs fail on error。

Visual：

- light/dark；
- desktop widths；
- inactive/active/composing；
- selection；
- each widget；
- Source Mode；
- degraded state；
- reviewed pixel diff。
- versioned manifest 固定 OS/WebView/font/theme/scale/viewport/fixture/animation/tolerance/mask。

Manual/platform：

- macOS/Windows/Linux；
- Chinese/Japanese/Korean IME；
- VoiceOver or equivalent accessibility smoke；
- large document；
- stability observation。

R0 必须产出 release-gate ADR 和机器可读 manifests，冻结以下参数后 R1/R2 才能开始：

- performance reference machine、build profile、measurement boundaries、warm-up、sample/repetition count 和 noise policy；
- visual runner、baseline environment、pixel threshold、changed-pixel ratio 和 mask review policy；
- IME 自动化与签名人工证据边界；
- structured widget 的 P0/P1 release scope；
- observation 的 release revision、七天/二十小时窗口、每平台场景次数与日志完整性。

## Risks / Trade-offs

- [Parser cannot preserve concrete syntax] -> Use semantic parser plus independent lossless token/source map; reject any parser that requires serializer reconstruction.
- [Local and Core projection disagree] -> Limit local projection to safe optimistic visuals; confirmed Core response wins only with full identity match.
- [Marker replacement breaks selection or IME] -> Enable constructs incrementally behind per-feature flags and require dedicated selection/composition fixtures before default-on.
- [Single Core History increases perceived latency] -> Apply optimistic local transaction immediately, attach transaction identity, and reconcile ack without replaying user input.
- [Structured widgets create a second state model] -> Keep drafts revision-bound and require every commit to return through Core command; discard drafts on identity mismatch.
- [Async widgets cause layout shift] -> Reserve bounded dimensions, cache measured layout by block identity, and apply only visible results.
- [Render IR v2 increases IPC payload] -> Viewport scope, compact enums, delta invalidation, cancellation, and schema benchmarks.
- [Large documents cannot support every widget automatically] -> Preserve WYSIWYG entry but degrade heavy widgets explicitly; Source Mode remains complete.
- [Cross-platform IME behavior differs] -> Platform-specific smoke and real composition testing are release blockers.
- [Legacy ProseMirror removal exposes missing behavior] -> Remove dependencies only after R5 product gates; do not reassign document truth to ProseMirror.
- [Visual baselines become noisy] -> Pin fonts, theme, scale, viewport, fixture, animation state, and rendering environment.

## Migration Plan

### R0: Correctness and evidence reset

- Create parser evaluation report and freeze canonical product fixtures.
- Fix Tauri command argument contract and real invoke tests.
- Add projection state/degraded UI and logging.
- Fix Core WYSIWYG command routing.
- Add ack-driven projection invalidation.
- Remove or map stale decorations on doc changes.
- Update migration matrix to separate architecture and product status.

Rollback: keep Source Mode default and disable Core WYSIWYG projection feature flag. Core save/history remain active.

### R1: Single editor surface

- Introduce EditorSurfaceBinding and compartments.
- Move Source/WYSIWYG to one EditorView.
- Disable CodeMirror History and route Undo/Redo to Core.
- Preserve selection, scroll, viewport and pending state across mode changes.

Rollback: retain old remount implementation behind temporary flag until state-preservation E2E passes.

### R2: Render IR v2 and basic Typora projection

- Implement concrete syntax source map and IR v2.
- Add optimistic local projection.
- Add marker fold/reveal for heading, emphasis, strong, strike, code, link, quote, lists, tasks, thematic break and fences.
- Add Enter/Backspace/Delete behavior for these structures.
- Add composition-neighborhood protection and core selection mapping fixtures for every folded construct.
- Keep every folding construct experimental and default-off until its composition and selection fixtures pass.

Rollback: per-construct flags can fall back to exact editable source without changing Core text.

### R3: Structured blocks

- Add table, image, code, FrontMatter, diagram and HTML comment descriptors/widgets.
- Wire Core commands and resource transactions.
- Add keyboard, focus, source reveal and accessibility behavior.

Rollback: each unsafe/unsupported widget falls back at block scope to source.

### R4: Input integrity and performance

- Complete composition transaction model.
- Complete clipboard MIME policy and drag/drop.
- Complete selection across folds/widgets.
- Meet performance budgets for normal/large/huge fixtures.
- Run security and accessibility regression suites.

Rollback: disable unsafe projection constructs and keep Source Mode; never roll back Core document truth.

### R5: Product release and legacy cleanup

- Run required Tauri GUI E2E and visual baselines.
- Run CJK IME and all platform smoke.
- Complete current-build observation period.
- Verify all P0/P1 product capabilities.
- Remove hidden ProseMirror shell, Tiptap dependencies, legacy commands and CSS.
- Archive only after independent review confirms every gate.

Rollback: before dependency removal, keep prior release available; after removal, roll back release artifact rather than reintroducing serializer save.

## Open Questions

- Which parser/source-map combination wins the R0 conformance and performance spike?
- Will visual regression run through WebdriverIO screenshots, Playwright against the Tauri WebView, or a dedicated deterministic renderer?
- Which CI environment provides stable macOS Chinese IME automation, and which IME scenarios remain signed manual release evidence?
- Should HTML preview remain entirely source/inert in phase two, or allow an opt-in sandboxed rendered widget?
- What exact rich clipboard behavior is required when copying only part of a structured table or diagram?
- Which structured widgets must ship before WYSIWYG becomes default: all R3 widgets, or a formally defined P0 subset with visible source fallback for the rest?

These questions MUST be resolved in R0 design records before the dependent implementation task begins. They do not permit bypassing the corresponding release gate.
