## ADDED Requirements

### Requirement: Runtime save workflow 编排

系统 SHALL 在 Core-backed Source Mode 下提供 Runtime 编排的保存流程（flush → SavePayload → identity compare → atomic write → mark persisted），替换前端 `getMarkdown()` + `write_file` 的流程。

#### Scenario: save_document 流程包含 atomic write
- **WHEN** `save_document(session_id)` 被调用
- **THEN** Runtime 请求 Host 执行 temp write + sync + atomic replace（通过 `atomic_write`）
- **THEN** 写入成功后才更新 `persisted_revision`

#### Scenario: save_document 失败不更新 persisted_revision
- **WHEN** 写入临时文件失败
- **THEN** Host 返回写入错误
- **THEN** Runtime 不更新 `persisted_revision`
- **THEN** 磁盘原始文件保持完整

## MODIFIED Requirements

### Requirement: 文档保存使用原子写入
The `write_file` Tauri command SHALL use `atomic_write` to save document content.

**MODIFIED**: Core-backed Source Mode save does NOT use `write_file` Tauri command. Instead, `save_document` uses Runtime's Host adapter which internally uses `atomic_write`. The `write_file` command remains for legacy WYSIWYG path and other callers.

#### Scenario: Source Mode save 不调用 write_file
- **WHEN** Core-backed Source Mode 保存文档
- **THEN** 走 `save_document` 流程
- **THEN** 不调用 `write_file` Tauri command
- **THEN** legacy WYSIWYG save 仍使用 `write_file`