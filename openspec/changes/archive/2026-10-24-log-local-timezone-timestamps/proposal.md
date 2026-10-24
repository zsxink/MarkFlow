# Proposal

## Why

日志时间戳与按日轮转当前都使用 UTC（`tracing_subscriber::fmt()` 默认 `SystemTime` 计时器输出 UTC `Z` 时间戳；`tracing_appender::rolling::daily` 内部用 `now_utc()` 判跨天），排查问题时需要手工换算时区，且「当天日志文件」的边界与本地日期错位——在 UTC+8 机器上日志文件实际覆盖「本地 08:00 → 次日 08:00」。

## What Changes

- 日志行时间戳改为运行平台本地时间，RFC 3339 格式并带本地时区偏移（如 `2026-10-24T08:22:34.274+08:00`），不再输出 UTC `Z` 后缀。
- 日志文件按**本地日期**跨天切换，`markflow.log.YYYY-MM-DD` 文件名中的日期即本地日期。
- 保留项不变：7 天清理（`LOG_RETENTION_DAYS`）、脱敏逻辑（`redact_message` 等）、非阻塞写入、日志级别策略。
- 不修改 `crash-logging` 既有要求（panic 钩子与脱敏行为不变）；时间戳格式变化由新能力规格承载。

## Capabilities

### New Capabilities

- `log-local-time`: 日志时间戳与按日轮转使用运行平台本地时区的行为要求。

### Modified Capabilities

（无 — `crash-logging` 的 panic 钩子与脱敏要求不受影响）

## Impact

- **代码**：`src-tauri/src/logger.rs`（`init_logging` 的时间戳计时器与文件轮转策略）、`src-tauri/src/logger/tests.rs`（新增本地时间格式/轮转测试）。
- **依赖**：`tracing-subscriber` 启用 `chrono` feature 并引入 `chrono`；`tracing-appender` 轮转改为自定义策略（`Rotation::NEVER` + 每日按本地日期滚动或自管文件切换）。避免 `time` crate 的 `LocalTime`（需 `--cfg unsound_local_offset`，多线程下取本地时区有 UB 风险）。
- **前端**：`src/infra/logger.ts` 不需改动（时间戳由 Rust subscriber 生成）；`e2e/run.mjs` 仅复制/脱敏日志文件，不解析时间戳，不受影响。
- **日志文件格式**：时间戳从 `...Z` 变为 `...+08:00`（或对应本地偏移），属于对外可见格式变化。
