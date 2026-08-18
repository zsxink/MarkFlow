# Validation Run Record — P2-A corrective（heading level class）

状态：COMPLETED（修复 + 测试 + 全量 gate 通过）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P2（corrective） |
| Run ID | `20260818-p2-corrective-p2a-heading-level` |
| Date/time | 2026-08-18 |
| Agent/operator | Claude Code（AI coding agent） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `c5a820d`（修复前）→ corrective 修复在工作树 |
| Dirty status | DIRTY（修复未提交） |
| Feature flags | `losslessCoreSession`（off 默认）、`codemirrorLivePreview`（off 默认） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `b0a3ef16d81172847e8627de25f8e7f14536073384a6736523136173123c524d` |

## Scope

- 触发：P2 人工验收发现 P2-A（heading 级别类 `.mf-h1`-`.mf-h6` 未应用）
- 修复：`src/lib/lossless/projection.ts`（ConstructRange.level + decorationFor(range.cls, range.level)）
- 测试：`src/lib/lossless/projection.test.ts`（新增「heading level classes applied」）
- 验收 harness：`e2e/specs/lossless/p2-acceptance.e2e.mjs` + `e2e/run-lossless-acceptance.mjs`（保留作验收证据）

## Commands

| ID | Command | Exit | Status |
| --- | --- | --- | --- |
| R01 | `npx tsc --noEmit` | 0 | PASS |
| R02 | `npm run test -- src/lib/lossless/projection.test.ts` | 0 | PASS（6/6） |
| R03 | `npm run test` 全量 | 0 | PASS（420 / 35 files） |

## 结论

P2-A 已修复：heading 分级 class（mf-h1..mf-h6）生效，新增测试锁定回归。不改变 P2 GO（条件性）判定。