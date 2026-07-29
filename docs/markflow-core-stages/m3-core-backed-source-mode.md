# M3: Core-backed Source Mode

> 状态：M3/M3.1 已交付并归档
> 更新日期：2026-07-29

## 阶段目标

让 Source Mode 率先接入 Core session，并让保存内容只来自 Core confirmed snapshot，不再来自前端 Markdown serializer。

这是第一次用户路径接入 Core，但不改变默认 WYSIWYG 体验。M3 的目标不是一次性完成全部编辑器迁移，而是建立一条可验证、可回退、可继续扩展到 M4-M8 的 Core-backed 文档主路径。

## 范围边界

### M3 必须完成

- Source Mode 打开文件时创建 Runtime session，并以 session text 初始化 CodeMirror。
- Source Mode 用户输入以 UTF-16 patch 发送到 Runtime/Core，不以整篇 Markdown 作为常规同步单位。
- Source Mode 保存时只保存 Core confirmed snapshot。
- 保存流程由 Runtime 编排，Host/Tauri 只负责文件身份校验和原子写入。
- Source Mode dirty 状态由 pending patch 与 Core revision 计算，不再由前端 serializer 文本比较决定。
- Source Mode 的 outline、stats、large/huge 状态从 Core/Runtime 获取。
- WYSIWYG legacy 路径继续可用，并与 Source Mode 新路径明确隔离。
- 外部修改、保存冲突、同路径多窗口后保存冲突继续可触发。
- M0/M1/M2 的保真 fixture、Unicode 坐标、Large/Huge 预算进入产品路径验证。

### M3 不做

- 不替换 ProseMirror WYSIWYG 主体验；WYSIWYG 仍可继续用 legacy open/save。
- 不实现 Core History；Source Mode 可暂用 CodeMirror history，Core 只确认文本 revision。
- 不迁移 toolbar 格式命令到 Core；这属于 M6。
- 不迁移图片/资源事务的完整 Core owner；M3 只定义 Source 保存与 pending image legacy 兼容边界。
- 不删除 `getMarkdown()`、`write_file` 等 legacy API；但 Source Mode 保存不得调用它们。
- 不实现多窗口实时合并；同一路径多窗口以独立 session + 保存冲突处理。

## 当前基线（设计时）

以下为 M3 设计时的历史基线，用于解释迁移原因；不是 post-M3 当前实现状态：

- Source Mode：`src/lib/editor.source.ts` 创建 CodeMirror 6，`updateListener` 回调整篇 doc 字符串。
- 模式切换：`src/lib/editor.ts` 的 `switchToSource()` 从 ProseMirror serializer 得到 Markdown；`switchToWysiwyg()` 将 Source 内容写回 ProseMirror。
- 保存入口：`src/components/sidebar.fileops.ts` 的 `saveActiveDocument()` 调用 `getMarkdown()`，再经 `preparePendingImagesForSave()` 和 `writeFile()` 写盘。
- 后端写盘：`src-tauri/src/commands/files.rs` 的 `write_file(path, content)` 接收完整字符串并原子写入。
- Core 基础：`markflow-core` 已有 `DocumentSession`、`TextPatch`、`PositionMap`、`ParseIndex`、`save_payload()` 和 lossless/patch/position 测试。

M3 的设计重点是把 `markflow-core` 从离线测试路径接到 Runtime/Tauri/CodeMirror，而不是在前端继续扩展 serializer 补丁。

## Post-M3 当前实现状态

截至 2026-07-29，M3 与 M3.1 已完成并归档，当前实现状态如下：

- Source Mode 通过 `src/lib/coreSession.ts`、`src/lib/editor.sourcePatcher.ts`、`src/lib/SourceSyncController.ts` 接入 Core-backed open/edit/save 主路径。
- 保存入口 `src/components/sidebar.fileops.ts` 已按 active Core session 分派：Core Source 调用 `saveCoreSession()`，legacy WYSIWYG 保留 `getMarkdown()` + legacy write 路径。
- Runtime 位于 `src-tauri/crates/runtime/`，包含 `DocumentService`、`SessionRegistry`、`SaveLease`、`PathSaveCoordinator`、Host trait、真实 reload 与保存冲突编排。
- Tauri adapter 位于 `src-tauri/src/commands/core_bridge.rs` 与 `src-tauri/src/runtime_host.rs`，负责 IPC envelope、Host side effect 和 Runtime 调用，不实现 Markdown 语法。
- feature flag `isCoreBackedSourceModeEnabled()` 可回退 Source Mode legacy 路径，WYSIWYG 迁移仍属于 M5-M8。
- M3 交付后的持续风险是 M4-M8 的 legacy WYSIWYG、编辑命令、资源、导出与 spec 碎片化整理，不应把 M3 误读为完整 Core editor 迁移完成。

## 架构设计

### 1. 分层职责

```text
CodeMirror Source View
  - 用户输入、选区、viewport、本地乐观镜像
  - 生成 revision-bound Utf16TextPatch
  - 展示 pending/dirty/error 状态

Editor Adapter
  - transaction -> patch 转换
  - patch batching、flush barrier、ack/resync/retry
  - confirmedRevision / persistedRevision / pendingTransactions
  - bridge DTO 调用和错误归类

Tauri Bridge
  - 稳定 IPC commands
  - DTO 版本校验和错误 envelope
  - client/window/session ownership 传递

markflow-runtime
  - SessionRegistry
  - document open/save/reload/close use case
  - FileIdentity、冲突判断、原子写入编排
  - background parse/stats/outline task 调度

markflow-core
  - DocumentSession
  - UTF-8/UTF-16/source byte 坐标转换
  - TextPatch 应用、幂等、revision 推进
  - SavePayload、ParseIndex、Outline、Stats

Host/Tauri file adapter
  - read bytes
  - compare expected FileIdentity
  - temp write + fsync + atomic replace
  - metadata/fingerprint 回传
```

