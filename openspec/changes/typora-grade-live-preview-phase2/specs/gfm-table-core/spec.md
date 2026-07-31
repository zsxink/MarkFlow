## ADDED Requirements

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
