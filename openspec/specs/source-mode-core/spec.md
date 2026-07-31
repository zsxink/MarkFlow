# source-mode-core

Defines the three-layer architecture for Core-backed Source Mode: Lifecycle Guard,
Patch Adapter, and Sync Controller.

## Lifecycle Guard

### Purpose
定义前端 Source 模式的生命周期守卫行为：generation isolation、幂等 close、WYSIWYG dirty gate、opening 禁用编辑。

### Requirements

#### Requirement: generation isolation 屏蔽 stale 响应

CoreSourceCoordinator SHALL 在每次 open/close 时递增 generation。所有异步响应落地前必须校验 (generation, sessionId, requestId)，不匹配时静默丢弃。

##### Scenario: 旧 open 响应不覆盖新 session

- **WHEN** 用户快速切换两次 Source On/Off
- **THEN** 第一个 `openCoreSession` 的异步响应到达时 generation 不匹配
- **THEN** 响应被静默丢弃
- **THEN** 第二个 session 状态不受影响

##### Scenario: 旧 close 响应不重置新 session

- **WHEN** 用户在 close 进行中又 open 新 session
- **THEN** 旧 close 的 finally 块到达时 generation 不匹配
- **THEN** 不执行任何 session 重置操作
- **THEN** 新 session 保持正常工作

#### Requirement: 幂等可 await close

`closeCoreSession()` SHALL 返回统一的 `Promise<void>`，调用方可 await 其完成。close 操作幂等，多次调用只执行一次。

##### Scenario: 连续 close 调用

- **WHEN** `closeCoreSession()` 被连续调用 3 次
- **THEN** 第一次实际执行 close 操作
- **THEN** 后续调用立即返回已 resolve 的 Promise
- **THEN** 所有调用者都 await 到 close 完成

#### Requirement: Core open 成功后创建 CM

CodeMirror SHALL Core session `open_document` 成功后创建。opening 期间禁用编辑器输入并显示明确状态（loading）。

##### Scenario: opening 期间用户不可编辑

- **WHEN** 用户切入 Source Mode
- **THEN** 编辑器显示 loading 指示器
- **THEN** 编辑输入被禁用（CodeMirror 未创建或处于只读状态）
- **WHEN** `open_document` 返回
- **THEN** 创建 CodeMirror 并以 `opened.text` 初始化
- **THEN** 启用编辑并将焦点交给用户

##### Scenario: open 失败不创建编辑器

- **WHEN** `open_document` 返回错误
- **THEN** 不创建 CodeMirror
- **THEN** 显示错误提示
- **THEN** 保持 WYSIWYG 模式（或回退）

#### Requirement: WYSIWYG dirty 阻止 Source 切换

系统 SHALL 在 WYSIWYG 有未保存修改时阻止切入 Core Source Mode，提示用户先保存或放弃。

##### Scenario: WYSIWYG dirty 时阻止切换

- **WHEN** WYSIWYG 模式有未保存修改
- **WHEN** 用户尝试切换到 Source Mode
- **THEN** 显示确认对话框（保存/放弃/取消）
- **THEN** 用户选择保存后先执行 legacy save
- **THEN** 保存成功后才调用 `open_document`
- **THEN** 用户选择放弃后直接重新从磁盘读取
- **THEN** 用户选择取消后停留在 WYSIWYG 模式

## Patch Adapter

### Purpose
定义 CodeMirror Source Mode 到 Core Bridge 的 patch extraction / legacy onUpdate compatibility 行为，包括 UTF-16 patch 生成、同一 batch 的 `ChangeSet.compose`、ack/resync 边界和 flush 调用入口。pending queue 上限、frame batching、composition batching 与 backpressure 的 owner 是 `source-sync-controller`。

### Requirements

#### Requirement: 从 transaction 生成 Utf16TextPatchDto

Adapter SHALL 从 CodeMirror 的 `Transaction.changes` 或 `Update.changes` 提取 change set。同一 batch 内的多个 transaction SHALL 使用 `ChangeSet.compose` 合成为单个 change set 后生成包含 UTF-16 range 的 `Utf16TextPatchDto`。不同 animation frame 或 batch 的 change 不得拼接；每个 batch SHALL 基于自己捕获时的 `confirmedRevision`。

##### Scenario: 同一 batch 合成而非按原始坐标拼接

- **WHEN** 初始文本为 `XYZ`，同一 batch 内有 3 个 transaction（依次插入 `a` 到文首、插入 `b` 到 `X` 后、插入 `c` 到 `Y` 后）
- **THEN** Adapter 使用 `ChangeSet.compose` 合成
- **THEN** 生成的 change 反映从起始 text 到最终 text 的变换，最终效果等价于 CodeMirror 顺序应用三个 transaction 得到的 `aXbYcZ`
- **THEN** Adapter 不得把后两个 transaction 当作起始文本坐标直接拼接，避免生成 `abcXYZ`、`aXYbZc` 等错误结果

