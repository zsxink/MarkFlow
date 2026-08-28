# 不可变环境快照 — P4A task 6.1 run 20260829-035314-p4a-f189b0c

本文件是该 run 运行时实测值的不可变快照。字段与格式参照
`evidence/P3/20260829-p3-closeout-90081fc/ENVIRONMENT.md`。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-29 03:53 +0800 |
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
| commit SHA | `f189b0c95fa7fa4e05186a9e95ecc190c6b521b1`（HEAD 短 SHA `f189b0c`） |
| 工作树状态 | DIRTY（两部分，见下） |
| — spike 新增（本 run 产物） | `spike/parser-spike/**`、`spike/parser-spike-rust/**`、`vitest.spike.config.ts`（untracked，任务规定不 commit，由调度器复核后统一提交） |
| — 既有非本任务修改 | `src-tauri/src/lossless/guarded_write.rs`、`src/components/sidebar.conflict.ts`、`src/components/sidebar.fileops.ts`、`src/components/sidebar.fileops.test.ts`、`src/components/sidebar.lossless.conflict.test.ts`、`src/lib/lossless/editorSurfaceBinding.ts`（本 run 开始前已存在于工作树，归属调度器其他工作流；本 spike 未读取/未修改任何产品代码） |
| feature flags | 无产品 flag 涉及（spike 不触碰产品代码；`losslessCoreSession`/`codemirrorLivePreview` 保持仓库默认） |
| spike 依赖版本 | `@lezer/markdown` 1.7.0（node_modules 实装）/ `@codemirror/lang-markdown` 6.5.0（产品依赖）；Rust：`markdown` 1.0.0 / `pulldown-cmark` 0.13.4 / `comrak` 0.54.0（spike 独立 crate 自带 Cargo.toml，未加入任何 workspace，未改 `src-tauri/Cargo.toml` / `markflow-core/Cargo.toml`） |
| perf 合成 fixture 目录 | `<os.tmpdir>/markflow-p4a-spike/`（`perf-1m.md`、`perf-10m.md`、`perf-varied-1m.md`、`perf-varied-10m.md`；确定性 mulberry32 seed 42 生成，SHA-256 见 `perf-ts.json`） |
| 输入法 | 未使用（纯自动化） |
| screen reader | 未使用 |
| 显示缩放 | 未使用 |

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| TS spike（vitest + @lezer/markdown） | PASS | 本机 node 24 |
| Rust spike（独立 crate 编译运行） | PASS | 本机 cargo 1.96，target/ 在 spike crate 内 |
| npm registry / crates.io 网络可达 | PASS | license/版本元数据为当日实测 |
| 桌面 E2E / IME / screen reader | NOT APPLICABLE | 本任务是离线 parser spike，无 UI 环节 |
