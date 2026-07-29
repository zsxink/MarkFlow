## Context

M3 (Core-backed Source Mode) 实现了从前端 CodeMirror 到 Core session 的 patch-based 同步路径，commit `d28e69a` 修复了 3/4 个 P0 阻塞问题。但两位独立 agent 的复核确认以下剩余风险：

- **同步模型**：patch 为 fire-and-forget 多路并行发送，不同 base revision 的 transaction change 被直接拼接
- **生命周期**：switchToSource 异步间隙中用户输入可能被覆盖；close 竞态通过 boolean 短路而非真正排他
- **保存完整性**：flush barrier 不完整（retained batch 未被等待）；save_in_progress 可能永久残留；同路径双 session 无路径级串行化
- **协议安全**：仅有部分 patch 使用 Envelope；错误码映射丢失精度（P0-4 虽已修复但仍无 async 模型）
- **验证**：reload_document 返回内存文本而非从文件读取；open 返回固定 DocumentId(0)

M3.1 收敛到可验证的完整性基线，不引入 Rope、CRDT、OT 或 SolidJS workspace store。

## Goals / Non-Goals

**Goals:**
- Source 模式在 patch 路径下不会静默丢数据
- close/open 竞态不会使 session 状态不一致
- flush barrier 在 backend receipt 确认前不写盘
- resync 恢复不直接覆盖用户 optimistic 内容
- 保存路径具备原子性 + 完整冲突检测
- Bridge 协议错误码与 Core/Runtime 枚举 1:1 映射
- feature flag 可从运行时配置

**Non-Goals:**
- 不引入 CRDT/OT/Rope/SolidJS workspace store
- 不到入原生 Channel（留待 native benchmark 证明需要）
- 不实现冲突解决 UI（在 M4 规划）
- 不改动 WYSIWYG 路径，不与 ProseMirror 纠缠
- 不实现多窗口 session 协调（仅路径级串行化保护文件写入）

## Decisions

### ADR-1: patch 串行模型 — 单 in-flight + ChangeSet.compose

**Choice:** 使用 CodeMirror `ChangeSet.compose` 将同一 batch 内的多个 transaction 合成为单个 change set，然后序列化为单次 `apply_text_patch` 请求。in-flight 确认前不发送新请求。

**Rejected:** 
- 当前 fire-and-forget 模型：无法保证 base revision（不同 batch 可能基于不同起始状态拼接 change → `aXbYc` bug 而非 `aXYbc`）
- 直接上 Channel：缺乏 native benchmark 证据证明需要

**Consequence:** 协议更易证明正确；延迟取决于 batch 间隔 + ack round-trip；需要保留 batch 队列防止丢编辑。

### ADR-2: generation + request-id 隔离生命周期

**Choice:** CoreSourceCoordinator 每 open/close 递增 generation，所有异步响应落地前校验 (generation, sessionId, requestId)。close 返回 Promise\<void\> 供 await，不使用 boolean 短路。

**Rejected:** 当前 `closeInProgress = true` 直接 return 在旧 close finally 中可能重置新 session。

**Consequence:** 额外一次整数比较/闭包捕获；消除 stale 响应修改新 session 的类。

### ADR-3: resync 使用 authoritative snapshot + replay

**Choice:** resync 请求携带 `lastConfirmedRevision + pending transaction IDs`，响应返回 authoritative text/revision + 每 transaction 的接收状态。前端删除已确认前缀，按原序重放未确认 transaction。

**Rejected:** 当前行为直接用 Core snapshot 覆盖编辑器——丢失前端未确认编辑；引入 CRDT/OT 则过重。

**Consequence:** 需要稳定 transaction id + replay 测试；但复杂度低于协同编辑算法。

### ADR-4: 保存使用 RAII SaveLease + per-path lock

**Choice:** `save_document` 获取 session lock 后创建 `SaveLease`（RAII token），释放时自动清理 save_in_progress。增加 `PathSaveCoordinator` 对同一 canonical path 的保存做串行化（compare identity → temp write + fsync → rename → 发布新 identity）。

