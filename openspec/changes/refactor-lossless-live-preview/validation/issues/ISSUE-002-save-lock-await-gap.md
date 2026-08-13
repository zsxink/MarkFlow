# Validation Issue — Save Lock Await Gap

状态：FIXED（独立 Reviewer PASS，2026-08-13）

| 字段 | 值 |
| --- | --- |
| Issue ID | ISSUE-002 |
| Severity | Save Safety |
| Phase | P0S corrective |
| First run ID | `20260813-100918-p0s-immediate-transaction-guard` |
| Commit/flags | start `9884790` + manifest worktree / legacy ProseMirror |
| Environment | run-local `ENVIRONMENT.md` |
| Owner | implementation AI（待修复） |

## Expected

同一窗口同一时刻最多存在一个 save operation，包含文件 stat、Save 对话框、图片准备、
写入和完成状态更新。

## Actual

`savingInProgress` 在 Save 对话框或 pre-save stat 的异步等待之后才设为 true；第二次
Cmd+S/autosave 可进入并发保存。

## Minimal reproduction

延迟 `get_file_stats`，连续触发两次 Save，观察两个调用均进入 prepare/write。

## Byte/file impact

可能重复写盘并竞争 pending-image draft、persisted revision 和完成回调。

## Evidence

`../evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/REVIEW.md`

## Root cause

保存互斥权没有在函数通过 clean guard 后、任何异步等待前原子占用。

## Fix

NOT IMPLEMENTED

## Verification

NOT STARTED；补 delayed-stat + double-save 测试并断言一次 write。

## Closure

- Fix commit: NOT RECORDED
- Passing run: NOT RECORDED
- Reviewer: NOT RECORDED
- Closed date: NOT RECORDED
