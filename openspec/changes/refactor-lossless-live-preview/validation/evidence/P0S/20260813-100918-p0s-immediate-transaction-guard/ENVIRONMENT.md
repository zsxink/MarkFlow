# 不可变环境快照 — P0S corrective run 20260813-100918

| 字段 | 实测值 |
| --- | --- |
| 记录时间 | 2026-08-13 10:09:18 +0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Corrective start HEAD | `98847901b8a0ea871f05bad09c7c6faa3e7bf82e` |
| Candidate state | 产品、测试与验证文档位于工作树；最终 commit 待 Program Owner/执行者创建 |
| OS | Darwin 25.5.0, arm64 |
| Node | v24.17.0 |
| npm | 11.13.0 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI | tauri-cli 2.11.3 |
| Feature flags/settings | legacy ProseMirror 默认路径；autosave=true / interval=10000ms；无 lossless flags |
| Manual fixture directory | `/Users/xian/markflow-test` 未由本 run 读取、写入或整理 |

## 可用性

- macOS automated unit/integration/Rust/build：AVAILABLE。
- 独立 Reviewer desktop lifecycle：PENDING；不得复用实现者已启动的进程。
- 人工立即 Save/A→B/close：PENDING，由 xian 使用全新 Markdown 副本执行。
- Windows/Linux desktop：本 run 未执行。

