# markflow-runtime Specification

## Purpose
定义 Runtime session registry、保存编排、文件身份冲突检测和 Runtime 职责边界，使 Core 文档能力通过可测试的 Host port 接入产品路径。

## Requirements

### Requirement: SessionRegistry 管理 session 生命周期

系统 SHALL 提供 `SessionRegistry` 管理所有活跃的 Core session，支持创建、查找、关闭 session，以及按文档路径索引多 session。

#### Scenario: 创建 session 并分配唯一 id

- **WHEN** `SessionRegistry::create(client_id, window_label, source)` 调用
- **THEN** 返回一个唯一的 `SessionId`
- **THEN** session 可被 `get(SessionId)` 检索

#### Scenario: 关闭 session 后不可访问

- **WHEN** `SessionRegistry::close(session_id)` 调用
- **THEN** session 从 registry 中移除
- **THEN** 后续对该 session 的操作返回 `SESSION_NOT_FOUND`

#### Scenario: 同路径多窗口有独立 session

- **WHEN** 两个窗口打开同一文件路径
- **THEN** 每个窗口获得独立的 `SessionId` 和 `SessionHandle`
- **THEN** 两个 session 互不阻塞

#### Scenario: 每 session 独立锁不阻塞其他 session

- **WHEN** session A 正在执行耗时操作（锁内）
- **THEN** session B 的读写操作不受影响

### Requirement: Runtime 编排保存流程

Runtime SHALL 编排保存流程（flush → SavePayload → compare identity → atomic write → mark persisted）。`save_in_progress` 使用 `SaveLease` RAII 管理。同路径保存经 `PathSaveCoordinator` 串行化。Host/Tauri 只负责文件身份校验和原子写入。

#### Scenario: 保存流程使用 Core SavePayload

- **WHEN** `save_document(session_id)` 被调用
- **THEN** Runtime 先 flush pending patch
- **THEN** 从 Core 获取 `SavePayload(revision)`
- **THEN** Runtime 请求 Host 比较 expected FileIdentity
- **THEN** Host 执行 temp write + sync + atomic replace
- **THEN** Runtime 更新 `persisted_revision` 和 `file_identity`
- **THEN** Host write 失败不更新 `persisted_revision`

#### Scenario: Host write 失败 RAII 清理

- **WHEN** Host atomic write 失败
- **THEN** `SaveLease` 析构
- **THEN** `save_in_progress` 恢复为 false
- **THEN** `persisted_revision` 保持不变
- **THEN** dirty 状态保持 true
- **THEN** 可再次调用 save_document

### Requirement: FileIdentity 冲突检测

Runtime SHALL 在保存前使用 `FileIdentity` 检测外部修改和冲突。

#### Scenario: FileIdentity mismatch 返回 CONFLICT

- **WHEN** `save_document` 调用时文件的 mtime/size/fingerprint 与 `persisted_identity` 不匹配
- **THEN** 返回 `CONFLICT` 错误
- **THEN** 不写入磁盘

#### Scenario: clean 状态外部修改允许 reload

- **WHEN** 文件未被编辑且外部修改检测到
- **THEN** 允许 `reload_document` 更新 Core session 和 CodeMirror

#### Scenario: dirty 状态外部修改阻止自动 reload

- **WHEN** 文件有未保存编辑且外部修改检测到
- **THEN** 阻止自动 reload
- **THEN** 保存时返回 `CONFLICT`

### Requirement: Runtime 职责约束

Runtime SHALL 不实现 Markdown 语法，只编排 session 和 Host side effects。

#### Scenario: Runtime 不直接处理 Markdown

- **WHEN** Runtime 处理数据
- **THEN** 所有 Markdown 语义操作委托给 Core
- **THEN** Runtime 只负责 session、保存、冲突判断的编排

### Requirement: DocumentService 负责编排

Runtime SHALL 提供 `DocumentService` 作为统一入口，封装 session 管理、保存编排、reload、flush 和 close 的业务逻辑。Bridge commands 委托给 `DocumentService`。

#### Scenario: DocumentService 可独立测试

- **WHEN** `DocumentService::save_document(session_id)` 调用
- **THEN** 内部执行 flush → SavePayload → compare identity → atomic write → mark persisted 流程
- **THEN** 所有 Host 交互通过 trait 抽象（可 mock）
- **THEN** DocumentService 可在纯 Rust 测试中验证

