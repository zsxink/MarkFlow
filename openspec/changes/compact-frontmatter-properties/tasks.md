# Tasks

## 1. Safe source patches and menu actions

- [x] 1.1 Preserve quoted property keys and typed/empty arrays during edits; reject invalid typed values; verify domain regression tests and unchanged body bytes.
- [x] 1.2 Correct shared context-menu button/action indexing with separators; verify enabled and disabled actions after separators in a focused test.

## 2. Compact editable properties

- [x] 2.1 Replace persistent per-row controls with inline fields, tag chips and on-demand addition; verify component tests for editing, cancellation, validation and focus/draft retention.
- [x] 2.2 Add field/tag context menus, handle-based dragging and keyboard/menu movement; verify component tests for ordering, cancellation, read-only and stale document actions.
- [x] 2.3 Style compact properties across themes and narrow windows; verify rendered screenshots, long values and collapsed/empty/fallback states.

## 3. Integration and review

- [x] 3.1 Run full unit tests, TypeScript/build checks and OpenSpec validation; confirm no unrelated working-tree changes are included.
- [x] 3.2 Independently review source preservation and interaction boundaries, then run browser flows covering inline edits, tags, menus, drag sorting and document/read-only transitions.

## Workflow follow-up

- Sync delta specs before any future archive and run the repository archive gates after archiving.
