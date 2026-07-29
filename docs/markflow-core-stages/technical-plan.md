# MarkFlow Core 重构技术方案

> 状态：实施中 — M3/M3.1 已交付并归档，等待 M4 规划
> 更新日期：2026-07-29
> 目标：设计 `markflow-core`，将 Markdown 文档核心能力从前端编辑器收拢到 Rust。
> 配套文档：`product-plan.md`、`feature-migration-matrix.md`

## 1. 架构目标

`markflow-core` 是 MarkFlow 的文档内核，而不是一个普通 Markdown parser wrapper。

它负责：

- 文档状态模型与编辑事务。
- Markdown 原文保真。
- 解析、索引和 source map。
- 文本 patch 与编辑命令。
- Render IR 输出。
- 诊断与统计。
- 内部扩展点。
- 导出前的语义中间层。

前端负责：

- 视图布局。
- CodeMirror 渲染与交互。
- 用户输入、菜单、设置、弹窗。
- 调用 Core command 并应用 patch。
- 根据 Render IR 绘制 Live Preview / Preview。

## 2. 总体架构

```text
┌───────────────────────────────────────────────────────────┐
│                         UI Layer                           │
│  Toolbar / Sidebar / Statusbar / CodeMirror / Preview DOM  │
└───────────────┬───────────────────────────────┬───────────┘
                │ Tauri IPC                      │ events
┌───────────────▼───────────────────────────────▼───────────┐
│                      markflow-tauri                         │
│  IPC / file dialog / watcher / app settings / logging       │
└───────────────┬───────────────────────────────────────────┘
                │ inbound/outbound ports
┌───────────────▼───────────────────────────────────────────┐
│                    markflow-runtime                         │
│  session registry / task scheduler / save & asset workflow │
└───────────────┬───────────────────────────────────────────┘
                │ pure document API
┌───────────────▼───────────────────────────────────────────┐
│                      markflow-core                          │
│  DocumentSession / Parser / Index / Patch / Render IR       │
│  Diagnostics / Assets / Export IR / Internal Providers      │
└───────────────────────────────────────────────────────────┘
```

核心约束：

- Core 不依赖 Tauri。
- Core 不依赖 WebView、DOM、CodeMirror、ProseMirror。
- Core 不直接执行文件、网络、剪贴板、对话框和打印等副作用。
- Core API 可被 Rust 单元测试、CLI、Tauri commands 复用。
- Runtime 负责 Core 与 Host Port 的用例编排，不实现 Markdown 语法。
- CodeMirror 可以持有乐观文本镜像，但保存只使用 Core confirmed snapshot。
- 文档运行态以 `SessionId` / `DocumentId` 为主键；路径只是 `DocumentSource` 属性，不能作为 UI、命令、任务或 Host 回填的唯一身份。
- 所有异步任务和 Host 副作用都绑定 `request_id + client_id/window_label + session_id + revision`，返回时不匹配则丢弃或记录为 stale。

## 3. Cargo 结构

当前实现已采用顶层 Cargo workspace：

```text
Cargo.toml
  members = ["markflow-core", "src-tauri", "src-tauri/crates/runtime"]

markflow-core/
  Cargo.toml
  src/
    lib.rs
    document/
      line_ending_map.rs
      line_index.rs
      parse_index/
        heading.rs
        update.rs
        large_document_policy.rs
        list.rs
        scanner.rs
        style_map.rs
        table.rs
        types.rs
      patch.rs
      position_map.rs
      session.rs
      snapshot.rs
      text_buffer.rs
    testing/

src-tauri/
  Cargo.toml
  crates/
    runtime/
      Cargo.toml
      src/
        error.rs
        error.rs
        file_identity.rs
        host.rs
        registry.rs
        save.rs
        save_coordinator.rs
        session.rs
        source.rs
  src/
    commands/
      core_bridge.rs
      export.rs
      files*.rs
    lib.rs
    runtime_host.rs
    state.rs
```

M0/M1 的 workspace viability 决策已落地：`markflow-core` 是顶层独立 crate，`markflow-runtime` 作为 `src-tauri/crates/runtime` 下的独立 workspace member 存在，Tauri adapter 通过 `src-tauri/src/commands/core_bridge.rs`、`runtime_host.rs` 和 `state.rs` 调用 runtime。后续 M4-M8 可继续拆分 UI/App Service 层，但不得倒退为 Core 直接依赖 Tauri、DOM、CodeMirror 或 ProseMirror。

## 4. 核心数据模型

### 4.1 DocumentSession

```rust
pub struct DocumentSession {
    pub id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub original: OriginalSnapshot,
    pub text: TextBuffer,
    pub line_index: LineIndex,
    pub position_map: PositionMap,
    pub parse_cache: ParseCache,
    pub style_map: StyleMap,
    pub diagnostics: DiagnosticStore,
}
```

职责：

- 保存当前文档文本。
- 跟踪 revision。
- 提供 line/column 与 byte offset 映射。
- 保存原始文件元信息。
- 缓存解析结果。
- 应用 patch。

文件路径、权限、mtime 和平台 file identity 属于 Runtime/Host 的 `DocumentSource`，不进入 Core 文档模型。这样未命名文档、Web File Handle、CLI stdin 和桌面路径可以共享 Core。

### 4.2 OriginalSnapshot

