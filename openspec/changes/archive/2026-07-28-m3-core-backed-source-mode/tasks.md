## 1. 变更与项目准备

- [x] 1.1 确认 M0/M1/M2 前置条件：markflow-core tests 通过，M2 ParseIndex/LargeDocumentPolicy 已落地
- [x] 1.2 在工作区添加 `markflow-runtime` crate：
  - [x] 创建 `src-tauri/crates/runtime/` 目录
  - [x] 编写 Cargo.toml，依赖 `markflow-core`，可选依赖 `serde`/`thiserror`
  - [x] 在工作区根 Cargo.toml 注册
- [x] 1.3 创建 M3 fixture 目录，添加测试 fixture：
  - [x] CRLF、Mixed EOL、BOM、FrontMatter、HTML Comment fixture
  - [x] 1MB、10MB、50MB 文档 fixture
  - [x] Unicode（中文、emoji、combining mark）fixture
- [x] 1.4 在 `feature-migration-matrix.md` 中添加 M3 项占位

## 2. markflow-runtime 核心模块

- [x] 2.1 实现 `FileIdentity` 和 `DocumentSource`
  - [x] FileIdentity：canonical_path、platform_id（inode）、mtime_ms、size、fingerprint
  - [x] DocumentSource：path（Option）、display_name、source_kind
  - [x] DocumentSourceKind：DiskFile、Untitled（预留）
- [x] 2.2 实现 `SessionHandle` 和 `DocumentRuntimeState`
  - [x] DocumentRuntimeState：core DocumentSession、opened_identity、persisted_revision、persisted_identity
  - [x] save_in_progress：Option<SaveToken>，防止并发保存
  - [x] DocumentCapabilities：标记路径允许的功能
- [x] 2.3 实现 `SessionRegistry`
  - [x] DashMap<SessionId, Arc<SessionHandle>> sessions
  - [x] DashMap<DocumentSourceKey, Vec<SessionId>> path_index
  - [x] create() / get() / close() / list_by_path()
  - [x] 每 session 独立锁，锁内不做跨 await/IO
- [x] 2.4 实现 Host trait
  - [x] read_document_bytes(path) -> Result<(Vec<u8>, FileIdentity)>
  - [x] stat_identity(path) -> Result<FileIdentity>
  - [x] compare_and_atomic_write(path, content, expected_identity) -> Result<FileIdentity>
  - [x] 内部使用 atomic_write（temp write + sync + rename）
- [x] 2.5 实现 save workflow
  - [x] flush pending patch barrier
  - [x] Core SavePayload(revision) 获取
  - [x] Host compare_and_atomic_write
  - [x] 更新 persisted_revision + persisted_identity
  - [x] Host 写入失败不更新 persisted_revision
- [x] 2.6 Core error 映射为 stable runtime error code
  - [x] RevisionMismatch、InvalidRange、InvalidUtf16Boundary、TransactionConflict
  - [x] UnsupportedEncoding、PendingQueueFull、SaveFlushTimeout、Conflict
  - [x] Cancelled、SessionNotFound、ProtocolVersionUnsupported
- [x] 2.7 实现 close/cancel 生命周期（释放 session、取消后台任务、清理 path index）
- [x] 2.8 添加 registry 并发测试

## 3. Tauri Bridge Commands

