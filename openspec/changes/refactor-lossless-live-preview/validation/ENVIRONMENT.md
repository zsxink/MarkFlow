# 验证环境清单

当前状态：NOT STARTED

本文件是当前环境清单模板/索引，不是历史 run 的不可变证据。AI 在首次 P0 run 和环境变化后更新本文件；每次 run 开始时必须把完整实测值复制到该 run 目录的 `ENVIRONMENT.md`，计算 SHA-256，并在 `RUN.md` 中记录。后续修改本文件不得改变旧 run 的环境证据。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | NOT RECORDED |
| 主机/设备 | NOT RECORDED |
| OS/版本 | NOT RECORDED |
| CPU 架构 | NOT RECORDED |
| WebView 版本 | NOT RECORDED |
| Node | NOT RECORDED |
| npm | NOT RECORDED |
| Rust | NOT RECORDED |
| Cargo | NOT RECORDED |
| Tauri CLI | NOT RECORDED |
| 仓库 branch | NOT RECORDED |
| commit SHA | NOT RECORDED |
| feature flags | NOT RECORDED |
| 输入法 | NOT RECORDED |
| screen reader | NOT RECORDED |
| 显示缩放 | NOT RECORDED |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | NOT STARTED | 当前机器应在 P0 实测确认 |
| Windows desktop | BLOCKED | 尚未登记设备/runner |
| Linux desktop | BLOCKED | 尚未登记设备/runner |
| CJK IME | NOT STARTED | 尚未登记输入法 |
| VoiceOver/Screen reader | NOT STARTED | P2/P4B 前确认 |
| Network failure injection | NOT STARTED | P3/P4B 前确认 |
| File permission failure | NOT STARTED | P1B 前确认 |
