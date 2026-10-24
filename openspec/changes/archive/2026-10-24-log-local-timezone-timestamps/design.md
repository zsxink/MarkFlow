# Design

## Context

`src-tauri/src/logger.rs` 的 `init_logging()` 目前使用 `tracing_appender::rolling::daily(&dir, "markflow.log")` + `tracing_subscriber::fmt()` 默认计时器，两者都以 UTC 为准（tracing-subscriber 默认 `SystemTime` 计时器输出 UTC `Z`；tracing-appender 内部 `now_utc()` 判跨天）。依赖现状：`tracing = 0.1`、`tracing-appender = 0.2`、`tracing-subscriber 0.3 (features: fmt)`，未引入 `chrono`/`time`。前端 `src/infra/logger.ts` 仅转发事件，时间戳由 Rust subscriber 生成；`e2e/run.mjs` 只复制/脱敏日志文件，不解析时间戳。

## Goals / Non-Goals

**Goals**

- 日志行时间戳为本地时间（RFC 3339 + 本地偏移，如 `2026-10-24T08:22:34.274+08:00`）。
- 按本地日期轮转：`markflow.log.YYYY-MM-DD` 的日期即写入记录时的本地日期，边界为本地午夜。
- 保持 7 天清理、脱敏、非阻塞写入、级别策略不变。

**Non-Goals**

- 不改日志级别策略、脱敏规则、`get_log_dir` 菜单行为。
- 不为旧 UTC 日期日志文件做迁移或改名（由 7 天清理自然淘汰）。
- 不在前端展示日志内容（无日志查看 UI）。

## Decisions

### D1: 时间戳计时器 — tracing-subscriber `chrono` feature + `ChronoLocal::rfc_3339()`

- 启用 `tracing-subscriber` 的 `chrono` feature（其内部引入 `chrono`），并在 `Cargo.toml` 显式声明 `chrono` 依赖（默认 `clock` feature）供轮转逻辑使用。
- `init_logging()` 中 `.with_timer(ChronoLocal::rfc_3339())`，输出 `2026-10-24T08:22:34.274+08:00`。
- **备选（否决）**：`time` crate 的 `LocalTime` — 需要 `--cfg unsound_local_offset`，多线程下获取本地时区有 UB 风险（issue 中明确指出避免）。
- **备选（否决）**：自实现 `FormatTime` 手工格式化 — chrono 的 `rfc_3339()` 已是标准实现，无需重复造轮子。

### D2: 轮转 — 自定义 `io::Write` 包装器，按写入时的本地日期切换文件

`tracing_appender::Rotation` 只支持 UTC 判跨天，无法满足本地日期轮转。方案：

- 写一个实现 `std::io::Write` 的自定义 writer（如 `LocalDateRollingWriter`）：内部维护「当前文件 + 当前本地日期」，每次写入时用 `chrono::Local::now().date_naive()` 计算本地日期，若与缓存日期不同则关闭旧文件、打开 `markflow.log.<新本地日期>`。
- 文件命名沿用现有后缀格式 `markflow.log.YYYY-MM-DD`（与 tracing-appender daily 一致），e2e 与排障脚本无需感知变化。
- 日期计算与文件切换逻辑以可注入的日期提供函数实现，便于单元测试跨天场景。
- **备选（否决）**：`tracing_appender::rolling::Builder` + `Rotation::NEVER` + 外部定时器在本地午夜触发轮转 — 需要额外的后台任务与 writer 替换通道，复杂度高且午夜定时不可靠（挂起/休眠跨午夜时错过触发）。按写入判断天然正确：休眠跨午夜后第一条写入即切换。
- **备选（否决）**：fork/替换 tracing-appender — 维护成本不成比例。
- 性能：`Local::now()` 每次写入一次系统调用级别开销，且整个 writer 已被 `non_blocking` 包装在 worker 线程串行执行，不在热路径上；可忽略。

### D3: 测试策略 — 直接测试 writer 与计时器，不依赖全局 subscriber

`init_logging()` 设置全局 subscriber 且进程内只能设置一次，无法多测。测试聚焦：

- 轮转 writer：注入日期提供函数，模拟跨天写入，断言文件切换与命名。
- 时间戳：断言 `ChronoLocal::rfc_3339()` 输出以本地偏移结尾、不含 `Z`。
- 现有脱敏测试不动。

## Risks / Trade-offs

- [本地时区在运行中被修改（罕见）] → 按写入日期判断自然跟随系统时区，无需额外处理；仅影响切换粒度为逐条。
- [自研轮转 writer 的边界 bug（写入失败、句柄泄漏）] → 文件打开失败时降级为忽略该条写入并记录到 stderr（不 panic）；writer 被 non_blocking worker 独占，无并发竞争。
- [`chrono` 新增依赖体积] → 仅默认 `clock` feature，项目已是 Tauri 桌面应用，体积影响可忽略；license 为 MIT/Apache-2.0，符合 `license-compliance`。
- [时间戳格式变化（`Z` → `+08:00`）影响现有解析脚本] → 仓库内 grep 确认无时间戳解析依赖（e2e 仅复制/脱敏）；属一次性外部可见变化，已在 proposal 声明。

## Migration Plan

无需迁移：新代码直接替换 `init_logging()` 中的 appender 与 timer。旧的 UTC 日期日志文件保留原地，由 7 天按修改时间清理自然淘汰。回滚 = revert 单个提交。

## Open Questions

（无）
