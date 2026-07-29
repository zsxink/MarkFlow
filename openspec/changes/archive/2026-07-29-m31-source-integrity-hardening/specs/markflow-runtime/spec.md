# markflow-runtime Specification (Delta for M3.1)

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Runtime 编排保存流程（修改 — RAII + per-path lock）

Runtime SHALL 编排保存流程（flush → SavePayload → compare identity → atomic write → mark persisted）。`save_in_progress` 使用 `SaveLease` RAII 管理。同路径保存经 `PathSaveCoordinator` 串行化。

#### Scenario: 保存流程使用 Core SavePayload（未改动）

- **WHEN** `save_document(session_id)` 被调用
- **THEN** Runtime 先 flush pending patch
- **THEN** 从 Core 获取 `SavePayload(revision)`
- **THEN** Runtime 请求 Host 比较 expected FileIdentity
- **THEN** Host 执行 temp write + sync + atomic replace
- **THEN** Runtime 更新 `persisted_revision` 和 `file_identity`
- **THEN** Host write 失败不更新 `persisted_revision`

#### Scenario: Host write 失败 RAII 清理（新增）

- **WHEN** Host write 失败
- **THEN** `SaveLease` 析构
- **THEN** `save_in_progress` 恢复为 false
- **THEN** persisted_revision 不更新
- **THEN** 可再次调用 save_document
