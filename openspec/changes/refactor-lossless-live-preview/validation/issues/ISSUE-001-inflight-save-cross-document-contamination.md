# Validation Issue — In-flight Save Cross-document Contamination

状态：FIXED（独立 Reviewer PASS，2026-08-13）

| 字段 | 值 |
| --- | --- |
| Issue ID | ISSUE-001 |
| Severity | Data Loss / Cross-document / Save Safety |
| Phase | P0S corrective |
| First run ID | `20260813-100918-p0s-immediate-transaction-guard` |
| Commit/flags | start `9884790` + manifest worktree / legacy ProseMirror |
| Environment | run-local `ENVIRONMENT.md` |
| Owner | implementation AI（待修复） |

## Expected

文档 A 的保存完成只能更新 A 对应的保存状态；切换并编辑 B 后，B 的内容、dirty、
revision 和 file stats 不受 A 的异步回调影响。

## Actual

保存完成回调写入当前全局 document state。A/B revision 数值相同时，A 的完成回调可把
B 错误标记为 persisted/clean；pending-image rewrite 还可能把 A 内容水合进 B。

## Minimal reproduction

A edit → delayed save → discard-switch B → edit B 到相同 revision → release A save。

## Byte/file impact

B 的未保存编辑可能失去 dirty/close/autosave 保护；存在静默数据丢失风险。

## Evidence

`../evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/REVIEW.md`

## Root cause

Legacy revision/file stats/persisted state 是全局活动文档状态，save completion 没有校验
保存开始时的 document identity/generation。

## Fix

IMPLEMENTED（`d74a79d`）：`saveActiveDocument` 保存启动时捕获
`documentGeneration`（`getDocumentGeneration()`）；异步完成后 `setLastReadStats`、
`markDocumentPersisted`、`setMarkdown(prepared)` 全部带
`getDocumentGeneration() === saveGeneration` 守卫；不匹配时保留新文档状态（仅 debug 日志）。
`resetDocumentRevision()` 每次 hydration/reload bump generation，打开 B 必然 bump，
因此 A 的 in-flight 保存完成不会污染 B。`src/components/sidebar.fileops.ts`。

## Verification

DONE：`src/components/sidebar.fileops.test.ts` 新增「P0 corrective」单元测试——A save barrier →
discard-switch B（generation 1→2）→ edit B → release A，断言 `setLastReadStats`/
`markDocumentPersisted` 均未调用、B 保持 dirty。独立 Reviewer（`20260813-170525`）确认
generation 守卫覆盖全部污染路径。desktop 层由 `e2e/specs/p0s/` 立即 A→B discard 测试 + 人工
Section 7（选「不保存」后 A 未被写盘，hash/length/mtime 与基线一致）覆盖。

## Closure

- Fix commit: `d74a79d4ce0205f97fc94080966dc9a3af62ddf8`
- Passing run: `20260813-1715-p0s-final-d74a79d`（C01–C13 全 PASS；本目录 RUN.md）
- Reviewer: 独立 Reviewer PASS（`20260813-170525-independent-review-d74a79d/REVIEW.md`
  功能复核 PASS；evidence 治理 NO-GO 已由本 final run + ISSUE-004 closure 处理）
- Closed date: 2026-08-13
