# 不可变环境快照 — P3 closeout run 20260829-p3-closeout-90081fc

本文件是该 run 运行时实测值的不可变快照。根目录 `validation/ENVIRONMENT.md` 只作
当前模板/索引，后续修改不影响本快照。全部 gate 在干净 checkout
`/private/tmp/p3-clean-verify/wt`（worktree，detached at `90081fc`，`git status` clean）
上 fresh 执行；node_modules 由 `npm ci` 全新安装，Rust 在全新 `target/` 下编译。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-29 00:46 +0800 |
| 主机/设备 | 本地 Mac（Tauri dev 运行机） |
| OS/版本 | macOS 26.5.2（Build 25F84），Darwin arm64 |
| CPU 架构 | arm64 |
| WebView 版本 | WebKit 605.1.15（Tauri e2e 实测 WebView） |
| Node | v24.17.0 |
| npm | 12.0.2 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI | tauri-cli 2.11.3 |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `90081fcb2f55ab1c91e6ce3a0c9c6b76f55f304c`（style: core fmt 漂移 + tauri clippy lint 修复，无行为变更；父提交 `b77c7f0` = Reviewer GO 候选基线） |
| feature flags | `losslessCoreSession`=ON（默认，未验收候选）、`codemirrorLivePreview`=ON（默认，未验收候选）；opt-out：`localStorage['markflow.losslessCoreSession']='0'` / `localStorage['markflow.codemirrorLivePreview']='0'` |
| 干净 checkout 路径 | `/private/tmp/p3-clean-verify/wt`（验证完成后删除，日志留档于本 run `gates/`） |
| 输入法 | 未使用（自动化 gate 无 IME；桌面/IME 项依赖人工） |
| screen reader | 未使用 |
| 显示缩放 | 未使用 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| macOS desktop | PASS（e2e 真实 WebKit，4 suite 30 用例） | 当前机器 |
| Windows desktop | BLOCKED | 尚未登记设备/runner（5.12 人工） |
| Linux desktop | BLOCKED | 尚未登记设备/runner（5.12 人工） |
| CJK IME（真组合会话） | NOT STARTED | 依赖人工（5.11/5.12） |
| VoiceOver/Screen reader | NOT STARTED | 依赖人工 |
| 30 分钟连续编辑观察 | NOT STARTED | 依赖人工（5.11/5.12） |
