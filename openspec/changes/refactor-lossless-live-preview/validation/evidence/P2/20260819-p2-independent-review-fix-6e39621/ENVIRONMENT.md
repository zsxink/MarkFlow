# 验证环境快照 — P2 独立复核修复 run

本文件是不可变环境证据，随 RUN.md 同目录保存。修改即失效（原文件保留在 git 历史）。

| 字段 | 值 |
| --- | --- |
| 记录时间 | 2026-08-19 |
| Run ID | `20260819-p2-independent-review-fix-6e39621` |
| 阶段 | P2（单一 CodeMirror Surface + 基础 Live Preview）独立复核 corrective |
| 主机/设备 | MacBook（Darwin） |
| OS/版本 | macOS Darwin 25.5.0 |
| CPU 架构 | arm64 (Apple Silicon) |
| Node | v24.x |
| Rust | rustc 1.96.x / cargo 1.96.x |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `6e39621`（冻结修复候选，CLEAN） |
| Dirty status | CLEAN（修复已提交） |
| Feature flags | `losslessCoreSession`（default off）、`codemirrorLivePreview`（default off） |
| Autosave | 默认开 interval 10000ms；E2E lossless suite 用 2000ms |
| 测试工具 | vitest 2.1.9（36 files / 438 tests）、core cargo test 93、tauri cargo test 151、byte-contract、openspec validate --all 61 |