```rust
pub struct OriginalSnapshot {
    pub bom: BomKind,
    pub encoding: EncodingKind,
    pub dominant_line_ending: LineEndingKind,
    pub trailing_newlines: usize,
    pub final_newline: bool,
    pub byte_len: usize,
    pub hash: ContentHash,
}
```

第一阶段完整支持 UTF-8 与 UTF-8 BOM。无效 UTF-8 或其他编码不得静默转码；Runtime 返回 `UnsupportedEncoding`，由产品选择只读打开或显式转码。

文档级 `dominant_line_ending` 只用于新增文本默认值，不能用于 Mixed EOL 保真。逐行 EOL 存入 `LineEndingMap`。

### 4.3 TextBuffer

Core 内部区分源字节和 UI 逻辑文本：

```rust
pub struct TextBuffer {
    logical_text: LogicalText,
    line_endings: LineEndingMap,
}
```

- `LogicalText` 统一使用 LF，便于 CodeMirror 和解析器处理。
- `LineEndingMap` 记录每个逻辑行原本的 LF、CRLF 或 CR。
- `LineEndingMap` 使用 run-length encoded spans；普通统一 EOL 文档不能产生按行对象开销。
- 保存时由 Core 组合逻辑文本、EOL map 与 BOM，生成 `SavePayload`。
- 未编辑行的 EOL 必须逐行保留；新增行继承当前块、相邻行或文档主导 EOL。

底层存储短期可以用 `String`，中期按 benchmark 决定是否切换 rope。

```rust
pub enum LogicalText {
    Flat(String),
    Rope(RopeText),
}
```

建议阶段：

- P0：`String` + `LineIndex` + `LineEndingMap`，先完成保真和 API。
- P1：引入 rope 或自研 chunked text，用于超大文件编辑。
- P2：增量解析与 patch 直接基于 chunk range。

### 4.4 Source Range

所有语义节点必须能映射回原文，但跨 IPC 不直接暴露含义不明的 byte range。

```rust
pub struct SourceRange {
    pub start: ByteOffset,
    pub end: ByteOffset,
}

pub struct UiRange {
    pub start: Utf16Offset,
    pub end: Utf16Offset,
}

pub struct LineCol {
    pub line: u32,
    pub column_utf16: u32,
    pub column_utf8: u32,
}
```

约束：

- Rust 内部使用 UTF-8 byte range。
- CodeMirror 和 IPC DTO 使用 UTF-16 code unit range。
- 所有 range 都绑定 revision；旧 revision range 不能用于新状态。
- `PositionMap` 负责 UTF-16、逻辑 UTF-8 与保存源字节之间的转换。
- `LineIndex` 缓存每行累计 UTF-8/UTF-16 长度，使常用转换为对数级定位加单行扫描。
- 使用 typed newtype，禁止用裸 `usize` 混用坐标单位。

## 5. Markdown 解析策略

### 5.1 分层解析

```text
Level 0: 字节与行索引
Level 1: block scan，识别标题/列表/代码块/表格/HTML/comment/frontmatter
Level 2: inline parse，识别 strong/em/link/image/code/span
Level 3: internal provider parse，识别 Mermaid/PlantUML/Math/内部扩展语法
```

大文件打开时先完成 Level 0/1，让大纲、滚动、基础高亮可用；Level 2/3 可按可视范围和空闲时间推进。

### 5.2 Parser 选型

候选：

- `pulldown-cmark`：成熟、快速、CommonMark pull parser，适合 HTML 输出和事件流。
- `markdown-rs`：Rust 实现，强调 concrete tokens、位置和 mdast/HTML 输出，更接近保真需求。
- 自研轻量 block scanner：专注 MarkFlow 需要的 source range、style capture、增量编辑。

建议：

- M0 用真实 fixture benchmark `markdown-rs` 与至少一个对照 parser。
- `markdown-rs` 的 concrete token、position、GFM 和 frontmatter 能力是首选候选，但必须以 benchmark 和错误恢复结果为准。
- MarkFlow 自研部分聚焦 block boundary cache、StyleMap、SourceMap、trivia 和增量失效，不重新实现完整 CommonMark。
- 如完整 parser 无法满足 10MB 首屏预算，可增加轻量 Level 1 line/block index，但它不能成为第二套完整 Markdown 语义。
- 不把第三方 AST 直接暴露为 Core API。

原因：第三方 parser 的目标通常是“理解 Markdown 并输出 HTML/AST”，而 MarkFlow 的目标是“编辑后保留原文风格”。两者相关但不相同。

Markdown 的 fence、list、HTML block 等结构可能因一次编辑影响远距离内容。增量解析必须定义：

- 可证明安全的向前/向后重扫边界。
- 单次同步重扫的时间或字节预算。
- 超出预算后返回局部结果，并在后台执行可取消的全量校验。
- 所有结果绑定 revision，旧任务结果直接丢弃。
- `BlockId` 默认只在同一 revision 内有效；跨 revision 复用必须经过显式 reconciliation。

## 6. StyleMap

`StyleMap` 记录原文格式偏好，用于局部编辑时沿用用户风格。

```rust
pub struct StyleMap {
    pub dominant_line_ending: LineEndingKind,
    pub default_bullet: BulletMarker,
    pub default_ordered_marker: OrderedMarker,
    pub default_fence: FenceStyle,
    pub list_styles: Vec<ListStyleSpan>,
    pub quote_styles: Vec<QuoteStyleSpan>,
    pub table_styles: Vec<TableStyleSpan>,
}
```

