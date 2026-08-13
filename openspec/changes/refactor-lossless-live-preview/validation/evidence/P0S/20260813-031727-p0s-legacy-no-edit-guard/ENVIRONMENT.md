# 不可变环境快照 — P0S run 20260813-031727-p0s-legacy-no-edit-guard

本文件是该 run 运行时实测值的不可变快照，SHA-256 记录于同目录 RUN.md。根目录
`validation/ENVIRONMENT.md` 只作当前模板/索引，后续修改不影响本快照。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-13 03:17:27 +0800 |
| 主机/设备 | 本地 Mac（Tauri dev 运行机） |
| OS/版本 | Darwin 26.5.2（macOS） |
| CPU 架构 | arm64 |
| WebView 版本 | WebKit 605.1.15（Tauri e2e 实测 WebView；P0S desktop E3 待人工确认） |
| Node | v24.17.0 |
| npm | 11.13.0 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI | tauri-cli 2.11.3 |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | ad59b21（P0S start；代码改动尚未提交，evidence 提交后见 git log） |
| feature flags | 无 lossless flags；legacy ProseMirror 默认路径；autosave 使用产品配置（默认 `autosave=true` / `autosaveInterval=10000`） |
| 输入法 | 未使用（自动化 gate 无 IME） |
| screen reader | 未使用 |
| 显示缩放 | 未使用 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | PASS（e2e 真实 WebKit；人工 desktop E3 待执行） | 当前机器 |
| Windows desktop | BLOCKED | 尚未登记设备/runner |
| Linux desktop | BLOCKED | 尚未登记设备/runner |
| CJK IME | NOT STARTED | 尚未登记输入法 |
| VoiceOver/Screen reader | NOT STARTED | P2/P4B 前确认 |
| Network failure injection | NOT STARTED | P3/P4B 前确认 |
| File permission failure | NOT STARTED | P1B 前确认 |