### Requirement: RAII SaveLease

保存操作 SHALL 使用 `SaveLease` RAII token 管理 `save_in_progress` 状态。`SaveLease` 析构时自动清理。

#### Scenario: SaveLease 自动释放

- **WHEN** 保存成功
- **THEN** `SaveLease` 在作用域结束时析构
- **THEN** `save_in_progress = false`

#### Scenario: SaveLease 在 panic 路径释放

- **WHEN** 保存过程中 panic
- **THEN** `SaveLease` 在栈展开时析构
- **THEN** `save_in_progress = false`
- **THEN** session 保持可用

### Requirement: PathSaveCoordinator 串行化同路径保存

Runtime SHALL 提供 `PathSaveCoordinator`，对同一 canonical path 的保存操作做串行化。

#### Scenario: 双 session 同路径保存

- **WHEN** session A 和 session B 同时保存同文件
- **THEN** `PathSaveCoordinator` 串行化两者
- **THEN** 先保存者成功
- **THEN** 后保存者因 identity 变化返回 CONFLICT

### Requirement: reload 经 host 读文件

`reload_document` SHALL 经 Host trait 真正从磁盘读取文件。读取 IO 在 session lock 外进行。

#### Scenario: reload 流程

- **WHEN** `reload_document(session_id)` 调用
- **THEN** 首先检查 session 是否 clean
- **THEN** 在 session lock 外调用 `host.read_document_bytes(path)`
- **THEN** 重新获取 session lock
- **THEN** 再次确认 session 仍 clean
- **THEN** 用读取内容创建新 Core state
- **THEN** 返回新 revision 和文本

### Requirement: 全局 Mutex 已移除（不变式）

SessionRegistry SHALL 使用 DashMap + per-session `Arc<Mutex<DocumentRuntimeState>>` 提供并发安全。最外层无全局 Mutex。

#### Scenario: 并发读写不阻塞

- **WHEN** Session A 正持 per-session lock 执行操作
- **THEN** Session B 的读写不受影响
- **THEN** registry 查询（如 get）不阻塞

### Requirement: Runtime owns Host workflow lifecycle

Runtime SHALL own session, save, asset, export, and Host task lifecycle, including request id allocation, cancellation, timeout, stale result rejection, and Host error mapping. Host SHALL only execute platform side effects and SHALL NOT own Core revision, dirty state, Markdown generation, history, active editor state, active file path, or fallback policy.

#### Scenario: Host does not mutate Core revision

- **WHEN** Host completes a file, render, network, asset, or export side effect
- **THEN** Runtime validates the result identity before applying any workflow outcome
- **THEN** Host does not directly update Core revision or session dirty state

#### Scenario: Runtime rejects stale Host result

- **WHEN** a Host result arrives after the session was closed or advanced beyond the request revision
- **THEN** Runtime drops the result or returns `HOST_STALE_SESSION` / `HOST_STALE_REVISION`
- **THEN** no stale result is applied to another session or window

### Requirement: Runtime Host port boundary

Runtime SHALL define Host port traits or equivalent modules for file system, clipboard, dialogs, windows, notifications, shell, network, render, and export side effects. Each Host operation SHALL accept a Host request context and return stable Host results or Host errors.

#### Scenario: File write uses Host context

- **WHEN** Runtime saves a document through the Host file system port
- **THEN** the Host request includes the target session, document identity, base revision, request id, and `file_system` capability
- **THEN** the existing FileIdentity, SaveLease, atomic write, and conflict gate semantics are preserved

#### Scenario: Export uses Host context

- **WHEN** Runtime starts an export job
- **THEN** the Host export port receives Export IR-rendered input or output request bound to the initiating session and revision
- **THEN** Host does not read editor DOM or active window content as document truth

#### Scenario: Window close cancels routed window tasks

- **WHEN** a window close is confirmed or the window is destroyed
- **THEN** Runtime/AppState cancels Host window tasks bound to that `window_label`
- **THEN** later UI side effects validate request/window/session identity before showing completion state

#### Scenario: OS notifications remain explicit when unsupported

- **WHEN** a workflow wants an OS-level notification before a Tauri notification capability/plugin exists
- **THEN** the Host `notifications` capability remains `not_configured`
- **THEN** regular frontend toast routing stays in App Service and does not claim OS notification support

#### Scenario: Shell open validates explicit target range

