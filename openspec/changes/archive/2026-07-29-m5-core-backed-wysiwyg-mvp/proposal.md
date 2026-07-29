## Why

M3/M4 have established Core-backed Source Mode, session projection, and Editor Adapter boundaries, but WYSIWYG still depends on the legacy ProseMirror document and serializer. M5 moves the first editable Live Preview path onto Core-confirmed Markdown text so Source/WYSIWYG switching can preserve bytes while keeping the legacy ProseMirror path available as a compatibility fallback.

## What Changes

- Add a Core Render IR for viewport-scoped WYSIWYG projection, produced from the session's confirmed snapshot and tagged with `sessionId`, `revision`, `requestId`, and UTF-16 ranges.
- Add a `get_render_blocks` Bridge command that requests Render IR for a session/revision/viewport without exposing Rust byte offsets over IPC.
- Add a CodeMirror WYSIWYG adapter extension that renders M5 block/inline coverage through decorations and safe widgets while leaving Markdown text editable.
- Add marker reveal, stale render drop, image preview widget lifecycle, and large-document viewport-only rendering behavior.
- Preserve the existing ProseMirror WYSIWYG path as an explicit legacy compatibility route during M5.

## Capabilities

### New Capabilities
- `core-backed-wysiwyg`: Core-backed WYSIWYG/Live Preview rendering, mode switching, viewport rendering, widgets, stale result isolation, accessibility, and security behavior.

### Modified Capabilities
- `core-bridge-protocol`: Adds the session-bound `get_render_blocks` command and stable Render IR DTO/error behavior.

## Impact

- Affected Rust/Core: `markflow-core/src/document/**` adds Render IR types/builders and tests.
- Affected Runtime/Bridge: `src-tauri/crates/runtime/src/**` and `src-tauri/src/commands/core_bridge.rs` expose session-bound render requests.
- Affected frontend Bridge/Adapter: `src/lib/coreBridge.ts`, `src/lib/coreSession.ts`, `src/editor-adapter/**`, and Solid workspace projection consume Render IR.
- Affected legacy editor: `src/lib/editor.ts` and `src/lib/editor.init.ts` remain reachable and are not removed in M5.
- No dependency upgrades, database changes, or breaking Bridge migration beyond the additive command.
