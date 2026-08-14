# P1A 验证记录：最小 Lossless Core

总体状态：**技术验收 PASS；Program Owner 决定待确认**。此前的
`20260813-p1a-core-0967a06` 为不可改写的历史证据，不能覆盖随后发现的 P1A
缺陷。修复候选 `9ad0513` 已通过新的独立 evidence run、独立 Reviewer 和 AI Core
contract acceptance；P1A 无产品 UI，按 Program Owner 的 2026-08-14 授权不要求 xian
执行技术清单。最终是否启动 P1B 仍由 Program Owner 明确确认。

正式设计：[P1A：最小 Lossless Core](../../design/phases/P1A-lossless-core.md)

## Candidate identity

| Branch | Commit | Core manifest | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `648e9a3` | `markflow-core/Cargo.toml`（独立 crate） | `20260813-p1a-core-0967a06` |

## Corrective candidate（2026-08-14）

| Branch | Candidate commit | Run ID | 自动化结论 | Reviewer / 人工 / Program Owner |
| --- | --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `9ad0513` | `20260814-p1a-corrective-core` | PASS；见该 run 的 `RUN.md` 与原始 logs | **PASS ×2 / PENDING / PENDING** |

本轮修复覆盖 fresh open/reload clean revision、reload 前 delayed patch identity、
multi-change base-snapshot EOL inheritance，以及 PositionMap/text geometry mismatch。
独立 Reviewer 报告见 `validation/evidence/P1A/20260814-p1a-final-9ad0513/REVIEW.md`；
AI acceptance 见 `validation/evidence/P1A/20260814-161034-p1a-ai-contract-9ad0513/`。

### Corrective 独立复核（2026-08-14）

**两个独立 Reviewer 均对候选 `9ad0513` 判 PASS：**

1. `20260814-p1a-corrective-core/REVIEW.md` — 状态 **PASS**：4 项修复根因均确认属实且修复正确；
   门禁/fixture/故障注入全部独立复验通过。
2. `20260814-p1a-final-9ad0513/REVIEW.md` — **Reviewer GO**：独立 harness 复现 4 项修复为 passing，
   全部门禁（含 npm test 375 项 / OpenSpec strict）通过；无 P0/P1 缺陷。

**唯一 Open finding（P2，非 P1A 阻塞）**：transaction-id 重复保护在 256 条已接受事务后失效
（`TRANSACTION_RETRY_WINDOW_CAPACITY` 淘汰后同 id 不同 payload 可被当作新事务接受）。
须在 P1B 协议冻结 session-lifetime 唯一性规则并测试，不重新打开任何 corrective 数据完整性缺陷。

两者均声明：**人工验收与 Program Owner Go/No-Go 仍 PENDING**，不得据此标记 P1A 完成。

## AI Coding 验证

- [x] Core `cargo fmt --check`
- [x] Core `cargo clippy -D warnings`
- [x] Core 全量 tests（历史 run：78 项；corrective run：92 项全绿，见 `20260814-p1a-corrective-core/gate_core_test.log`）
- [x] L0 全 canonical fixtures（24 项）
- [x] 零 patch 重复 prepare-save 等于 original bytes，revision/hash 不变且不依赖 parser/serializer
- [x] L1 文首/正文/文尾/跨行 edits（95 intents 全匹配 oracle）
- [x] BOM 与 LF/CRLF/CR/Mixed boundary provenance
- [x] 普通 inherit 固定顺序与显式 paste EOL provenance
- [x] provenance 数量不符时 Patch 原子拒绝
- [x] UTF-16↔UTF-8↔source byte property tests
- [x] surrogate/emoji/ZWJ/combining boundary negative tests
- [x] stale revision 与 overlapping change rejection
- [x] transaction retry 幂等与 duplicate mismatch rejection
- [x] invalid UTF-8 不覆盖
- [x] prepare-save stale revision rejection
- [x] failure atomicity：text/revision 不变
- [x] 1MB/10MB/50MB benchmark
- [x] panic/unwrap 审计（非测试代码仅 2 处可证明不可触发的 `.expect()`）
- [x] AI API→test mapping 完成（见 `validation/evidence/P1A/20260813-p1a-core-0967a06/`）

Miri/sanitizer：stable toolchain 无 `cargo-miri` 组件，**不可用已如实记录**（P1A §4 不允许伪报通过）。

## Core contract acceptance

- 验收方式：Codex AI Core contract acceptance（Program Owner 授权；P1A 无产品 UI）
- [x] 审阅五组代表性 byte diff、零 patch source replay 与 L0/L1 byte contract
- [x] 审阅 Mixed EOL 新增换行、invalid UTF-8、Core scope 和 benchmark
- [x] 记录 parser/renderer 不参与 Core 保存主链

AI acceptance 结论：**PASS**。详见
`validation/evidence/P1A/20260814-161034-p1a-ai-contract-9ad0513/AI-ACCEPTANCE.md`。

## Reviewer 与决定

> 下列 `2026-08-13` reviewer 结论只适用于历史 candidate。对 corrective candidate `9ad0513`
> 的独立复核已于 2026-08-14 完成：**两个独立 Reviewer 均判 PASS**（见上方 Corrective 独立复核节）。
> 非 UI Core acceptance 已由 AI 完成；Program Owner Go/No-Go 仍为 **PENDING**，不得在
> 收到用户启动 P1B 的明确决定前按任何 Reviewer 结论勾选 P1A 完成。

### 历史 candidate（2026-08-13，已 superseded 供参考）

- [x] Reviewer 重跑随机 fixtures（7 个 fixture SHA-256 实测与 manifest 一致）
- [x] Reviewer 检查 source bytes 可回放（PASS）
- [x] Reviewer 检查 patch 原子性/幂等/PositionMap（PASS）
- [x] Reviewer 对照 spec 检查 EOL 继承顺序与 DTO（CONDITIONAL PASS，§3.5 已冻结）
- Reviewer：fresh-context 独立 Reviewer → **CONDITIONAL PASS**（历史 candidate `648e9a3`）
- Open blocking issues：NONE（reviewer 5 项观察已处置：#1 已提交、#2 已冻结、#3 文档、#4 P1B 观察、#5 环境）
- Program Go/No-Go：NOT STARTED（待用户明确决定是否启动 P1B）

### Corrective candidate（2026-08-14）— 当前有效

- Reviewer：**两个独立 Reviewer → PASS / Reviewer GO**（候选 `9ad0513`）
- Open blocking issues：NONE（唯一 Open finding 为 P2 transaction-id 保留窗口，非 P1A 阻塞，P1B 处理）
- Core contract acceptance：**AI PASS**（`20260814-161034-p1a-ai-contract-9ad0513`）
- Program Go/No-Go：**NOT STARTED**（待用户明确决定是否启动 P1B）

### Reviewer 发现与处置（2026-08-13）

独立 Reviewer 发现 §3.5 多 overflow inherit 的语义缝隙：设计 01 §3.5 "超出部分继续使用
同一固定邻域顺序" 未定义"同一顺序"是逐项重走右→左→dominant，还是邻域序列只消费一次。
Reviewer 独立推导 sequential-advance 语义（右→左→dominant 顺序消费），与实现 AI 原始
实现一致；实现 AI 中途一次纠偏误引入"全部 overflow 取右邻"，Reviewer 测试复现后已改回
sequential-advance，并新增判分测试 `inherit_overflow_discriminator_left_vs_dominant`
锁定语义（commit `648e9a3`）。该语义不改变 L0/L1 byte contract。
