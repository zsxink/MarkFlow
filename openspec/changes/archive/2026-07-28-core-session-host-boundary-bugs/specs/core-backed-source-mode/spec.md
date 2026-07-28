## ADDED Requirements

### Requirement: closeCoreSession 防重入

closeCoreSession 的异步调用 SHALL 使用防重入锁，防止快速切换 Source ↔ WYSIWYG 时并发关闭覆盖新 session。

#### Scenario: 快速切换不破坏 session 状态

- **WHEN** 用户快速连续执行 Source → WYSIWYG → Source 切换 3 次以上
- **THEN** patcher 不停止工作
- **THEN** 每次切回 Source 后 CM6 内容与 Core confirmed snapshot 一致
- **THEN** 操作日志无 `Non-critical error closing core session` 异常

### Requirement: backpressure batch 不丢失

backpressure 状态下积累的 batch 编辑 SHALL 不被永久丢弃。

#### Scenario: backpressure 下编辑不丢失

- **WHEN** 大量编辑快速输入触发 backpressure
- **THEN** 所有编辑最终都被 Core 接收
- **THEN** backpressure 恢复后 CM6 内容不被 Core 覆盖回旧内容
- **THEN** 单测覆盖 backpressure 状态下的 patch 不被丢弃

### Requirement: Selection 偏移使用 UTF-16 转换

Selection anchor/head 在 Rust 端 SHALL 使用 `Core::byte_for_utf16()` 转换，而非直接用 `len()` 截断。

#### Scenario: CJK/emoji 内容光标定位正确

- **WHEN** Source mode 中包含中文/emoji/combining mark 的文末位置
- **THEN** 可用鼠标正常选中
- **THEN** 行内光标定位不跳位
- **THEN** Core `apply_patch` 不因 Selection 越界返回 `InvalidUtf8Boundary`

### Requirement: Core save 后更新 dirty 状态

Core save 路径 SHALL 在成功后调用 `markDocumentPersisted()` 或等效 dirty-reset 路径。

#### Scenario: Core save 后 dirty 为 false

- **WHEN** Source Mode 中保存文档
- **THEN** 保存后 dirty 状态变为 false
- **THEN** 关闭窗口不弹未保存确认
- **THEN** autosave 在空编辑周期不触发写盘

## MODIFIED Requirements

### Requirement: dirty 状态由 Core revision 计算

Source Mode dirty 状态 SHALL 由 `pending_transaction_count > 0 || confirmed_revision != persisted_revision || external_conflict_state != clean` 决定，blocked 状态下 SHALL 额外检查 `pendingCount > 0 || confirmedRevision !== persistedRevision`。

#### Scenario: 编辑后 dirty 为 true

- **WHEN** Source Mode 中用户输入文字
- **WHEN** `confirmed_revision > persisted_revision`
- **THEN** dirty 状态为 true

#### Scenario: 保存成功后 dirty 为 false

- **WHEN** `save_document` 成功返回
- **THEN** `persisted_revision` 更新为当前 `confirmed_revision`
- **THEN** dirty 状态为 false

#### Scenario: 保存期间新输入保持 dirty

- **WHEN** 保存进行中时有新的 patch ack 到达
- **THEN** 保存仅标记 `target_revision` 为 persisted
- **THEN** `confirmed_revision > persisted_revision` 成立
- **THEN** dirty 状态为 true

#### Scenario: blocked 状态下有未确认 patch 时 dirty 为 true

- **WHEN** session 处于 blocked 状态
- **WHEN** `pendingCount > 0` 或有未 ack 的 patch
- **THEN** `isCoreSessionDirty()` 返回 true
- **THEN** 关闭窗口弹出未保存确认

#### Scenario: blocked 状态下无未确认编辑时 dirty 为 false

- **WHEN** session 处于 blocked 状态
- **WHEN** `pendingCount === 0` 且 `confirmedRevision === persistedRevision`
- **THEN** `isCoreSessionDirty()` 返回 false
