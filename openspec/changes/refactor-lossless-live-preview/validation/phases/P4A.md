# P4A 验证记录：Parser 与 Render IR

总体状态：BLOCKED by P3

正式设计：[P4A：Render IR Spike](../../design/phases/P4A-render-ir.md)

## Candidate identity

| Branch | Commit | Parser/IR flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `5ac06b5`（6.2 spike 文件 uncommitted，工作树另含调度器其他工作流的既有修改，见 run ENVIRONMENT.md） | 无产品 flag（离线 spike；`coreRenderIr` 未引入） | `20260829-055341-p4a-5ac06b5`（run 6.2：`evidence/P4A/20260829-055341-p4a-5ac06b5/`；property 结论 `spike/parser-spike/PROPERTY-REPORT.md`）；前序 run 6.1：`evidence/P4A/20260829-035314-p4a-f189b0c/` |

## AI Coding 验证

- [x] parser candidate range comparison（run `evidence/P4A/20260829-035314-p4a-f189b0c/`：Lezer/markdown-rs/pulldown-cmark/comrak × 26 统一 fixtures round-trip 全部 0 INVALID；draft ParseIndex 因 Tauri 无 JVM 运行时记 excluded；初步 qualify/disqualify 见 `spike/parser-spike/REPORT.md` §7）
- [x] license/maintenance/supply-chain record（run 同上 `license.md`：MIT/MIT/MIT/BSD-2-Clause 实测；维护节奏与依赖面记录）
- [x] CJK/emoji/escape/nested/malformed/Mixed EOL source slice properties（run `evidence/P4A/20260829-055341-p4a-5ac06b5/`：TS Lezer + Rust 三候选确定性 property（固定 seed + SPEC 指纹两侧一致）；**0 range 失败** —— P1 上下文 220 例/候选、P2 嵌套包含、P3 malformed 13 例、P7 裸 CR/Mixed EOL、PF frontmatter（已知 SPURIOUS 按冻结清单豁免，无新发现）；markdown-rs 例外见下行）
- [x] range fuzz/deep nesting/huge token（run 同上：P4 随机 boundary 430 例/候选（安全区精确断言）+ P5 校验器 fuzz 全判 INVALID + P6 10k 深嵌套/5MB 巨词/1e5 重复定界符；**markdown-rs 触发淘汰判据**：mixed-container-nest-10k 超 5s budget（实测 11.1s，默认栈 SIGABRT）→ 1 timeout 记录在案；Lezer/pulldown/comrak 全部 0 range 失败，Lezer 维持 QUALIFY，详见 `spike/parser-spike/PROPERTY-REPORT.md` §5）
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
