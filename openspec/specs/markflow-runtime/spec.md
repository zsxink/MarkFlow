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

Runtime SHALL 编排保存流程（flush → SavePayload → compare identity → atomic write → mark persisted），Host/Tauri 只负责文件身份校验和原子写入。

#### Scenario: 保存流程使用 Core SavePayload

- **WHEN** `save_document(session_id)` 被调用
- **THEN** Runtime 先 flush pending patch
- **THEN** 从 Core 获取 `SavePayload(revision)`
- **THEN** Runtime 请求 Host 比较 expected FileIdentity
- **THEN** Host 执行 temp write + sync + atomic replace
- **THEN** Runtime 更新 `persisted_revision` 和 `file_identity`
- **THEN** Host write 失败不更新 `persisted_revision`

#### Scenario: Host write 失败不更新 persisted_revision

- **WHEN** Host atomic write 失败
- **THEN** `persisted_revision` 保持不变
- **THEN** dirty 状态保持 true

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
