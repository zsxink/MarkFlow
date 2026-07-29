> DEPRECATED: This spec has been merged into [markflow-runtime](../markflow-runtime/spec.md).

# runtime-document-service Specification

## Purpose
定义 Runtime DocumentService 层的职责：从 core_bridge.rs 提取可独立测试的服务层，修复 save_in_progress 残留，实现真实 reload 路径。

## Requirements

### Requirement: DocumentService 独立层

Core Bridge 命令 SHALL 仅做反序列化、权限上下文和错误封装。业务规则（session 管理、保存编排、reload）进入 `DocumentService`。

#### Scenario: 命令只做薄封装

- **WHEN** 前端调用 `save_document` Tauri command
- **THEN** command 仅验证参数和权限
- **THEN** 委托 `DocumentService::save_document(session_id)` 执行
- **THEN** command 封装结果为响应
- **THEN** DocumentService 可被独立测试（不依赖 Tauri 运行时）

### Requirement: save_in_progress 使用 RAII

保存操作 SHALL 使用 RAII token（`SaveLease`）标记进行中的保存。释放时自动清理 save_in_progress 状态，不论成功或失败。

#### Scenario: 成功路径清理 token

- **WHEN** `save_document` 成功
- **THEN** `SaveLease` 在作用域结束时析构
- **THEN** `save_in_progress` 自动恢复为 false

#### Scenario: 失败路径清理 token

- **WHEN** `save_document` 在 Core 阶段失败
- **THEN** `SaveLease` 析构
- **THEN** `save_in_progress` 恢复为 false

#### Scenario: 写入阶段 Host 失败

- **WHEN** `save_document` 的 atomic write 阶段失败
- **THEN** `SaveLease` 析构
- **THEN** `persisted_revision` 不更新

### Requirement: 真实 reload 路径

`reload_document` SHALL 经 Host 真正从磁盘读取文件。读取 IO 在 session lock 外进行。

#### Scenario: reload 从磁盘读取

- **WHEN** `reload_document(session_id)` 调用
- **THEN** Host 执行 `read_document_bytes(path)` 读取文件
- **THEN** 验证 session 在 IO 完成后仍存在且 clean
- **THEN** 用读取内容创建新的 Core state

#### Scenario: dirty 状态阻止 reload

- **WHEN** session 有未保存修改
- **WHEN** `reload_document` 调用
- **THEN** 返回 `TRANSACTION_CONFLICT` 错误
- **THEN** 不替换 Core state

### Requirement: 返回真实 document id 和 outline

`open_document` SHALL 返回唯一 document id（非固定值）和由 Core 计算的实际 outline 与统计信息。

#### Scenario: open 返回非零 document id

- **WHEN** `open_document(path)` 调用
- **THEN** 返回的 `DocumentOpened` 包含非零的 `documentId`
- **THEN** 不同文件返回不同 document id

#### Scenario: outline 来自 Core parse

- **WHEN** `open_document` 打开含标题的文档
- **THEN** `DocumentOpened.outline` 包含由 Core parse_index 提取的标题节点
