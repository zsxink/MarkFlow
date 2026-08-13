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

IMPLEMENTED（`d74a79d`）：`saveActiveDocument` 的 `savingInProgress = true` 移到函数入口、
任何 `await` 之前（Save 对话框、pre-save stat、prepare、write、完成全在锁内），整个函数体
`try/finally` 释放，逐条核对所有 return 路径均走 finally，无锁泄漏。顺带修复
`confirmDocumentTransition` 的 `saved === 'saved'`（原 `skipped`/`failed` 字符串 truthy 会放行切换）。
`src/components/sidebar.fileops.ts`。

## Verification

DONE：`src/components/sidebar.fileops.test.ts` 新增「P1 corrective」单元测试——延迟
`get_file_stats` 使第一个 save 阻塞在 pre-save stat，第二个 save 返回 `skipped`，断言
`writeFile` 只调用一次。独立 Reviewer（`20260813-170525`）确认锁前置且无泄漏。

## Closure

- Fix commit: `d74a79d4ce0205f97fc94080966dc9a3af62ddf8`
- Passing run: `20260813-1715-p0s-final-d74a79d`（C01–C13 全 PASS）
- Reviewer: 独立 Reviewer PASS（`20260813-170525-independent-review-d74a79d/REVIEW.md`
  功能复核 PASS；evidence 治理 NO-GO 已由本 final run + ISSUE-004 closure 处理）
- Closed date: 2026-08-13
