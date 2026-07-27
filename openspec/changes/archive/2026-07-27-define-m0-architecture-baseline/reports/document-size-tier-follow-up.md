# Document Size Tier Follow-up

## Current Baseline

Existing `document-size-tier` behavior classifies documents by both byte size and line count:

- Normal: `< 1MB` and `< 5000` lines.
- Large: `1MB-10MB` or `5000-50000` lines.
- Huge: `> 10MB` or `> 50000` lines.

Related code and tests include:

- `src/types/settings.ts`
- `src/lib/fileSizeTier.test.ts`
- `src-tauri/src/config/settings.rs`
- `src-tauri/src/commands/files.rs`
- archived OpenSpec change `2026-07-14-large-file-degradation`

## M0 Target Direction

The M0 Core baseline defines future Large Document entry by UTF-8 byte size, with line count, max line length, nesting depth, and node count treated as budget inputs rather than primary product tier definitions.

## Required Follow-up

Create a later OpenSpec change before M2/M4 to reconcile current line-count behavior with the future byte-based Core Large Document model.

Suggested change:

- Name: `align-document-size-tier-with-core-baseline`
- Scope: update `document-size-tier` specs, settings migration, file metadata DTOs, tests, and degradation UI wording.
- Non-goal: do not remove existing large-file protection without replacement budgets.

