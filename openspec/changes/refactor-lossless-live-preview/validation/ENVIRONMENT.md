# 验证环境清单

当前状态：P3 in-progress（P2 已 GO；P3 start identity 见 `evidence/P3/20260820-p3-start-95f215b/`）

本文件是当前环境清单模板/索引，不是历史 run 的不可变证据。AI 在每次 run 开始时
必须把完整实测值复制到该 run 目录的 `ENVIRONMENT.md`，计算 SHA-256，并在 `RUN.md` 中
记录。后续修改本文件不得改变旧 run 的环境证据。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-20（P3 start） |
| 主机/设备 | xian 的 macOS 开发机（run 时实测） |
| OS/版本 | macOS 26.5.2 (Darwin 25.5.0, Build 25F84) |
| CPU 架构 | arm64 |
| WebView 版本 | WebKit（Tauri v2；未实测具体版本） |
| Node | v24.17.0 |
| npm | 12.0.2 |
| Rust | rustc 1.96.0 |
| Cargo | 1.96.0 |
| Tauri CLI | tauri-cli 2.11.3 |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `95f215b22e681e6f90f35f0d7062bd30ddc97aa1`（P3 start HEAD） |
| feature flags | `losslessCoreSession` default ON（未验收候选）；`codemirrorLivePreview` default ON（未验收候选）；opt-out `localStorage['markflow.losslessCoreSession']==='0'` 与 `localStorage['markflow.codemirrorLivePreview']==='0'`；autosave 默认 `autosave=true` / `autosaveInterval=10000` |
| 工作树状态 | clean |
| 输入法 | NOT RECORDED |
| screen reader | NOT RECORDED |
| 显示缩放 | NOT RECORDED |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | NOT STARTED | P0S desktop E3 使用真实 Tauri WebView 与真实隔离文件 |
| Windows desktop | BLOCKED | 尚未登记设备/runner |
| Linux desktop | BLOCKED | 尚未登记设备/runner |
| CJK IME | NOT STARTED | 尚未登记输入法 |
| VoiceOver/Screen reader | NOT STARTED | P2/P4B 前确认 |
| Network failure injection | NOT STARTED | P3/P4B 前确认 |
| File permission failure | NOT STARTED | P1B 前确认 |