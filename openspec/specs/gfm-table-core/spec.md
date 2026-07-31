# GFM Table Core

## Purpose

Define GFM pipe table scanning, editable table model extraction, and fallback behavior for tables that cannot be cleanly represented as an editable cell grid.

## Requirements

### Requirement: Delimiter-aware GFM table scanning
Core SHALL recognize GFM pipe table rows without treating escaped pipes or inline-code pipes as cell delimiters.

#### Scenario: Escaped pipe remains cell content
- **WHEN** a GFM table cell contains `\|`
- **THEN** Core SHALL keep the escaped pipe inside the current cell and SHALL NOT split it into an extra column

#### Scenario: Inline-code pipe remains cell content
- **WHEN** a GFM table cell contains an inline-code span with `|`
- **THEN** Core SHALL keep the pipe inside the inline-code cell content and SHALL NOT split it into an extra column

#### Scenario: Empty cells are preserved
- **WHEN** a GFM table contains adjacent delimiters or an empty leading or trailing cell
- **THEN** Core SHALL preserve the empty cell as an editable cell value

### Requirement: Editable table model extraction
Core SHALL expose an editable table model for scanned GFM pipe table blocks, including block id, source range, alignment, delimiter lengths, row roles, cell values, and cell content source ranges.

#### Scenario: Table model exposes source ranges
- **WHEN** a scanned table block is requested as an editable table model
- **THEN** Core SHALL return each cell with its original content source range so a single-cell edit can patch only that cell content

#### Scenario: Table style metadata is retained
- **WHEN** a scanned table block has leading pipes, trailing pipes, and alignment markers
- **THEN** Core SHALL include the recorded pipe, alignment, delimiter padding, and delimiter dash-length style in the table model

### Requirement: Source fallback for unsupported tables
Core SHALL refuse editable table model extraction when the requested block is stale, not a table, malformed, or unsupported.

#### Scenario: Stale revision rejects model extraction
- **WHEN** a caller requests a table model using a revision that does not match the session revision
- **THEN** Core SHALL reject the request without returning an editable model

#### Scenario: Malformed table falls back to source
- **WHEN** table rows cannot be parsed into the delimiter column count
- **THEN** Core SHALL return no editable model so the editor can keep source fallback behavior

### Requirement: Table model powers WYSIWYG grid editing
The GFM table model SHALL be exposed through Render IR widget descriptors and Core table commands. WYSIWYG SHALL provide an accessible grid with cell, row, column, alignment, navigation, and source reveal operations.

#### Scenario: Table descriptor binds exact model
- **WHEN** Core renders a supported GFM table
- **THEN** the descriptor contains session, revision, block identity, row/cell identities, source ranges, alignments, and StyleMap metadata
- **THEN** the frontend does not reparse table pipes to determine edit targets

#### Scenario: Unsupported table uses source fallback
- **WHEN** Core rejects a malformed or unsupported table model
- **THEN** WYSIWYG displays the exact editable source with diagnostics
- **THEN** it does not construct a lossy grid

### Requirement: Table commands preserve unaffected syntax
Cell edits SHALL patch the cell content range; structural edits MAY rewrite the table block but MUST preserve values and configured formatting policy outside the necessary structural change.

#### Scenario: Edit one cell
- **WHEN** one cell value changes without structural edits
- **THEN** only that content range is patched
- **THEN** all other table bytes remain unchanged
