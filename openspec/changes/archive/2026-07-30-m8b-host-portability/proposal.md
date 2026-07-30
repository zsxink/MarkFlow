## Why

M8A 已经让导出输入优先来自 Core confirmed snapshot，但 Host side effects 仍分散在 Tauri commands、前端调用路径和窄文件系统 trait 中。M8B 需要稳定 Host/Bridge contract，证明打开、保存、资源、搜索、导出等工作流可以脱离 Tauri 用 mock Host 验证，并避免结果回填依赖 active window、active path 或当前编辑 DOM。

## What Changes

- 新增 versioned Host request context，所有 Host side effects 显式携带 protocol version、request id、client/window/session/document/revision identity 和 capability。
- 建立 Host capability registry、stable Host/export error code registry 和 capability negotiation DTO。
- 建立 non-Tauri mock Host harness，覆盖 missing capability、permission denied、window mismatch、stale session、stale revision、same-path multi-session conflict 和 cancellation。
- 将现有 Runtime 文件系统 Host trait 逐步收敛到 Host Port contract，保留 FileIdentity、SaveLease、PathSaveCoordinator、atomic write 和 conflict gate。
- 为 file system、clipboard、dialogs、windows、notifications、shell、network、render、export 建立 capability matrix，并与 Tauri v2 capability / permission 配置保持可测试映射。
- 为 Core/Runtime/Host 边界补非 Tauri inspect/search/diagnostics/html export harness，证明核心能力不依赖 Tauri runtime。
- 不删除旧 serializer 和 legacy DOM/export fallback；删除仍属于 M8C。

## Capabilities

### New Capabilities

- `host-portability`: 定义 Host Adapter/Bridge contract、Host capability negotiation、stable Host error codes、mock Host harness、permission matrix 和非 Tauri portability 验证要求。

### Modified Capabilities

- `core-bridge-protocol`: Bridge DTO 需要扩展 Host request context、stable Host/export error code mapping、request/window/session/revision binding 和 compatibility tests。
- `markflow-runtime`: Runtime 需要拥有 Host workflow 编排、request cancellation/timeout/stale result 丢弃和 mock Host 可测边界；Host 只执行平台副作用。
- `background-task-lifecycle`: Host side effect jobs 需要统一 request-bound cancellation、timeout 和 window/session close 清理语义。

## Impact

- Affected Rust crates:
  - `src-tauri/crates/runtime`
  - `src-tauri/src/commands/*`
  - `src-tauri/src/runtime_host.rs`
  - `markflow-core` only for non-Tauri CLI/harness reuse; Core must remain host-independent.
- Affected TypeScript modules:
  - `src/lib/coreBridge.ts`
  - export/search/asset call sites that initiate Host-bound workflows.
- Affected docs:
  - `docs/markflow-core-stages/m8-export-ir-host-portability-full-migration.md`
  - `docs/markflow-core-stages/feature-migration-matrix.md`
  - `docs/markflow-core-stages/m8b-host-portability-evidence.md`
  - Host capability matrix and protocol fixture documentation.
- Affected tests:
  - Runtime Host protocol unit tests.
  - Tauri Host adapter serialization/permission tests.
  - Non-Tauri harness tests for inspect/search/diagnostics/html export.
  - Regression tests for same-path multi-session conflict and stale result rejection.
