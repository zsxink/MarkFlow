# Tasks

## 1. 拆分 CI job

- [x] 1.1 把 `.github/workflows/ci.yml` 的 `audit-and-test` 拆成 `web-checks`（无 apt）与 `rust-checks`（apt + cargo），并给两个 job 各加 `timeout-minutes`
- [x] 1.2 `web-checks` 承担 npm ci / audit / test / tsc / capability / openspec / archive-sync / layering / build / bundle-size
- [x] 1.3 `rust-checks` 承担 apt / cargo test / fmt / clippy，且不安装 Node、不构建前端

## 2. apt 依赖安装优化

- [x] 2.1 用 `actions/cache@v4` 缓存 `/var/cache/apt/archives`，key 带周号并配 `restore-keys` 前缀
- [x] 2.2 安装步骤优先 `--no-download`，失败回退网络安装
- [x] 2.3 给 `apt-get update` / `install` 加 `Acquire::Retries=5` 与 30s 连接超时
- [x] 2.4 给 apt 安装步骤加 `timeout-minutes: 8`

## 3. 移除过时冗余检查

- [x] 3.1 构建步骤从 `npm run build`（`tsc && vite build`）改为 `npx vite build`，避免与前面的 `tsc --noEmit` 重复

## 4. 修复阻塞 `rust-checks` 的 Linux 编译错误

main 上 `Run Rust tests` 已失败（run 39934417518），PR #366 把 `export.rs` 拆成模块时漏了 cfg 门控：`print_webview` 引用了被 `#[cfg(target_os = "macos")]` 门控掉的 `WebviewWindowBuilder` / `WebviewUrl`，`tests.rs` 也引用了门控掉的 `cleanup_pdf_after_delays`。新 job 会继承这个红。

- [x] 4.1 `mod.rs`：把 `WebviewUrl` / `WebviewWindowBuilder` 改为无条件 import（`print_webview` 在所有桌面平台都注册），`PathBuf` 改为 macOS 门控
- [x] 4.2 `tests.rs`：把 `cleanup_pdf_after_delays` 与 `Duration` 改为 macOS 门控 import

## 5. 验证

- [x] 5.1 移走 `dist/` 后确认 `cargo check --tests` 通过（证明 Rust job 不依赖前端产物）
- [x] 5.2 `cargo test`（152 通过）、`cargo fmt -- --check`、`cargo clippy --all-targets -- -D warnings` 通过
- [x] 5.3 `npx vite build` + `bash scripts/check-bundle-size.sh` 通过
- [x] 5.4 `npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs`、`bash scripts/check-capabilities.sh`、`bash scripts/check-archive-synced.sh`、`npm run validate:openspec` 全部通过
- [x] 5.5 `actionlint` 校验 `ci.yml` 无错误
- [ ] 5.6 PR 首次运行后确认：`web-checks` 在 3 分钟内出结论；第二次运行 apt 步骤命中缓存

## Workflow follow-up

- 合入后归档 change 并同步 `ci-runtime-budget`、`archive-sync-gate` 主规范
- 观察 1–2 次运行，把实测耗时回填到 issue #365
