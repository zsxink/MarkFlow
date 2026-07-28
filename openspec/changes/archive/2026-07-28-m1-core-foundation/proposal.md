## Why

M0 has frozen the architecture baseline and explicitly defers production `markflow-core` API work to M1. M1 now needs a minimal, testable document kernel that proves MarkFlow can preserve Markdown bytes while applying scoped text edits outside the Tauri/UI runtime.

## What Changes

- Add a top-level Cargo workspace with an independent `markflow-core` crate.
- Introduce the M1 document kernel API: `DocumentSession`, `OriginalSnapshot`, `TextBuffer`, `LineIndex`, `LineEndingMap`, `PositionMap`, and `TextPatch`.
- Support UTF-8 and UTF-8 BOM opening, reject unsupported or invalid encodings, preserve LF/CRLF/Mixed EOL, trailing newlines, and BOM when saving.
- Apply revision-bound, transaction-bound text patches with non-overlap checks, UTF-8 boundary checks, UTF-16 boundary checks, rollback on failure, and idempotent retry behavior.
- Add lossless fixtures and Rust tests for open/save byte-for-byte roundtrip, edited untouched-region preservation, coordinate conversion, patch failure atomicity, and property-style Unicode/EOL cases.
- Add an M1.1 correction gate that completes bidirectional source-byte mapping, deterministic inserted-line EOL inheritance, order-independent multi-change patches, next-revision selections, and a bounded transaction retry window.
- Add a reproducible release-mode 1/10/50 MB localized-patch and save harness so M2 can make the String-versus-rope decision from measured evidence.
- Keep the current product editing path intact; this change establishes Core foundation only and does not route Source Mode, WYSIWYG, save, export, or UI through Core yet.

## Capabilities

### New Capabilities
- `markflow-core-foundation`: Defines the M1 Core document kernel behavior, public API boundaries, byte-preserving save payload generation, patch semantics, coordinate mapping, and test expectations.

### Modified Capabilities
None.

## Impact

- Adds root `Cargo.toml` workspace metadata and `markflow-core/`.
- Adds Rust fixtures under `markflow-core/fixtures/lossless/`.
- Adds a std-only Core performance example; it is not run by the default test suite.
- Adds OpenSpec change artifacts under `openspec/changes/m1-core-foundation/`.
- Does not add Tauri, WebView, DOM, CodeMirror, ProseMirror, network, or file IO dependencies to `markflow-core`.
- Does not change existing TypeScript editor, serializer, save, export, or runtime product paths.
