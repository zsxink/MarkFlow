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

NOT IMPLEMENTED

## Verification

NOT STARTED；必须增加 delayed A save + B switch/edit 回归和真实 desktop lifecycle。

## Closure

- Fix commit: NOT RECORDED
- Passing run: NOT RECORDED
- Reviewer: NOT RECORDED
- Closed date: NOT RECORDED
