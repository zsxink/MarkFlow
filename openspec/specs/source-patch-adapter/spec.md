# source-patch-adapter Specification

## Purpose
定义 CodeMirror Source Mode 到 Core Bridge 的 patch adapter 行为，包括 UTF-16 patch 生成、批处理、ack/resync、backpressure、flush 和 legacy onUpdate 兼容。

## Requirements

### Requirement: 从 transaction 生成 Utf16TextPatchDto

Adapter SHALL 从 CodeMirror 的 `Transaction.changes` 或 `Update.changes` 提取 change set，生成包含 UTF-16 range 的 `Utf16TextPatchDto`。

#### Scenario: 简单文本输入生成正确 patch

- **WHEN** 用户在 CodeMirror 中输入一个字符
- **THEN** Adapter 生成包含一个 change 的 patch
- **THEN** `from`/`to` 为 UTF-16 坐标
- **THEN** `insert` 为输入字符
- **THEN** `baseRevision` 等于当前 confirmed revision

#### Scenario: 多 change transaction 顺序和范围正确

- **WHEN** 一个 transaction 包含多个 changes（如粘贴替换选区）
- **THEN** patch 的 changes 数组顺序与 transaction 一致
- **THEN** 每个 change 的 range 按 base revision 原始文本计算

### Requirement: frame/composition batching

Adapter SHALL 在同一 animation frame 或 IME composition 期间批量处理多个 transaction，合并为一个 patch。

#### Scenario: IME composition 期间不拆分

- **WHEN** IME composition 进行中
- **THEN** Adapter 延迟发送 patch
- **WHEN** composition end
- **THEN** Adapter 尽快 flush 并发送合并后的 patch

### Requirement: ack/retry 状态机

Adapter SHALL 维护同步状态机，处理 ack、retry、resync 和 flush。

#### Scenario: ack 后 confirmed revision 推进

- **WHEN** `ApplyPatchAck` 到达
- **THEN** Adapter 更新 `confirmedRevision` 为 ack 中的 `revision`
- **THEN** 标记对应 transaction 为已确认

#### Scenario: out-of-order ack 不跳跃确认

- **WHEN** transaction 2 的 ack 先于 transaction 1 的 ack 到达
- **THEN** 不更新 `confirmedRevision` 为 transaction 2 的 revision
- **THEN** 等待 transaction 1 确认后按顺序推进

#### Scenario: revision mismatch 触发 resync

- **WHEN** `apply_text_patch` 返回 `REVISION_MISMATCH`
- **THEN** Adapter 进入 `resyncing` 状态
- **THEN** 暂停语义命令和保存
- **THEN** 调用 `resync_document`

### Requirement: pending queue 上限

Adapter SHALL 对 pending transaction 设置数量和字节数上限，超限时进入 backpressure 状态。

#### Scenario: pending queue full 进入 backpressure

- **WHEN** pending transaction 数量或累计字节数达到上限
- **THEN** Adapter 进入 `backpressure` 状态
- **THEN** 暂停语义命令和保存
- **THEN** 提示用户同步中

### Requirement: flushPendingPatches

Adapter SHALL 提供 `flushPendingPatches()` 方法，供保存和模式切换事件调用。

#### Scenario: flushPendingPatches 成功

- **WHEN** `flushPendingPatches()` 调用
- **THEN** 等待所有 pending transaction 得到确认
- **THEN** 返回成功

#### Scenario: flushPendingPatches 超时

- **WHEN** pending patch 在超时内未全部确认
- **THEN** 返回超时错误
- **THEN** 调用方可决定重试或提示用户

### Requirement: 保留 legacy onUpdate 兼容

`editor.source.ts` SHALL 在保留现有 `onUpdate` 回调的同时，增加可选 `onTransaction` 回调供 Core-backed 模式使用。

#### Scenario: legacy 路径继续使用 onUpdate

- **WHEN** Core-backed 模式未启用
- **THEN** `onUpdate` 回调如常工作
- **THEN** 编辑器行为与 M2 之前完全一致
