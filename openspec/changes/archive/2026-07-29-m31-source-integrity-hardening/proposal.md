## Why

M3 复审确认了 Core-backed Source Mode 的核心机制正确，但 Source 模式的数据完整性存在多个缺口：patch 采用 fire-and-forget 多路并行发送、resync 用 Core 快照直接覆盖本地内容、flush barrier 不完整、close/open 竞态、保存路径缺少原子性保障。这些问题不解决，M4 将在不稳固的基础上叠加功能。M3.1 的目标是将 Source 模式建立为不会静默丢数据、可恢复、可验证、单一权威的闭环。

## What Changes

- 前端同步模型：替换当前并行 fire-and-forget 为单 in-flight + ChangeSet.compose + 有界队列 + 严格 flush barrier
- 生命周期管理：Core open 成功后才创建可编辑 CodeMirror；generation/AbortController 隔离旧异步响应
- close 幂等化：closeCoreSession 变为可 await、幂等、不短路
- WYSIWYG dirty 隔离：WYSIWYG 有未保存修改时阻止切入 Core Source
- Core/Runtime DocumentService：提取可独立测试的 DocumentService，修正 save_in_progress 残留
- reload_document 真实化：经 host 真正读取文件，而非返回内存文本
- 保存路径强化：RAII SaveLease + per-path lock + 全内容 fingerprint + 同目录原子替换
- Save As 迁移到 Runtime 权威链路
- Bridge 协议：全命令 versioned Envelope，完整错误码映射（error code 与 Core/Runtime 枚举 1:1）
- feature flag：从硬编码 true 改为可配置 persisted setting
- CI：cargo fmt --all + clippy --workspace -- -D warnings 全绿
- 测试覆盖：真实 CM transaction compose、延迟/乱序 ack、backpressure 恢复、retry exhaustion、竞态、保真 fixture byte-for-byte

## Capabilities

### New Capabilities

- `source-sync-controller`: 前端同步深模块 — single in-flight、ChangeSet.compose、有界队列、strict flush barrier、recovery replay
- `source-lifecycle-guard`: 生命周期守卫 — generation isolation、幂等 close、WYSIWYG dirty gate、opening 禁用编辑
- `runtime-document-service`: Runtime DocumentService 独立层 — 真实 reload、save_in_progress 修复、per-path save coordinator
- `save-integrity`: 保存完整性 — RAII SaveLease、全内容 fingerprint、per-path lock、原子替换

### Modified Capabilities

- `source-patch-adapter`: 前端同步状态机从并行 fire-and-forget 改为单 in-flight + ChangeSet.compose + 有界队列；flush barrier 覆盖 retained batch / queue / in-flight / backend revision
- `core-bridge-protocol`: 全命令 versioned Envelope；新增错误码 SAVE_FLUSH_TIMEOUT；error code 与 Core/Runtime 枚举 1:1 映射；async command + spawn_blocking
- `core-backed-source-mode`: Core open 成功后才创建 CM；close 幂等可 await；WYSIWYG dirty 阻止切换；Source → WYSIWYG 切换经由 flush barrier
- `markflow-runtime`: 提取 DocumentService；reload 经 host 读文件；RAII SaveLease；per-path lock；全内容 fingerprint
- `document-size-tier`: size class 从 Core 实际字节而非逻辑文本推算

## Impact

- **前端代码**：`editor.sourcePatcher.ts` → `SourceSyncController` 深模块；`coreSession.ts` 生命周期重构，全局模块变量 -> 实例化对象
- **Rust 代码**：`core_bridge.rs` → DocumentService；`runtime_host.rs` 保存路径修复；`error.rs` 错误码扩展
- **测试**：新增~10+ 单元/集成测试文件；保真 fixture 使用确定性生成
- **CI**：修复 cargo fmt/clippy workspace 级失败
- **迁移**：Save As 迁移期间 Core Source 路由显式禁用而非回退 ProseMirror serializer