**Rejected:**
- 当前 save_in_progress 无 RAII，错误路径可能残留
- 无路径级锁，双 session 同路径可能 last-write-wins

**Consequence:** 保存路径可证明无残留 token；双 session 同路径后保存者获得 conflict 错误（而非静默覆盖）。

### ADR-5: 全内容 fingerprint vs 采样

**Choice:** 使用全内容 SHA-256 fingerprint 做最终冲突判断。size+mtime 做快速预检。

**Rejected:** 当前空 fingerprint 回退到 size+mtime，或仅前 4096 bytes 采样——都可能漏报同大小/保留时间戳的外部修改。

**Consequence:** 保存前 O(n) 校验，与写盘同阶。预期 ~1ms/MB（SHA-256 软件实现）。

### ADR-6: async command + spawn_blocking

**Choice:** open/save/reload 改为 async Tauri command，阻塞 IO 放入 `spawn_blocking`。常规 patch 保留同步（低延迟、少 copy）。

**Rejected:** 当前同步 command 在主线程执行 — open 大文件或保存时阻塞 UI。

**Consequence:** 需要 Tauri async command + 小心处理 session registry 跨 await 边界；常规 patch 路径保持同步以降低延迟。

### ADR-7: 优先使用 async JSON IPC

**Choice:** 使用 async JSON IPC + 现有 String 类型。在原生 benchmark（1/10/50 MB）未达标前不上 raw request/response 或 Channel。

**Rejected:** 当前为同步 Tauri command。

**Consequence:** 保留可量化升级门槛（p95 延迟预算）；无需引入序列化框架。

## Risks / Trade-offs

- **[Risk] Resync replay 的正确性依赖稳定的 transaction ordering** → Mitigation: transaction id 单调递增，replay 按 id 排序；property test 验证任意排列下的结果一致性
- **[Risk] async command + session registry 跨 await 的线程安全** → Mitigation: session handle 使用 Arc\<Mutex\<DocumentRuntimeState\>\>，registry 使用 DashMap（已实现）；spawn_blocking 闭包捕获 Arc clone，不持有锁跨 await
- **[Risk] 全内容 fingerprint 增加保存延迟** → Mitigation: 只有 size+mtime 不匹配时才回退到全内容 checksum（常见场景是文档未变动 → size+mtime 匹配 → 跳过 checksum）
- **[Risk] ChangeSet.compose 的边界情况** → Mitigation: 覆盖 CM6 官方文档中的所有 compose 模式（replace range、insert、delete、sequential、overlapping-like 事件顺序）
- **[Risk] 旧的 generation 响应在超时后到达** → Mitigation: generation 是单调递增的 u64，响应到达时如果 generation < current 则静默丢弃

## Migration Plan

1. **Test-first**: 为所有新行为编写先失败后通过的测试（CM ChangeSet.compose、延迟/乱序 ack、backpressure 恢复、retry exhaustion、flush timeout、mismatch replay、快速 open/close、并发保存）
2. **SourceSyncController**: 在独立文件中实例化，替换 `editor.sourcePatcher.ts` 的 module-level 函数
3. **生命周期**: 修改 `coreSession.ts`，引入 generation，close 改为可 await，WYSIWYG dirty 阻止切换
4. **DocumentService**: 从 `core_bridge.rs` 提取到独立模块；真实 reload 路径
5. **保存完整性**: 实现 RAII SaveLease + per-path lock + 全内容 fingerprint
6. **协议**: 全命令 versioned Envelope；async command + spawn_blocking
7. **CI/测试**: 修复 cargo fmt/clippy；保真 fixture 测试；删除旧 no-op invoke mock 测试
8. **退役**: 所有旧 fire-and-forget 代码路径在 SourceSyncController 验证通过后删除

Rollback: 切换 feature flag 回 false 回到 M3 baseline（仅遗留之前的修复）。