核心约束：

- Core 不依赖 Tauri、DOM、CodeMirror、ProseMirror、文件系统。
- Runtime 不实现 Markdown 语法，只编排 session 和 Host side effects。
- CodeMirror 可以持有 optimistic mirror，但保存只能使用 Core confirmed snapshot。
- `getMarkdown()` 在 Source Mode 新保存链路中是禁止依赖。
- 所有跨层 range 都必须绑定 revision 和坐标单位。

### 2. Runtime Session Registry

新增 `markflow-runtime` 或在已存在 workspace 中加入 runtime crate/module。M3 默认使用独立 crate；若 workspace viability 证明短期阻塞，可暂放 `src-tauri/src/runtime/`，但 public API 按独立 crate 设计，并记录退出条件。

```rust
pub struct SessionRegistry {
    sessions: DashMap<SessionId, Arc<SessionHandle>>,
    path_index: DashMap<DocumentSourceKey, Vec<SessionId>>,
}

pub struct SessionHandle {
    client_id: ClientId,
    window_label: String,
    source: DocumentSource,
    inner: Mutex<DocumentRuntimeState>,
}

pub struct DocumentRuntimeState {
    core: DocumentSession,
    opened_identity: FileIdentity,
    persisted_revision: Revision,
    persisted_identity: FileIdentity,
    save_in_progress: Option<SaveToken>,
    capabilities: DocumentCapabilities,
}
```

要求：

- session id、document id、transaction id 由 Runtime 分配，不能由前端自造。
- 每个 session 独立加锁，不能用全局锁包住 parse、save 或 await。
- 不在锁内执行 IPC await、磁盘 IO、hash 大文件或后台 parse。
- session 绑定 `client_id` 与 window ownership；窗口关闭只关闭本窗口 session。
- 同一路径多窗口使用独立 session；保存时通过 FileIdentity 判断冲突。
- `close_document` 必须释放 session、取消后台任务、清理 path index。

### 3. FileIdentity 与 DocumentSource

```rust
pub struct DocumentSource {
    pub path: Option<PathBuf>,
    pub display_name: String,
    pub source_kind: DocumentSourceKind,
}

pub struct FileIdentity {
    pub canonical_path: Option<PathBuf>,
    pub platform_id: Option<String>,
    pub mtime_ms: Option<u64>,
    pub size: u64,
    pub fingerprint: ContentFingerprint,
}
```

M3 至少支持磁盘文件。未命名文档可以作为 M3.5/M4 继续补齐，但 API 必须预留 `path: Option<PathBuf>`。

冲突判断规则：

- mtime/size 是快速判断，不是最终覆盖依据。
- 保存前必须比较 expected identity；平台 identity 不可用时比较 fingerprint。
- clean session 遇到外部修改可以 reload。
- dirty session 遇到外部修改必须进入 conflict，不允许静默覆盖。
- 同一路径多窗口后保存者如果 expected identity 已过期，必须返回 `CONFLICT`。

### 4. Bridge DTO

所有命令使用统一 envelope，TypeScript 类型由 Rust DTO 生成或通过 schema test 校验。

```rust
pub struct ProtocolEnvelope<T> {
    pub protocol_version: u32,
    pub request_id: RequestId,
    pub client_id: ClientId,
    pub session_id: Option<SessionId>,
    pub payload: T,
}
```

M3 命令：

```rust
open_document(path) -> DocumentOpened
get_document_text(session_id) -> DocumentTextResult
apply_text_patch(session_id, patch) -> ApplyPatchAck
resync_document(session_id, confirmed_revision) -> ResyncResult
flush_document(session_id) -> FlushResult
save_document(session_id) -> SaveResult
get_outline(session_id) -> Outline
get_document_stats(session_id) -> DocumentStats
reload_document(session_id) -> ReloadResult
close_document(session_id) -> ()
```

DTO 最小字段：

```typescript
interface DocumentOpened {
  protocolVersion: number;
  sessionId: string;
  documentId: string;
  revision: number;
  persistedRevision: number;
  text: string | TextTransportRef;
  originalSnapshot: OriginalSnapshotDto;
  fileIdentity: FileIdentityDto;
  sizeClass: 'normal' | 'large' | 'huge';
  outline: OutlineDto;
  stats: DocumentStatsDto;
  capabilities: DocumentCapabilitiesDto;
}

interface Utf16TextPatchDto {
  transactionId: string;
  baseRevision: number;
  changes: Array<{
    from: number;
    to: number;
    insert: string;
  }>;
  selectionAfter?: {
    anchor: number;
    head: number;
  };
}

interface ApplyPatchAck {
  transactionId: string;
  baseRevision: number;
  revision: number;
  affectedRanges: Array<{ from: number; to: number }>;
  outlineRevision?: number;
  statsRevision?: number;
}
```

错误码：

