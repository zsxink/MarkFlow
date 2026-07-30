# M8B Host Portability Evidence

> 日期：2026-07-30
> Issue：#240
> 分支：`feat/issue-240-m8b-host-portability`
> 范围：M8B Host/Bridge contract 稳定与非 Tauri harness 起步

## 已完成

- Runtime 新增 `host_contract` 模块，定义 Host/Bridge protocol v1。
- Host request context 固定携带：
  - `protocol_version`
  - `request_id`
  - `client_id`
  - `window_label`
  - `session_id`
  - `document_id`
  - `base_revision`
  - `capability`
- Host capability registry 覆盖：
  - `file_system`
  - `clipboard`
  - `dialogs`
  - `windows`
  - `notifications`
  - `shell`
  - `network`
  - `render`
  - `export`
- Host stable error code registry 覆盖：
  - `HOST_PROTOCOL_VERSION_UNSUPPORTED`
  - `HOST_MISSING_CAPABILITY`
  - `HOST_PERMISSION_DENIED`
  - `HOST_REQUEST_MISMATCH`
  - `HOST_CLIENT_MISMATCH`
  - `HOST_WINDOW_MISMATCH`
  - `HOST_SESSION_MISMATCH`
  - `HOST_STALE_SESSION`
  - `HOST_STALE_REVISION`
  - `HOST_REQUEST_CANCELLED`
  - `HOST_TIMEOUT`
  - `HOST_WRITE_FAILED`
  - `EXPORT_CANCELLED`
  - `EXPORT_STALE_REVISION`
  - `EXPORT_UNSUPPORTED_FORMAT`
  - `EXPORT_IR_UNSUPPORTED_BLOCK`
  - `EXPORT_HOST_PERMISSION_DENIED`
  - `EXPORT_TIMEOUT`
  - `EXPORT_WRITE_FAILED`
- Runtime 新增 deterministic `MockHostHarness`，用于非 Tauri 环境验证：
  - missing capability
  - permission denied / export permission denied
  - stale session
  - stale revision / export stale revision
  - window mismatch
  - request cancellation / export cancellation
  - capability matrix 查询
- Host context scope 校验已覆盖：
  - 文档相关副作用要求 `session_id`
  - 窗口相关副作用要求 `window_label`
  - 文件系统、render、export 结果路由要求 `base_revision`
  - protocol version 不匹配返回稳定错误码
- `Host` 文件系统 trait 已迁入 `HostRequestContext` 参数：
  - `read_document_bytes(context, path)`
  - `stat_identity(context, path)`
  - `compare_and_atomic_write(context, path, content, expected)`
- Runtime save workflow 已为 stat / atomic write 构造 session/document/revision-bound `file_system` context，并保留 FileIdentity、SaveLease、PathSaveCoordinator、atomic write 与 conflict gate。
- Tauri reload 已为文件读取构造 session/document/revision-bound `file_system` context。
- Tauri open document 在 session 创建前构造 pre-session `file_system` context；严格 session-bound open 语义仍待后续 Runtime open workflow 收敛。
- Tauri save dialog 入口已在调用 `blocking_save_file()` 前构造并校验 `dialogs` context：
  - `commands/files.rs::select_export_path`
  - `commands/export.rs::save_binary_export`
- Tauri window close lifecycle 已接入 Host `windows` context：
  - `AppState::create_window_host_context`
  - `AppState::register_window_task`
  - `AppState::cancel_window_tasks`
  - `confirm_window_close` 和 `WindowEvent::Destroyed` 会取消绑定到该 `window_label` 的 Host window tasks，避免关闭后的结果路由到其他窗口。
- 前端 Host context DTO 已补齐 M8B 字段：protocol version、request id、client/window/session/document/revision identity 和 capability。
- 前端 clipboard Web API 调用前已构造 `clipboard` Host context，覆盖图片复制、路径复制、Mermaid/PlantUML SVG/PNG 复制和文件树路径复制。
- 前端 App Service toast routing 已覆盖导出类异步结果 toast：
  - `src/app-service/notifications.ts`
  - HTML/PDF/DOCX export success/failure toast 在显示前校验 `requestId + windowLabel + sessionId`。
  - OS-level Host `notifications` 仍保持 `not_configured`，等待真实 Tauri notification capability/plugin 后再迁移。
