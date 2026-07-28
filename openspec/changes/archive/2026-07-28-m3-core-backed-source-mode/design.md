# M3: Core-backed Source Mode — Design

## Context

截至 M3 设计时，Source Mode 编辑后保存仍依赖前端 Markdown serializer（`getMarkdown()`），未接入 `markflow-core` 的 `DocumentSession`。产品路径如下：

- Source Mode：`src/lib/editor.source.ts` 创建 CodeMirror 6，`updateListener` 回调整篇 doc 字符串。
- 保存入口：`saveActiveDocument()` 调用 `getMarkdown()` 获取整篇 Markdown，再经 `preparePendingImagesForSave()` 和 `writeFile()` 写盘。
- 模式切换：`switchToSource()`/`switchToWysiwyg()` 通过 ProseMirror serializer / 文本回写完成视图切换。
- Core 基础：`markflow-core` 已有 `DocumentSession`、`TextPatch`、`PositionMap`、`ParseIndex`、`save_payload()` 和 lossless/patch/position 测试，但从未在产品路径中运行。

M3 的目标是首次把 Core 接入用户路径——让 Source Mode 的 open/edit/save 由 Core session 承担，保存内容只来自 Core confirmed snapshot，以此建立一条可验证、可回退、可继续扩展到 M4-M8 的 Core-backed 文档主路径。

设计约束：

- Core 不依赖 Tauri、DOM、CodeMirror、ProseMirror、文件系统。
- Runtime 不实现 Markdown 语法，只编排 session 和 Host side effects。
- 所有跨层 range 都必须绑定 revision 和坐标单位。
- WYSIWYG legacy 路径继续可用，与 Source Mode 新路径明确隔离，通过 `activeEngine` 分派。

---

## Goals / Non-Goals

### Goals

- **Source Mode open/edit/save 主路径由 Core session 承担** — 用户在 Source Mode 下打开、编辑、保存文件时，内容真相由 Core `DocumentSession` 维护，不再依赖前端 serializer。
- **Source Mode 保存内容只来自 Core confirmed snapshot** — `save_document` 命令输出 `SavePayload` 的 bytes，禁止在任何分支中调用 `getMarkdown()` 作为保存内容。
- **分层架构可继续扩展到 M4-M8** — Runtime session registry、Bridge protocol、Patch adapter 的设计必须预留扩展点，使后续阶段（WYSIWYG backend、Core History、toolbar commands、resources）可以在此基础上增量搭建。

### Non-Goals

- **不替换 ProseMirror WYSIWYG 主体验** — WYSIWYG 仍可继续用 legacy open/save；M3 只改变 Source Mode 路径。
- **不实现 Core History** — Source Mode 暂用 CodeMirror history，Core 只确认文本 revision，不做 operation undo/redo。
- **不迁移 toolbar 格式命令到 Core** — 这属于 M6。
- **不删除 `getMarkdown()`、`write_file` 等 legacy API** — 但 Source Mode 保存不得调用它们。Legacy 路径继续保留作为 WYSIWYG 兼容模式和回退手段。
- **不实现多窗口实时合并** — 同一路径多窗口以独立 session + 保存冲突处理，不做 OT/CRDT。

---

## Decisions

### 1. 分层职责分配：Core / Runtime / Bridge / Adapter

**决策**：四层严格分层，每层只负责自己的关注点，不允许越层依赖。

```
CodeMirror Source View          ← 用户输入、选区、乐观镜像
  |
Editor Adapter (sourceSyncAdapter.ts)
  |  ← transaction → patch, batching, ack/resync/flush
Tauri Bridge (IPC commands)
  |  ← DTO envelope, versioning, error mapping
markflow-runtime (Rust crate)
  |  ← SessionRegistry, save workflow, FileIdentity
markflow-core
  |  ← DocumentSession, TextPatch, PositionMap, ParseIndex
Host/Tauri file adapter         ← read/write bytes, stat identity
```

**理由**：

