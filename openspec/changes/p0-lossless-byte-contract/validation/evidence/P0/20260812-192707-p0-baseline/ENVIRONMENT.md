# P0 验证环境快照（不可变）

Run ID：`20260812-192707-p0-baseline`

| 字段 | 值 |
| --- | --- |
| 记录时间 | 2026-08-12 19:27:07 +0800 |
| 主机/设备 | macOS（Apple Silicon） |
| OS/版本 | macOS 26.5.2 (25F84) |
| CPU 架构 | arm64 |
| WebView | WKWebView（系统 WebKit；未单独采集版本） |
| Node | v24.17.0 |
| npm | 11.13.0 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI | @tauri-apps/cli ^2.11.3（本地 devDependency） |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `d6f289e`（evidence 提交前基线） |
| dirty status | `openspec/changes/p0-lossless-byte-contract/tasks.md`（状态更新）；`src-tauri/Cargo.lock`（sha2 dev-dep） |
| feature flags | 无 lossless flags（legacy ProseMirror 默认路径）；e2e 默认 settings：livePreview=true, autosave=false |
| 输入法 | 未单独登记（P2/P4B 前确认） |
| screen reader | 未登记（P2/P4B 前确认） |
| 显示缩放 | 未单独登记 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | AVAILABLE | 本次 P0 实测设备 |
| Windows desktop | BLOCKED | 未登记设备/runner |
| Linux desktop | BLOCKED | 未登记设备/runner |
| CJK IME | NOT STARTED | P2/P4B 前确认 |
| VoiceOver/screen reader | NOT STARTED | P2/P4B 前确认 |

## 日志与配置目录

- 配置目录：`~/Library/Application Support/MarkFlow/`
- 日志：`~/Library/Application Support/MarkFlow/logs`
- e2e 模式：使用 `MARKFLOW_E2E_DATA_DIR` 隔离目录

## 本文件 SHA-256

（由 RUN.md 记录；内容不可变）
