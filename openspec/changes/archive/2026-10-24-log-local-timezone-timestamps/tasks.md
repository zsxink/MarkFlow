# Tasks

## 1. 依赖与时间戳

- [x] 1.1 在 `src-tauri/Cargo.toml` 中添加 `chrono` 依赖（默认 features 含 `clock`），并为 `tracing-subscriber` 启用 `chrono` feature。验证：`cargo check --manifest-path src-tauri/Cargo.toml` 通过。
- [x] 1.2 在 `init_logging()` 中启用 `.with_timer(ChronoLocal::rfc_3339())`，使日志行时间戳为本地时间 RFC 3339 格式（如 `2026-10-24T08:22:34.274+08:00`），不再使用默认 UTC `Z` 计时器。验证：`cargo test --manifest-path src-tauri/Cargo.toml` 中时间戳格式测试通过。

## 2. 本地日期轮转 writer

- [x] 2.1 实现 `LocalDateRollingWriter`（实现 `std::io::Write`）：维护当前文件与缓存本地日期，每次写入用 `chrono::Local::now().date_naive()`（通过可注入的日期提供函数）判断是否跨天，跨天时关闭旧文件并打开 `markflow.log.<新本地日期>`；文件打开失败时降级丢弃该条写入并输出 stderr，不 panic。验证：`cargo test` 中跨天切换测试通过。
- [x] 2.2 单元测试：注入日期提供函数模拟跨天写入，断言文件按本地日期切换、文件名日期与写入日期一致、同日写入不切换文件；并测试 `ChronoLocal::rfc_3339()` 输出以本地偏移结尾且不含 `Z`。验证：`cargo test --manifest-path src-tauri/Cargo.toml logger` 全部通过。
- [x] 2.3 在 `init_logging()` 中用 `LocalDateRollingWriter`（经 `tracing_appender::non_blocking` 包装）替换 `tracing_appender::rolling::daily`，保持 `WorkerGuard`、日志级别、脱敏与 7 天清理逻辑不变。验证：`cargo test --manifest-path src-tauri/Cargo.toml` 全部通过；`npm run tauri dev` 启动后 logs 目录生成 `markflow.log.<本地日期>` 且行时间戳为本地偏移格式（人工观察或以单测为准）。

## 3. 回归验证

- [x] 3.1 确认仓库内无对旧 `Z` 时间戳格式的解析依赖（grep `e2e/`、`src/` 中日志时间戳相关代码），确认 `src/infra/logger.ts` 无需改动。验证：grep 输出与结论记录在 PR 描述或测试注释中。
- [x] 3.2 运行完整质量门禁：`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test`、`npm run build`、`npm test`、`npm run validate:openspec`。验证：全部通过。