示例：

- 在 `* item` 所在列表里新增项，应继续使用 `*`。
- 在 `~~~rust` 代码块附近插入代码块，应优先使用 `~~~`。
- 表格单 cell 内容编辑只替换 cell content range；结构操作仅可重写当前 table block，并沿用既有 alignment、pipe 和 padding 风格。

## 7. Patch Engine

### 7.1 TextPatch

```rust
pub struct TextPatch {
    pub transaction_id: TransactionId,
    pub base_revision: Revision,
    pub changes: Vec<TextChange>,
    pub selection_after: Option<Selection>,
}

pub struct TextChange {
    pub range: SourceRange,
    pub replacement: String,
}
```

原则：

- Patch 是 Core 与 UI 的主要编辑协议。
- Patch 必须可组合、可验证、可回滚。
- 文本编辑只替换 transaction 指定范围；语义命令最多替换其最小完整语法块，禁止用整篇替换作为正常同步路径。
- 多 change 使用同一 base document 坐标，必须有序且不重叠。
- IPC 层接收 `Utf16TextPatch`，Runtime 转换并验证为 Core byte patch。
- 同一 `transaction_id` 重试必须幂等，不能重复应用。
- `RevisionMismatch` 必须返回 confirmed revision 和 resync 指令，不能悄悄覆盖。

### 7.2 编辑命令

```rust
pub enum EditCommand {
    ToggleStrong { selection: Selection },
    ToggleEmphasis { selection: Selection },
    ToggleStrikethrough { selection: Selection },
    ToggleInlineCode { selection: Selection },
    SetHeading { selection: Selection, level: u8 },
    ToggleBlockQuote { selection: Selection },
    ToggleList { selection: Selection, kind: ListKind },
    InsertCodeFence { selection: Selection, language: Option<String> },
    InsertTable { position: ByteOffset, rows: usize, cols: usize },
    UpdateTableCell { table: NodeId, row: usize, col: usize, text: String },
}
```

所有命令输出 `TextPatch`，不直接修改 UI。

### 7.3 History 所有权

M3-M5 迁移期可以暂时保留 CodeMirror history，但 M6 必须切换为 Core 单一 owner。

```rust
pub struct HistoryTransaction {
    pub id: TransactionId,
    pub origin: EditOrigin,
    pub before: Revision,
    pub after: Revision,
    pub forward: TextPatch,
    pub inverse: TextPatch,
    pub selection_before: Selection,
    pub selection_after: Selection,
}
```

分组规则：

- 同一 IME composition 只形成一个 history transaction。
- 连续普通输入按时间、origin 和相邻范围合并。
- 语义命令、表格操作、FrontMatter 操作和资源事务独立成组。
- undo/redo 前必须 flush pending patch。
- Adapter 应禁用或替换 CodeMirror 可独立回放的文档 history，不能让两套历史同时修改文本。
- save 不清空 history；external reload 建立明确 history boundary。

## 8. Render IR

Render IR 是 Core 给 UI 的稳定渲染协议。

```rust
pub struct RenderDocument {
    pub revision: Revision,
    pub blocks: Vec<RenderBlock>,
}

pub struct RenderBlock {
    pub id: BlockId,
    pub kind: RenderBlockKind,
    pub ui_range: UiRange,
    pub children: Vec<RenderInline>,
    pub attrs: RenderAttrs,
}
```

Render IR 不包含 DOM，不包含 CSS class 细节，只表达语义和 session-bound、revision-bound UI range。

Render IR 的所有 range 都是当前 revision 的 UI/UTF-16 range。Core 内部 source byte range 不直接发送给 CodeMirror，避免非 ASCII 和 CRLF 下错位。

UI 可以据此：

- 给 CodeMirror 添加 decorations。
- 渲染块级 widget。
- 生成大纲。
- 定位点击到源码 range。
- 做 Preview Mode。

### 8.1 Export IR 与最终格式适配器

Core 负责从 confirmed revision 生成不可变 `ExportDocument`，但不强制所有二进制格式都在 Rust 中生成。

- HTML：可由 Core renderer 或共享 renderer 生成，必须有 golden test。
- PDF：允许 Host 继续使用 WebView/native print，输入改为 Export snapshot，不读取实时编辑 DOM。
- DOCX：允许保留 TypeScript `docx` 适配器，输入改为 Export IR。
- 图片、字体、图表解析由 Runtime/Host capability 提供，Core 只输出资源清单和语义。

目标是统一导出语义和输入快照，不是为了“Rust 化”而重写成熟的平台输出链路。

导出请求必须携带 `session_id + revision + export_request_id`。Runtime 在发起时 capture confirmed snapshot；Host 只处理 Export IR 和资源清单。导出期间切换文档或继续编辑不会改变本次导出的输入。

## 9. 内部 Provider 边界

本轮重构不实现第三方插件系统，不承诺动态加载、插件 SDK、插件市场或稳定 ABI。

Core 仍需要内部 provider 边界，避免 Mermaid、PlantUML、FrontMatter、GFM Table、导出等能力散落到 UI 或 Host。

### 9.1 Provider 类型

内部 provider 可覆盖：

- Block parser。
- Inline parser。
- Render provider。
- Edit command handler。
- Diagnostic provider。
- Export provider。
- Asset resolver。

