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

IMPLEMENTED（`d74a79d`）：新增专用 P0S desktop lifecycle suite
`e2e/specs/p0s/`（`npm run test:e2e:p0s`）。`e2e/run.mjs` 在 p0s suite 用
`autosave=true` + `autosaveInterval=2000` 并预置 byte-contract fixtures；
`e2e/wdio.conf.mjs` 注册 p0s suite；`package.json` 新增 `test:e2e:p0s`。
e2e-only（`import.meta.env.MODE === 'e2e'`）暴露 `window.__markflowEditor`/
`__markflowStore` 供测试 dispatch 真实 ProseMirror transaction 与断言 active/dirty
（WebKit 的 `browser.keys`/`execCommand` 不触发 ProseMirror transaction）。

## Verification

DONE：`e2e/specs/p0s/p0s-lifecycle.e2e.mjs` 4 测试在真实 WebKit 605.1.15 全过：
(1) 零编辑打开 7 个 byte-contract fixtures 等待两个 autosave tick 字节/mtime 不变；
(2) 立即 Cmd+S 后磁盘含输入字符（not skipped）；(3) 立即 A→B discard 后 A 未被写盘；
(4) 干净 Cmd+S 不写盘。实现 AI 与独立 Reviewer（`20260813-170525`）分别运行均 PASS。
人工 Section 7 确认 desktop E3 立即 A→B 不写盘 + 立即 Cmd+S 落盘。

## Closure

- Fix commit: `d74a79d4ce0205f97fc94080966dc9a3af62ddf8`
- Passing run: `20260813-1715-p0s-final-d74a79d`（C08 p0s e2e 4/4 PASS）
- Reviewer: 独立 Reviewer PASS（`20260813-170525-independent-review-d74a79d/REVIEW.md`
  功能复核 PASS；evidence 治理 NO-GO 已由本 final run + ISSUE-004 closure 处理）
- Closed date: 2026-08-13