- `REVISION_MISMATCH`
- `INVALID_RANGE`
- `INVALID_UTF16_BOUNDARY`
- `TRANSACTION_CONFLICT`
- `UNSUPPORTED_ENCODING`
- `PENDING_QUEUE_FULL`
- `SAVE_FLUSH_TIMEOUT`
- `CONFLICT`
- `CANCELLED`
- `SESSION_NOT_FOUND`
- `PROTOCOL_VERSION_UNSUPPORTED`

### 5. 打开流程

```text
UI openFileInEditor(path)
  -> confirm legacy/Core transition if active doc dirty
  -> open_document(path)
  -> Runtime read bytes + FileIdentity
  -> Core DocumentSession::open_bytes
  -> Core parse_index/stats/size_class
  -> Runtime register session
  -> DocumentOpened
  -> Source Adapter create CodeMirror doc from opened.text
  -> state.confirmedRevision = opened.revision
  -> state.persistedRevision = opened.persistedRevision
```

迁移策略：

- 当用户选择 Source Mode 或打开后切换到 Source Mode 时使用 Core-backed Source session。
- 默认 WYSIWYG 可继续走 legacy `readFile()` + `setMarkdown()`。
- 若文件已经在 Source Core session 中打开，切回 Source 时不得从 ProseMirror serializer 重建内容；必须从 Core confirmed snapshot 或 Adapter mirror 恢复。
- Source -> WYSIWYG 的过渡期允许把 confirmed text 注入 ProseMirror，但该动作只是 legacy 视图同步，不改变 Core session 的文档真相。

### 6. Source Mode Patch 同步

CodeMirror transaction 同步链路：

```text
CodeMirror transaction
  -> Adapter 立即提交本地 optimistic mirror
  -> 从 transaction.changes 生成 Utf16TextPatch
  -> 同一 animation frame / IME composition 内 batch
  -> apply_text_patch(session_id, base_revision, transaction_id, patch)
  -> Runtime UTF-16 -> Core byte range
  -> Core DocumentSession::apply_patch
  -> Ack(new_revision, affected_ranges)
  -> Adapter 标记 transaction confirmed
```

Adapter 状态机：

```typescript
type SyncState =
  | { kind: 'idle' }
  | { kind: 'pending'; pendingCount: number }
  | { kind: 'backpressure'; pendingCount: number; reason: string }
  | { kind: 'resyncing'; reason: string }
  | { kind: 'blocked'; code: string; message: string };
```

要求：

- `baseRevision` 必须等于 Adapter 当前 confirmed revision。
- pending patch 可以继续在 optimistic mirror 上排队，但 pending 数量和累计字节数必须有上限。
- 超过 pending 上限时，Source Mode 进入 backpressure：保留编辑器内容，暂停语义命令和保存，提示用户同步中。
- IME composition 期间不拆分到破坏组合输入语义的 patch；composition end 后尽快 flush。
- 相同 `transaction_id` 重试必须幂等；不同 payload 重用同一 id 必须失败。
- Ack 到达顺序与发送顺序不一致时，Adapter 必须按 transaction order 提交 confirmed revision，不能跳跃确认。
- Core apply 失败后不得把 optimistic mirror 当作保存真相。

### 7. Resync 设计

触发条件：

- `REVISION_MISMATCH`
- `INVALID_RANGE`
- IPC timeout 后无法确认 transaction 状态
- Runtime 重启或 session state 丢失
- 外部 reload 更新了 confirmed snapshot

流程：

```text
Adapter pause semantic commands/save
  -> resync_document(session_id, last_confirmed_revision)
  -> Runtime 返回 confirmed snapshot 或 revision delta
  -> Adapter diff optimistic mirror 与 confirmed text
  -> 丢弃已由 Core 确认的 pending transaction
  -> 重放仍能安全应用的 pending patch
  -> 无法安全重放时进入 blocked，并要求用户手动选择保留本地内容或重载 Core 内容
```

M3 可以先只实现 confirmed snapshot resync，不强制实现 delta resync。但 Huge 文档必须在 M3 benchmark 后决定是否允许 snapshot resync；如果 snapshot resync 超预算，需要 ordered channel 分块或局部 resync。

### 8. Flush Barrier 与保存

旧路径：

```text
getMarkdown() -> preparePendingImagesForSave(markdown) -> write_file(path, content)
```

Source Mode 新路径：

```text
save_document(session_id)
  -> Adapter/Runtime flush pending patch barrier
  -> Core 输出 SavePayload(revision)
  -> Runtime 请求 Host compare expected FileIdentity
  -> Host temp write + sync + atomic replace
  -> Runtime 更新 persisted_revision 和 file identity
  -> SaveResult(revision, fileIdentity)
```

dirty 公式：

```text
dirty = pending_transaction_count > 0
     || confirmed_revision != persisted_revision
     || external_conflict_state != clean
```

保存规则：

- 保存开始时记录 `target_revision = latest_confirmed_revision_after_flush`。
- 保存期间如有新输入，保存成功也只能把 `target_revision` 标记为 persisted；更新后的 revision 仍 dirty。
- pending patch 未确认时，保存必须等待 flush；超时则明确失败或提示稍后重试。
- 保存不得调用 ProseMirror `getMarkdown()`、`getSourceContent()`、前端全文 fallback 或 `write_file(path, content)`。
- Host 写入失败不得修改 `persisted_revision`。
- Runtime 标记 persisted 必须和 Host 返回的新 FileIdentity 同步。

### 9. Legacy WYSIWYG 兼容

M3 迁移期保留双轨：

```text
Source Mode active:
  open/save/dirty/stats/outline -> Core-backed path

WYSIWYG active:
  open/save/dirty/stats/outline -> legacy path
```

