## Why

M7A starts the table milestone from the Core contract so WYSIWYG table UI can edit GFM pipe tables without making the editor text a hidden source of truth. The current scanner recognizes simple tables, but it does not yet expose a table model or preserve cell boundaries when pipes appear in escaped text or inline code.

## What Changes

- Add a Core GFM table capability for parsing table rows into editable cell ranges.
- Treat escaped pipes and inline-code pipes as cell content, not delimiters.
- Expose table model data needed by later WYSIWYG commands, including block range, alignment, row/cell values, and per-cell source ranges.
- Keep non-GFM, malformed, or unsupported tables in source fallback by refusing to produce an editable model.
- Add targeted Core tests for table parsing, style preservation inputs, and model extraction.

## Capabilities

### New Capabilities

- `gfm-table-core`: Core-owned GFM pipe table parsing and editable table model extraction for M7A.

### Modified Capabilities

- None.

## Impact

- `markflow-core/src/document/parse_index/**` table parsing and exports.
- New Core table model API used by future WYSIWYG table commands.
- Rust integration tests under `markflow-core/tests/`.
