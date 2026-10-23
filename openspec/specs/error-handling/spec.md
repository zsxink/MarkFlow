# error-handling Specification

## Purpose
定义后端锁恢复、统一错误分类以及前端异常处理的要求。

## Agent Context
- **源码入口：** `src-tauri/src/error.rs`、`src-tauri/src/state.rs` 与 `src/infra/logger.ts`。
- **关联规范：** `crash-logging`、`background-task-lifecycle`、`safe-http-fetch`。
- **不变量：** 可恢复的中毒锁不得 panic；命令失败必须保留稳定分类；用户触发的失败不得静默忽略。
- **验证：** `cargo test --manifest-path src-tauri/Cargo.toml`；`npm test -- src/infra`；`npx openspec validate error-handling --strict`。

## Requirements

### Requirement: 毒锁门禁助手
The backend SHALL provide a unified lock-access helper that converts a poisoned `Mutex` into a structured error instead of panicking, and SHALL recover state that is safe to reconstruct by taking the inner value.

#### Scenario: 锁因先前的恐慌而中毒
- **WHEN** 助手守护的`Mutex`因前持有者恐慌而中毒
- **THEN** 后续访问通过`into_inner()`恢复内部值并继续（使用`warn`级别的日志），并且不会恐慌该过程

#### Scenario: 可恢复状态重构
- **WHEN** 中毒的互斥锁保护可以安全重建的状态（设置缓存、挂起/cli 文件映射）
- **THEN** helper恢复内部值并继续，呈现`warn`级别的结构化日志

### Requirement: 统一后端错误类型和错误码
The backend SHALL return a unified error type from commands that carries both a stable error code and a human-readable `message` string, so the frontend can classify failures.

#### Scenario: 命令返回分类错误
- **WHEN** 命令失败并出现预期错误（锁毒、IO、序列化、无效工作区）
- **THEN** 调用拒绝包括 `message` 字符串（向后兼容）加上机器可读的错误代码

### Requirement: 前端没有不明原因的空捕获
The frontend SHALL NOT contain `catch` blocks that silently ignore errors without a category. Only explicit best-effort operations MAY ignore an error, and MUST emit a structured `debug`/`warn` log.

#### Scenario: 尽力调用忽略带有日志的错误
- **WHEN** 非关键的即发即弃调用（例如标记初始文件已处理、关闭时保存窗口状态）失败
- **THEN** 使用结构化消息记录错误，并跳过操作，不会造成用户可见的中断

#### Scenario: 可恢复的动作面分类错误
- **WHEN** 用户启动的操作（上下文菜单、图像菜单）失败
- **THEN** 故障被分类（重试/冲突/降级/致命），用户看到的是可恢复的提示，而不是裸露的吐司或静默下降

### Requirement: 生产路径锁获取不得 panic
后端 SHALL NOT 在 `src-tauri/src` 的生产路径上使用会因中毒而 panic 的锁获取方式（例如 `lock().unwrap()` / `lock().expect(...)`）。凡保护可恢复状态、且中毒后必须继续服务的锁点，SHALL 通过统一锁助手（`crate::error::lock_mutex` 或其 infallible 变体 `crate::error::lock_mutex_infallible`）获取锁；中毒时助手 MUST 记录 `warn` 级结构化日志并通过 `into_inner()` 恢复内部值。仅用于主动制造中毒场景的测试代码 MAY 直接调用 `lock().unwrap()`。不 panic 但静默吞掉中毒的一次性尽力型获取为允许的例外，但 MUST NOT 用于保护必须恢复的共享状态。

#### Scenario: 生产路径扫描无裸 unwrap
- **WHEN** 对 `src-tauri/src`（排除 `#[cfg(test)]` 模块）执行 `lock().unwrap()` 扫描
- **THEN** 结果为空，所有锁点均经由统一助手获取

#### Scenario: 中毒锁在文件树过滤路径上恢复
- **WHEN** 忽略匹配器 snapshot 的锁因前持有者 panic 而中毒
- **THEN** 后续调用在取得 guard 后检测到中毒标记，记录 `warn` 日志、清除中毒标记并恢复内部 snapshot，不 panic 调用线程
- **THEN** 恢复后若本次 patterns 有效，则应用并返回新的匹配器 snapshot
- **THEN** 恢复后若本次 patterns 无效，则保留并返回上一次有效的匹配器 snapshot
- **THEN** 文件树读取与事件过滤继续按恢复后的有效规则工作

#### Scenario: 中毒锁在 watcher 溢出恢复路径上降级
- **WHEN** watcher 的恢复范围锁因前持有者 panic 而中毒
- **THEN** 生产者在取得 guard 后检测到中毒标记，跳过该次范围合并，仍标记溢出
- **THEN** 消费端读取恢复范围时退化为根路径 `rescan`，不 panic watcher 线程
- **THEN** 文件树通过该受控重扫恢复一致状态

### Requirement: UI 能力经注入端口上报

基础设施层与引擎层 SHALL NOT 直接 import UI 层来展示提示、对话框或菜单；用户可见反馈 SHALL 通过注入的端口回调完成，端口未注册时 MUST 安全降级并记录结构化日志。

#### Scenario: 基础设施层不反向依赖 UI 层

- **WHEN** 检查 `src/infra/`、`src/editor/`、`src/render/`、`src/export/` 的 import
- **THEN** 不存在指向 `src/ui/` 的 import 语句
- **AND** 提示与对话框能力 SHALL 来自 `src/infra/ui-ports.ts` 暴露的端口

#### Scenario: 端口缺失时的上报降级

- **WHEN** 端口尚未注册而失败路径需要上报用户
- **THEN** 系统 SHALL 记录 `warn` 级结构化日志并继续执行
- **AND** SHALL NOT 因缺少端口抛出未捕获异常

#### Scenario: 已注册端口保持既有用户可见行为

- **WHEN** 端口已由入口装配注册
- **THEN** 用户可见的错误提示、确认对话框与右键菜单行为 SHALL 与分层重构前一致
