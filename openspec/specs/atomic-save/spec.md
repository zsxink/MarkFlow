# atomic-save Specification

## Purpose
定义原子写入基础设施，防止崩溃或断电导致文件损坏，并供文档和设置持久化使用。

## Agent Context
- **源码入口：** `src-tauri/src/commands/files.rs` 中的 `atomic_write` 与 `write_file`；`src-tauri/src/commands/settings.rs` 中的 `save_settings_inner`。
- **关联规范：** `autosave-reliability`、`error-handling`、`type-system`。
- **不变量：** 临时文件必须与目标位于同一目录；只有同步成功后才能替换目标；任一失败路径都不得截断旧文件，并应尽力清理临时文件。
- **验证：** `cd src-tauri && cargo test atomic_write`；`npx openspec validate atomic-save --strict`。

## Requirements

### Requirement: 原子文件写入
The system SHALL provide an `atomic_write` function that writes content to a file atomically, ensuring the target file is never left in a truncated or corrupted state.

#### Scenario: 原子写入成功
- **WHEN** `atomic_write(path, content)` 被调用
- **THEN** 应在与目标相同的目录中创建临时文件
- **THEN** 内容应写入临时文件
- **THEN** 临时文件应同步到磁盘
- **THEN** 临时文件应自动重命名为目标路径
- **THEN** 旧的目标文件内容将全部替换

#### Scenario: 写入失败保留旧文件
- **WHEN** `atomic_write(path, content)` 被调用
- **AND** 写入临时文件失败（如磁盘已满、权限错误）
- **THEN** 临时文件应被删除
- **THEN** `path` 的原始文件应保持不变且不损坏

#### Scenario: 重命名失败清理
- **WHEN** `atomic_write(path, content)` 被调用
- **AND** 写入成功但重命名为目标失败
- **THEN** 临时文件应被删除
- **THEN** `path` 的原始文件应保持不变

#### Scenario: 父目录自动创建
- **WHEN** `atomic_write(path, content)` 被调用
- **AND** `path`的父目录不存在
- **THEN** 写入前应先创建父目录

### Requirement: 清理剩余临时文件
系统 MUST 在启动时清除之前写入失败留下的临时文件。

#### Scenario: 剩余的临时文件被删除
- **WHEN** 申请开始
- **AND** 监视目录中存在与模式 `*.pid.tmp` 或 `*.tmp` 匹配的临时文件
- **THEN** 过时的临时文件（早于阈值或来自死进程）应被删除

#### Scenario: 活动临时文件未删除
- **WHEN** 申请开始
- **AND** 临时文件属于仍在运行的进程
- **THEN** 临时文件不得删除

### Requirement: 文档保存使用原子写入
The `write_file` Tauri command SHALL use `atomic_write` to save document content.

#### Scenario: 文档保存是原子的
- **WHEN** 调用`write_file`命令保存Markdown文件
- **THEN** 写入应在幕后使用 `atomic_write`
- **THEN** 如果写入失败，原文件应保持完整

### Requirement: 设置保存使用原子写入
The `save_settings_inner` function SHALL use `atomic_write` to persist settings.

#### Scenario: 设置保存是原子的
- **WHEN** `save_settings_inner(settings)` 被调用
- **THEN** 写入应使用`atomic_write`写入`settings.json`
- **THEN** 如果写入失败，原来的`settings.json`应保持不变
