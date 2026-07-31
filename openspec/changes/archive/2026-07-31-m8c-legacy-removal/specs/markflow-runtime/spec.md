## MODIFIED Requirements

### Requirement: Runtime owns Host workflow lifecycle
Runtime SHALL own session, save, asset, export, and Host task lifecycle, including request id allocation, cancellation, timeout, stale result rejection, and Host error mapping. Host SHALL only execute platform side effects and SHALL NOT own Core revision, dirty state, Markdown generation, history, active editor state, active file path, or fallback policy. M8C removal SHALL delete product-path fallback policies that call ProseMirror serializer, `getMarkdown()` save, WYSIWYG whole-document serializer sync, or DOM-based export when Core-backed workflows fail.

#### Scenario: Host does not mutate Core revision
- **WHEN** Host completes a file, render, network, asset, or export side effect
- **THEN** Runtime validates the result identity before applying any workflow outcome
- **THEN** Host does not directly update Core revision or session dirty state

#### Scenario: Runtime rejects stale Host result
- **WHEN** a Host result arrives after the session was closed or advanced beyond the request revision
- **THEN** Runtime drops the result or returns `HOST_STALE_SESSION` / `HOST_STALE_REVISION`
- **THEN** no stale result is applied to another session or window

#### Scenario: Runtime rejects legacy save fallback
- **WHEN** Core-backed save cannot produce a confirmed SavePayload
- **THEN** Runtime SHALL return a stable save error
- **THEN** Runtime and frontend MUST NOT call ProseMirror serializer or `getMarkdown()` to synthesize a replacement save payload

### Requirement: Runtime Host port boundary
Runtime SHALL define Host port traits or equivalent modules for file system, clipboard, dialogs, windows, notifications, shell, network, render, and export side effects. Each Host operation SHALL accept a Host request context and return stable Host results or Host errors.

#### Scenario: File write uses Host context
- **WHEN** Runtime saves a document through the Host file system port
- **THEN** the Host request includes the target session, document identity, base revision, request id, and `file_system` capability
- **THEN** the existing FileIdentity, SaveLease, atomic write, and conflict gate semantics are preserved

#### Scenario: Export uses Host context
- **WHEN** Runtime starts an export job
- **THEN** the Host export port receives Export IR-rendered input or output request bound to the initiating session and revision
- **THEN** Host does not read editor DOM or active window content as document truth

#### Scenario: Window close cancels routed window tasks
- **WHEN** a window close is confirmed or the window is destroyed
- **THEN** Runtime/AppState cancels Host window tasks bound to that `window_label`
- **THEN** later UI side effects validate request/window/session identity before showing completion state

#### Scenario: OS notifications remain explicit when unsupported
- **WHEN** a workflow wants an OS-level notification before a Tauri notification capability/plugin exists
- **THEN** the Host `notifications` capability remains `not_configured`
- **THEN** regular frontend toast routing stays in App Service and does not claim OS notification support

#### Scenario: Shell open validates explicit target range
- **WHEN** UI opens a path or URL through the Host `shell` port
- **THEN** the request carries a `shell` Host context with explicit `window_label`
- **THEN** empty targets, relative paths, and unsafe URL schemes are rejected before calling the platform shell
- **THEN** Host does not infer a target from active window, active path, or selection

#### Scenario: Network image fetch is session and revision bound
- **WHEN** UI fetches or downloads a remote image
- **THEN** the Host `network` request carries `request_id`, `session_id`, `document_id`, and `base_revision`
- **THEN** SSRF, redirect, MIME, magic-byte, response-size, timeout, and concurrency gates run before bytes are returned or written
- **THEN** workflows without an active Core session fail with a stable stale-session style error instead of using active window/path state

#### Scenario: Render IR is bound to Host render context
- **WHEN** UI requests viewport-scoped render blocks for Core-backed WYSIWYG
- **THEN** the Host `render` context carries `request_id`, `session_id`, and `base_revision`
- **THEN** stale revisions and unknown sessions are rejected before rendering output is applied
- **THEN** legacy ProseMirror diagram DOM rendering remains documented until removed by the follow-up migration

#### Scenario: Export output is bound to Host export context
- **WHEN** HTML, PDF, print, or DOCX output is produced from a Core Export IR snapshot
- **THEN** the platform output request carries Host `export` context with `request_id`, `window_label`, `session_id`, `document_id`, and `base_revision`
- **THEN** Host output does not read active editor DOM, active path, active selection, or current window content as document truth
- **THEN** legacy DOM export fallback MUST NOT be used in product main paths after M8C removal

#### Scenario: Export failure codes remain stable
- **WHEN** export is cancelled, stale, unsupported, permission denied, timed out, or fails while writing
- **THEN** Host/Bridge tests preserve stable export failure codes for frontend mapping