### 9.2 Provider 边界

Provider 不直接修改 `DocumentSession`。Provider 只能：

- 读取文本和解析索引。
- 声明它拥有或增强的 source range。
- 返回 Render IR、Diagnostic、TextPatch 或 Export artifact。

Core 负责冲突解决、排序、失败隔离。第三方插件系统等 Core 和 UI 边界稳定后再单独规划。

### 9.3 第一批内部 provider

第一批内部 provider：

- `gfm-table`
- `task-list`
- `frontmatter`
- `html-comment`
- `image`
- `mermaid`
- `plantuml`

### 9.4 FrontMatter lossless CST

FrontMatter 不使用普通 serde round-trip 保存。普通 YAML AST 会丢失注释、空行、quote style、字段顺序和部分 scalar 表达。

M0 必须评估 lossless CST 方案，例如基于 rowan 的 YAML 编辑器或 tree-sitter YAML。最终 API 返回：

```rust
pub struct FrontMatterView {
    pub format: FrontMatterFormat,
    pub ui_range: UiRange,
    pub fields: Vec<FrontMatterField>,
    pub structured_edit_safe: bool,
    pub unsafe_reasons: Vec<FrontMatterUnsafeReason>,
}
```

首期结构化编辑只支持安全 YAML 子集。duplicate key、anchor/alias、tag、merge key、多文档、损坏语法或无法局部 patch 的复杂 block scalar 必须回退源码编辑。

### 9.5 GFM Table 边界

表格结构化能力只覆盖 GFM pipe table：

- parser 必须区分 delimiter pipe、escaped pipe 与 inline code 内 pipe。
- table style 记录首尾 pipe、每列 alignment、delimiter 长度和 cell padding。
- cell 修改优先替换 cell content range；行列结构变化才允许替换 table block。
- 像素列宽属于 UI state，不写回 Markdown。
- HTML table、非 GFM table 和损坏 table 作为 unknown/source block。

### 9.6 不受信任内容

Markdown、FrontMatter、HTML block、图片和图表都按不受信任输入处理：

- Render IR 不携带可直接执行的脚本或事件属性。
- raw HTML 默认以源码或经过 sanitizer 的预览显示，不在编辑 WebView 中执行。
- FrontMatter 值不作为模板、命令或 URL 自动执行。
- Mermaid/PlantUML 输出在进入 DOM、剪贴板或导出前执行现有安全校验和 sanitizer。
- 网络资源继续经过 scheme、port、DNS/IP、redirect、MIME 和大小限制。
- Core parser/diagnostic 使用深度、节点数、单行长度和输出大小预算，防止恶意文档耗尽资源。

## 10. Tauri IPC 设计

迁移后的 Tauri command 应变薄：

```rust
open_document(path) -> DocumentOpened
close_document(session_id) -> ()
get_document_text(session_id) -> String
apply_text_patch(session_id, utf16_patch) -> ApplyPatchAck
resync_document(session_id, confirmed_revision) -> ResyncResult
flush_document(session_id) -> FlushResult
run_edit_command(session_id, command) -> TextPatch
get_render_blocks(session_id, viewport) -> RenderDocument
get_outline(session_id) -> Outline
get_diagnostics(session_id, viewport) -> Vec<Diagnostic>
save_document(session_id) -> SaveResult
reload_document(session_id) -> ReloadResult
```

所有 DTO 使用统一 envelope：

```rust
pub struct ProtocolEnvelope<T> {
    pub protocol_version: u32,
    pub request_id: RequestId,
    pub client_id: ClientId,
    pub window_label: Option<WindowLabel>,
    pub session_id: Option<SessionId>,
    pub payload: T,
}
```

要求：

- Rust DTO 自动生成或校验 TypeScript 类型，避免手写漂移。
- 错误使用稳定 code：`REVISION_MISMATCH`、`UNSUPPORTED_ENCODING`、`STALE_RANGE`、`CANCELLED`、`CONFLICT`。
- `open_document` 首次传输可以包含全文；之后普通输入只发送 patch。
- Huge 文档首次文本传输必须 benchmark JSON String、raw body 与 ordered channel；选择不会造成不可接受重复拷贝的路径。
- 高频输入 patch 可在一帧或一个 composition transaction 内批处理。
- 大结果、进度和后台任务更新使用 ordered channel；普通事件只传小型生命周期通知。
- Bridge 暴露 capabilities，Web/CLI/桌面可以声明缺失的平台能力。
- 同一路径的多窗口使用独立 session；`client_id` 隔离 pending transaction，FileIdentity 负责保存冲突。本轮不引入多镜像实时合并。
- 所有文档命令必须显式携带 `session_id`。窗口、对话框、通知和 close flow 必须携带 `window_label`。
- 所有后台结果必须携带原始 `request_id + session_id + revision`；前端 Adapter/App Service 应用前必须校验仍匹配目标 session。

前端不再调用：

```text
getMarkdown() -> write_file(content)
```

而是：

```text
CodeMirror transaction
  -> Adapter optimistic update
  -> batch Utf16TextPatch(base_revision)
  -> Runtime converts and Core applies
  -> Ack(new_revision, affected_ranges)
  -> UI updates confirmed_revision
save_document(session_id)
  -> flush pending patch barrier
  -> Core creates SavePayload
  -> Runtime asks Host for compare-and-atomic-write
  -> Core/Runtime marks revision persisted
```

