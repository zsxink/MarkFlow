# Core Session、Patch Bridge 与同步设计

## 1. 组件边界

```text
EditorSurfaceBinding
  ├─ CodeMirror transaction observer
  ├─ SourceSyncController
  └─ UI session identity
             │ Tauri commands
             ▼
LosslessSessionRegistry
  ├─ session/document/file identity
  ├─ optimistic request dedupe
  ├─ LosslessDocumentSession
  └─ prepare/commit save
```

Core 不管理 DOM、selection UI、decorations 或 CodeMirror History。前端不生成保存 bytes、不恢复 BOM/EOL、不决定 persisted revision。

## 2. Session identity

异步操作不能共享一套“所有字段必须相等”的判断。字段按操作分组：

| 操作 | 必需 identity | 不作为该操作 stale 条件 |
| --- | --- | --- |
| text patch/ack | `bindingGeneration`、`sessionId`、`documentId`、`baseRevision/resultRevision`、`transactionId` | `fileIdentity`；保存改变磁盘身份不能使合法编辑 ack 失效 |
| async widget/renderer | `bindingGeneration`、`sessionId`、`documentId`、`revision`、`requestId`、目标 source range/hash | `fileIdentity` |
| save | `sessionId`、`documentId`、`expectedRevision`、`expectedFileIdentity`、`saveOperationId` | 新输入产生的更高 optimistic revision |
| resource | `bindingGeneration`、`sessionId`、`documentId`、目标 source range/revision、`resourceOperationId` | 无关文件的 identity |

每种 request/response DTO 必须显式包含本行字段。旧文档 A 的 ack、widget/renderer、资源结果或 save completion 不得应用到文档 B；但 revision N 保存更新 file identity 后，合法的 N+1 patch/ack 仍可继续收敛。

## 3. TextPatch

一个 CodeMirror transaction 可包含多个 change。Bridge 将其转换为按旧文档坐标表达的原子 `TextPatch`：

```text
TextPatch {
  bindingGeneration,
  sessionId,
  documentId,
  baseRevision,
  transactionId,
  changes: [ {
    fromUtf16,
    toUtf16,
    insertedLogicalText,
    insertedLineEndings: [ExplicitLf | ExplicitCrlf | ExplicitCr | Inherit]
  } ],
  selectionAfter,
}
```

`insertedLineEndings.length` 必须等于 `insertedLogicalText` 中逻辑 `\n` 的数量。paste/drop 在归一化前用 transaction annotation 保存显式类型；普通键入和无可信来源的命令写 `Inherit`。缺失、数量不符或与文本不一致时 Core 返回稳定错误并原子拒绝整个 Patch。

Core 必须：

1. 校验 session 与 base revision；
2. 校验 changes 排序、不重叠、边界合法；
3. 一次性构造 PositionMap；
4. 原子应用所有 changes；
5. 记录 transactionId→result，支持幂等 retry；
6. 返回 result revision、confirmed hash、position summary；
7. 失败时不应用任何 change。

## 4. 单 in-flight 控制器

同一 session 同一时刻只有一个 patch request in-flight。新的 CM transactions 在本地立即生效并进入 bounded queue。控制器状态：

```text
idle -> batching -> sending -> awaiting-ack -> idle
                            ├-> retrying
                            ├-> resyncing
                            └-> blocked
```

- batching 只合并可安全表示为同一 base mirror 的 transactions；
- queue 达到上限时先 flush，不得丢弃；
- timeout 使用同 transactionId retry；
- stale revision 触发 snapshot 对比和 resync；
- resync 不得覆盖未确认的本地输入；无法 rebase 时进入 blocked；
- blocked 时允许复制/导出恢复文本，但禁止保存旧 Core snapshot。

具体 batch frame、timeout、retry 次数必须由 P1B benchmark 决定，不能照抄 draft 常量。

## 5. Optimistic 与 confirmed

前端维护：

- `optimisticDoc`：当前 CodeMirror doc；
- `lastSentMirror`：已编码进 in-flight/queue 的逻辑文本基线；
- `confirmedRevision` 与 confirmed hash；
- `persistedRevision`；
- `pendingCount`；
- `pipelineState`。

Dirty 定义：`pendingCount > 0 || confirmedRevision != persistedRevision`。projection、selection、theme 和 mode reconfigure 不影响 dirty。

## 6. Flush barrier

Save、Save As、close、reload、external conflict resolution、export snapshot 和文档切换前需要 flush barrier。结果只有：

- `Flushed(revision)`：可继续；
- `CancelledByUser`：停止调用方操作；
- `Blocked(error)`：不得使用旧 snapshot；
- `Disposed`：调用方必须确认目标 session 已关闭，不得继续写盘。

Flush 不能通过读取 CodeMirror 全文并替换 Core 文本来“快速收敛”，除非进入明确的 recovery bulk replace，且该操作有独立 History boundary、byte 影响报告和用户确认。

## 7. Resync

resync 顺序：

1. 暂停发送新 patch；
2. 获取 Core confirmed snapshot 与 revision；
3. 验证 session/document identity；
4. 计算 confirmed snapshot 到 optimistic doc 的局部 changes；
5. 若 changes 可无歧义重放，则以新 transactionId 提交；
6. 若无法安全重放，进入 blocked，保留 optimistic text 供恢复；
7. 不得静默把 UI 重置为 Core snapshot。

## 8. Bridge command 合同

P1B 最小命令：

- `open_lossless_document`；
- `apply_document_patch`；
- `get_document_snapshot`；
- `flush_document_session` 或前端 flush 后 snapshot；
- `prepare_document_save`；
- `commit_document_save`；
- `reconcile_document_save`；
- `reload_lossless_document`；
- `close_lossless_document`。

错误码至少区分 invalid encoding、invalid boundary、invalid EOL provenance、stale revision、wrong identity、duplicate mismatch、external conflict、session missing、pipeline blocked、save outcome unknown、I/O 和 internal invariant。前端不得根据英文 message 分支。

## 9. 生命周期清理

关闭文档或销毁 binding 时必须取消 timer、in-flight wait、IR、image task 和 event listener；registry 清除 session。任何延迟响应由 generation/identity 丢弃。验证要使用 fake timer、真实 dispatcher 和 A/B 文档快速切换检测泄漏。
