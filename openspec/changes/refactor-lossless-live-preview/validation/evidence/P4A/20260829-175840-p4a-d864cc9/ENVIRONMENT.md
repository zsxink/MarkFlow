# 不可变环境快照 — P4A task 6.8 run 20260829-175840-p4a-d864cc9

本文件是该 run 运行时实测值的不可变快照。字段与格式参照
`evidence/P4A/20260829-055341-p4a-5ac06b5/ENVIRONMENT.md` 与
`evidence/P4A/20260829-035314-p4a-f189b0c/ENVIRONMENT.md`。

本 run 为 P4A 任务 6.8 全门禁复核 run：在干净提交 `d864cc9` 上运行全部 protocol gate，
为独立 Reviewer 提供原始证据，并支持把 P4A 终态记录为 `SPIKE_COMPLETE_NO_CORE_IR`。

| 字段 | 当前值 |
| --- | --- |
| 记录时间 | 2026-08-29 17:58 +0800 |
| 主机/设备 | 本地 Mac（Tauri dev 运行机） |
| OS/版本 | macOS 26.5.2（Build 25F84），Darwin arm64 |
| CPU 架构 | arm64 |
| GUI 会话 | Aqua（`launchctl managername` = Aqua；桌面 E2E 可运行，见 RUN.md） |
| WebView 版本 | WebKit（tauri debug e2e 构建内嵌 driver，具体版本见 e2e 日志） |
| Node | v24.17.0 |
| npm | 12.0.2 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| 仓库 branch | `test/issue-255-lossless-byte-contract` |
| commit SHA | `d864cc970da94929e5a7cf3509be0d42eda72b92`（短 SHA `d864cc9`） |
| 工作树状态 | clean（门禁运行前核实；仅存 untracked spec/evidence 产物：`adr/`、历史 evidence run 目录、`renderOwnerRegistry*.ts`、REVIEW-65.md 与本 run 目录） |
| 已下载/实装依赖 | node_modules（@lezer/markdown 1.7.0、@codemirror/lang-markdown 6.5.0 等，产品依赖）；src-tauri target/ 已构建 |
| feature flags | 产品 flag 保持仓库默认（`losslessCoreSession` / `codemirrorLivePreview` 默认 ON）；`coreRenderIr` 无此 flag（grep `src/`,`src-tauri/`,`tests/` 0 命中，未实现即 default-off 最强形式） |
| 输入法 | 未使用（本 run 无 IME 交互） |
| screen reader | 未使用 |
| 显示缩放 | 未使用 |

## 门禁清单（见 RUN.md §3）

npm test / tsc / build / cargo fmt / cargo clippy / cargo test /
openspec validate (--strict, --all) / archive-sync / byte-contract / e2e-smoke /
e2e-regression —— 全部在本机真实运行，原始输出见 `gate-output/`。

## 环境可用性

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| TS 单元测试（vitest） | PASS | 本机 node 24 |
| TypeScript 类型检查 / 构建 | PASS | tsc noEmit 0 错；vite build 成功 |
| Rust fmt / clippy / test | PASS | cargo 1.96；target/ 在 src-tauri 内 |
| OpenSpec 校验 / archive sync | PASS | openspec CLI；scripts/check-archive-synced.sh |
| byte-contract（canonical L0/L1 harness） | PASS | 本机实际运行 |
| 桌面 E2E（tauri debug 构建 + WDIO/WebKit） | PASS | Aqua GUI 会话可用（见 RUN.md §5） |