#### Requirement: ack/retry 状态机

Adapter SHALL 维护同步状态机，使用单 in-flight 模型处理 ack、retry、resync 和 flush。

##### Scenario: ack 后 confirmed revision 推进

- **WHEN** `ApplyPatchAck` 到达
- **THEN** Adapter 更新 `confirmedRevision` 为 ack 中的 `revision`
- **THEN** 标记对应 transaction 为已确认
- **THEN** 从 pending queue 移除已确认 transaction
- **THEN** 如果 queue 非空，发送下一个 patch（batch）

##### Scenario: out-of-order ack 不跳跃确认

- **WHEN** transaction 2 的 ack 先于 transaction 1 的 ack 到达
- **THEN** 不更新 `confirmedRevision` 为 transaction 2 的 revision
- **THEN** 等待 transaction 1 确认后按顺序推进

##### Scenario: revision mismatch 触发 resync

- **WHEN** `apply_text_patch` 返回 `REVISION_MISMATCH`
- **THEN** Adapter 进入 `resyncing` 状态
- **THEN** 暂停语义命令和保存
- **THEN** 调用 `resync_document(session_id, lastConfirmedRevision, pendingTransactionIds)`
- **THEN** 响应到达后删除已确认前缀，按原序重放未确认 transaction
- **THEN** 状态不连续时进入 blocked

#### Requirement: flushPendingPatches

Adapter SHALL 提供 `flushPendingPatches()` 方法，供保存和模式切换事件调用。barrier 覆盖 retained batch、pending queue、in-flight request 和 backend receipt revision。

##### Scenario: flush 等待全部完成

- **WHEN** `flushPendingPatches()` 调用
- **THEN** 先发送当前 retained batch（若有）
- **THEN** 等待所有 pending queue 中的 transaction 发送并确认
- **THEN** 等待 in-flight 请求的 ack
- **THEN** 验证 backend receipt revision == 预期 revision
- **THEN** 返回成功

##### Scenario: flush 超时返回错误

- **WHEN** pending patch 在超时内未全部确认
- **THEN** 返回超时错误
- **THEN** 保留所有 pending transaction
- **THEN** 调用方可决定重试或提示用户（不自动继续保存）

#### Requirement: 保留 legacy onUpdate 兼容

`editor.source.ts` SHALL 在保留现有 `onUpdate` 回调的同时，增加可选 `onTransaction` 回调供 Core-backed 模式使用。

##### Scenario: legacy 路径继续使用 onUpdate

- **WHEN** Core-backed 模式未启用
- **THEN** `onUpdate` 回调如常工作
- **THEN** 编辑器行为与 M2 之前完全一致

## Sync Controller

### Purpose
定义前端 SourceSyncController 深模块的行为：使用单 in-flight 并发模型 + ChangeSet.compose + 有界队列 + 严格 flush barrier + recovery replay，替换并行 fire-and-forget 模型。

### Requirements

#### Requirement: 单 in-flight patch 发送

Controller SHALL 维护最多一个 in-flight patch 请求。新 patch 在 in-flight 确认前排队等待，不并行发送。

##### Scenario: in-flight 时新更改排队

- **WHEN** 一个 patch 正在等待 ack
- **WHEN** 新编辑产生 transaction
- **THEN** transaction 进入 pending queue
- **THEN** 不发送新 patch 请求
- **WHEN** ack 到达
- **THEN** pending queue 中所有 transaction 合并为一个 patch 发送

##### Scenario: 同一 batch 内的 ChangeSet.compose

- **WHEN** 同一 animation frame 内有多个 transaction
- **THEN** Controller 使用 CodeMirror `ChangeSet.compose` 将其合成为单个 change set
- **THEN** 序列化为单个 `Utf16TextPatchDto`
- **THEN** base revision 为当前 `confirmedRevision`

#### Requirement: 有界 pending queue

Controller SHALL 对 pending unacknowledged transaction 维护有界队列，数量和字节数超限时进入 backpressure 状态。

##### Scenario: backpressure 由 ack 自动唤醒

- **WHEN** pending queue 满触发 backpressure
- **THEN** 暂停新 transaction 入队
- **WHEN** ack 到达释放队列容量
- **THEN** backpressure 自动解除
- **THEN** 队列恢复处理（不需外部唤醒）

##### Scenario: retry exhaustion 进入 blocked

- **WHEN** patch 发送失败超过最大重试次数
- **THEN** Controller 进入 `blocked` 状态
- **THEN** 保留所有 pending transaction（不丢弃）
- **THEN** 返回明确错误给调用方
- **THEN** 不假装 flush 成功

#### Requirement: 严格 flush barrier

