# 不可变环境快照 — P4A task 6.2 run 20260829-055341-p4a-5ac06b5

本文件是该 run 运行时实测值的不可变快照。字段与格式参照
`evidence/P4A/20260829-035314-p4a-f189b0c/ENVIRONMENT.md`（run 6.1）。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-29 05:53 +0800 |
| 主机/设备 | 本地 Mac（Tauri dev 运行机） |
| OS/版本 | macOS 26.5.2（Build 25F84），Darwin arm64 |
| CPU 架构 | arm64 |
| WebView 版本 | 未使用（本 run 为纯自动化 parser spike，无桌面 E2E） |
| Node | v24.17.0 |
| npm | 12.0.2 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI | 未使用（无桌面环节） |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `5ac06b523dc1ca1498aaf5c01566ab6aab9c3c7e`（HEAD 短 SHA `5ac06b5`，即 6.1 提交） |
| 工作树状态 | DIRTY（两部分，见下） |
| — 本任务新增/修改（6.2 产物） | 新增 `spike/parser-spike/property.test.ts`、`spike/parser-spike/lib/property-spec.mjs`、`spike/parser-spike-rust/src/property.rs`、`spike/parser-spike-rust/src/lib.rs`、`spike/parser-spike/PROPERTY-REPORT.md`；修改 `spike/parser-spike/lib/lezer.ts`（kind-owned marker 过滤，见 PROPERTY-REPORT §3.1）、`spike/parser-spike-rust/src/main.rs`（lib+bin 拆分与 `--property` 入口）——全部 uncommitted，任务规定不 commit，由调度器复核后统一提交 |
| — 既有非本任务修改 | `src-tauri/src/lossless/guarded_write.rs`、`src/components/sidebar.conflict.ts`、`src/components/sidebar.fileops.ts`、`src/components/sidebar.fileops.test.ts`、`src/components/sidebar.lossless.conflict.test.ts`、`src/lib/lossless/editorSurfaceBinding.ts`（本 run 开始前已存在于工作树，归属调度器其他工作流；本 run 未读取/未修改任何产品代码） |
| feature flags | 无产品 flag 涉及（spike 不触碰产品代码；`losslessCoreSession`/`codemirrorLivePreview` 保持仓库默认） |
| spike 依赖版本 | `@lezer/markdown` 1.7.0 / `@codemirror/lang-markdown` 6.5.0（node_modules 实装，产品依赖）；Rust：`markdown` 1.0.0 / `pulldown-cmark` 0.13.4 / `comrak` 0.54.0（spike 独立 crate，未加入任何 workspace，未改产品 Cargo.toml） |
| property 生成器 | 固定 seed 列表 `[42,1337,20260829,7,99,12345,5150,8080,314159,271828]` + mulberry32；SPEC_SHA256 指纹 TS/Rust 一致：`74ee61baa5fc2e7e3b498b2a352dc233ef8f989c0b759aadbd72278996ff0996`（两侧 JSON 内记录） |
| 输入法 | 未使用（纯自动化） |
| screen reader | 未使用 |
| 显示缩放 | 未使用 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| TS spike（vitest + @lezer/markdown） | PASS | 本机 node 24 |
| Rust spike（独立 crate 编译运行 + `--property`） | PASS | 本机 cargo 1.96，target/ 在 spike crate 内（git 状态未出现，.gitignore `spike/**/target/` 生效） |
| npm registry / crates.io 网络可达 | NOT APPLICABLE | 本 run 无新增依赖采集 |
| 桌面 E2E / IME / screen reader | NOT APPLICABLE | 本任务是离线 parser property 测试，无 UI 环节 |