约束：

- UI 状态栏必须能显示 active engine：`Core Source` / `Legacy WYSIWYG`。
- Source Core session 存在时，WYSIWYG legacy serializer 不得反向覆盖 session。
- 从 WYSIWYG 切到 Source 时，如果 WYSIWYG dirty，必须先走 legacy transition guard；不能把 serializer 输出默默当成 Core 打开基线。
- 从 Source 切到 WYSIWYG 时，必须先 flush Core pending patch，再把 confirmed text 注入 WYSIWYG legacy 视图；flush 失败则阻止切换。
- 旧路径测试继续保留，作为 M3 回归门禁。

### 10. Outline、Stats 与 Large/Huge UI

`DocumentOpened` 返回初始 outline/stats。后续 patch ack 可携带轻量更新标记，UI 根据 revision 拉取最新数据。

Large/Huge 策略：

- `Normal: <= 1MB`
- `Large: > 1MB && <= 10MB`
- `Huge: > 10MB`

UI 行为：

- Source Mode 对 Large/Huge 必须优先可编辑。
- 状态栏/Degradation Bar 显示 Runtime 返回的 size class 和降级原因。
- Large 文档默认允许 block scan outline，延迟 inline parse、图表、图片诊断、全文诊断。
- Huge 文档首次文本传输路径必须由 benchmark 决定；禁止未经测量固定 JSON 大字符串。
- 保存仍走 Core bytes，不降级为前端 serializer。

### 11. 日志与隐私

日志允许记录：

- session id、revision、transaction id。
- patch 字节数、change 数、耗时、错误码。
- 文件大小、size class、hash/fingerprint 前缀。
- save conflict 发生与 resolved 状态。

日志禁止记录：

- 文档正文。
- 完整绝对路径。
- 剪贴板内容。
- 图片 base64。
- 凭据、URL token、用户私有配置全文。

## 开发方案

### Phase 0: 变更准备

1. 创建 OpenSpec change，明确 M3 scope、delta spec、tasks 和设计说明。
2. 从真实 issue 创建分支，分支名形如 `feat/issue-N-core-backed-source-mode`。
3. 冻结 M0/M1/M2 作为前置条件：`markflow-core` tests 通过，M2 ParseIndex/LargeDocumentPolicy 已落地。
4. 补充 M3 fixture 列表：CRLF、Mixed EOL、BOM、FrontMatter、HTML Comment、Unicode、1MB、10MB、50MB、同路径双窗口。
5. 在 `feature-migration-matrix.md` 中为 M3 项添加 owner、测试记录占位。

### Phase 1: Runtime 与 Host Port

交付：

- `markflow-runtime` crate/module。
- `SessionRegistry`、`SessionHandle`、`DocumentRuntimeState`。
- `DocumentSource`、`FileIdentity`、`DocumentCapabilities`。
- Host trait：`read_document_bytes`、`stat_identity`、`compare_and_atomic_write`。
- 保存 workflow：flush -> SavePayload -> compare -> atomic write -> mark persisted。

开发任务：

1. 接入 `DocumentSession::open_bytes()` 和 `save_payload()`。
2. 为 session 分配 id 并维护 client/window ownership。
3. 将 Core error 映射为 stable runtime error code。
4. 实现 close/cancel 生命周期。
5. 添加 registry 并发测试，确保不同 session 不互相阻塞。

### Phase 2: Tauri Bridge Commands

交付：

- `open_document`
- `get_document_text`
- `apply_text_patch`
- `resync_document`
- `flush_document`
- `save_document`
- `get_outline`
- `get_document_stats`
- `reload_document`
- `close_document`

开发任务：

1. 在 `src-tauri/src/lib.rs` 注册新 commands。
2. Tauri command 只做 DTO 解包、调用 Runtime、返回 envelope。
3. 为 DTO 建立 TypeScript 类型生成或 schema parity test。
4. 增加 error code mapping test。
5. 维护 legacy `read_file`/`write_file`，但 Source path 不再调用。

### Phase 3: Frontend Bridge Client

交付：

- `src/lib/coreBridge.ts`
- `src/lib/coreSession.ts`
- `src/lib/sourceSyncAdapter.ts`
- runtime DTO TS types

开发任务：

1. 封装 `invoke()`，统一带 protocol version、request id、client id。
2. 建立 `CoreSessionState`：

```typescript
interface CoreSessionState {
  sessionId: string | null;
  documentId: string | null;
  confirmedRevision: number;
  persistedRevision: number;
  pendingTransactions: PendingTransaction[];
  syncState: SyncState;
  sizeClass: 'normal' | 'large' | 'huge';
  activeEngine: 'core-source' | 'legacy-wysiwyg';
}
```

3. 新增 dirty selector，不复用 legacy content string compare。
4. 将 bridge error code 映射到 toast/dialog/logging。
5. 增加 feature flag：`coreBackedSourceMode`，便于回滚和灰度。

### Phase 4: CodeMirror Patch Adapter

交付：

- transaction -> `Utf16TextPatchDto`。
- frame/composition batching。
- ack/retry/resync/flush 状态机。
- Source editor programmatic update guard 与 Core patch guard 分离。

开发任务：