- 前端 shell/open path 操作已接入 Host `shell` bridge：
  - `src/host-bridge/shell.ts`
  - 文件树 context menu reveal 与图片“打开文件所在”调用前构造 `shell` Host context。
  - shell target 校验拒绝空 target、相对路径、`javascript:` / `data:` 等非 allowlisted scheme；允许绝对本地路径、Windows 绝对路径、UNC、`file:`、`http:`、`https:`。
- Network image fetch/download 已接入 Host `network` context：
  - `download_image_to_pending`
  - `fetch_remote_image_as_base64`
  - `download_image_to_storage`
  - `download_image`
  - 前端 `handleNetworkImage` 和 remote image context menu 会携带 active Core `sessionId + documentId + confirmedRevision + requestId`。
  - 现有 SSRF、redirect、MIME、magic bytes、20MB size cap、HTTP timeout、concurrency semaphore 保持在 Host network 执行前后。
- Core-backed WYSIWYG Render IR 已接入 Host `render` context：
  - `get_render_blocks` 在调用 Core render 前构造 `render` Host context。
  - 绑定 `requestId + sessionId + baseRevision`。
  - stale revision / unknown session 仍由 Runtime/Core gate 拒绝。
  - legacy ProseMirror Mermaid/PlantUML DOM node view 渲染仍存在；M8B 记录为遗留路径，删除/完全替换归后续收敛。
- Export platform output 已接入 Host `export` context：
  - `save_export` 支持 HTML/document export context。
  - `create_pdf` / `print_webview` 支持 PDF/print export context。
  - `save_binary_export` 支持 DOCX binary export context。
  - active Core session 路径使用 Export IR 产出的 `sessionId + documentId + baseRevision + exportRequestId` 作为 Host export context。
  - Host export 输出不读取 active editor DOM / active path / active window content；无 active Core session 时 legacy DOM snapshot fallback 仍保留并记录。
- Bridge/frontend contract 已补齐：
  - `src/host-bridge/context.ts` 统一构造 Host-bound DTO，包含 protocol version、request id、client id、window label、session id、document id、base revision 和 capability。
  - `src/lib/error.ts` 将 Host/export stable error codes 映射为 frontend-visible `retry` / `degrade` / `fatal` 分类，避免 permission、capability、timeout、stale revision、unsupported format 被压成 generic internal error。
  - `src/host-bridge/resultRouting.ts` 提供 Host result identity gate；Export IR 输出路径在写入 HTML/PDF/DOCX/print 前校验 `requestId + sessionId + documentId + baseRevision`，并在异步返回后确认当前 UI session 未切换。
  - Tauri `network` / `export` Host DTO 反序列化前端 `protocolVersion` 并调用 Runtime Host protocol gate；unsupported protocol 返回 `HOST_PROTOCOL_VERSION_UNSUPPORTED`。
- 新增 non-Tauri Runtime harness：
  - `src-tauri/crates/runtime/tests/non_tauri_harness.rs`
  - 覆盖 Runtime session inspect。
  - 覆盖 session/revision-bound search。
  - 覆盖 session/revision-bound diagnostics。
  - 覆盖 Export IR -> HTML 的非 Tauri 输出路径，并通过 `MockHostHarness` 校验 Host export context。
  - 覆盖同路径多 session save conflict。
  - 覆盖同路径 export 结果绑定 initiating session。
- 新增机器可读 Host capability matrix：`src-tauri/host-capability-matrix.json`。
- 新增人工可读 Host capability matrix：`docs/markflow-core-stages/m8b-host-capability-matrix.md`。
- 新增 Tauri permission drift gate：`src-tauri/tests/host_capability_matrix.rs`。

## Host capability matrix

- 机器可读 fixture：`src-tauri/host-capability-matrix.json`
- 人工可读文档：`docs/markflow-core-stages/m8b-host-capability-matrix.md`
- Drift gate：`cargo test --manifest-path src-tauri/Cargo.toml host_capability_matrix`

## 自动化验证

