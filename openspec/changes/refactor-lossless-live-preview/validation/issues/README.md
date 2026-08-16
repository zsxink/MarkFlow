# 验证问题目录

状态：ALL CLOSED（P0S 阶段，2026-08-13）

- [`ISSUE-001-inflight-save-cross-document-contamination.md`](./ISSUE-001-inflight-save-cross-document-contamination.md) — Data Loss / Cross-document / Save Safety — **FIXED**（`d74a79d`，closure 见正文）
- [`ISSUE-002-save-lock-await-gap.md`](./ISSUE-002-save-lock-await-gap.md) — Save Safety — **FIXED**（`d74a79d`，closure 见正文）
- [`ISSUE-003-p0s-desktop-lifecycle-gap.md`](./ISSUE-003-p0s-desktop-lifecycle-gap.md) — Save Safety / Validation Gap — **FIXED**（`d74a79d`，closure 见正文）
- [`ISSUE-004-p0s-final-evidence-integrity.md`](./ISSUE-004-p0s-final-evidence-integrity.md) — Validation / Release Gate — **CLOSED**（2026-08-13；final run manifest 16/16 0 mismatch + final gate PASS + Program GO）
- [`ISSUE-005-stale-receipt-blocks-lossless-open-blank-editor.md`](./ISSUE-005-stale-receipt-blocks-lossless-open-blank-editor.md) — Functional（P1B 人工验收阻塞）— **OPEN，修复已应用待复测**（旧 schema receipt 触发 corruption gate + lossless 打开失败不回滚视图 + 模式 UI 不同步）

每个失败建立独立 Markdown 文件，命名 `ISSUE-<number>-<slug>.md`。编号在本目录递增。问题关闭前必须链接修复 commit 和通过的验证 run。

严重度优先级：Data Loss、Security、Cross-document、Save Safety、Functional、Performance、Visual、Flaky。前四类阻止阶段 Go。
