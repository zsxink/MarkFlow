# Validation Issue — P0S Desktop Lifecycle Coverage Gap

状态：FIXED（独立 Reviewer PASS，2026-08-13）

| 字段 | 值 |
| --- | --- |
| Issue ID | ISSUE-003 |
| Severity | Save Safety / Validation Gap |
| Phase | P0S corrective |
| First run ID | `20260813-100918-p0s-immediate-transaction-guard` |
| Commit/flags | start `9884790` + manifest worktree / legacy ProseMirror |
| Environment | run-local `ENVIRONMENT.md` |
| Owner | implementation AI（待补） |

## Expected

独立 Reviewer 在真实 Tauri/WebKit、autosave=true 环境执行零编辑两个 tick、立即
WYSIWYG Save/A→B/close、in-flight 与跨文档隔离。

## Actual

标准 smoke 通过，但 `e2e/run.mjs` 使用 `autosave:false`，不覆盖 P0S lifecycle。

## Minimal reproduction

检查 `e2e/run.mjs` settings 和现有 smoke specs；没有 autosave=true 的 P0S suite。

## Byte/file impact

自动化无法证明真实桌面下 hash/length/mtime/save count 和跨文档安全合同。

## Evidence

`../evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/gate_e2e.log` 与
`../evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/REVIEW.md`。

## Root cause

通用 smoke 的设计目标是 UI 基础链路，不是 P0S autosave lifecycle。

## Fix

NOT IMPLEMENTED

## Verification

NOT STARTED；新增专用 suite 后由实现 AI 和新的独立 Reviewer 分别运行。

## Closure

- Fix commit: NOT RECORDED
- Passing run: NOT RECORDED
- Reviewer: NOT RECORDED
- Closed date: NOT RECORDED
