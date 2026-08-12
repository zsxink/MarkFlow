# P1B 验证记录：无损 Source 纵向闭环

总体状态：BLOCKED by P1A

正式设计：[P1B：无损 Source 纵向闭环](../../design/phases/P1B-source-vertical-slice.md)

## Candidate identity

| Branch | Commit | Flags | Run ID |
| --- | --- | --- | --- |
| NOT RECORDED | NOT RECORDED | `losslessCoreSession=true` | NOT RECORDED |

## AI Coding 验证

- [ ] Unit/typecheck/build/Rust tests
- [ ] E2E debug build、smoke、regression
- [ ] 真实 dispatcher open/apply/save/commit/reload/close
- [ ] 全 fixtures 未编辑 Save L0
- [ ] 全 fixtures 正文编辑 Save/reopen L1
- [ ] pending input 立即 Save flush
- [ ] save 期间继续输入仍保持 dirty
- [ ] timeout/retry/duplicate/stale ack
- [ ] resync 与 blocked recovery
- [ ] A/B 文档快速切换和旧异步结果
- [ ] autosave clean/dirty/blocked
- [ ] external conflict 不覆盖
- [ ] atomic write/rename/permission failure
- [ ] prepare 后外部替换与不配合锁的竞争写入
- [ ] write/commit response 丢失、重复 saveOperationId、启动 receipt reconcile
- [ ] reload/close/save-as flush barrier
- [ ] parser/render failure 不影响 Source
- [ ] flag off legacy 与 flag on lossless owner 隔离
- [ ] 脱敏 E2E artifacts 保存

## 人工验证记录

- 验收人/环境：NOT RECORDED
- [ ] LF/CRLF/BOM/尾部 2/3 line-break-boundary fixtures
- [ ] 不编辑 dirty/mtime
- [ ] 中文+emoji 正文编辑立即保存并重开 hash
- [ ] autosave 工作流
- [ ] 外部修改 conflict
- [ ] blocked pipeline 阻止 Save 且恢复文本可复制
- [ ] A/B 切换无串文档
- [ ] flag off legacy 可用
- [ ] 错误提示清楚且无正文泄漏

人工结论：NOT STARTED

## Reviewer 与决定

- [ ] 保存路径无 serializer/normalize/PM source
- [ ] dirty 为 revision/pending
- [ ] async identity 与 lifecycle cleanup
- [ ] 按操作 identity matrix；保存变更 file identity 不误拒绝 N+1 patch
- [ ] guarded-write 替换点复核与 outcome reconcile
- [ ] 真实 dispatcher 非 mock-only
- Reviewer：NOT RECORDED
- Program Go/No-Go：NOT STARTED
