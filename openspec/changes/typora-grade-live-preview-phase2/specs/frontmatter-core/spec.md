## ADDED Requirements

### Requirement: FrontMatter model powers structured WYSIWYG editing
Safe FrontMatter models SHALL produce structured widget descriptors with exact field, value, trivia, and source ranges. Structured field operations SHALL call Core FrontMatter commands.

#### Scenario: Open safe FrontMatter form
- **WHEN** `structured_edit_safe` is true
- **THEN** WYSIWYG displays typed fields and a reveal-source action
- **THEN** opening or closing the form does not rewrite Markdown

#### Scenario: Unsafe FrontMatter remains source
- **WHEN** `structured_edit_safe` is false
- **THEN** WYSIWYG displays the exact source and unsafe reasons
- **THEN** structured commit actions are unavailable

### Requirement: FrontMatter UI preserves trivia
Structured edits MUST preserve comments, quoting, indentation, key order, line endings, and unrelated fields unless the user explicitly changes them.

#### Scenario: Update one nested value
- **WHEN** a nested supported field is updated
- **THEN** Core patches the corresponding value range
- **THEN** surrounding trivia and unrelated values remain byte-identical
