# P1A 验证记录：最小 Lossless Core

总体状态：Reviewer CONDITIONAL PASS（条件已解决），待人工验收

正式设计：[P1A：最小 Lossless Core](../../design/phases/P1A-lossless-core.md)

## Candidate identity

| Branch | Commit | Core manifest | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `648e9a3` | `markflow-core/Cargo.toml`（独立 crate） | `20260813-p1a-core-0967a06` |

## AI Coding 验证

- [x] Core `cargo fmt --check`
- [x] Core `cargo clippy -D warnings`
- [x] Core 全量 tests（78 项全绿）
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

## 人工验证记录

- 验收人：NOT RECORDED（等待 Reviewer 后交 xian）
- [ ] 审阅五组代表性 byte diff
- [ ] 审阅零 patch open/prepare-save 的原始 bytes 回放报告
- [ ] 审阅 Mixed EOL 新增换行行为
- [ ] 审阅 invalid UTF-8 产品行为
- [ ] 审阅 Core scope 未包含 parser/DOM/History
- [ ] 审阅 benchmark 可进入 P1B
- [ ] 签署 byte contract

人工结论：NOT STARTED

## Reviewer 与决定

- [x] Reviewer 重跑随机 fixtures（7 个 fixture SHA-256 实测与 manifest 一致）
- [x] Reviewer 检查 source bytes 可回放（PASS）
- [x] Reviewer 检查 patch 原子性/幂等/PositionMap（PASS）
- [x] Reviewer 对照 spec 检查 EOL 继承顺序与 DTO（CONDITIONAL PASS，§3.5 已冻结）
- Reviewer：fresh-context 独立 Reviewer → **CONDITIONAL PASS**
- Open blocking issues：NONE（reviewer 5 项观察已处置：#1 已提交、#2 已冻结、#3 文档、#4 P1B 观察、#5 环境）
- Program Go/No-Go：NOT STARTED（待人工验收）

### Reviewer 发现与处置（2026-08-13）

独立 Reviewer 发现 §3.5 多 overflow inherit 的语义缝隙：设计 01 §3.5 "超出部分继续使用
同一固定邻域顺序" 未定义"同一顺序"是逐项重走右→左→dominant，还是邻域序列只消费一次。
Reviewer 独立推导 sequential-advance 语义（右→左→dominant 顺序消费），与实现 AI 原始
实现一致；实现 AI 中途一次纠偏误引入"全部 overflow 取右邻"，Reviewer 测试复现后已改回
sequential-advance，并新增判分测试 `inherit_overflow_discriminator_left_vs_dominant`
锁定语义（commit `648e9a3`）。该语义不改变 L0/L1 byte contract。