1. 在 `editor.source.ts` 增加可选 `onTransaction`，保留 legacy `onUpdate` 兼容。
2. 从 `update.transactions` 或 `update.changes` 提取 change set。
3. 记录 selectionAfter。
4. 生成 monotonic transaction id。
5. 对 pending queue 设置数量和字节上限。
6. 实现 `flushPendingPatches()`，供保存和切换模式调用。
7. 为 resync 使用 CodeMirror transaction 替换整篇 doc，并标记为 programmatic update。

### Phase 5: Open/Save 路径接入

交付：

- Source Mode open 使用 `open_document`。
- Source Mode save 使用 `save_document`。
- Source Mode dirty 使用 Core session revision。
- `saveActiveDocument()` 按 active engine 分派。

开发任务：

1. 在 `openFileInEditor()` 中按目标模式/flag 分派 Core open。
2. Source Mode active 时，不调用 `readFile()` + `setMarkdown()` 作为主路径。
3. 修改 `saveActiveDocument()`：`core-source` 调 `saveCoreSourceDocument()`；legacy-wysiwyg 走旧路径。
4. 保留 `preparePendingImagesForSave()` legacy 路径；Source Core 路径遇到 pending images 时先进入明确的兼容策略：
   - M3 推荐：Source Core 路径暂不自动迁移 pending images，提示切回 legacy 或保存前完成资源迁移。
   - 若必须支持：先在 Runtime 定义 asset prepare/commit barrier，不允许前端改写 Markdown 后直接写盘。
5. Source -> WYSIWYG 切换前 flush；失败则停留 Source。
6. WYSIWYG -> Source 如当前文件还没有 Core session，调用 `open_document(path)` 从磁盘建立 session；若 WYSIWYG dirty，先提示保存或放弃。

### Phase 6: 外部修改与冲突

交付：

- Runtime 保存冲突。
- clean reload。
- dirty conflict。
- 同路径多 session 冲突。

开发任务：

1. watcher 事件仍由现有前端接收，但转发给 Core session conflict handler。
2. Runtime 根据 FileIdentity 判断 `cleanExternalChanged` / `dirtyConflict`。
3. clean 状态外部修改允许 `reload_document()` 更新 Core session 和 CodeMirror。
4. dirty 状态外部修改阻止自动 reload，保存返回 conflict。
5. 同路径两个 session 先后保存：第一者更新磁盘 identity，第二者保存必须返回 conflict。

### Phase 7: UI 状态与可观测性

交付：

- 状态栏 active engine。
- pending sync indicator。
- Large/Huge degradation bar。
- save conflict dialog 复用。
- 日志与性能 marker。

开发任务：

1. `store` 增加 Core session 视图状态或集中在 `coreSession.ts` 后向外暴露 selector。
2. 保存按钮、窗口关闭、自动保存均读取 Core dirty selector。
3. outline/status stats 在 Source Core active 时从 Core DTO 更新。
4. 增加 debug log：open/apply/flush/save/resync/close。
5. 所有错误 toast 使用用户可恢复文案，详细原因进日志。

### Phase 8: 测试与文档更新

交付：

- Rust runtime tests。
- Tauri command integration tests。
- Frontend adapter tests。
- E2E fixture save tests。
- benchmark/report。
- feature migration matrix 更新。

开发任务：

1. 更新 `docs/markflow-core-stages/feature-migration-matrix.md` M3 项状态。
2. 在 OpenSpec change 中记录 validation results。
3. 补充开发者说明：Source Mode 新/旧路径如何分派、如何回滚 flag。

## 复核方案

### 1. 主开发自检

每个 phase 完成后，作者必须检查：

- 是否有 Source Mode 新路径调用 `getMarkdown()`、`getSourceContent()` 作为保存内容。
- 是否有 Runtime/Core 锁跨 await 或磁盘 IO。
- 是否有裸 `usize` range 穿过 IPC 或跨层接口。
- 是否有 Core import Tauri/WebView/DOM/CodeMirror/ProseMirror。
- 是否有保存成功但 persisted revision 未对应实际写入 revision。
- 是否有错误路径吞掉 failure 后清 dirty。
- 是否有日志记录正文或完整路径。

### 2. 独立 agent 复核

合入或归档前必须派独立 sub-agent 做不偏不倚复核。复核输入：

- OpenSpec proposal/design/tasks。
- 本文档 M3 方案。
- 实际 diff。
- 测试结果和 benchmark 报告。

复核任务：

- 静态走查 Source 保存路径，证明不经过 ProseMirror serializer。
- 静态走查 Runtime save workflow，证明保存只来自 Core `SavePayload`。
- 检查 session registry 并发和生命周期。
- 检查 FileIdentity 冲突处理和同路径多窗口保存。
- 检查 UTF-16 patch DTO 到 Core byte range 转换。
- 检查 Large/Huge 不降级到 serializer。
- 运行 `npm test`、`npx tsc --noEmit`、Rust tests 和相关 e2e。
- 对缺失测试标注风险等级和必须补齐项。

复核输出：

```text
reports/m3-independent-review.md
```

内容至少包含：

- 结论：通过 / 阻塞 / 有条件通过。
- 必修问题列表，含文件和行号。
- 已运行命令和结果。
- 未覆盖风险。
- 对验收标准逐项勾稽。

### 3. 架构复核清单

- `markflow-core` 仍是纯文档内核，无平台副作用。
- `markflow-runtime` 是 session/save owner。
- Tauri command 只是 adapter。
- Source Mode 常规编辑只发送 patch。
- Source Mode save 只使用 confirmed revision。
- WYSIWYG legacy 与 Source Core 边界清楚。
- 失败时不兜底到 serializer 写盘。
- 同一路径多窗口不会静默覆盖。
- clean reload 和 dirty conflict 均可解释、可测试。

