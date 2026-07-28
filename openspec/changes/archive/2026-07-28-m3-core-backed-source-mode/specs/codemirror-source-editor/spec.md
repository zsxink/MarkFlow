## MODIFIED Requirements

### Requirement: WYSIWYG 与 Source 双向内容同步
系统 SHALL 确保 WYSIWYG 和 Source 模式间的内容一致性。

**MODIFIED**: Source Mode now supports a Core-backed path where the truth of the document comes from `DocumentSession`, not from serializer round-trips. The legacy sync path remains for WYSIWYG and when Core-backed mode is not enabled.

#### Scenario: Core-backed Source → WYSIWYG 切换使用 confirmed text
- **WHEN** Core-backed Source Mode 激活
- **WHEN** 用户切换到 WYSIWYG 模式
- **THEN** 系统先调用 `flush_document` 确保所有 pending patch 确认
- **THEN** flush 成功后，从 Core confirmed snapshot 获取文本注入 WYSIWYG 视图
- **THEN** flush 失败阻止切换

#### Scenario: WYSIWYG → Core-backed Source 切换不经过 getMarkdown()
- **WHEN** Core-backed 模式激活
- **WHEN** 用户从 WYSIWYG 切换到 Source Mode
- **THEN** 系统调用 `open_document(path)` 从磁盘创建 Core session
- **THEN** 不调用 Tiptap 的 `getMarkdown()` 作为 Source Mode 的初始内容
- **THEN** 若 WYSIWYG dirty，先提示保存或放弃

### Requirement: 内容变更追踪
源码编辑器的内容变更 SHALL 触发 dirty 标志检查和事件通知。

**MODIFIED**: In Core-backed Source Mode, dirty state is computed from Core revision comparison, not from comparing CM6 content to `lastPersistedMarkdown`.

#### Scenario: Core-backed dirty 使用 revision 比较
- **WHEN** Core-backed Source Mode 激活
- **THEN** dirty = `pending_transaction_count > 0 || confirmed_revision != persisted_revision || external_conflict_state != clean`
- **THEN** 不再比较 CM6 全文与 `lastPersistedMarkdown`

### Requirement: 统计数据兼容
源码编辑器 SHALL 支持获取字数、行数、光标位置等统计信息。

**MODIFIED**: In Core-backed Source Mode, stats can also be obtained from Core/Runtime via `get_document_stats` and outline via `get_outline`.

#### Scenario: Core-backed 模式下从 Core 获取 stats
- **WHEN** Core-backed Source Mode 激活
- **THEN** `getWordCount`、`getLineCount` 等函数可回退到 CM6 统计
- **THEN** outline 等语义信息从 `get_outline` DTO 获取