# 验证问题目录

状态：ACTIVE（P0S corrective blockers）

- [`ISSUE-001-inflight-save-cross-document-contamination.md`](./ISSUE-001-inflight-save-cross-document-contamination.md) — Data Loss / Cross-document / Save Safety
- [`ISSUE-002-save-lock-await-gap.md`](./ISSUE-002-save-lock-await-gap.md) — Save Safety
- [`ISSUE-003-p0s-desktop-lifecycle-gap.md`](./ISSUE-003-p0s-desktop-lifecycle-gap.md) — Save Safety / Validation Gap

每个失败建立独立 Markdown 文件，命名 `ISSUE-<number>-<slug>.md`。编号在本目录递增。问题关闭前必须链接修复 commit 和通过的验证 run。

严重度优先级：Data Loss、Security、Cross-document、Save Safety、Functional、Performance、Visual、Flaky。前四类阻止阶段 Go。
