# P0 验证环境快照（不可变）

Run ID：`20260813-005131-p0-corrective-zeroedit-lifecycle`

| 字段 | 值 |
| --- | --- |
| 记录时间 | 2026-08-13 00:51:31 +0800 |
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
| commit SHA | `dd5969b`（corrective evidence 提交前基线；evidence 提交后见 git log） |
| dirty status | evidence 提交前：P0 corrective scope 的工作树改动（tasks.md、docs、新增 lifecycle characterization 测试/文档）；另有历史 openspec 文档的未提交改动与未跟踪的 pnpm-lock.yaml / pnpm-workspace.yaml |
| feature flags | 无 lossless flags（legacy ProseMirror 默认路径） |
| 输入法 | 未单独登记（P2/P4B 前确认） |
| screen reader | 未登记（P2/P4B 前确认） |
| 显示缩放 | 未单独登记 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | AVAILABLE | 本次 corrective P0 实测设备 |
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