失败处理：

- patch 超时：保留 pending queue，暂停保存和语义命令，不阻塞本地继续输入到预算上限。
- revision mismatch：请求增量补丁或 confirmed snapshot，重建 CodeMirror mirror。
- 保存冲突：Host 返回当前 file identity，Runtime 不覆盖磁盘，UI 进入冲突流程。
- 任意失败都不得调用前端 `getMarkdown()` 兜底写盘。

### 10.1 保存与资源事务

Core 不直接写文件。保存由 Runtime 协调：

```text
flush pending patches
  -> Core build SavePayload(revision)
  -> Host compare expected FileIdentity
  -> Host write temp + sync + atomic replace
  -> preserve permissions where supported
  -> Runtime mark persisted(revision, new_identity)
```

图片迁移使用 prepare/commit/rollback：

1. Core 生成 `AssetPlan` 和 Markdown patch proposal。
2. Host 将资源写入临时或目标安全位置并返回结果。
3. Runtime 只有在所有必需资源成功后才提交文档 patch 和保存。
4. 失败时清理临时资源，文档引用保持原状。

`FileIdentity` 至少包含平台可用的 canonical identity、size、mtime 和 content fingerprint。mtime/size 只能用于快速判断，不能作为唯一冲突依据。

### 10.2 Host Port Contract

Host Adapter 是可替换的平台端口，Tauri 只是第一个实现。Host 不拥有 Markdown 文档模型，不读取 UI store，不调用 ProseMirror/CodeMirror serializer。

```rust
pub struct HostRequestContext {
    pub protocol_version: u32,
    pub request_id: RequestId,
    pub client_id: ClientId,
    pub window_label: Option<WindowLabel>,
    pub session_id: Option<SessionId>,
    pub document_id: Option<DocumentId>,
    pub base_revision: Option<Revision>,
    pub capability: HostCapability,
}

pub enum HostCapability {
    FileSystem,
    Clipboard,
    Dialogs,
    Windows,
    Notifications,
    Shell,
    NetworkFetch,
    DiagramRender,
    Export,
}
```

Port 分组：

- FileSystem：read bytes、stat identity、compare-and-atomic-write、watch、rename/delete、temporary file。
- Clipboard：read/write text、read/write image、format negotiation。
- Dialogs：open/save folder/file、confirm、permission prompt，必须 window-scoped。
- Windows：create/focus/close、close permission、window label、platform lifecycle。
- Notifications/Shell：toast/native notification、open path/url。
- NetworkFetch：受限下载、redirect/DNS/IP/MIME/size gate。
- DiagramRender：Mermaid/PlantUML 等受限渲染，返回 sanitized artifact 或 diagnostic。
- Export：PDF/native print、DOCX adapter、HTML artifact write。

Host contract 要求：

- 文档副作用必须带 `session_id`；窗口副作用必须带 `window_label`。
- 所有可长耗时操作必须支持 cancellation token、timeout、progress event 和 stable error code。
- Host 结果必须回带 `request_id`，Runtime/App Service 按 `session_id + revision` 校验后才能提交状态。
- Host capability negotiation 区分 unsupported、permission denied、user cancelled、temporary unavailable、internal failure。
- 同一路径多 session 同时保存、导出或迁移资源时，Host 不按 path 合并请求；冲突由 Runtime/FileIdentity 决定。
- Host mock 必须能覆盖每个 port，CI 不依赖公网、真实剪贴板或真实系统对话框。

## 11. 前端重构

### 11.1 Editor State

前端状态从“内容拥有者”变为“会话视图”：

```typescript
interface EditorViewState {
  sessionId: string | null;
  confirmedRevision: number;
  persistedRevision: number;
  pendingTransactions: readonly PendingTransaction[];
  mode: 'source' | 'live-preview' | 'preview';
  selection: SelectionState;
  viewport: ViewportRange;
}
```

`dirty = pendingTransactions.length > 0 || confirmedRevision != persistedRevision`。保存成功只能把实际写入的 revision 标记为 persisted；保存过程中又产生新输入时，文档继续保持 dirty。

M4 后前端应升级为 workspace/session projection：

```typescript
interface AppWorkspaceState {
  windowLabel: string;
  clientId: string;
  activeSessionId: string | null;
  sessionsById: Record<string, EditorViewState>;
}
```

`activeFilePath` 只能从 active session 的 `DocumentSource` 派生，用于兼容旧文件树高亮。selection、viewport、pending、mode、dirty、outline、diagnostics 和 widget draft 都必须按 `sessionId` 存储。

### 11.2 CodeMirror 角色

CodeMirror 成为唯一可编辑文本视图。

Source Mode 与 WYSIWYG / Live Preview Mode 使用同一个 CodeMirror document，只是 extension set 不同：

- Source Mode：完整语法显示。
- Live Preview：decorations、widgets、folding、syntax marker reveal。

CodeMirror document 是乐观镜像，不是第二个保存真相。Adapter 必须提供：

- transaction -> patch 转换。
- patch batching 与 flush barrier。
- ack、retry、resync 状态机。
- Core patch -> CodeMirror transaction 映射。
- revision-bound selection 和 viewport。

### 11.3 SolidJS 与 ProseMirror 迁移

迁移阶段：

