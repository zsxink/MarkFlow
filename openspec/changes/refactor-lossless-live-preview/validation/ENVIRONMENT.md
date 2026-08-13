# 验证环境清单

当前状态：P0S IN PROGRESS（由 Program Owner 决定于 2026-08-13 进入 P0S）

本文件是当前环境清单模板/索引，不是历史 run 的不可变证据。AI 在每次 P0S run 开始时
必须把完整实测值复制到该 run 目录的 `ENVIRONMENT.md`，计算 SHA-256，并在 `RUN.md` 中
记录。后续修改本文件不得改变旧 run 的环境证据。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-13（P0S start） |
| 主机/设备 | NOT RECORDED（run 时实测） |
| OS/版本 | Darwin 25.5.0 |
| CPU 架构 | NOT RECORDED（run 时实测） |
| WebView 版本 | NOT RECORDED（P0S desktop E3 实测） |
| Node | NOT RECORDED（run 时实测） |
| npm | NOT RECORDED（run 时实测） |
| Rust | NOT RECORDED（run 时实测） |
| Cargo | NOT RECORDED（run 时实测） |
| Tauri CLI | NOT RECORDED（run 时实测） |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `ad59b21`（P0S start HEAD；证据提交后见 git log） |
| feature flags | 无 lossless flags；legacy ProseMirror 默认路径；autosave 使用产品配置（默认 `autosave=true` / `autosaveInterval=10000`） |
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