- Core 保持纯文档内核，无平台依赖。这是不可妥协的架构约束——如果 Core 依赖 Tauri 或 DOM，将无法独立测试、无法在非 Tauri 环境中复用，且会拉高后续所有阶段的开发成本。
- Runtime 作为编排层，不实现 Markdown 语法。它只管理 session 生命周期、保存工作流、外部修改检测。这使得 Runtime 的职责边界清晰，测试时可以用 mock Host 替换文件系统。
- Bridge 只做 DTO 解包/打包，不包含业务逻辑。Tauri command handler 只是薄 adapter，转发到 Runtime 方法。这是为了保持命令可独立测试、不依赖 Tauri runtime。
- Adapter 层承担 CodeMirror 与 Core 之间的阻抗匹配——transaction 转 patch、乐观镜像确认、批量化、重试/resync。将这部分逻辑留在前端而非后端的理由是：前端持有 CodeMirror 实例，是最自然观察 transaction 和 composition 的位置；后端只维护文本真相，不关心输入事件语义。

**替代方案考量**：将 adapter 逻辑放在 Runtime（patch 在前端生成后直接透传，adapter 在后端做 ack/resync 编排）。拒绝理由：后端无法直接观察 CodeMirror 的 transaction 语义和 composition 状态，将 adapter 放在后端会引入额外的 IPC 往返来同步状态，增加复杂度和延迟。

### 2. Session Registry 并发策略：DashMap + per-session Mutex

**决策**：使用 `DashMap<SessionId, Arc<SessionHandle>>`，`SessionHandle.inner` 使用标准 `Mutex<DocumentRuntimeState>`，锁内不做跨 `await` 或磁盘 IO。

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
```

**理由**：

- DashMap 提供无锁并发读，适合高频的 `session_id → handle` 查找（每次 patch 都需要查找 session）。
- per-session Mutex 确保一个 session 的操作（apply patch、save）不会阻塞其他 session。如果使用全局锁，一个 session 的 save 等待 Host compare 会阻塞所有其他 session 的 patch 操作。
- 锁内临界区只包含：读取/更新 revision、分配 id、检查 FileIdentity。锁内不执行 IPC await、磁盘 IO、大文件 hash——这些操作在锁外完成，结果返回后再加锁更新状态。
- session 绑定 `client_id` 与 `window_label`，窗口关闭时只清理本窗口 session，不影响其他窗口。

**替代方案考量**：使用 `tokio::sync::Mutex` 允许在锁内 wait。拒绝理由：`tokio::sync::Mutex` 的持有者可以跨 await，但容易导致无意识的长锁持有；`std::sync::Mutex` 强制开发者把 IO 等阻塞操作移出临界区，更符合「锁内只做短操作」的纪律。Runtime 是同步编排层，不需要异步锁。

### 3. UTF-16 Patch 传输约定

**决策**：IPC 全程使用 UTF-16 range（`{from: number, to: number, insert: string}`），Runtime 在收到 patch 后通过 Core `PositionMap` 将 UTF-16 range 转换为 Core 内部使用的 UTF-8 byte range，再调用 `DocumentSession::apply_patch`。

**理由**：

- CodeMirror 的 `ChangeSet` 使用 JavaScript 字符串索引，即 UTF-16 code unit 偏移。直接将 UTF-16 偏移传递给 Core 会因多字节字符（尤其是 emoji、combining marks、CJK）导致偏移错误。
- 在 Runtime（Rust）侧做转换，而非在前端侧预先转换，因为前端侧没有 Core 的 `PositionMap`（PositionMap 随 Core session 维护，包含完整的 UTF-8↔UTF-16 映射信息）。
- `baseRevision` 绑定在 patch 中，Runtime 在转换前先校验 `baseRevision == session.confirmed_revision`，否则返回 `REVISION_MISMATCH`，避免使用过期映射。
- 转换失败（如非法的 UTF-16 surrogate pair 或超出文档边界）返回 `INVALID_UTF16_BOUNDARY` 或 `INVALID_RANGE`，不修改 session 状态。

**替代方案考量**：在前端将 UTF-16 转换为 UTF-8 byte offset 再发送。拒绝理由：前端没有 Core 的 PositionMap，需要维护一份镜像映射或依赖额外库（如 `TextEncoder`），增加了前端复杂度和不一致风险。转换在 Runtime 侧进行，PositonMap 是 Core `DocumentSession` 的天然能力，无需重复实现。

### 4. Flush Barrier + Target Revision 保存

**决策**：保存流程为 `flush pending → capture target_revision → Host compare → atomic write → mark persisted_revision = target_revision`。

```
save_document(session_id)
  → flush pending patches (await all pending transactions confirmed)
  → lock session, capture target_revision = confirmed_revision
  → Core: save_payload() → bytes + SavePayload { revision: target_revision }
  → unlock session
  → Host: compare expected FileIdentity → temp write + fsync + atomic replace
  → lock session, update persisted_revision = target_revision, persisted_identity
  → unlock session
  → return SaveResult { revision, fileIdentity }
