# M8B Host Capability Matrix

> 日期：2026-07-30
> 机器可读来源：`src-tauri/host-capability-matrix.json`
> 目标：Host capability、Tauri permission 和跨平台支持状态必须可审计、可测试，不允许新增 Host side effect 时绕过矩阵。

| Capability | 参数范围 | 资源范围 | 超时 | 取消语义 | 错误码 | 平台状态 | Tauri permission 映射 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `file_system` | session-bound path、FileIdentity、atomic write payload、asset transaction paths | 当前 session document source 与验证后的资源事务目标 | 30000ms | final commit 前可取消 | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_STALE_SESSION`, `HOST_STALE_REVISION`, `HOST_WRITE_FAILED` | macOS/Windows/Linux available | internal Rust command；无 Tauri plugin permission |
| `clipboard` | plain text、Markdown、image bytes/file identity | 当前 window/webview clipboard permission | 5000ms | request-bound | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_WINDOW_MISMATCH`, `HOST_REQUEST_CANCELLED` | not migrated | not configured |
| `dialogs` | open/save/message/ask/confirm options | requesting window only | 用户交互型 | window close 或 user cancel 返回 cancellation | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_WINDOW_MISMATCH`, `HOST_REQUEST_CANCELLED` | available | `dialog:allow-open`, `dialog:allow-save`, `dialog:allow-message`, `dialog:allow-ask`, `dialog:allow-confirm` |
| `windows` | window label、close lifecycle、routing metadata | explicit window label only | 5000ms | window close cancels bound jobs | `HOST_MISSING_CAPABILITY`, `HOST_WINDOW_MISMATCH`, `HOST_REQUEST_CANCELLED` | available | `core:default` |
| `notifications` | OS-level notification message key、severity、request id、optional session identity；regular toast stays App Service routed UI | requesting window only | 5000ms | stale App Service toast result dropped；OS notification deferred | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_WINDOW_MISMATCH` | OS notification not migrated | not configured |
| `shell` | allowlisted file path or URL | minimal allowlisted path/URL range | 5000ms | request-bound until OS handoff | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_WINDOW_MISMATCH`, `HOST_REQUEST_CANCELLED` | available | `shell:default` |
| `network` | URL、redirect policy、MIME allowlist、size limit、timeout | SSRF-gated http/https resources | 15000ms | timeout returns `HOST_TIMEOUT` | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_STALE_SESSION`, `HOST_TIMEOUT`, `HOST_REQUEST_CANCELLED` | available | `http:default`, `http:allow-fetch` |
| `render` | diagram language/source/render target/sandbox/timeout | session/revision-bound diagram job | 10000ms | close/cancel/timeout returns stable error | `HOST_MISSING_CAPABILITY`, `HOST_PERMISSION_DENIED`, `HOST_STALE_SESSION`, `HOST_STALE_REVISION`, `HOST_TIMEOUT`, `HOST_REQUEST_CANCELLED` | not migrated | `http:default`, `http:allow-fetch` for remote PlantUML |
| `export` | Export IR-rendered input、format output request、default filename、output identity | session/revision-bound export job and selected output path | 30000ms | close/user cancel returns `EXPORT_CANCELLED`; OS handoff exception documented | `EXPORT_CANCELLED`, `HOST_REQUEST_MISMATCH`, `HOST_CLIENT_MISMATCH`, `EXPORT_STALE_REVISION`, `EXPORT_UNSUPPORTED_FORMAT`, `EXPORT_IR_UNSUPPORTED_BLOCK`, `EXPORT_HOST_PERMISSION_DENIED`, `EXPORT_TIMEOUT`, `EXPORT_WRITE_FAILED` | macOS partial；Windows/Linux html/docx only | `core:webview:allow-print`, `dialog:allow-save` |

## Gate

- 新增 Host-facing command 必须同时更新 `host-capability-matrix.json` 和本文件。
- `src-tauri` 测试会校验 matrix 中列出的 Tauri permissions 是否存在于 `src-tauri/capabilities/*.json`。
- `status = internal_rust_command` 的能力必须说明为什么没有 Tauri plugin permission。
- `status = not_configured` 的能力代表能力尚未迁移；不得作为已支持能力展示给 UI。
