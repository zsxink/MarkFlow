# 验证环境快照 — P2 AI Coding 初始 run

本文件是不可变环境证据，随 RUN.md 同目录保存。修改即失效（原文件保留在 git 历史）。

| 字段 | 值 |
| --- | --- |
| 记录时间 | 2026-08-18 |
| Run ID | `20260818-p2-ai-coding-initial` |
| 阶段 | P2（单一 CodeMirror Surface + 基础 Live Preview） |
| 主机/设备 | MacBook（Darwin XianMac.local） |
| OS/版本 | macOS Darwin 25.5.0 |
| CPU 架构 | arm64 (Apple Silicon) |
| Node | v24.17.0 |
| npm | 12.0.2 |
| Rust | rustc 1.96.0 |
| Cargo | cargo 1.96.0 |
| Tauri CLI | not on PATH（embedded WebDriver driver，无需 tauri-driver） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `8bbcb79`（P2 编码前的基线）/ P2 候选为工作树未提交改动 |
| Dirty status | P2 编码改动未提交（见 git diff） |
| Feature flags | `losslessCoreSession`（default off）、`codemirrorLivePreview`（default off，P2 新增） |
| Autosave | 默认开 interval 10000ms；E2E lossless suite 用 2000ms |
