## Why

代码审查发现 Core-backed Source Mode（#205，对应 specs/core-backed-source-mode）中有 7 个 bug：2 个前端竞态、1 个 Rust 端 UTF-16 偏移转换缺失、2 个 dirty 状态计算缺陷、1 个 toast 重复弹窗、1 个架构冗余。其中 6 个严重级别、1 个重要级别，影响 Source Mode 的会话稳定性、数据保全和交互体验。

## What Changes

- **Bug 1 — closeCoreSession 竞态**: `closeCoreSession()` 未 await 导致快速切换 Source ↔ WYSIWYG 时 session 状态混乱。修复：await + 防重入锁。
- **Bug 2 — backpressure batch 丢弃**: batch 编辑在 backpressure 检查前被清空，CM6 已显示但 Core 从未收到。修复：backpressure 检查挪到清空前。
- **Bug 3 — Selection UTF-16 偏移**: `core_bridge.rs` 中 Selection 直接用 `len()` 截断，未调用 `byte_for_utf16()`。修复：使用 `state.core.byte_for_utf16()` 转换。
- **Bug 4 — Core save dirty 永真**: Core save 路径从不调用 `markDocumentPersisted()`，导致 dirty 永远为 true。修复：save 成功后调用 `markDocumentPersisted()`。
- **Bug 5 — blocked 状态 dirty 掩藏**: `isCoreSessionDirty()` 在 blocked 状态下即使有未 ack patch 也返回 false。修复：blocked 时检查 pendingCount > 0。
- **Bug 6 — 双重 toast**: `saveCoreSession` catch 块在已有 `toastMsg` 时重复弹出 toast。修复：删除冗余的 `if (toastMsg) showToast(toastMsg)`。
- **Bug 7 — 冗余 Mutex**: `Mutex<SessionRegistry>` 多余，内部已是 `DashMap + AtomicU64`。修复：改为直接 `SessionRegistry`。

## Capabilities

### New Capabilities

- (此变更为纯缺陷修复，不引入新 capability)

### Modified Capabilities

- `core-backed-source-mode`: Core save 后需同步 dirty 状态；closeCoreSession 需防重入；backpressure 处理逻辑需修正；blocked 状态下 dirty 计算规则修正

## Impact

- `src/lib/editor.ts`: closeCoreSession 防重入 + markDocumentPersisted 调用
- `src/lib/editor.sourcePatcher.ts`: backpressure 检查提前
- `src/lib/coreSession.ts`: isCoreSessionDirty blocked 规则 + 去除冗余 toast
- `src-tauri/src/commands/core_bridge.rs`: Selection UTF-16 → byte 偏移转换
- `src-tauri/src/runtime_host.rs`: 移除冗余 Mutex