### 4. 数据保真复核清单

- UTF-8 BOM 保留。
- LF/CRLF/Mixed EOL 保留。
- 尾部空行保留。
- FrontMatter 未触及区域保留。
- HTML Comment 未触及区域保留。
- code fence marker 和长度未触及时保留。
- list marker 未触及时保留。
- 中文、emoji、combining mark selection/patch 不错位。

## 开发者说明

### Source Mode 新/旧路径分派

Source Mode 的 open/save/dirty 检查根据是否启用 Core-backed Source Mode 走不同路径：

**核心分派点** — `src/lib/editor.ts` 的 `switchToSource()`:

1. 检查 `isCoreBackedSourceModeEnabled()`（`src/lib/coreSession.ts` 中定义）。
2. 如果启用：
   - 调用 `openCoreSession(filePath)` 通过 Bridge 创建 Runtime session，CodeMirror 内容由 Core 提供。
   - `onTransaction` 回调使用 `createPatcherCallback()`（`src/lib/editor.sourcePatcher.ts`），每个 CM transaction 提取 UTF-16 patch 发送到 Core。
   - dirty 状态由 `isCoreSessionDirty()`（`src/lib/coreSession.ts`）计算：`pendingCount > 0 || confirmedRevision != persistedRevision`。
3. 如果未启用（legacy）：
   - 使用纯前端 `createSourceEditor()`，无 Core session。
   - dirty 状态由 `isDocumentDirty()`（`src/lib/editor.state.ts`）比较 Markdown serializer 输出。

**保存分派点** — `src/components/sidebar.fileops.ts` 的 `saveActiveDocument()`:

1. 检查 `getCoreSessionState().isActive`。
2. 如果 Core session 活跃：
   - 调用 `saveCoreSession()`（`src/lib/coreSession.ts`）— flush patches -> Core save_payload -> Host 原子写入。
   - **不调用** `getMarkdown()`、`preparePendingImagesForSave()`、`write_file()` 等 legacy API。
3. 如果 Core session 未活跃：
   - 走 legacy 路径：`getMarkdown()` -> `write_file()`。

### 如何通过 Feature Flag 回退

如果 Core-backed Source Mode 需要临时禁用：

1. 修改 `src/lib/coreSession.ts` 中的 `isCoreBackedSourceModeEnabled()`:
   ```typescript
   export function isCoreBackedSourceModeEnabled(): boolean {
     return false; // 临时禁用
   }
   ```
2. 重启应用后，Source Mode 走纯前端 legacy 路径（CodeMirror + `readFile()`/`write_file()`）。
3. WYSIWYG 模式不受影响（始终走 legacy 路径）。
4. 恢复时改回 `return true;` 即可重新启用。
5. **注意**：禁用后已有 Core session 不会自动清理；建议在禁用前关闭所有打开的文件。长期方案建议从设置存储中读取该标志。

### 文件关键入口

| 职责 | 文件 |
|------|------|
| Bridge 命令（Rust） | `src-tauri/src/commands/core_bridge.rs` |
| 前端 invoke 封装 + DTO | `src/lib/coreBridge.ts` |
| Core session 生命周期 + state | `src/lib/coreSession.ts` |
| CM patch 提取 + batch + send | `src/lib/editor.sourcePatcher.ts` |
| 保存分派 + dirty 计算 | `src/components/sidebar.fileops.ts` |
| 状态栏 active engine 指示器 | `src/components/statusbar.ts` |
- 打开不编辑再保存 byte-for-byte 一致。
- 小 patch 后未触及区域 byte-for-byte 一致。

## 验证方案

### 1. Rust 单元测试

范围：

- `markflow-core`
- `markflow-runtime`
- Tauri Host adapter 可测试部分

命令：

```bash
cargo test -p markflow-core
cargo test -p markflow-runtime
cargo test --manifest-path src-tauri/Cargo.toml
```

用例：

- session registry create/get/close。
- 每 session 独立锁，不阻塞其他 session patch。
- open bytes -> save payload byte-for-byte。
- apply patch revision mismatch 不修改 session。
- duplicate transaction id 同 payload 幂等。
- duplicate transaction id 不同 payload 返回 conflict。
- UTF-16 range 转 Core byte range。
- invalid UTF-16 boundary 失败。
- save workflow pending flush 后写入目标 revision。
- Host write 失败不更新 persisted revision。
- FileIdentity mismatch 返回 conflict。
- clean external modification reload。
- dirty external modification conflict。

### 2. Frontend 单元测试

命令：

```bash
npm test
npx tsc --noEmit
```

用例：

- CodeMirror transaction 转 `Utf16TextPatchDto`。
- 多 change transaction 顺序和 range 正确。
- IME composition batching。
- ack 后 confirmed revision 推进。
- out-of-order ack 不跳跃确认。
- revision mismatch 触发 resync。
- resync 后可重放安全 pending patch。
- pending queue full 进入 backpressure。
- `flushPendingPatches()` 成功/超时/失败。
- Source Core dirty selector。
- 保存期间新输入保持 dirty。
- Source Core save 不调用 `getMarkdown()` mock。
- legacy WYSIWYG save 仍调用旧路径并通过既有测试。

### 3. Tauri/Protocol 测试

范围：

- IPC command 注册。
- DTO schema parity。
- error envelope。
- protocol version。