1. 保留 ProseMirror WYSIWYG。
2. 新增 Core-backed Source session，并完成 Source 保存切换。
3. 提取框架无关 Editor Adapter。
4. 以 vertical slice 增量迁移 SolidJS 应用外壳。
5. 新增 Core-backed WYSIWYG / Live Preview。
6. Toolbar commands 和 History 切到 Core。
7. 表格、FrontMatter、图片、搜索、诊断、导出迁移。
8. 功能矩阵全绿并经过稳定观察期后，移除 ProseMirror serializer 保存真相链路。

所见即所得编辑模式长期保留；迁移目标是替换旧编辑内核的文档真相职责，不是移除 WYSIWYG 产品能力。

## 12. 性能方案

### 12.1 大文件预算

Core 按文件大小和复杂度分级：

```text
Normal: <= 1MB
        全量 block parse，可启用完整高级预览
Large:  > 1MB 且 <= 10MB
        block parse 优先，inline/render/diagnostics 按 viewport 或 idle task
Huge:   > 10MB
        Source/WYSIWYG 均可用，进一步限制同步预算和自动 widget
```

产品档位只按 UTF-8 源文件字节数定义。行数、最大单行长度、嵌套深度和节点数只作为档位内的复杂度预算信号，不能改变用户看到的 Normal/Large/Huge 分类。现有行数阈值设置在 M4 设置迁移时转为内部兼容项或明确废弃。

M0 在统一基准机冻结以下 p95 指标：

- 1MB / 10MB / 50MB 进入可输入状态。
- UI transaction commit。
- patch ack。
- viewport Render IR。
- 10MB save。
- 峰值内存和全文副本数量。

初始目标见产品方案。实现中不得用关闭 WYSIWYG 作为唯一达标方式。

### 12.2 增量更新

应用 patch 后：

- 更新 line index。
- 找到受影响 block range。
- 局部重扫 block。
- 只失效相关 Render IR 和 diagnostics。
- UI 只刷新受影响 decorations/widgets。
- 无法证明安全边界时，保留当前可编辑状态并调度后台全量 parse，不能在输入路径无限向后扫描。

### 12.3 后台任务

长任务进入 Core scheduler：

- parse inline。
- link/image diagnostics。
- diagram render preparation。
- export preparation。

任务必须可取消，并绑定 revision，避免旧 revision 结果覆盖新状态。

任务还必须有：

- deadline 或工作预算。
- priority：input/selection > viewport > outline > diagnostics > diagram/export。
- backpressure：同类旧任务被新 revision 合并或取消。
- 结果大小上限与分页。

## 13. 跨平台一致性

### 13.1 Selection Model

Core 与 UI 明确 selection 表示：

```rust
pub struct Selection {
    pub anchor: ByteOffset,
    pub head: ByteOffset,
    pub affinity: SelectionAffinity,
}
```

UI 层负责 CodeMirror offset 与 Core byte offset 映射。涉及非 ASCII 文本时必须测试 UTF-8/UTF-16 映射。

### 13.2 IME

输入法 composition 期间：

- UI 不运行破坏 composition 的格式化命令。
- Core 只接受 CodeMirror commit 后的 patch。
- Live Preview decorations 避免覆盖 composition range。

### 13.3 快捷键

快捷键分两层：

- 平台层：Command/Ctrl、系统保留快捷键。
- Core command 层：语义命令，如 ToggleStrong。

测试覆盖 macOS、Windows、Linux 的常用编辑快捷键。

## 14. 测试策略

### 14.1 Core Fixture

建立 `markflow-core/fixtures/lossless/`：

- `frontmatter.md`
- `html-comment.md`
- `mixed-list-markers.md`
- `code-fence-backtick.md`
- `code-fence-tilde.md`
- `table-alignment.md`
- `crlf.md`
- `trailing-newlines.md`
- `blockquote-nesting.md`
- `large-document.md`

测试类型：

- open -> save byte-for-byte。
- edit one range -> untouched ranges byte-for-byte。
- command patch correctness。
- parse range correctness。
- UTF-8 byte / UTF-16 / line-column / EOL map 双向映射。
- parser differential、property test 和 fuzz。
- malformed Markdown、YAML、超长行、深层嵌套和大 replacement 限额。

### 14.2 Benchmark

Core benchmark：

- open document。
- build line index。
- block parse。
- inline parse visible range。
- apply patch。
- save document。
- render IR viewport。
- IPC patch encode/decode、ack/resync 和 revision mismatch。
- 1MB、10MB、50MB 三档峰值内存与全文副本数量。
- 50MB 首次传输的 JSON/raw/channel 对照 benchmark。

### 14.3 E2E

桌面 E2E：

- Source/Live Preview 切换不改文件。
- 中文输入法基本路径。
- CRLF 文件保存后仍是 CRLF。
- 修改表格单元格保留 alignment。
- 大文件打开后可输入和保存。
- pending patch 未确认时保存会等待或失败，不写入旧 revision。
- Core history undo/redo 与 CodeMirror mirror 一致。
- FrontMatter unsafe fixture 自动回退源码。

测试基础设施要求：

- Core unit/fixture/benchmark 不启动 Tauri、不访问公网、不依赖真实 DNS。
- 网络图片、PlantUML、文件 watcher 使用可注入 Host mock。
- 自动化 composition event harness 覆盖状态机；真实中文/日文输入法进入跨平台人工 release gate。
- 每个迁移阶段更新 `feature-migration-matrix.md` 状态和测试证据。

