## Why

M6 Phase 3-5 needs to move source-mode formatting from legacy editor mutations to Core-owned edit commands without losing Markdown fidelity or command ordering. The current branch adds the surface area but still resyncs whole documents after commands and lacks frontend flush/idempotency guarantees.

## What Changes

- Extend semantic command IPC results to return UTF-16 patch data, affected ranges, selection_after, and revision.
- Make semantic command, undo, and redo requests transaction-bound and idempotent for stable retries.
- Deepen `FormatCommandLayer` so toolbar and keyboard callers submit semantic actions while the layer owns selection capture, pending patch flush, patch application, revision sync, stale-session guards, and undo/redo dispatch.
- Migrate Core-backed Source Mode toolbar/keyboard actions for bold, italic, strike, inline code, headings, quote, lists, code fence, link, undo, and redo while keeping WYSIWYG legacy fallback.
- Update M6 migration documentation and tests with explicit evidence for completed and deferred items.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `core-bridge-protocol`: semantic edit commands, undo, and redo return patch-first command results and enforce transaction idempotency.
- `source-mode-core`: Core-backed Source Mode flushes pending text patches before semantic commands and applies returned command patches without whole-document resync on the normal path.
- `keyboard-shortcuts`: Core-backed Source Mode shortcuts dispatch semantic Core commands, including undo/redo and safe link insertion.
- `toolbar-layout`: formatting toolbar controls dispatch semantic Core commands in Core-backed Source Mode while preserving legacy fallback outside that path.

## Impact

- Rust IPC adapter: `src-tauri/src/commands/core_bridge.rs`
- Core history/session helper API: `markflow-core/src/document/session.rs`
- Frontend bridge DTOs: `src/lib/coreBridge.ts`
- Source command seam: `src/editor-adapter/formatCommandLayer.ts`
- Toolbar/keyboard integration: `src/components/toolbar.ts`, `src/utils/keyboard.ts`
- Tests and M6 migration matrix/docs.
