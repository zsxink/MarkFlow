# P1A：最小 Lossless Core

## 1. 目标

实现不依赖 UI 的 Rust Core：从原始 bytes 建 session，应用 revision-bound patch，生成符合 L0/L1 的保存 payload。此阶段不接入默认编辑器。

## 2. 输入与依赖

- P0 fixtures、harness、ADR 全部 Go；
- `design/01-byte-fidelity-and-position.md`；
- `design/02-core-session-and-sync.md`；
- draft 的 snapshot/TextBuffer/LineEndingMap 仅作为参考；
- [P1A 验证记录](../../validation/phases/P1A.md)。

## 3. 实施范围

- 独立 `markflow-core` crate 或清晰独立模块；
- `OriginalSnapshot`、`TextBuffer`、`LineEndingMap`；
- branded/newtype positions 与 PositionMap；
- `TextPatch` 原子校验、revision 和 transaction 幂等；
- `LosslessDocumentSession` open/apply/snapshot/prepare-save/mark-persisted/reload/close；
- invalid UTF-8 安全行为；
- golden、property、fuzz boundary 测试；
- 不实现 parser、Render IR、widgets、History。

## 4. AI Coding 验证

AI 必须运行：

- `cargo fmt --all -- --check`；
- `cargo clippy --all-targets --all-features -- -D warnings`，按实际 workspace manifest 调整目录但记录命令；
- Core 全量 `cargo test`；
- P0 canonical fixture L0；
- 每个 fixture 在零 patch 下重复 `prepare-save`，确认 payload 等于 original bytes、revision 不变，且不依赖 parser/serializer；
- 每个 fixture 的正文、文首、文尾、跨行 L1 edits；
- UTF-16/UTF-8/source byte property tests；
- stale revision、overlap、invalid boundary、duplicate retry、duplicate mismatch negative tests；
- Mixed EOL 固定继承顺序、显式 LF/CRLF/CR paste provenance、provenance 数量不符原子拒绝的 golden/negative tests；
- invalid UTF-8 不覆盖测试；
- panic/unwrap 审计与 large input benchmark；
- Miri 或 sanitizer 若环境可用；不可用必须记录，不能伪报通过。

AI 验证报告要列出每个 public API 的测试映射和每个 Core error code 的触发用例。

## 5. 独立 Reviewer 验证

Reviewer 必须：

- 检查 original bytes 是否仍可回放，而不是只存 normalized text；
- 检查每个 EOL boundary provenance；
- 检查 PositionMap 对 surrogate、emoji、CRLF、BOM 边界；
- 检查 patch 原子性和 transactionId 幂等；
- 检查 Patch DTO 能完整表达逐新增换行 provenance，且实现顺序与 spec 一致；
- 检查 prepare-save 不接受 stale revision；
- 随机抽取至少五个 fixture 重跑 hash；
- 使用故障注入证明失败不改变 session revision/text。

## 6. Core contract acceptance（AI 执行；无需产品 UI 人工验收）

P1A 尚未接入产品编辑器，因而没有可供最终用户体验的界面行为。Program Owner 已明确
将这类非 UI 的 Core/byte-contract 复核授权给 AI；AI 必须以独立 Reviewer 报告、可复跑的
byte/hash/benchmark 证据完成下列验收。用户只在后续已接入产品界面的阶段负责真实界面
编辑与效果验收。

AI 必须：

1. 审阅 Core API 是否严格小于 draft 范围；
2. 查看五组代表性 byte diff 报告；
3. 查看零 patch open/prepare-save 报告，确认干净保存 payload 与原始 bytes 完全相同；
4. 确认 LF/CRLF/Mixed/BOM/尾部空行行为符合产品预期；
5. 确认无效 UTF-8 的只读/拒绝提示文案方案；
6. 审阅 benchmark，确认进入 P1B 不会明显阻塞打开/输入；
7. 记录 Core contract acceptance，不把 parser/renderer 需求塞入 Core 保存主链。

## 7. 必须证据

- Core API 文档；
- fmt/clippy/test/property/fuzz/benchmark 输出；
- fixture hash 与 L1 interval reports；
- error code matrix；
- independent review report；
- 人工 contract acceptance。

## 8. Go/No-Go

Go：所有 canonical fixture 的零 patch payload、L0/L1 通过；PositionMap/property tests 通过；无 panic/静默 normalize；Reviewer 与人工批准。

No-Go：任何未触及 byte 改变；EOL 统一化；stale patch 可应用；Core 依赖 parser 才能保存；失败后 session 部分改变。

## 9. 回滚

Core 尚未接入产品入口，可从构建依赖移除。P0 fixtures 和报告保留。禁止为了通过 P1A 删除 legacy 编辑器。
