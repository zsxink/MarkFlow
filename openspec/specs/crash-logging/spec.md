# crash-logging Specification

## Purpose
定义崩溃日志的结构化上下文记录与敏感内容脱敏要求。

## Agent Context
- **源码入口：** `src-tauri/src/logger.rs`、`src-tauri/src/lib.rs`。
- **关联规范：** `error-handling`、`background-task-lifecycle`、`safe-http-fetch`。
- **不变量：** 崩溃信息保留诊断上下文但不得写入正文、URL 密钥或完整私有路径；日志失败不得替代默认 panic 行为。
- **验证：** `cargo test --manifest-path src-tauri/Cargo.toml`；`npx openspec validate crash-logging --strict`。

## Requirements

### Requirement: 带有崩溃上下文的恐慌钩子
后端 MUST 安装一个紧急钩子，在遵循默认钩子之前，用结构化上下文记录紧急位置和消息。

#### Scenario: 结合上下文捕捉恐慌
- **WHEN** 任何线程恐慌
- **THEN** 恐慌位置和消息被写入结构化日志（已编辑），并且默认的恐慌行为仍然发生

### Requirement: 敏感内容的日志修订
The logging layer SHALL redact full document bodies, URL secrets/query strings, and private absolute path contents before writing them to logs.

#### Scenario: 文档正文未记录
- **WHEN** 日志调用将包含完整的文档文本
- **THEN** 正文被截断/省略，仅记录有限的、非敏感的摘要

#### Scenario: URL秘密已编辑
- **WHEN** 日志调用将包含包含查询参数或嵌入秘密的 URL
- **THEN** 秘密/查询部分被屏蔽

#### Scenario: 私家路径总结
- **WHEN** 日志调用将包含私有绝对文件路径
- **THEN** 文件名或敏感段被屏蔽，同时保留足够的目录层次结构用于诊断
