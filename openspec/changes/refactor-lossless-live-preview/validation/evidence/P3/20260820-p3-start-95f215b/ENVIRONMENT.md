# ENVIRONMENT.md — P3 start identity (immutable evidence)

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-20（P3 start run） |
| 主机/设备 | xian 的 macOS 开发机（run 时实测） |
| OS/版本 | macOS 26.5.2 (Darwin 25.5.0, Build 25F84) |
| CPU 架构 | arm64 |
| WebView 版本 | WebKit（Tauri v2 运行时；未实测具体版本，记 run 时实测） |
| Node | v24.17.0 |
| npm | 12.0.2 |
| Rust | rustc 1.96.0 |
| Cargo | 1.96.0 |
| Tauri CLI | tauri-cli 2.11.3 |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `95f215b22e681e6f90f35f0d7062bd30ddc97aa1`（P3 start HEAD） |
| feature flags | `losslessCoreSession` = **default ON**（`7ff9da1` 提前默认开启，未验收候选）；`codemirrorLivePreview` = **default ON**（同上）；opt-out：`localStorage['markflow.losslessCoreSession']==='0'`、`localStorage['markflow.codemirrorLivePreview']==='0'`；autosave 使用产品配置（默认 `autosave=true` / `autosaveInterval=10000`） |
| 工作树状态 | clean（git status 无未提交/未跟踪改动） |
| 输入法 | 未登记（P3 desktop 实测时记录） |
| screen reader | 未登记 |
| 显示缩放 | 未登记 |