- 已通过：`cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml`
- 已通过：`cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml host_contract`
- 已通过：`cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml save`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml host_capability_matrix`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml runtime_host`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml dialog_host_context`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml export_dialog_host_context`
- 已通过：`npm test -- --run src/host-bridge/context.test.ts`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml state::tests::window`
- 已通过：`npm test -- --run src/app-service/notifications.test.ts src/lib/documentExport.test.ts src/lib/pdfExport.test.ts src/lib/docxExport.test.ts`
- 已通过：`npm test -- --run src/host-bridge/context.test.ts src/host-bridge/shell.test.ts src/components/contextMenu.test.ts`
- 已通过：`npm test -- --run src/host-bridge/context.test.ts src/lib/imageUtils.test.ts`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml commands::files_image::tests::network_host_context_requires_session_and_revision`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml get_render_blocks`
- 已通过：`npm test -- --run src/lib/coreBridge.test.ts src/editor-adapter/codemirror/wysiwygRenderExtension.test.ts`
- 已通过：`cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml host_contract_exports_stable_failure_code_registry`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml get_export_document`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml`
- 已通过：`npm test -- --run src/lib/pdfExport.test.ts src/lib/documentExport.test.ts src/lib/storage.test.ts`
- 已通过：`cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml --test non_tauri_harness`
- 已通过：`npm test -- --run src/lib/error.test.ts src/host-bridge/resultRouting.test.ts src/lib/documentExport.test.ts src/host-bridge/context.test.ts`
- 已通过：`npx tsc --noEmit`
- 已通过：`git diff --check`
- 已通过：`openspec validate m8b-host-portability`
- 已通过：独立复核 agent `Gauss` 静态走查并运行 `cargo test --manifest-path src-tauri/Cargo.toml unsupported_protocol`、`cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml host_contract`、`npm test -- --run src/lib/error.test.ts src/host-bridge/resultRouting.test.ts src/host-bridge/context.test.ts`、`npx openspec validate m8b-host-portability`、`cargo test --manifest-path src-tauri/Cargo.toml host_capability_matrix`。

覆盖点：

- Host error code serde roundtrip。
- protocol version gate。
- required `session_id` / `window_label` / `base_revision` scope gate。
- mock Host missing capability。
- mock Host stale session。
- mock Host window mismatch。
- mock Host request cancellation。
- mock Host permission denied。
- mock Host stale revision。
- file system Host trait context migration does not break save conflict tests。
- Tauri Host adapter read/stat/write call sites compile with HostRequestContext。
- Tauri capability matrix mapped permissions exist in `src-tauri/capabilities/*.json`。
- frontend Host context DTO version/session/window/revision validation。
- frontend clipboard context construction type-checks for affected call sites。
- frontend routed toast drops stale window/session results before showing completion/failure state。
- frontend shell bridge validates explicit shell target range before Tauri shell plugin execution。
- network image Host requests require session/revision/request identity before fetch/download execution。
- Core-backed render requests require session/revision/request identity before Render IR response.
- export output Host context binds request/window/session/document/revision identity for active Core Export IR paths.
- export failure tests cover stable cancellation/stale/unsupported/permission/timeout/write-failure code registry or frontend mapping.
- Bridge/frontend stable Host/export error mapping remains machine-readable.
- Host result identity gate rejects mismatched request/window/session/revision identities before UI applies output.
- non-Tauri harness proves inspect/search/diagnostics/html export can run through Runtime/Core without Tauri commands or editor DOM.
- same-path save conflict and same-path export session isolation are covered.
- capability matrix explicit status。

## 未完成 / 下一步

- 尚未将所有现有 Tauri commands 迁入 versioned Host Port。
- 尚未补打开、保存、搜索、导出、资源事务的完整非 Tauri workflow harness。
- 尚未补 Host mock 与 Tauri Host 对同一协议 fixture 的序列化一致性测试。
- Full legacy ProseMirror diagram DOM render replacement 尚未迁移；legacy DOM export fallback 仍保留到后续收敛。
- OS-level `notifications` Host port 尚未迁移；当前普通 toast 是前端 App Service routing，Tauri capability matrix 中 notifications 为 `not_configured`。
- 尚未补 macOS/Windows/Linux Host smoke。

## 未验证

- macOS GUI smoke：未验证。
- Windows release smoke：未验证。
- Linux release smoke：未验证。
- Tauri permission drift：已通过 fixture 对照测试；GUI 权限行为未验证。
- PDF/DOCX 平台输出取消语义：未验证。

## Legacy/Fallback 状态

- 旧 Tauri commands 仍存在；本次已完成 Host protocol、file_system context、dialogs context、clipboard context、windows lifecycle context、App Service toast routing 和 capability matrix 起步。
- M8A 的 legacy DOM snapshot fallback 仍存在；删除仍归 M8C。
- Runtime `Host` trait 仍是文件系统窄接口，但已接收 `HostRequestContext`；后续应继续按能力拆分 port。