- **WHEN** UI opens a path or URL through the Host `shell` port
- **THEN** the request carries a `shell` Host context with explicit `window_label`
- **THEN** empty targets, relative paths, and unsafe URL schemes are rejected before calling the platform shell
- **THEN** Host does not infer a target from active window, active path, or selection

#### Scenario: Network image fetch is session and revision bound

- **WHEN** UI fetches or downloads a remote image
- **THEN** the Host `network` request carries `request_id`, `session_id`, `document_id`, and `base_revision`
- **THEN** SSRF, redirect, MIME, magic-byte, response-size, timeout, and concurrency gates run before bytes are returned or written
- **THEN** workflows without an active Core session fail with a stable stale-session style error instead of using active window/path state

#### Scenario: Render IR is bound to Host render context

- **WHEN** UI requests viewport-scoped render blocks for Core-backed WYSIWYG
- **THEN** the Host `render` context carries `request_id`, `session_id`, and `base_revision`
- **THEN** stale revisions and unknown sessions are rejected before rendering output is applied
- **THEN** legacy ProseMirror diagram DOM rendering remains documented until removed by the follow-up migration

#### Scenario: Export output is bound to Host export context

- **WHEN** HTML, PDF, print, or DOCX output is produced from a Core Export IR snapshot
- **THEN** the platform output request carries Host `export` context with `request_id`, `window_label`, `session_id`, `document_id`, and `base_revision`
- **THEN** Host output does not read active editor DOM, active path, active selection, or current window content as document truth
- **THEN** legacy DOM export fallback is only used when there is no active Core session and remains documented as a fallback

#### Scenario: Export failure codes remain stable

- **WHEN** export is cancelled, stale, unsupported, permission denied, timed out, or fails while writing
- **THEN** Host/Bridge tests preserve stable export failure codes for frontend mapping

### Requirement: Same-path multi-session conflict through Host harness

Runtime Host tests SHALL cover two sessions opened on the same path and verify that save/resource/export results remain session-isolated.

#### Scenario: Same-path save conflict remains isolated

- **WHEN** two sessions are opened for the same file path with different identity states
- **WHEN** one session saves successfully
- **THEN** the other session's save detects conflict
- **THEN** Runtime does not overwrite the file or mark the second session clean

#### Scenario: Same-path export remains bound to initiating session

- **WHEN** session A starts export for a path also open in session B
- **WHEN** the active window switches to session B before export completes
- **THEN** Runtime keeps the export result bound to session A
- **THEN** Host does not read session B path, DOM, or selection

### Requirement: Runtime non-Tauri harness reuses session lifecycle

The non-Tauri harness SHALL use Runtime session registry and workflow boundaries for open/save/search/diagnostics/export tests. It SHALL NOT bypass session lifecycle by directly invoking Core for workflows that require Host identity or side effects.

#### Scenario: Harness open creates Runtime session

- **WHEN** the harness opens a file
- **THEN** it creates a Runtime session with FileIdentity and DocumentSource
- **THEN** subsequent search, diagnostics, save, and export operations target that session id

#### Scenario: Harness export uses confirmed revision

- **WHEN** the harness exports HTML
- **THEN** Runtime captures a confirmed revision for the session
- **THEN** Export IR and rendered output are tied to that revision

## Document Service

### Purpose
定义 Runtime DocumentService 层的职责：从 core_bridge.rs 提取可独立测试的服务层，修复 save_in_progress 残留，实现真实 reload 路径。

### Requirements

#### Requirement: DocumentService 独立层

Core Bridge 命令 SHALL 仅做反序列化、权限上下文和错误封装。业务规则（session 管理、保存编排、reload）进入 `DocumentService`。

##### Scenario: 命令只做薄封装

- **WHEN** 前端调用 `save_document` Tauri command
- **THEN** command 仅验证参数和权限
- **THEN** 委托 `DocumentService::save_document(session_id)` 执行
- **THEN** command 封装结果为响应
- **THEN** DocumentService 可被独立测试（不依赖 Tauri 运行时）

#### Requirement: save_in_progress 使用 RAII

保存操作 SHALL 使用 RAII token（`SaveLease`）标记进行中的保存。释放时自动清理 save_in_progress 状态，不论成功或失败。

##### Scenario: 成功路径清理 token

- **WHEN** `save_document` 成功
- **THEN** `SaveLease` 在作用域结束时析构
- **THEN** `save_in_progress` 自动恢复为 false