## 15. 迁移里程碑

### M0: Architecture Spikes and Baseline

- parser、buffer/position、IPC patch、FrontMatter lossless CST spike。
- 冻结 Core/Runtime/Host ADR、协议 DTO、性能基线和功能矩阵。
- 修复测试对公网 DNS 的依赖。

### M1: Core Foundation

- 新建 `markflow-core`。
- DocumentSession、OriginalSnapshot、LineIndex、LineEndingMap、PositionMap、TextPatch。
- open/save 保真。
- lossless fixtures。

### M2: Parse Index

- 语义 parser + MarkFlow style/trivia scanner。
- FrontMatter、HTML Comment、heading、list、code fence、table range。
- Outline 从 Core 输出。

### M3: Core-backed Source Mode

- Runtime session registry + Tauri Bridge commands。
- CodeMirror 文本变更同步 Core。
- 乐观镜像、patch batching、ack/resync。
- 保存从 Core session 写出。

### M4: SolidJS App Shell and Editor Adapter

- UI 外壳迁移到 SolidJS。
- vertical slice 增量迁移，不做一次性替换。
- 建立 Editor Adapter。
- Solid store 不保存权威 Markdown。
- 现有功能完整迁移与适配。

### M5: Core-backed WYSIWYG Editing MVP

- Render IR。
- 标题、粗体、列表、代码块、图片基础 decorations/widgets。
- Source/WYSIWYG 同文本模型切换。
- 旧 ProseMirror WYSIWYG 作为兼容路径保留。

### M6: Edit Commands, History and Feature Migration

- Toolbar 改为 Core command。
- Core 成为 History 单一 owner。
- strong/emphasis/heading/list/quote/code fence。
- selection_after 光标映射。
- 现有编辑功能完整迁移与适配。

### M7: Tables, FrontMatter, Assets, Search and Diagnostics

- 表格编辑 patch。
- 表格所见即所得 UI。
- FrontMatter 结构化编辑。
- unsafe YAML 回退源码。
- 图片路径解析、复制、迁移收拢到 Core。
- 搜索和诊断进入 Core。
- 图表作为内部 renderer。

### M8: Export IR, Host Portability and Full Migration

- 导出切到 Core Render/Export IR。
- 移除 `tiptap-markdown` 保存链路。
- Host Adapter 边界稳定。
- Core CLI/test harness。

## 16. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 自研 Core 范围过大 | 交付周期失控 | 先做保真 session，复用语义 parser，自研只聚焦 style/trivia 与增量边界 |
| WYSIWYG 体验退步 | 用户感知明显 | 保留当前 WYSIWYG 兼容路径，Core-backed WYSIWYG 逐块替换 |
| Parser 与真实 Markdown 方言不一致 | 渲染/诊断偏差 | 第三方 parser 对照测试，内部 provider 分层 |
| 大文件 rope 引入复杂度 | 编辑 bug 增加 | P0 先 String，性能瓶颈明确后再换 |
| 插件 ABI 过早固化 | 后续难改 | 本轮不做插件系统，只保留内部 provider |
| 跨平台 IME 难测 | 输入损坏风险 | 建立最小人工验收矩阵和自动化 smoke |
| IPC 每键往返或全文复制 | 输入延迟和内存放大 | 乐观镜像、小 patch、批处理、ack/resync、全文副本 benchmark |
| Mixed EOL offset 错位 | 保存损坏、光标错位 | LogicalText + LineEndingMap + PositionMap，三坐标 property test |
| History 双 owner | undo 重复应用或 revision 分叉 | M6 切换 Core 单一 owner，Adapter 禁用独立 history |
| FrontMatter 复杂 YAML 被重写 | 用户元数据损坏 | lossless CST、安全子集、`structured_edit_safe` 回退 |
| UI 全量迁移失控 | 长期双 UI、回归难定位 | M4 vertical slice，每个 slice 单独回归和可回退 |
| 在线依赖导致测试不稳定 | CI 偶发失败 | Host mock / local resolver，Core 测试禁止公网 |

## 17. M0 决策门

这些不是长期悬而未决的问题，必须在对应阶段开始前以 ADR 冻结：

| 决策 | 候选方向 | 必需证据 | 最晚冻结 |
| --- | --- | --- | --- |
| Cargo 布局 | workspace 独立 crate / `src-tauri` 内临时模块 | Tauri dev/build、Core 独立 test、依赖图和迁移成本 | M1 开始前 |
| 语义 parser | `markdown-rs` / 对照 parser / 组合方案 | CommonMark/GFM fixture、错误恢复、1/10/50MB benchmark | M1 开始前 |
| Core 实现策略 | 自主实现 / 封装 `bekoedit-markdown` / 维护裁剪 fork | MarkFlow fixture、1/10/50MB benchmark、API 稳定性、维护活跃度、license/NOTICE 与可替换性 | M1 开始前 |
| TextBuffer | `String` / stable rope | patch、内存、UTF-8/UTF-16 映射 benchmark | M1 API 冻结前 |
| FrontMatter CST | 现有 lossless crate / tree-sitter YAML / 最小自维护 CST | 注释、顺序、quote、复杂 YAML fixture | M2 开始前 |
| Bridge DTO | Rust -> TS 类型生成方案 | version、error code、兼容测试、构建集成 | M3 开始前 |
| 性能基准机 | CI runner / 固定物理机 | 可重复 p95、OS/CPU/内存记录 | M2 benchmark 前 |
| Legacy 移除版本 | 一个或多个稳定发布周期 | 功能矩阵全绿、fallback/数据损坏指标、跨平台 release gate | M8C 开始前 |

