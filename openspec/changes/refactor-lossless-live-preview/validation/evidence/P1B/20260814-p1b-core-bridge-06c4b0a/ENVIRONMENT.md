# 验证环境清单 — P1B run `20260814-p1b-core-bridge-06c4b0a`

本文件是本次 P1B AI coding run 的不可变环境副本。SHA-256 记录在 RUN.md 与
artifact-manifest.sha256 中；修改本文件不得改变历史 run 的环境证据。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-14（P1B AI coding） |
| 主机/设备 | 本机（macOS desktop） |
| OS/版本 | Darwin 25.5.0（macOS 26.5.2） |
| CPU 架构 | arm64 |
| WebView 版本 | WebKit 605.1.15（Tauri/WebKit E2E 实测） |
| Node | v24.17.0 |
| npm | 11.13.0 |
| Rust | 1.96.0 |
| Cargo | 1.96.0 |
| Tauri CLI | 项目 package.json 内 `tauri` |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `06c4b0a793f152f5441294ef98670f7a13af5b77` |
| feature flags | `losslessCoreSession=false`（产品默认 off；测试/E2E 显式开启，任一 byte fixture 失败保持 off） |
| 输入法 | 未实测（CJK/IME 人工阶段） |
| screen reader | 未实测 |
| 显示缩放 | 未实测 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | 可用 | lossless / p0s / smoke / regression E2E 均在真实 Tauri WebKit WebView 上通过 |
| Windows desktop | BLOCKED | 尚未登记设备/runner |
| Linux desktop | BLOCKED | 尚未登记设备/runner |
| CJK IME | NOT STARTED | P1B 人工阶段确认 |
| VoiceOver/Screen reader | NOT STARTED | P2/P4B 前确认 |
| Network failure injection | NOT STARTED | P3/P4B 前确认 |
| File permission failure | 部分覆盖 | Rust dispatcher atomic-write 失败路径；桌面 permission 注入未跑 |
