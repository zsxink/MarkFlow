> DEPRECATED: This spec has been merged into [source-mode-core](../source-mode-core/spec.md).

# source-patch-adapter Specification

## Purpose
定义 CodeMirror Source Mode 到 Core Bridge 的 patch extraction / legacy onUpdate compatibility 行为，包括 UTF-16 patch 生成、同一 batch 的 `ChangeSet.compose`、ack/resync 边界和 flush 调用入口。pending queue 上限、frame batching、composition batching 与 backpressure 的 owner 是 `source-sync-controller`。
## Requirements
### Requirement: 从 transaction 生成 Utf16TextPatchDto

Adapter SHALL 从 CodeMirror 的 `Transaction.changes` 或 `Update.changes` 提取 change set。同一 batch 内的多个 transaction SHALL 使用 `ChangeSet.compose` 合成为单个 change set 后生成包含 UTF-16 range 的 `Utf16TextPatchDto`。不同 animation frame 或 batch 的 change 不得拼接；每个 batch SHALL 基于自己捕获时的 `confirmedRevision`。

#### Scenario: 同一 batch 合成而非按原始坐标拼接

- **WHEN** 初始文本为 `XYZ`，同一 batch 内有 3 个 transaction（依次插入 `a` 到文首、插入 `b` 到 `X` 后、插入 `c` 到 `Y` 后）
- **THEN** Adapter 使用 `ChangeSet.compose` 合成
- **THEN** 生成的 change 反映从起始 text 到最终 text 的变换，最终效果等价于 CodeMirror 顺序应用三个 transaction 得到的 `aXbYcZ`
- **THEN** Adapter 不得把后两个 transaction 当作起始文本坐标直接拼接，避免生成 `abcXYZ`、`aXYbZc` 等错误结果

### Requirement: ack/retry 状态机

Adapter SHALL 维护同步状态机，使用单 in-flight 模型处理 ack、retry、resync 和 flush。

#### Scenario: ack 后 confirmed revision 推进

- **WHEN** `ApplyPatchAck` 到达
- **THEN** Adapter 更新 `confirmedRevision` 为 ack 中的 `revision`
- **THEN** 标记对应 transaction 为已确认
- **THEN** 从 pending queue 移除已确认 transaction
- **THEN** 如果 queue 非空，发送下一个 patch（batch）

#### Scenario: out-of-order ack 不跳跃确认

- **WHEN** transaction 2 的 ack 先于 transaction 1 的 ack 到达
- **THEN** 不更新 `confirmedRevision` 为 transaction 2 的 revision
- **THEN** 等待 transaction 1 确认后按顺序推进

#### Scenario: revision mismatch 触发 resync

- **WHEN** `apply_text_patch` 返回 `REVISION_MISMATCH`
- **THEN** Adapter 进入 `resyncing` 状态
- **THEN** 暂停语义命令和保存
- **THEN** 调用 `resync_document(session_id, lastConfirmedRevision, pendingTransactionIds)`
- **THEN** 响应到达后删除已确认前缀，按原序重放未确认 transaction
- **THEN** 状态不连续时进入 blocked

### Requirement: flushPendingPatches

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

### Requirement: 保留 legacy onUpdate 兼容

`editor.source.ts` SHALL 在保留现有 `onUpdate` 回调的同时，增加可选 `onTransaction` 回调供 Core-backed 模式使用。

#### Scenario: legacy 路径继续使用 onUpdate

- **WHEN** Core-backed 模式未启用
- **THEN** `onUpdate` 回调如常工作
- **THEN** 编辑器行为与 M2 之前完全一致

