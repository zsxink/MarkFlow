# source-patch-adapter Specification (Delta for M3.1)

## MODIFIED Requirements

### Requirement: 从 transaction 生成 Utf16TextPatchDto

Adapter SHALL 从 CodeMirror 的 `Transaction.changes` 或 `Update.changes` 提取 change set。同一 batch 内的多个 transaction SHALL 使用 `ChangeSet.compose` 合成为单个 change set 后生成包含 UTF-16 range 的 `Utf16TextPatchDto`。不同 animation frame 或 batch 的 change 不得拼接（每个 batch 基于自己捕获时的 `confirmedRevision`）。

#### Scenario: 简单文本输入生成正确 patch（未改动）

- **WHEN** 用户在 CodeMirror 中输入一个字符
- **THEN** Adapter 生成包含一个 change 的 patch
- **THEN** `from`/`to` 为 UTF-16 坐标
- **THEN** `insert` 为输入字符
- **THEN** `baseRevision` 等于当前 confirmed revision

#### Scenario: 同一 batch 合成而非拼接

- **WHEN** 同一 animation frame 内有 3 个 transaction（在位置 X 插入 "a"，在 Y 插入 "b"，在 Z 插入 "c"）
- **THEN** Adapter 使用 `ChangeSet.compose(c1, c2, c3)` 合成
- **THEN** 生成的 change 反映从起始 text 到最终 text 的变换
- **THEN** 效果为 "aXbYc" 而非 "aXbYc" 被错误映射

### Requirement: ack/retry 状态机（修改）

Adapter SHALL 维护同步状态机，使用单 in-flight 模型处理 ack、retry、resync 和 flush。

#### Scenario: ack 后 confirmed revision 推进（未改动）

- **WHEN** `ApplyPatchAck` 到达
- **THEN** Adapter 更新 `confirmedRevision` 为 ack 中的 `revision`
- **THEN** 标记对应 transaction 为已确认
- **THEN** 从 pending queue 移除已确认 transaction
- **THEN** 如果 queue 非空，发送下一个 patch（batch）

#### Scenario: out-of-order ack 不跳跃确认（未改动）

- **WHEN** transaction 2 的 ack 先于 transaction 1 的 ack 到达
- **THEN** 不更新 `confirmedRevision` 为 transaction 2 的 revision
- **THEN** 等待 transaction 1 确认后按顺序推进

#### Scenario: revision mismatch 触发 resync（修改 — 增加 replay）

- **WHEN** `apply_text_patch` 返回 `REVISION_MISMATCH`
- **THEN** Adapter 进入 `resyncing` 状态
- **THEN** 暂停语义命令和保存
- **THEN** 调用 `resync_document(session_id, lastConfirmedRevision, pendingTransactionIds)`
- **THEN** 响应到达后删除已确认前缀，按原序重放未确认 transaction
- **THEN** 状态不连续时进入 blocked

### Requirement: flushPendingPatches（修改 — 严格 barrier）

Adapter SHALL 提供 `flushPendingPatches()` 方法，供保存和模式切换事件调用。barrier 覆盖 retained batch、pending queue、in-flight request 和 backend receipt revision。

#### Scenario: flush 等待全部完成

- **WHEN** `flushPendingPatches()` 调用
- **THEN** 先发送当前 retained batch（若有）
- **THEN** 等待所有 pending queue 中的 transaction 发送并确认
- **THEN** 等待 in-flight 请求的 ack
- **THEN** 验证 backend receipt revision == 预期 revision
- **THEN** 返回成功

#### Scenario: flush 超时返回错误

- **WHEN** pending patch 在超时内未全部确认
- **THEN** 返回超时错误
- **THEN** 保留所有 pending transaction
- **THEN** 调用方可决定重试或提示用户（不自动继续保存）

## REMOVED Requirements

### Requirement: pending queue 上限（移至 source-sync-controller）
**Reason**: 同步状态机已提取到独立的 SourceSyncController 深模块。
**Migration**: 参见 `specs/source-sync-controller/spec.md`

### Requirement: frame/composition batching（移至 source-sync-controller）
**Reason**: 同步模型已提取到独立的 SourceSyncController 深模块。
**Migration**: 参见 `specs/source-sync-controller/spec.md`