`- [x] 3.1 实现 `open_document` command
  - [x] DTO 解包 → Runtime create → Core DocumentSession::open_bytes
  - [x] parse_index/stats/size_class 计算 → DocumentOpened DTO
- [x] 3.2 实现 `apply_text_patch` command
  - [x] 接收 Utf16TextPatchDto → Runtime UTF-16 → Core byte range → DocumentSession::apply_patch
  - [x] ApplyPatchAck DTO 返回
- [x] 3.3 实现 `save_document` command（编排 flush → identity compare → atomic write）
- [x] 3.4 实现 `resync_document` command（confirmed snapshot 返回）
- [x] 3.5 实现 `flush_document` command（pending patch barrier）
- [x] 3.6 实现 `get_document_text`、`get_outline`、`get_document_stats` commands
- [x] 3.7 实现 `reload_document`、`close_document` commands
- [x] 3.8 在 `src-tauri/src/lib.rs` 注册新 commands
- [x] 3.9 维护 legacy `read_file`/`write_file` 命令（Source path 不调用）
- [ ] 3.10 添加 Tauri command integration tests + error code mapping test

## 4. Frontend Bridge Client

- [x] 4.1 创建 `src/lib/coreBridge.ts`
  - [x] 封装 `invoke()`，统一带 protocol version、request_id、client_id
  - [x] 所有 Core Bridge 命令接口
- [x] 4.2 创建 `src/lib/coreSession.ts`
  - [x] CoreSessionState 类型定义（sessionId、documentId、confirmedRevision、persistedRevision等）
  - [x] session 生命周期管理
  - [x] dirty selector（pending count + revision 比较 + conflict state）
  - [x] syncState 管理（idle / pending / backpressure / resyncing / blocked）
  - [x] bridge error code → toast/dialog/logging 映射
- [x] 4.3 添加 feature flag：`coreBackedSourceMode`，便于回滚和灰度
- [x] 4.4 编写 Frontend 单元测试

## 5. CodeMirror Patch Adapter

- [x] 5.1 在 `editor.source.ts` 增加可选 `onTransaction` 回调，保留 legacy `onUpdate` 兼容
- [x] 5.2 从 `update.transactions` 或 `update.changes` 提取 change set
- [x] 5.3 生成 `Utf16TextPatchDto`（UTF-16 range + baseRevision + transactionId + selectionAfter）
- [x] 5.4 实现 frame/composition batching
- [x] 5.5 实现 ack/retry 状态机
  - [x] ack 后 confirmed revision 按 transaction order 推进
  - [x] out-of-order ack 不跳跃确认
  - [x] revision mismatch 触发 resync
- [x] 5.6 实现 `flushPendingPatches()` 方法
- [x] 5.7 对 pending queue 设置数量和字节上限
  - [x] 超限进入 backpressure 状态
- [x] 5.8 为 resync 使用 CodeMirror transaction 替换整篇 doc，标记为 programmatic update
- [ ] 5.9 编写 Adapter 单元测试

## 6. Open/Save 路径接入

- [x] 6.1 修改 `switchToSource()`：按 target mode / flag 分派 Core open
- [x] 6.2 Source Mode active 时，不调用 `readFile()` + `setMarkdown()` 作为主路径（Core 管理内容）
- [x] 6.3 修改 `saveActiveDocument()`：
  - [x] `core-source` 调 `saveCoreSession()`
  - [x] `legacy-wysiwyg` 走旧路径
- [x] 6.4 Source → WYSIWYG 切换前 flush；失败则停留 Source
- [x] 6.5 WYSIWYG → Source 切换按策略创建 Core session；WYSIWYG dirty 先提示保存或放弃
- [x] 6.6 Source Mode 保存不调用 `getMarkdown()`、`write_file` 等 legacy API

## 7. 外部修改与冲突

- [x] 7.1 Runtime FileIdentity 冲突检测
  - [x] cleanExternalChanged 允许 reload（save_integration.rs: clean_external_changed_detects_conflict）
  - [x] dirtyConflict 阻止自动 reload，保存返回 CONFLICT（save_integration.rs: dirty_conflict_prevents_auto_reload）
- [ ] 7.2 支持同路径多 session 先后保存冲突检测
- [x] 7.3 实现 `reload_document` 更新 Core session 和 CodeMirror（core_bridge.rs + editor.sourcePatcher.ts: resyncEditorWithCore）

## 8. UI 状态与可观测性

- [x] 8.1 状态栏显示 active engine（Core Source / Legacy WYSIWYG）（statusbar.ts: updateActiveEngineIndicator）
- [x] 8.2 保存按钮、窗口关闭、自动保存均读取 Core dirty selector（sidebar.fileops.ts: getCoreSessionState/saveCoreSession)
- [x] 8.3 添加 pending sync indicator（pendingCount > 0 时显示）（statusbar.ts: pending-indicator）
- [ ] 8.4 Large/Huge degradation bar 在 Core-backed 路径下适配
- [x] 8.5 添加 debug log：open/apply/flush/save/resync/close（coreBridge.ts: logDebug 贯穿所有命令）
- [ ] 8.6 所有错误 toast 使用用户可恢复文案，详细原因进日志

## 9. 测试与文档

- [x] 9.1 Rust runtime 单元测试（save.rs: 5 tests, error.rs: 3 tests, file_identity.rs: 7 tests, save_integration.rs: 6 tests, registry_concurrency.rs: 7 tests — 总计 28 Rust tests）
- [x] 9.2 Tauri command integration tests（core_bridge.rs: 1 test module + error code mapping tests）
- [x] 9.3 Frontend adapter 测试（editor.sourcePatcher.test.ts: 21 tests, coreBridge.test.ts: 18 tests, coreSession.test.ts: 20 tests, sidebar.fileops.save.test.ts）
- [ ] 9.4 E2E fixture save 测试（CRLF、BOM、FrontMatter、Unicode 等）
- [ ] 9.5 Performance benchmark（1MB/10MB/50MB open + patch + save）
- [x] 9.6 更新 `docs/markflow-core-stages/feature-migration-matrix.md` M3 项状态
- [ ] 9.7 数据保真复核：byte-for-byte 一致、EOL 保留、BOM 保留
- [x] 9.8 补充开发者说明：Source Mode 新/旧路径分派方式、回滚 flag（m3-core-backed-source-mode.md 文档已更新含开发者说明）