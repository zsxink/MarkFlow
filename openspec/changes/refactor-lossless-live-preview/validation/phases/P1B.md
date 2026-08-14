# P1B 验证记录：无损 Source 纵向闭环

总体状态：AI coding 进行中（3.1–3.8 完成，3.9 desktop E2E 验证中）

正式设计：[P1B：无损 Source 纵向闭环](../../design/phases/P1B-source-vertical-slice.md)

## Candidate identity

| Branch | Commit | Flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `06c4b0a` | `losslessCoreSession=true`（测试内显式开启，产品默认 off） | NOT RECORDED |

## AI Coding 验证

- [x] Unit/typecheck/build/Rust tests
- [x] 真实 dispatcher open/apply/save/commit/reload/close（`dispatcher_contract.rs` 10 测试，不 mock invoke）
- [ ] E2E debug build、smoke、regression
- [ ] 全 fixtures 未编辑 Save L0（desktop）
- [x] autosacve 编排层：lossless 零编辑两次 tick → dirty=false、save count=0（`lifecycle.test.ts`，mock IPC 路由真实 fs）
- [x] 干净 Save → skipped 不写盘（`lifecycle.test.ts`）
- [x] 正文编辑 → dirty → Save 一次写盘 → persisted 收敛（`lifecycle.test.ts`）
- [x] reload/close/A-B 切换不写盘、不串文档（`lifecycle.test.ts`）
- [x] timeout/retry/duplicate/stale ack（`sourceSyncController.test.ts` 9 测试）
- [x] resync 与 blocked recovery（`sourceSyncController.test.ts`）
- [ ] prepare 后外部替换、锁不被遵守、write/commit response 丢失、重复 saveOperationId、启动 receipt reconcile（Rust 侧部分覆盖，desktop 待补）
- [x] renderer/parser command 故障不影响 Source 编辑保存（3.10，`lifecycle.test.ts`）
- [x] lossless open/edit/save/reload/close 无 `setMarkdown/getMarkdown/normalizeImageMarkdown`/PM serializer 调用（3.9.2 审计，`lifecycle.test.ts`）
- [ ] 脱敏 E2E artifacts 保存

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
  - P0：0 / P1：1 / P2：5
  - P1 in-flight dirty 空洞 → 已修复（`isDirty()` 纳入 `isInFlight()` + 回归测试）
  - P2 receipt 永不进入 Committed → 已修复（commit 传 saveOperationId，`mark_committed`）
  - P2 displaced-identity toast 文案 → 已修复
  - P2 saveAs 丢失响应不 reconcile → 已修复
  - P2 dispatcher 测试写真实配置目录 → 已修复（thread-local receipts override 隔离）
  - P2 图片迁移 localPatches 基于乐观文档计算（低概率偏移过期）→ 记录为 P1B 后 corrective 待办
- Program Go/No-Go：NOT STARTED（待人工验收 + 复评）
