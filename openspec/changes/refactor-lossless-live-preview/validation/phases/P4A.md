# P4A 验证记录：Parser 与 Render IR

总体状态：**TECHNICAL TERMINAL RECORDED — `SPIKE_COMPLETE_NO_CORE_IR` / PROGRAM ACCEPTANCE PENDING**（2026-08-29）

正式设计：[P4A：Render IR Spike](../../design/phases/P4A-render-ir.md)

## Candidate identity

| Branch | Commit | Parser/IR flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `5ac06b5`（6.2 spike 文件 uncommitted） | 无产品 flag（离线 spike；`coreRenderIr` 未引入） | run 6.2 `20260829-055341-p4a-5ac06b5/`；run 6.1 `20260829-035314-p4a-f189b0c/`；property 结论 `spike/parser-spike/PROPERTY-REPORT.md` |
| `test/issue-255-lossless-byte-contract` | `d864cc9`（6.8 全 gate，工作树 clean） | `coreRenderIr` 无此 flag（grep 0 命中；未实现即最强 default-off） | 终态 run 6.8 `evidence/P4A/20260829-175840-p4a-d864cc9/`（12/12 gate 全绿 + Reviewer PASS） |

## AI Coding 验证

- [x] parser candidate range comparison（run `evidence/P4A/20260829-035314-p4a-f189b0c/`：Lezer/markdown-rs/pulldown-cmark/comrak × 26 统一 fixtures round-trip 全部 0 INVALID；draft ParseIndex 因 Tauri 无 JVM 运行时记 excluded；初步 qualify/disqualify 见 `spike/parser-spike/REPORT.md` §7）
- [x] license/maintenance/supply-chain record（run 同上 `license.md`：MIT/MIT/MIT/BSD-2-Clause 实测；维护节奏与依赖面记录）
- [x] CJK/emoji/escape/nested/malformed/Mixed EOL source slice properties（run `evidence/P4A/20260829-055341-p4a-5ac06b5/`：TS Lezer + Rust 三候选确定性 property（固定 seed + SPEC 指纹两侧一致）；**0 range 失败** —— P1 上下文 220 例/候选、P2 嵌套包含、P3 malformed 13 例、P7 裸 CR/Mixed EOL、PF frontmatter（已知 SPURIOUS 按冻结清单豁免，无新发现）；markdown-rs 例外见下行）
- [x] range fuzz/deep nesting/huge token（run 同上：P4 随机 boundary 430 例/候选（安全区精确断言）+ P5 校验器 fuzz 全判 INVALID + P6 10k 深嵌套/5MB 巨词/1e5 重复定界符；**markdown-rs 触发淘汰判据**：mixed-container-nest-10k 超 5s budget（实测 11.1s，默认栈 SIGABRT）→ 1 timeout 记录在案；Lezer/pulldown/comrak 全部 0 range 失败，Lezer 维持 QUALIFY，详见 `spike/parser-spike/PROPERTY-REPORT.md` §5）
- [x] versioned IR schema contract — NOT APPLICABLE（ADR §3.3：无 producer，schema 为死代码；P7 任务 10.3/10.4 为 local-range 复查点）
- [x] stale revision/request/document/binding rejection — NOT APPLICABLE（Core-IR IPC 协议无；local 投影在 CM 事务内处理可见区重建/staleness/degraded，P2 任务 4.5/4.10/4.13 证据）
- [x] cancel 无 late mutation — NOT APPLICABLE（无 IPC render 请求可 cancel；见上）
- [x] local→core owner handoff 无重叠 — 部分实施（construct owner registry 本地形态，`renderOwnerRegistry.ts`；`core` owner 为类型位占位、运行时拒绝注册）
- [x] timeout/error local Source fallback — NOT APPLICABLE（无 Core IR 产生 timeout/error；P2 任务 4.13 注入 failure 只回退同一 CM Source）
- [x] Normal/Large/Huge payload/latency/memory — NOT APPLICABLE（无 IR payload；spike 已测 local 增量亚毫秒、10MB 全量 ~0.5s，见 6.1/6.2 run）
- [x] IR off 时 P3 不回归 — 由 6.8 全 gate 复核等效覆盖（`d864cc9` 全绿）
- [x] desktop degraded/retry E2E — NOT APPLICABLE（IR 专属；desktop degraded 投影 E2E 已由 P2/P3 覆盖并在 6.8 复跑 smoke/regression）

## 人工验证记录

- 验收人：PENDING-MANUAL（用户稍后界面人工验证阶段一并执行）
- [ ] table/footnote/reference/frontmatter/HTML/diagram 文档 — PENDING-MANUAL
- [ ] local/widget/fallback handoff 无重复或明显闪烁 — PENDING-MANUAL（自动化基础见 6.8 desktop e2e）
- [ ] 快速输入滚动无旧 UI 倒退 — PENDING-MANUAL
- [ ] 关闭 local construct/widget flag 后基础视图与保存不变 — PENDING-MANUAL（回退 Source，P3 已验证保存不变）
- [ ] local descriptor 异常或 widget timeout/error 局部降级 — PENDING-MANUAL（自动化 failure injection 由 P2/P3 覆盖）
- [ ] Large 文档响应 — PENDING-MANUAL
- [ ] parser ADR 不引入保存 serializer — 自动化：lossless 路径不调用 serializer（P3 3.9.2 spy）+ ADR §4 中性说明；界面阶段复核

人工结论：PENDING-MANUAL

## Reviewer 与决定

- [x] 坐标/identity/cancel/unsafe payload 审查 — 6.2 run `20260829-055341-p4a-5ac06b5/REVIEW.md`（PASS）+ 6.5 run `REVIEW-65.md`（PASS）
- [x] malformed 随机复核 — 6.2 run（property fuzz：随机 boundary 430 例/候选 + 校验器 fuzz 全 INVALID + 深嵌套/巨词）
- Reviewer：`20260829-055341-p4a-5ac06b5/REVIEW.md`、`20260829-071819-p4a-8bb00fe-REVIEW-65.md`、本 run `20260829-175840-p4a-d864cc9/REVIEW.md`（PASS，同意记录终态）
- Technical terminal：**`SPIKE_COMPLETE_NO_CORE_IR`**（2026-08-29；全 gate 12/12 exit 0；ADR §3.2/§3.3 冻结；产品侧 `coreRenderIr` 0 命中）。P4B/P6/P7 可依赖此架构决定。
- Program acceptance：**PENDING-MANUAL**。在 P5/归档前必须完成人工降级/性能复核并确认 ADR；此前不得把 P4A 写成 Program Complete。
