# 不可变环境快照 — P1A Core run 20260813-p1a-core-0967a06

本文件是该 run 运行时实测值的不可变快照，SHA-256 记录于同目录 RUN.md。根目录
`validation/ENVIRONMENT.md` 只作当前模板/索引，后续修改不影响本快照。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-13（P1A Core run） |
| 主机/设备 | 本地 Mac（Core 开发机） |
| OS/版本 | macOS 26.5.2（25F84）/ Darwin 25.5.0 |
| CPU 架构 | arm64 |
| 仓库根 | `/Users/xian/Project/book/MarkFlow`（`git rev-parse --show-toplevel` 实测） |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| candidate commit | `0967a06`（P1A 最小 Lossless Core；全 8 项实现任务完成，未开始 reviewer） |
| 工作树 dirty | 代码 checkpoint 已提交；仅剩 tasks.md 状态行与 evidence 目录未提交（属本阶段证据） |
| feature flags | 无 lossless flags；Core 未接入任何产品入口 |
| Core manifest | `markflow-core/Cargo.toml`（独立 crate，无 workspace 依赖） |
| Core 依赖 | `serde`（derive）、`sha2`；dev: `serde_json` |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| Node | v24.17.0 |
| npm | 11.13.0 |
| 输入法 | 未使用（P1A 无 UI） |
| screen reader | 未使用 |
| 显示缩放 | 未使用 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Core 全量 test | PASS | `cargo test` 78 项（35 lib + 43 integration），全绿 |
| Miri | BLOCKED | stable toolchain 无 `cargo-miri` 组件，P1A §4 要求如实记录，不伪报通过 |
| sanitizer | NOT RUN | 与 Miri 同理未启用（需 nightly/目标平台支持） |
| Windows desktop | BLOCKED | 尚未登记设备/runner |
| Linux desktop | BLOCKED | 尚未登记设备/runner |
| CJK IME | NOT STARTED | P1B 起需要 |
| File permission failure | NOT STARTED | P1B 起需要 |
