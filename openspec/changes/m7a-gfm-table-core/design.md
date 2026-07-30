## Context

M7A depends on Core owning table truth before the WYSIWYG layer adds widgets and commands. The current `markflow-core` parser recognizes basic GFM pipe tables and records alignment style, but its cell splitting treats every `|` as a delimiter. That breaks the M7 requirement that escaped pipes and inline-code pipes stay inside cell content.

The implementation must preserve the staged architecture: Core exposes table structure and source ranges, while UI draft state and pixel column widths remain outside Markdown truth.

## Goals / Non-Goals

**Goals:**

- Parse GFM pipe table rows with delimiter awareness for escaped pipes and inline code.
- Expose an editable `TableModel` from a scanned table block.
- Preserve existing table style metadata: alignment, leading/trailing pipes, delimiter padding, and source ranges.
- Return no editable model for stale, non-table, malformed, or unsupported table blocks.
- Cover the Core behavior with focused Rust tests.

**Non-Goals:**

- Building the ProseMirror table widget UI.
- Implementing table mutation commands for insert/delete row or column.
- Supporting HTML tables, grid tables, multiline cells, or damaged tables.
- Persisting pixel column widths in Markdown.

## Decisions

1. Keep table parsing in `document::parse_index::table`.

   Rationale: table recognition already lives there, and the scanner needs the same delimiter logic as model extraction. A shared row parser prevents the scanner and future command layer from disagreeing about column boundaries.

   Alternative considered: parse table models from raw source in a new command module only. That would leave scanner behavior wrong for inline-code and escaped pipes, causing block boundaries to diverge from command behavior.

2. Expose a source-range based `TableModel`.

   Rationale: later commands can patch individual cell content ranges without rewriting pipe, padding, alignment marker, or neighboring table bytes. Header and delimiter rows are represented explicitly so commands can validate row roles.

   Alternative considered: expose only cell strings and reconstruct Markdown during commands. That would violate M7's preservation rule for single-cell edits.

3. Use source fallback by returning `None` from model extraction.

   Rationale: M7 states that non-GFM or damaged tables fall back to source editing. Returning no model is a simple Core contract that prevents WYSIWYG from offering unsafe structured edits.

## Risks / Trade-offs

- [Risk] Inline code parsing in Markdown has edge cases around unmatched backticks and varying fence lengths. -> Mitigation: M7A treats a backtick run as an inline-code span only when a matching closing run exists in the same row, and falls back when row column counts do not match.
- [Risk] Single-cell patch commands still need more preservation tests. -> Mitigation: this slice exposes cell content ranges first; command implementation remains a follow-up task in the same milestone.
- [Risk] UI may assume every scanned table is editable. -> Mitigation: model extraction returns `None` for unsupported tables, giving the adapter a clear source fallback signal.
