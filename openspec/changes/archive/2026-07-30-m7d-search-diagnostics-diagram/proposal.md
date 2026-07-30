## Why

M7D needs Core-owned Search, Diagnostics, and Diagram render target contracts so these asynchronous features can be bound to `sessionId + revision + requestId` instead of relying on the current active editor. This closes the M7 planning gap for search paging, replace preview, diagnostic aggregation, and Mermaid/PlantUML renderer identity.

## What Changes

- Add a Core Search API for plain text matching, case-sensitive and whole-word options, large-document paging, UTF-16/UI range mapping, and replace preview patches.
- Add a Core Diagnostics API that reports bad links, Host-supplied missing image assets, duplicate headings, unsafe FrontMatter, malformed table-like rows, and Host/UI diagram render failures.
- Add a Core Diagram target API that identifies Mermaid and PlantUML code fences and returns render targets carrying session, document, revision, request, block, source range, UI range, language, and safe fallback state.
- Require Host-supplied diagnostics inputs to carry identity so stale or foreign asset/render results cannot land on the active document by accident.
- Record M7D functional matrix, verification evidence, and release note.

## Capabilities

### New Capabilities

- `core-search`: Core session-bound search, paged results, selection mapping, and replace preview patch generation.
- `core-diagnostics`: Core session-bound diagnostics aggregation with viewport filtering and Host-supplied identity validation.
- `core-diagram-render-targets`: Core session-bound Mermaid/PlantUML render target discovery and fallback state.

### Modified Capabilities

None.

## Impact

- `markflow-core` gains new public types and `DocumentSession` methods for search, diagnostics, and diagram render targets.
- New Core integration tests cover search, diagnostics, diagram identity, stale revision rejection, paging, and fallback behavior.
- M7 stage documentation and feature migration matrix are updated with M7D evidence.
- No new dependencies, Tauri commands, frontend UI migration, or Host renderer implementation are introduced in this slice.
