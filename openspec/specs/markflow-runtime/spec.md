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
