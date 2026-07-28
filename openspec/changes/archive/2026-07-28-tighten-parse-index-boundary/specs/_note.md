# Note: No spec-level changes

This change is a pure code refactoring — no behavior, API, or requirement changes.

- The existing `core-restructure` spec already requires that `types.rs` contains the listed types (BlockId, LineRange, BlockKind, BlockNode, OutlineItem, ParseIndex, ScanOutcome, AffectedRanges). Moving `impl ParseIndex` (containing `scan*`) to `mod.rs` does not change this requirement — the type `ParseIndex` remains defined in `types.rs`.
- No delta spec required.
