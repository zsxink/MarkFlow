# P1A 验证记录：最小 Lossless Core

总体状态：BLOCKED by P0

正式设计：[P1A：最小 Lossless Core](../../design/phases/P1A-lossless-core.md)

## Candidate identity

| Branch | Commit | Core manifest | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | NOT RECORDED | NOT RECORDED | NOT RECORDED |

## AI Coding 验证

- [ ] Core `cargo fmt --check`
- [ ] Core `cargo clippy -D warnings`
- [ ] Core 全量 tests
- [ ] L0 全 canonical fixtures
- [ ] 零 patch 重复 prepare-save 等于 original bytes，revision/hash 不变且不依赖 parser/serializer
- [ ] L1 文首/正文/文尾/跨行 edits
- [ ] BOM 与 LF/CRLF/CR/Mixed boundary provenance
- [ ] 普通 inherit 固定顺序与显式 paste EOL provenance
- [ ] provenance 数量不符时 Patch 原子拒绝
- [ ] UTF-16↔UTF-8↔source byte property tests
- [ ] surrogate/emoji/ZWJ/combining boundary negative tests
- [ ] stale revision 与 overlapping change rejection
- [ ] transaction retry 幂等与 duplicate mismatch rejection
- [ ] invalid UTF-8 不覆盖
- [ ] prepare-save stale revision rejection
- [ ] failure atomicity：text/revision 不变
- [ ] 1MB/10MB/50MB benchmark
- [ ] panic/unwrap 审计
- [ ] AI API→test mapping 完成

## 人工验证记录

- 验收人：NOT RECORDED
- [ ] 审阅五组代表性 byte diff
- [ ] 审阅零 patch open/prepare-save 的原始 bytes 回放报告
- [ ] 审阅 Mixed EOL 新增换行行为
- [ ] 审阅 invalid UTF-8 产品行为
- [ ] 审阅 Core scope 未包含 parser/DOM/History
- [ ] 审阅 benchmark 可进入 P1B
- [ ] 签署 byte contract

人工结论：NOT STARTED

## Reviewer 与决定

- [ ] Reviewer 重跑随机 fixtures
- [ ] Reviewer 检查 source bytes 可回放
- [ ] Reviewer 检查 patch 原子性/幂等/PositionMap
- [ ] Reviewer 对照 spec 检查 EOL 继承顺序与 DTO
- Reviewer：NOT RECORDED
- Open blocking issues：NONE RECORDED
- Program Go/No-Go：NOT STARTED