##### Scenario: 失败路径清理 token

- **WHEN** `save_document` 在 Core 阶段失败
- **THEN** `SaveLease` 析构
- **THEN** `save_in_progress` 恢复为 false

##### Scenario: 写入阶段 Host 失败

- **WHEN** `save_document` 的 atomic write 阶段失败
- **THEN** `SaveLease` 析构
- **THEN** `persisted_revision` 不更新

#### Requirement: 真实 reload 路径

`reload_document` SHALL 经 Host 真正从磁盘读取文件。读取 IO 在 session lock 外进行。

##### Scenario: reload 从磁盘读取

- **WHEN** `reload_document(session_id)` 调用
- **THEN** Host 执行 `read_document_bytes(path)` 读取文件
- **THEN** 验证 session 在 IO 完成后仍存在且 clean
- **THEN** 用读取内容创建新的 Core state

##### Scenario: dirty 状态阻止 reload

- **WHEN** session 有未保存修改
- **WHEN** `reload_document` 调用
- **THEN** 返回 `TRANSACTION_CONFLICT` 错误
- **THEN** 不替换 Core state

#### Requirement: 返回真实 document id 和 outline

`open_document` SHALL 返回唯一 document id（非固定值）和由 Core 计算的实际 outline 与统计信息。

##### Scenario: open 返回非零 document id

- **WHEN** `open_document(path)` 调用
- **THEN** 返回的 `DocumentOpened` 包含非零的 `documentId`
- **THEN** 不同文件返回不同 document id

##### Scenario: outline 来自 Core parse

- **WHEN** `open_document` 打开含标题的文档
- **THEN** `DocumentOpened.outline` 包含由 Core parse_index 提取的标题节点

## Save Integrity

### Purpose
定义保存完整性保障：RAII SaveLease、per-path save coordinator、全内容 fingerprint、同目录原子替换。

### Requirements

#### Requirement: per-path SaveCoordinator

系统 SHALL 提供 `PathSaveCoordinator`，对同一 canonical path 的保存操作做串行化。完整的保存原子单元为：compare identity → temp write + fsync → rename → 发布新 identity。

##### Scenario: 同路径并发保存串行化

- **WHEN** 两个 session 同时保存同一路径
- **THEN** `PathSaveCoordinator` 串行化两个保存操作
- **THEN** 先到者执行完整的保存原子单元
- **THEN** 后到者执行 identity 比对
- **WHEN** 后到者的 identity 因先到者完成而失效
- **THEN** 后到者返回 `CONFLICT` 错误

#### Requirement: 全内容 fingerprint

最终冲突判断 SHALL 使用全内容 SHA-256 fingerprint。size + mtime 作为快速预检（fast path），仅在预检不匹配时回退到全内容 checksum。

##### Scenario: size+mtime 匹配跳过 checksum

- **WHEN** 保存前 `host.stat_identity()` 返回的 size+mtime 与 `opened_identity` 完全匹配
- **THEN** 跳过全内容 fingerprint 计算

##### Scenario: size+mtime 不匹配触发 checksum

- **WHEN** 保存前 size 或 mtime 不匹配
- **THEN** Runtime 计算当前文件的 SHA-256 fingerprint
- **WHEN** fingerprint 与 opened_identity 一致
- **THEN** 允许保存
- **WHEN** fingerprint 不一致
- **THEN** 返回 `CONFLICT` 错误

#### Requirement: 同目录原子替换

保存的 atomic write SHALL 使用临时文件 + rename 模式，临时文件与目标保持同目录。

##### Scenario: 临时文件在同目录

- **WHEN** 执行 atomic write
- **THEN** 临时文件创建在与目标文件相同的目录
- **THEN** 写入内容后执行 fsync
- **THEN** 通过 `std::fs::rename` 实现原子替换

#### Requirement: Save As 通过 Runtime 权威路径

Save As 操作 SHALL 创建新的 Core session 并通过 `save_document` 执行写入。

##### Scenario: Save As 创建新 session

- **WHEN** 用户在 Core Source 模式执行 Save As
- **THEN** 系统创建一个指向新路径的 Core session
- **THEN** 将当前 Core confirmed text 作为新 session 内容
- **THEN** 在新 session 上调用 `save_document`
- **THEN** 全程不调用 getMarkdown()/ProseMirror serializer
