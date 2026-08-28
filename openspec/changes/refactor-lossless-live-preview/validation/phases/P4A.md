# P4A 验证记录：Parser 与 Render IR

总体状态：BLOCKED by P3

正式设计：[P4A：Render IR Spike](../../design/phases/P4A-render-ir.md)

## Candidate identity

| Branch | Commit | Parser/IR flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `f189b0c`（spike 文件 uncommitted，工作树另含调度器其他工作流的既有修改，见 run ENVIRONMENT.md） | 无产品 flag（离线 spike；`coreRenderIr` 未引入） | `20260829-035314-p4a-f189b0c`（run 6.1：`evidence/P4A/20260829-035314-p4a-f189b0c/`；候选结论 `spike/parser-spike/REPORT.md`） |

## AI Coding 验证

- [x] parser candidate range comparison（run `evidence/P4A/20260829-035314-p4a-f189b0c/`：Lezer/markdown-rs/pulldown-cmark/comrak × 26 统一 fixtures round-trip 全部 0 INVALID；draft ParseIndex 因 Tauri 无 JVM 运行时记 excluded；初步 qualify/disqualify 见 `spike/parser-spike/REPORT.md` §7）
- [x] license/maintenance/supply-chain record（run 同上 `license.md`：MIT/MIT/MIT/BSD-2-Clause 实测；维护节奏与依赖面记录）
- [ ] CJK/emoji/escape/nested/malformed/Mixed EOL source slice properties（6.1 已覆盖 CJK/emoji/Mixed EOL/malformed 的统一 fixtures round-trip；escape/nested/随机 boundary 的 property/fuzz 属任务 6.2）
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
