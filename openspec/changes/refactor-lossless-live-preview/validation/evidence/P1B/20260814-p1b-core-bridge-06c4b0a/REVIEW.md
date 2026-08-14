# P1B 独立 Reviewer 报告与修复记录

## Reviewer 结论（首轮，目标 `fb8729f`）

独立 Reviewer（fresh context）对 P1B save path / owner 隔离 / dispatcher 真实性
专项复核。结论：**NO-GO（条件性）**。

- P0：0
- P1：1（in-flight dirty 空洞）
- P2：5

## P1 — dirty 定义存在 in-flight 空洞（已修复）

`isDirty()` 原为 `pending > 0 || confirmedRevision != persistedRevision`。
当一帧 patch 被发送但 ack 未返回时（`sendFrame` 已把 `pendingCount` 置 0、
`confirmedRevision` 尚未推进），对先前 clean 的文档 `isDirty()` 返回 false。
此时 close/switch 走 clean 分支直接 dispose，不 flush → 已发送未确认的编辑
静默丢失。

修复：
- `sourceSyncController.ts` 新增 `isInFlight()`（`inFlight !== null`）；
- `editorSurfaceBinding.ts` `isDirty()` 纳入 `isInFlight()`；
- 回归测试：`isInFlight() is true while a patch awaits its ack`；
- close/switch 路径（`handleCloseRequested` / `confirmDocumentTransition` →
  `hasUnpersistedUserChanges` → `activeLosslessDirty` → `isDirty`）因此能阻止
  in-flight 编辑被静默丢弃。

## P2 项修复

1. **durable receipt 永不进入 `Committed`** → 修复：`commit_document_save` 接受
   `save_operation_id`，成功后 `mark_committed(op_id)` 置为 Committed；前端
   save/saveAs/reconcileOutcomeUnknown 均传 op id。启动 reconcile 因此只扫描
   真正未终结的 operation。
2. **displaced-identity toast 文案误导** → 修复：文案改为
   「检测到外部修改，原文件已保留为恢复副本，未覆盖」。
3. **saveAs 丢失响应不 reconcile** → 修复：`saveAs` catch 调用
   `reconcileOutcomeUnknown(opId, preparedRevision)`。
4. **dispatcher 测试向真实 app 配置目录写 receipt** → 修复：receipts dir
   thread-local test override，`cargo test` 每测试线程隔离；`cargo test` 134
   通过。
5. **图片迁移 localPatches 基于乐观文档计算（低概率偏移过期）** → 记录为
   P1B 后 corrective 待办（不阻塞 P1B Go；P1B 内图片迁移路径已改为显式局部
   patch，见 3.8）。

## 复评状态

同一 Reviewer 复评（目标 `21aa39a`+`e23314d`）：

| # | 修复项 | 结论 |
| --- | --- | --- |
| 1 | P1 in-flight dirty 空洞 | PASS |
| 2 | P2 receipt 进入 Committed | PASS |
| 3 | P2 saveAs 丢失响应 reconcile | PASS |
| 4 | P2 dispatcher 测试 receipts 目录隔离 | PASS |
| 5 | P2 displaced-identity toast 文案 | PASS |

总体结论：**可转为 GO（仍保留 Program Owner 人工验收）**。原 NO-GO 的唯一阻断项
（P1 in-flight dirty 空洞）已闭合，close/switch 路径经 `isDirty()` →
`hasUnpersistedUserChanges()` / `isDocumentDirty()` 全链路验证可阻止静默丢弃。
无剩余 P0/P1。唯一 P2 待办（图片迁移 localPatches 乐观偏移）记录为 P1B 后
corrective，不阻塞 P1B。

## 修复后 gate 状态

- `npm test`：391 passed（含 in-flight dirty 回归测试）
- `npx tsc --noEmit`：PASS
- `cargo test --manifest-path src-tauri/Cargo.toml`：134 passed
- lossless desktop E2E：修复后重跑（见 run 目录 e2e/ 与 gate 日志）