用例：

- `open_document` 返回 session/revision/text/outline/stats/capabilities。
- `apply_text_patch` stale revision 返回 `REVISION_MISMATCH`。
- `apply_text_patch` invalid range 返回 `INVALID_RANGE`。
- `save_document` pending 未 flush 时等待或返回明确错误。
- `save_document` conflict 返回 `CONFLICT` 且不写盘。
- `close_document` 后 session 不可访问。
- 前端 TS DTO 与 Rust DTO 字段一致。

### 4. E2E 验证

命令：

```bash
npm run build
npm run tauri dev
npm run e2e
```

若项目没有统一 e2e 命令，M3 change 必须记录实际执行命令和原因。

场景：

- 打开普通 fixture，切 Source，输入，保存，重启/重载后内容一致。
- Source Mode 打开 -> 不编辑 -> 保存，磁盘 byte-for-byte 一致。
- Source Mode 小编辑 -> 保存，未触及区域 byte-for-byte 一致。
- CRLF fixture 保存后仍 CRLF。
- Mixed EOL fixture 未触及行 EOL 不变。
- UTF-8 BOM fixture 保存后仍有 BOM。
- FrontMatter/HTML Comment fixture 保存不丢失。
- 中文、emoji、combining mark 输入后 selection 不错位。
- pending patch 未确认时点击保存，保存等待 flush 或明确失败。
- Runtime 返回 revision mismatch 时自动 resync。
- 外部修改 clean 状态下自动/手动 reload。
- 外部修改 dirty 状态下出现 conflict。
- 同一路径两个窗口分别编辑，后保存者冲突。
- WYSIWYG legacy 打开、编辑、保存仍正常。

### 5. Performance / Benchmark

M3 必须使用 native Tauri IPC 重测 M0 的模拟结论，不能只引用 spike。

目标场景：

- 1MB open + initial text transport。
- 10MB patch ack p95。
- 10MB 连续输入 500 次 p95/p99。
- 50MB first transport peak memory。
- 50MB resync path peak memory。
- Large/Huge 保存峰值内存和全文副本数。

记录文件：

```text
openspec/changes/<m3-change>/reports/m3-native-ipc-benchmark.md
```

报告必须包含：

- commit sha。
- OS/CPU/RAM。
- debug/release。
- fixture 名称和大小。
- 命令。
- p50/p95/p99。
- peak RSS。
- 传输策略。
- 是否达到 M0 冻结预算；若未达到，给出设计调整或更新 ADR。

### 6. Regression Gate

必须通过：

```bash
npm test
npx tsc --noEmit
cargo test -p markflow-core
cargo test -p markflow-runtime
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

必须人工或自动确认：

- 保存按钮。
- Ctrl+S。
- 自动保存。
- 窗口关闭未保存提示。
- 文件树打开不同文件。
- 外部修改 watcher。
- read-only Source Mode。
- WYSIWYG legacy save。

### 7. Release / Archive Gate

归档前：

1. 更新主 spec 或执行 `openspec-sync-specs`。
2. 派独立 agent 复核。
3. 运行：

```bash
npx openspec validate --all
bash scripts/check-archive-synced.sh
```

4. 确认 `feature-migration-matrix.md` 中 M3 项有测试记录。
5. 确认所有阻塞 review findings 已解决。

## 交付物

- Runtime session registry 和 Host save workflow。
- Tauri Core Bridge commands。
- Versioned Bridge DTO 与 TS 类型/schema 校验。
- Core-backed open/save commands。
- Source Mode optimistic patch、batching、ack/resync/flush 状态机。
- Source Mode confirmed snapshot 保存链路。
- stats/outline 从 Core 获取的基础路径。
- FileIdentity 外部修改与保存冲突路径。
- Large/Huge Source Mode 状态。
- Native Tauri IPC benchmark 报告。
- M3 独立复核报告。
- feature migration matrix 更新。

## 验收标准

- Source Mode 编辑并保存不调用 ProseMirror `getMarkdown()`。
- Source Mode 常规输入不传整篇 Markdown，只发送 patch。
- Source Mode 保存内容只来自 Core confirmed snapshot。
- CRLF、BOM、尾空行、FrontMatter、HTML Comment 保存后保持。
- Source Mode 打开 -> 不编辑 -> 保存，文件 byte-for-byte 一致。
- Source Mode 小编辑后，未触及区域 byte-for-byte 一致。
- 超过 1MB 的文档可打开、输入、保存，且不会触发 ProseMirror serializer。
- 10MB 文档 patch ack 和输入提交达到 M0 冻结的 p95 预算，或有更新 ADR 记录。
- 50MB 首次传输的峰值内存和全文副本数达到 M0 冻结预算，或有更新 ADR 记录。
- pending patch 未确认时保存会等待或明确失败，不会写入旧 Core revision。
- revision mismatch 可自动 resync；失败时不丢失或静默覆盖内容。
- 中文、emoji、combining mark、CRLF/Mixed EOL 的 selection 和 patch 不错位。
- 保存冲突检测仍可触发。
- 外部修改 clean 状态下可重新加载。
- 同一路径两个窗口独立编辑时，后保存窗口触发冲突而不是覆盖。
- WYSIWYG 旧路径仍可正常使用，作为兼容模式。
- Core/Runtime/Tauri/Frontend 自动化测试与 M3 E2E gate 通过。
- 独立 agent 复核无阻塞问题。

## M3 完成度复核查验清单

以下清单基于 2026-07-29 M3 完成度复核结果，记录各项验收状态：

### Rust Core 代码质量

- [x] testing 模块 `#[cfg(feature = "testing")]` 门控
- [x] 移除 blanket `#![allow(dead_code)]`，改用逐个标注
- [x] 删除 `tests/lossless.rs` 中死代码 `block_kinds`
- [x] OriginalSnapshot 字段私有化 + getter
- [x] scanner/heading/list/table/incremental 内部辅助改为 `pub(crate)`
- [x] text_buffer `validate_range` / `is_char_boundary` 改为 `pub(crate)`
- [x] session.rs `expect()` 封装为 `read_cache()` / `write_cache()`
- [x] scanner.rs `expect("checked by caller")` 添加 debug_assert 前置
- [x] scanner.rs `unreachable!()` 替换为安全 fallback
- [x] ID 类型提取到 `src/document/types.rs`
- [x] `incremental.rs` 重命名为 `update.rs`
- [x] `line_index.rs` 独立测试（至少 3 个新测试）
- [x] `text_buffer.rs` 扩展测试（至少 4 个新测试）
- [x] Benchmark 文件重命名为描述性名称
- [x] `fixtures/m3/` 删除，`fixtures/size/` 建立
- [x] `examples/lossless/` 和 `examples/m3/` 空目录删除
- [x] CI 中添加 markflow-core 独立 `cargo test` 步骤
- [x] CI 中添加 markflow-core `cargo clippy` 步骤
- [ ] `scanner.rs` 拆分（P2，本次未处理）

