# Design

## Context

See proposal.md for motivation. WYSIWYG tables are styled in the editor stylesheet: `.ProseMirror table` owns the external bottom margin, while the shared `.ProseMirror th, .ProseMirror td` rule currently applies `8px 12px` padding. The header uses the same cell rule, with a separate background and font weight.

## Goals / Non-Goals

**Goals:**
- Keep table-specific spacing local to the existing cell selector.
- Apply one symmetric vertical padding value to both header and body cells.
- Preserve horizontal padding, cell borders, table margin, and multi-line text layout.

**Non-Goals:**
- Change Markdown serialization, table editing behavior, or export-theme table styling.
- Adjust paragraph margins or spacing outside the table.

## Decisions

- Reduce the shared cell rule's vertical padding while retaining its existing horizontal padding. A single shared rule ensures `th` and `td` remain consistent; no separate header override is needed.
- Leave `.ProseMirror table` and all paragraph rules unchanged. This isolates the change to the cell interior and preserves the existing table-to-paragraph margin.
- Validate through the existing build and test gates, plus CSS/spec diff inspection; the stylesheet change has no runtime logic to unit test.

## Risks / Trade-offs

- **[Risk]** Excessive compression could make multi-line content feel cramped. → **Mitigation:** Retain a nonzero symmetric vertical inset and inspect the resulting CSS against both header and body cell rules.
- **[Risk]** A broad selector change could alter other content. → **Mitigation:** Limit the edit to `.ProseMirror th, .ProseMirror td` and leave all surrounding layout rules unchanged.
