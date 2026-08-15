# P1B 验证记录：无损 Source 纵向闭环

总体状态：AI coding 与桌面 E2E 完成，双轮独立复核 GO（条件性），待 Program Owner 人工验收

正式设计：[P1B：无损 Source 纵向闭环](../../design/phases/P1B-source-vertical-slice.md)

## Candidate identity

| Branch | Commit | Flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `06c4b0a` | `losslessCoreSession=true`（测试内显式开启，产品默认 off） | NOT RECORDED |

## AI Coding 验证

- [x] Unit/typecheck/build/Rust tests
- [x] 真实 dispatcher open/apply/save/commit/reload/close（`dispatcher_contract.rs` 10 测试，不 mock invoke）
- [x] E2E debug build、smoke、regression
- [x] 全 fixtures 未编辑 Save L0（desktop）
- [x] autosacve 编排层：lossless 零编辑两次 tick → dirty=false、save count=0（`lifecycle.test.ts`，mock IPC 路由真实 fs）
- [x] 干净 Save → skipped 不写盘（`lifecycle.test.ts`）
- [x] 正文编辑 → dirty → Save 一次写盘 → persisted 收敛（`lifecycle.test.ts`）
- [x] reload/close/A-B 切换不写盘、不串文档（`lifecycle.test.ts`）
- [x] timeout/retry/duplicate/stale ack（`sourceSyncController.test.ts` 9 测试）
- [x] resync 与 blocked recovery（`sourceSyncController.test.ts`）
- [ ] prepare 后外部替换、锁不被遵守、write/commit response 丢失、重复 saveOperationId、启动 receipt reconcile（Rust 侧部分覆盖，desktop 待补）
- [x] renderer/parser command 故障不影响 Source 编辑保存（3.10，`lifecycle.test.ts`）
- [x] lossless open/edit/save/reload/close 无 `setMarkdown/getMarkdown/normalizeImageMarkdown`/PM serializer 调用（3.9.2 审计，`lifecycle.test.ts`）
- [x] 脱敏 E2E artifacts 保存

## 人工验证记录

- 验收人/环境：NOT RECORDED
- [ ] LF/CRLF/BOM/尾部 2/3 line-break-boundary fixtures
- [ ] 不编辑 dirty/mtime
- [ ] 不编辑等待两个 autosave tick + 干净 Ctrl+S，记录 save count/hash/length/mtime/关闭提示
- [ ] 中文+emoji 正文编辑立即保存并重开 hash
- [ ] autosave 工作流
- [ ] 外部修改 conflict
- [ ] blocked pipeline 阻止 Save 且恢复文本可复制
- [ ] A/B 切换无串文档
- [ ] flag off legacy 可用
- [ ] 错误提示清楚且无正文泄漏

人工结论：NOT STARTED

## Reviewer 与决定

- [x] 保存路径无 serializer/normalize/PM source
- [x] autosave coordinator 与最终 write 入口均有 clean-session guard
- [x] dirty 为 revision/pending（并纳入 in-flight，修复 reviewer P1）
- [x] async identity 与 lifecycle cleanup
- [x] 按操作 identity matrix；保存变更 file identity 不误拒绝 N+1 patch
- [x] guarded-write 替换点复核与 outcome reconcile
- [x] 真实 dispatcher 非 mock-only
- Reviewer：AI 独立 Reviewer（fresh context，目标 `fb8729f`）
  - 首轮：P0 0 / P1 1 / P2 5；P1 in-flight dirty 空洞 → NO-GO（条件性）
  - 复评（`21aa39a`+`e23314d`）：P1/P2 修复逐项 PASS；**从 NO-GO（条件性）转为
    GO（待 Program Owner 人工验收）**；无剩余 P0/P1
- Reviewer：AI 独立 Reviewer #2（fresh context，2026-08-15，不依赖首轮结论）
  - 9 项复核全 PASS：保存路径无 serializer/PM source；owner 隔离与 flag 默认 off；
    dirty 含 in-flight；guarded write + receipt 状态机；reconcile 完整性；
    identity matrix + P2 冻结；真实 dispatcher；P2 修复项；evidence 真实性
  - 结论：P0 0 / P1 0 / P2 2（文档）+ 1 观察项；总体 **GO（条件性）**，与首轮 Reviewer 收敛一致
  - 运行验证：vitest lossless 16 passed、tsc PASS、cargo core 93、cargo tauri 134、manifest sha256 全通过
- Program Go/No-Go：NOT STARTED（待人工验收 + Program Owner 决定）

## P1B 后 corrective 待办

- 观察项：启动 receipt 扫描（`src-tauri/src/lib.rs` setup）目前仅记录日志/警告，
  未自动调用 `reconcile_document_save`；前端只在自身 lost-response /
  outcome-unknown 时主动 reconcile。记录为 P1B 后 corrective（不阻塞 P1B，
  留待 P2/corrective 决定）。