```

**理由**：

- Flush barrier 保证保存前所有已发送的 patch 都被 Core 确认，避免保存内容落后于用户已输入的内容。
- `target_revision = confirmed_revision_after_flush` 确保保存只对应一个确定的文本快照。保存期间用户的新输入会推进 `confirmed_revision` 但不会影响 `target_revision`。
- 保存成功后，只标记 `target_revision` 为 `persisted`。如果保存期间 revision 已推进到更高值，则该 session 在保存成功后保持 dirty（`confirmed_revision != persisted_revision`）。
- 保存使用 `SavePayload` 而非 `getMarkdown()`：Core 在 `save_payload()` 中直接输出去掉 parse data 的干净 bytes，不经过任何 serializer。这是保真的核心保证。
- Host 写入失败不更新 `persisted_revision`——session 保持 dirty，用户可以重试保存。

### 5. 乐观 Mirror + Ack 排序

**决策**：CodeMirror 本地收到 transaction 后立即应用到 optimistic mirror，不等待 Core ack。Ack 到达后按 `transactionId` 的发送顺序确认 revision，不跳跃确认。

**理由**：

- 乐观 mirror 保证用户输入后界面无延迟。如果每个字符都等待 IPC roundtrip 再更新视图，输入体验不可接受。这是 CodeMirror 6 的标准实践——`updateListener` 收到 transaction 后立即应用本地，然后决定是否发送给后端。
- Ack 必须按发送顺序确认。如果 Adapter 发送了 transaction A（base r1），然后发送 B（base r1），B 先于 A 被确认（Ack{revision: r2}，Ack{revision: r3}），则 Adapter 必须按 A→B 的顺序推进 `confirmed_revision`，不能因为 B 的 ack 先到就直接跳到 r3 后跳过 A 的 r2。Core 保证 revision 顺序递增，Adapter 通过 `pendingTransactions` 队列维护顺序。
- 相同 `transaction_id` 的重试必须幂等——Core 收到已确认过的 transaction_id 时返回相同的确认结果，不做修改。不同 payload 使用同一 id 必须失败（返回 `TRANSACTION_CONFLICT`），这是为了防止重试导致重复修改。
- 异常处理：Core apply 失败后（revision mismatch，invalid range），optimistic mirror 不能作为保存真相。Adapter 必须回退到 resync，用 Core 的 confirmed text 替换本地内容，重放安全挂起的 patch。

### 6. FileIdentity 冲突判断

**决策**：保存冲突使用二级判断——mtime/size 快速判断 + fingerprint 最终确认。

```rust
pub struct FileIdentity {
    pub canonical_path: Option<PathBuf>,
    pub platform_id: Option<String>,
    pub mtime_ms: Option<u64>,
    pub size: u64,
    pub fingerprint: ContentFingerprint,
}
```

**理由**：

- mtime/size 比较非常快（零拷贝的元数据查询），适合在大多数情况下快速判断文件是否被修改。
- 但 mtime 在以下场景不可靠：跨网络文件系统、某些平台 sub-second mtime 精度不足、同一秒内两次写入。
- 因此 mtime/size 不一致时，需要 fingerprint（文件内容的 sha256/xxhash 前缀）做最终确认。fingerprint 只计算前 N KB 或快速 hash（不做全文件 hash，避免大文件性能问题）。
- 文件首次打开时记录 `opened_identity`，每次保存成功后记录 `persisted_identity`。
- 保存前比较 expected identity（= `persisted_identity` 或 `opened_identity`，取决于是否有已成功保存）。不一致则返回 `CONFLICT`，不写盘。
- Clean session（`confirmed_revision == persisted_revision`）允许外部修改 reload。Dirty session 遇到外部修改阻止自动 reload，保存时必然 conflict。

### 7. 双轨隔离：activeEngine 分派

**决策**：通过 `activeEngine` 枚举区分 Source Mode Core-backed 路径和 WYSIWYG legacy 路径，前端全局状态和保存入口据此分派。

```typescript
type ActiveEngine = 'core-source' | 'legacy-wysiwyg';
```

**理由**：

- 两个路径的 open/save/dirty 逻辑完全不同，使用枚举分派比运行时判断 feature flag + session 存在性更清晰可追踪。
- 状态栏显示 active engine，便于开发者/用户在迁移期识别当前使用的路径。
- 保存入口 `saveActiveDocument()` 按 engine 分派：`core-source` 调用 `saveCoreSourceDocument()`（通过 bridge），`legacy-wysiwyg` 走旧路径。
- 模式切换时：
  - WYSIWYG → Source：如果 WYSIWYG dirty，先提示保存或放弃。如果文件还没有 Core session，从磁盘调用 `open_document()` 建立 session。不得将 serializer 输出作为 Core 打开基线。
  - Source → WYSIWYG：必须先 flush Core pending patches（通过 `flush_document` 命令），再把 confirmed text 注入 ProseMirror legacy 视图。flush 失败则阻止切换。
- 这一设计使 M3 可以增量交付：Source Mode 先接入 Core-backed，WYSIWYG 继续 legacy；后续阶段逐步把 WYSIWYG 接到 Core 时，`activeEngine` 可以扩展或切换 default。

---

## Risks / Trade-offs

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
| 未命名文档/空文档首次保存的预期 identity | API 预留 `path: Option<PathBuf>`，空文档保存作为 M3.5/M4 补充 |
| IPC 大文本传输峰值内存 | Huge 文档首次传输使用分块或 stream reference 而非单个 JSON 字符串，决策依赖 M3 benchmark |

---

## Implementation Phases

详见 `docs/markflow-core-stages/m3-core-backed-source-mode.md` 的完整分阶段方案。概要如下：

| Phase | 交付内容 | 关键产出 |
| --- | --- | --- |
| 0 | 变更准备 | OpenSpec change、分支、M0/M1/M2 冰结确认、fixture 列表、migration matrix 占位 |
| 1 | Runtime & Host Port | `markflow-runtime` crate、SessionRegistry、FileIdentity、Host trait、save workflow |
| 2 | Tauri Bridge Commands | open/apply/resync/flush/save/outline/stats/reload/close 命令 |
| 3 | Frontend Bridge Client | `coreBridge.ts`、`coreSession.ts`、`sourceSyncAdapter.ts`、CoreSessionState、feature flag |
| 4 | CodeMirror Patch Adapter | transaction→Utf16TextPatch、batching、ack/resync/flush 状态机 |
| 5 | Open/Save 路径接入 | Source Mode open→`open_document`、save→`save_document`、dirty→revision 计算、引擎分派 |
| 6 | 外部修改与冲突 | FileIdentity conflict、clean reload、dirty conflict、同路径多 session |
| 7 | UI 状态 & 可观测性 | 状态栏 active engine、pending indicator、degradation bar、错误 toast |
| 8 | 测试 & 文档 | Rust/frontend/e2e/protocol/benchmark 测试、复核报告、migration matrix |

---

## 验收标准

- Source Mode 编辑并保存不调用 ProseMirror `getMarkdown()`。
- Source Mode 常规输入不传整篇 Markdown，只发送 patch。
- Source Mode 保存内容只来自 Core confirmed snapshot。
- CRLF、BOM、尾空行、FrontMatter、HTML Comment 保存后 byte-for-byte 保持。
- Large/Huge 文件可打开/保存，不会触发 ProseMirror serializer。
- pending patch 未确认时保存等待或明确失败，不写入旧 revision。
- revision mismatch 可自动 resync，不丢失内容。
- Unicode（中文、emoji、combining marks）selection/patch 不错位。
- 外部修改 clean reload 和 dirty conflict 均可正确触发。
- 同路径两窗口独立编辑，后保存者触发 conflict。
- WYSIWYG legacy 路径无回归。
- 独立 agent 复核无阻塞问题。