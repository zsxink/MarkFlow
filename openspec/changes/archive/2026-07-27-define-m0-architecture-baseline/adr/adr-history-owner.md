# ADR: History Single Owner

- Status: Accepted for M0 baseline
- Date: 2026-07-27
- Evidence: `design.md`, `reports/ipc-patch-report.md`

## Decision

The long-term owner of document undo/redo is Core History. During M3-M5 migration, CodeMirror or ProseMirror history may remain active only for product paths that have not moved to Core. A migrated path must not let editor history and Core history both mutate document text.

Core History records revision-bound transactions with forward and inverse patches, selection before/after, edit origin, and grouping metadata.

## Grouping Rules

- A single IME composition becomes one history transaction.
- Adjacent plain typing can merge by time, origin, and neighboring range.
- Semantic commands, table operations, FrontMatter edits, asset transactions, external reloads, and resyncs create explicit boundaries.
- Undo/redo must flush pending patches before applying history.
- Save does not clear history.

## Migration Constraint

M6 owns the final migration of toolbar commands and history. M0 only freezes the owner and boundary.