`flush()` SHALL 仅在 retained batch、queue、in-flight 全为空，且 backend receipt revision 等于预期 revision 时返回成功。

##### Scenario: flush 等待所有 pending

- **WHEN** 调用 `flush()`
- **THEN** 等待当前 batch 被发送
- **THEN** 等待所有 in-flight 得到 ack
- **THEN** 等待 queue 中所有 transaction 被发送并确认
- **WHEN** backend receipt revision == 预期 revision
- **THEN** flush 返回成功

##### Scenario: flush timeout 返回错误

- **WHEN** `flush()` 在超时内未完成
- **THEN** 返回 `SAVE_FLUSH_TIMEOUT` 错误
- **THEN** 不清空 pending queue
- **THEN** 不写入磁盘
- **THEN** 调用方可决定重试或提示用户

#### Requirement: resync replay 恢复

resync SHALL 使用 authoritative snapshot + transaction status + deterministic replay，而非直接覆盖本地内容。

##### Scenario: resync 携带 pending transaction IDs

- **WHEN** revision mismatch 触发 resync
- **THEN** Controller 调用 `resync_document(session_id, lastConfirmedRevision, pendingTransactionIds)`
- **THEN** 响应包含 authoritative text/revision + 每 transaction 的接收状态

##### Scenario: 删除已确认前缀，重放未确认

- **WHEN** resync 响应到达
- **THEN** 前端在 authoritative text 上删除已被 backend 接收的 transaction 前缀
- **THEN** 按原序重放未被 backend 接收的 pending transaction
- **THEN** 如果状态不连续或无法证明，进入 `blocked`
- **THEN** 展示冲突/恢复操作，不覆盖编辑器内容

#### Requirement: 实例化对象而非 module globals

Controller SHALL 以实例化对象存在，而非 module 级函数，以支持多 session 隔离。

##### Scenario: multi-instance 隔离

- **WHEN** 创建两个 Controller 实例
- **THEN** 每个实例有独立的 confirmedRevision、pending queue、in-flight state
- **THEN** 实例间互不干扰
## Requirements
### Requirement: FormatCommandLayer flushes and applies command patches
FormatCommandLayer SHALL be the Source Mode semantic command seam. Before command, undo, or redo execution it SHALL flush SourceSyncController pending patches. After success it SHALL apply the returned UTF-16 patch to CodeMirror under a programmatic update guard, update confirmed revision, apply selection_after, and verify the session did not switch before mutating editor state.

#### Scenario: pending source edits flush before command
- **WHEN** a toolbar or keyboard semantic action is invoked in Core-backed Source Mode
- **THEN** FormatCommandLayer flushes pending SourceSyncController patches before reading the command base revision
- **THEN** the semantic command is sent using the flushed confirmed revision

#### Scenario: command patch updates editor without normal resync
- **WHEN** `execute_edit_command` returns a successful patch-first result
- **THEN** FormatCommandLayer applies that patch to CodeMirror
- **THEN** the programmatic update does not enqueue a user patch back into SourceSyncController
- **THEN** FormatCommandLayer does not call whole-document resync on the normal path

#### Scenario: stale session result is discarded
- **WHEN** a semantic command result returns after the active Core session changed
- **THEN** FormatCommandLayer discards the result without applying patch or selection to the current editor

### Requirement: Source Mode undo redo use Core history
Core-backed Source Mode undo and redo SHALL flush pending source patches first, call Core undo/redo IPC, and apply the returned patch/selection/revision through FormatCommandLayer.

#### Scenario: undo uses Core history owner
- **WHEN** the user invokes undo in Core-backed Source Mode
- **THEN** pending source patches are flushed
- **THEN** the frontend calls `undo_document`
- **THEN** the returned patch is applied to CodeMirror and confirmed revision is updated

### Requirement: Source and WYSIWYG share Core editor authority
Every active Core CodeMirror surface SHALL route patches, semantic commands, flush, resync, save, History, diagnostics, and projection through the same session authority regardless of visible mode.

#### Scenario: Formatting in WYSIWYG uses Core
- **WHEN** WYSIWYG is active and the user invokes a formatting command
- **THEN** the command targets the visible CodeMirror selection and active Core session
- **THEN** it does not call a hidden or legacy editor

#### Scenario: Save behavior is mode independent
- **WHEN** the same confirmed revision is saved from Source or WYSIWYG
- **THEN** Runtime receives the same session and SavePayload
- **THEN** persisted bytes are identical

### Requirement: Source Mode is the universal safe fallback
Source Mode SHALL remain available for unknown syntax, unsafe structured models, render errors, large-document degradation, and recovery workflows without closing the Core session.

#### Scenario: Degraded WYSIWYG switches to Source
- **WHEN** the user selects Source Mode from a degraded projection
- **THEN** the same Markdown mirror and selection range become visible
- **THEN** pending edits and dirty state are preserved