### Tauri Backend 代码质量

- [x] 删除 `document_service.rs` 和 `lib.rs` 导出
- [x] 删除 `ErrorDto`
- [x] 删除 11 个死代码 `AppError` 构造器
- [x] 删除 state.rs `consume_close_permission` / `cleanup_close_permission`
- [x] `FRONTEND_TXN_MAP.lock().expect()` 改为 `error::lock_mutex()?`
- [x] `snapshot.lock().unwrap()` 改为 `error::lock_mutex()`
- [x] `normalize_lexical` 提取到 `paths.rs`
- [x] MockHost 提取到 tests/common/
- [x] `AppHost::compare_and_atomic_write` 添加单元测试
- [ ] 5 个导出命令统一为 `save_export`（P2，本次未处理）

### TypeScript 前端

- [x] `contextMenu.ts` 错误使用 `reportUserActionError`
- [x] `newFileDialog.ts` 添加 `logException`
- [x] `codemirror-languages.ts` 添加 `logDebug`
- [x] 删除 `hideContextMenu()` 死代码
- [ ] `exportTheme.ts` 拆分（P2）
- [ ] `fileTree.core.ts` 拆分（P2）
- [ ] 测试文件移到 `__tests__/`（P2）
- [ ] `docxExport.ts` any 类型替换（P2）

### 文档审查

- [x] `technical-plan.md` — 更新文件引用
- [ ] `product-plan.md` — 待检查是否需要更新
- [ ] `feature-migration-matrix.md` — 待精确化 M3 条目
- [x] `m3-core-backed-source-mode.md` — 添加验收检查清单（本清单）
- [ ] legacy specs（architecture.md, technical-design.md）— 待审查标记
- [ ] spec 碎片化评估 — 待完成

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| CodeMirror UTF-16 offset 与 Core byte offset 不一致 | IPC 显式使用 UTF-16 range，Runtime 通过 `PositionMap` 转换，建立 Unicode property/unit/e2e 测试 |
| 保存路径双轨导致状态混乱 | 明确 Source Mode 新路径、WYSIWYG legacy 路径，状态栏显示 active engine，保存入口按 engine 分派 |
| 外部修改比较复杂 | mtime/size 快速判断 + content fingerprint/FileIdentity 最终确认 |
| 高频 IPC 影响输入 | optimistic mirror、小 patch、frame/composition batching、backpressure、native Tauri IPC p95 benchmark |
| pending patch 与保存竞态 | flush barrier + target revision + persisted revision 精确更新 |
| Runtime 锁导致 UI 卡顿 | session 级锁，锁内只做短临界区，不跨 await/IO |
| Huge 文档 resync 复制过多 | M3 benchmark 决定 snapshot/delta/channel 策略，超预算则禁止启用对应路径 |
| Source/WYSIWYG 切换污染 Core session | 切换前 flush，legacy serializer 只能作为 legacy 视图输入，不能覆盖 Core confirmed snapshot |
| 资源图片 legacy 迁移破坏 Source 保存真相 | M3 明确兼容限制；完整资源事务放到 M6/M7，禁止前端改写 Markdown 后直接冒充 Core 保存 |
| 错误 fallback 写入旧内容 | 所有错误路径禁止 `getMarkdown()` fallback；save failure 保持 dirty 并显示可恢复错误 |

## 退出条件

M3 只有在以下条件全部满足时才能进入 M4：

- Source Mode open/edit/save 主路径已由 Core session 承担。
- Source Mode 保存链路静态和测试均证明不经过 ProseMirror serializer。
- Runtime save workflow 已具备 FileIdentity conflict gate。
- M1/M2 保真 fixture 在 Source Mode 产品路径中通过。
- Large/Huge Source Mode 具有可测降级状态和 benchmark 记录。
- WYSIWYG legacy 路径无回归。
- 独立复核报告结论为通过或所有阻塞项已解决。
- OpenSpec / docs / migration matrix 已同步。
