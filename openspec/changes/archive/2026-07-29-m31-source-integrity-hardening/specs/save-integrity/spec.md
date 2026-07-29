# save-integrity Specification

## Purpose
定义保存完整性保障：RAII SaveLease、per-path save coordinator、全内容 fingerprint、同目录原子替换。

## ADDED Requirements

### Requirement: per-path SaveCoordinator

系统 SHALL 提供 `PathSaveCoordinator`，对同一 canonical path 的保存操作做串行化。完整的保存原子单元为：compare identity → temp write + fsync → rename → 发布新 identity。

#### Scenario: 同路径并发保存串行化

- **WHEN** 两个 session 同时保存同一路径
- **THEN** `PathSaveCoordinator` 串行化两个保存操作
- **THEN** 先到者执行完整的保存原子单元
- **THEN** 后到者执行 identity 比对
- **WHEN** 后到者的 identity 因先到者完成而失效
- **THEN** 后到者返回 `CONFLICT` 错误
- **THEN** 不静默覆盖先到者的写入

### Requirement: 全内容 fingerprint

最终冲突判断 SHALL 使用全内容 SHA-256 fingerprint。size + mtime 作为快速预检（fast path），仅在预检不匹配时回退到全内容 checksum。

#### Scenario: size+mtime 匹配跳过 checksum

- **WHEN** 保存前 `host.stat_identity()` 返回的 size+mtime 与 `opened_identity` 完全匹配
- **THEN** 跳过全内容 fingerprint 计算
- **THEN** 直接执行写入

#### Scenario: size+mtime 不匹配触发 checksum

- **WHEN** 保存前 size 或 mtime 不匹配
- **THEN** Runtime 计算当前文件的 SHA-256 fingerprint
- **WHEN** fingerprint 与 opened_identity 一致（外部工具只改了 mtime，未改内容）
- **THEN** 允许保存
- **WHEN** fingerprint 不一致
- **THEN** 返回 `CONFLICT` 错误
- **THEN** 不写入磁盘

### Requirement: 同目录原子替换

保存的 atomic write SHALL 使用临时文件 + rename 模式，临时文件与目标保持同目录以确保跨文件系统安全。

#### Scenario: 临时文件在同目录

- **WHEN** 执行 atomic write
- **THEN** 临时文件创建在与目标文件相同的目录
- **THEN** 写入内容后执行 fsync
- **THEN** 通过 `std::fs::rename` 实现原子替换
- **THEN** 目标文件路径在 rename 后指向新数据

#### Scenario: rename 失败不丢失原文件

- **WHEN** rename 操作失败（如磁盘空间满）
- **THEN** 临时文件保留
- **THEN** 原文件内容不受影响
- **THEN** 返回明确的写入错误
- **THEN** 临时文件由清理逻辑删除

### Requirement: Save As 通过 Runtime 权威路径

Save As 操作 SHALL 创建新的 Core session 并通过 `save_document` 执行写入，不调用 `getMarkdown()` 或 legacy serializer。

#### Scenario: Save As 创建新 session

- **WHEN** 用户在 Core Source 模式执行 Save As
- **THEN** 系统创建一个指向新路径的 Core session
- **THEN** 将当前 Core confirmed text 作为新 session 内容
- **THEN** 在新 session 上调用 `save_document`
- **THEN** 写入成功后替换当前 session 的目标路径
- **THEN** 全程不调用 getMarkdown()/ProseMirror serializer
