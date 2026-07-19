# error-handling Specification

## Purpose
定义后端锁恢复、统一错误分类以及前端异常处理的要求。

## Agent Context
- **源码入口：** `src-tauri/src/error.rs`、`src-tauri/src/state.rs` 与 `src/lib/logger.ts`。
- **关联规范：** `crash-logging`、`background-task-lifecycle`、`safe-http-fetch`。
- **不变量：** 可恢复的中毒锁不得 panic；命令失败必须保留稳定分类；用户触发的失败不得静默忽略。
- **验证：** `cargo test --manifest-path src-tauri/Cargo.toml`；`npm test -- src/lib`；`npx openspec validate error-handling --strict`。

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