## 18. 参考实现策略

### 18.1 首要参考实现

`bekoedit` / `bekoedit-markdown` 是本轮重构的首要参考实现。它已经实现或验证了与 MarkFlow 目标高度一致的概念：

- Markdown 原文是 canonical source，视觉表面都是 projection。
- Rust 持有 UTF-8 byte range，UI range 不具有权威性。
- `MarkdownIndex`、revision-scoped `BlockId` 和 fingerprint。
- 语义命令解析为最小 `SourcePatch`。
- 无法安全结构化编辑的内容回退为 Raw Markdown Island。
- versioned UI contract、原子保存和外部修改冲突处理。

### 18.2 明确不直接继承

- 不继承每次编辑后全量重新解析的 MVP 策略；MarkFlow 必须满足超过 1MB 文档的预算化增量处理。
- 不绑定 Dioxus、其 WebView bridge 或应用 crate 分层。
- 不把当前 Form Mode 的交互形态当作 MarkFlow WYSIWYG 终态。
- 不接受 FrontMatter 仅作为 Raw Island；MarkFlow 仍需安全子集的结构化编辑。
- 不让上游 `0.x` API 直接渗透 Editor Adapter、Runtime 或 Host contract。

### 18.3 采用门槛

M0 使用同一组 MarkFlow fixture 对自主 spike 与 `bekoedit-markdown` 做 differential test。只有以下条件全部通过，才允许从“参考实现”升级：

- 未编辑 open/save 与编辑后 untouched ranges 逐字节一致。
- UTF-8/UTF-16、CRLF/Mixed EOL、尾空行和 stale revision 行为满足 MarkFlow contract。
- GFM table、FrontMatter、HTML Comment、list marker 和 code fence 的支持或安全回退边界明确。
- 1/10/50MB p95、峰值内存和全文副本数量达到阶段预算。
- public API 可由 MarkFlow-owned facade 隔离，并有替换实现的 contract test。
- Apache-2.0、NOTICE、依赖安全和维护策略完成审查。

## 19. 技术依据

- [bekoedit](https://github.com/nabbisen/bekoedit)：Rust source-preserving Markdown editor 参考实现。
- [bekoedit-markdown](https://docs.rs/bekoedit-markdown/latest/bekoedit_markdown/)：MarkdownIndex、BlockId、SourcePatch、Raw Island 与 Form command crate。
- [bekoedit Architecture](https://github.com/nabbisen/bekoedit/blob/main/docs/src/architecture.md)：canonical source、projection、typed boundary 和 crate 分层。
- [bekoedit Source Preservation](https://github.com/nabbisen/bekoedit/blob/main/docs/src/source-preservation.md)：最小 patch、style trivia、stale command rejection 与当前全量 reparse 边界。
- [Tauri v2: Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/)：commands、async command、raw body 与 ordered channel。
- [Tauri v2: Inter-Process Communication](https://v2.tauri.app/concept/inter-process-communication/)：序列化的异步消息传递边界。
- [CodeMirror 6: Decorations](https://codemirror.net/examples/decoration/)：mark、widget、replace decoration、atomic range 与 viewport decoration。
- [CodeMirror 6: Huge Document](https://codemirror.net/examples/million/)：大文档虚拟化和解析工作预算。
- [markdown-rs](https://github.com/wooorm/markdown-rs)：concrete token、position、CommonMark、GFM 与 frontmatter 能力。
- [Ropey](https://docs.rs/crate/ropey/latest)：Rust UTF-8 rope 候选。
- [yaml-edit](https://docs.rs/yaml-edit)：lossless YAML syntax tree 候选，不代表最终选型。
- [CommonMark 0.31.2](https://spec.commonmark.org/current/)：fence、缩进、HTML block 等语义基线。
- [GitHub Table 文档](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-tables)：GFM table alignment 与 escaped pipe。

## 20. M0 OpenSpec 基线引用

OpenSpec change `define-m0-architecture-baseline` 是 M1 Core Foundation 前的当前技术基线。它冻结以下约束：

- `markflow-core` 不依赖 Tauri、DOM、CodeMirror、SolidJS、ProseMirror，也不直接执行文件、网络、剪贴板、对话框或打印副作用。
- `markflow-runtime` 负责编排 session、task、save、sync 和 Host capability，Host Adapter 只执行平台能力。
- Core confirmed snapshot 是保存、解析、history 和 export 的权威状态；CodeMirror 只能是 revision-bound optimistic mirror。
- Rust 内部使用 UTF-8 logical byte offset；IPC/editor DTO 使用 UTF-16 offset；保存路径使用 source-byte reconstruction 与 `LineEndingMap`。
- M0 spike code 位于 `openspec/changes/define-m0-architecture-baseline/spikes/`，不进入产品运行路径；为满足离线验证门禁，允许 scoped test fixture 修正，但不得改变运行时行为。
- Parser p95 尚未冻结；`bekoedit-markdown` 是参考实现，不是生产依赖。
