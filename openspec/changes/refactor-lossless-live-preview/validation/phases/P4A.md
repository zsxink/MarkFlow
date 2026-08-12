# P4A 验证记录：Parser 与 Render IR

总体状态：BLOCKED by P3

正式设计：[P4A：Render IR Spike](../../design/phases/P4A-render-ir.md)

## Candidate identity

| Branch | Commit | Parser/IR flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | NOT RECORDED | NOT RECORDED | NOT RECORDED |

## AI Coding 验证

- [ ] parser candidate range comparison
- [ ] license/maintenance/supply-chain record
- [ ] CJK/emoji/escape/nested/malformed/Mixed EOL source slice properties
- [ ] range fuzz/deep nesting/huge token
- [ ] versioned IR schema contract
- [ ] stale revision/request/document/binding rejection
- [ ] cancel 无 late mutation
- [ ] local→core owner handoff 无重叠
- [ ] timeout/error local Source fallback
- [ ] Normal/Large/Huge payload/latency/memory
- [ ] IR off 时 P3 不回归
- [ ] desktop degraded/retry E2E

## 人工验证记录

- 验收人：NOT RECORDED
- [ ] table/footnote/reference/frontmatter/HTML/diagram 文档
- [ ] local/Core handoff 无重复或明显闪烁
- [ ] 快速输入滚动无旧 UI 倒退
- [ ] 关闭 Core IR 基础视图与保存不变
- [ ] timeout/error 局部降级
- [ ] Large 文档响应
- [ ] parser ADR 不引入保存 serializer

人工结论：NOT STARTED

## Reviewer 与决定

- [ ] 坐标/identity/cancel/unsafe payload 审查
- [ ] malformed 随机复核
- Reviewer：NOT RECORDED
- P4A terminal：NOT STARTED (`GO_CORE_IR` / `SPIKE_COMPLETE_NO_CORE_IR` / `NO-GO`)
- Program decision：NOT STARTED
