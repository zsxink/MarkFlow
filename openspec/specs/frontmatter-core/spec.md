# FrontMatter Core

## Purpose

Core-level support for parsing, modeling, and safely editing YAML FrontMatter blocks in MarkFlow documents. Provides structured model extraction, value classification, unsafe-syntax detection, and lossless field edit commands.

## Requirements

### Requirement: FrontMatter model extraction
Core SHALL expose a FrontMatter model for top-of-document `---` YAML FrontMatter, including source range, content range, format, fields, trivia, structured-edit safety, and unsafe reasons.

#### Scenario: Safe YAML mapping returns fields and trivia
- **WHEN** a document begins with `---` YAML FrontMatter containing a top-level mapping, comments, and blank lines
- **THEN** Core SHALL return a structured-safe model with fields in source order and trivia entries for comments and blank lines

#### Scenario: Non-YAML delimiter remains source fallback
- **WHEN** a document begins with TOML `+++`, JSON, or a custom FrontMatter delimiter
- **THEN** Core SHALL NOT return a structured-editable YAML model and SHALL require source fallback

### Requirement: FrontMatter value classification
Core SHALL classify safe FrontMatter field values as strings, numbers, booleans, nulls, date-like scalars, scalar arrays, or simple nested mappings.

#### Scenario: Scalar types are recognized
- **WHEN** safe YAML FrontMatter contains string, number, boolean, null, and date-like scalar values
- **THEN** Core SHALL expose those values with their typed FrontMatter value kind

#### Scenario: Simple nested mappings are recognized
- **WHEN** safe YAML FrontMatter contains a nested mapping made only of simple scalar values
- **THEN** Core SHALL expose that nested mapping as a structured value

### Requirement: Unsafe FrontMatter fallback
Core SHALL mark FrontMatter as structured-edit unsafe when lossless local patching cannot be guaranteed.

#### Scenario: Duplicate key rejects structured edits
- **WHEN** YAML FrontMatter contains duplicate keys in the same mapping
- **THEN** Core SHALL include a duplicate-key unsafe reason and SHALL reject structured edit commands

#### Scenario: YAML-only advanced features reject structured edits
- **WHEN** YAML FrontMatter contains anchors, aliases, tags, merge keys, multi-document markers, damaged syntax, or complex block scalars
- **THEN** Core SHALL include unsafe reasons and SHALL reject structured edit commands

### Requirement: Revision-bound FrontMatter commands
Core SHALL execute FrontMatter commands only when the request session revision matches the current `DocumentSession` revision and the current FrontMatter model is structured-edit safe.

#### Scenario: Stale revision rejects command
- **WHEN** a FrontMatter command is submitted with a base revision that differs from the session revision
- **THEN** Core SHALL reject the command without producing or applying a text patch

#### Scenario: Unsafe model rejects command
- **WHEN** a FrontMatter command is submitted for a model marked structured-edit unsafe
- **THEN** Core SHALL reject the command without producing or applying a text patch

### Requirement: Lossless FrontMatter field edits
Core SHALL support add, delete, rename, and update commands for safe FrontMatter fields while preserving unrelated source bytes inside the FrontMatter block.

#### Scenario: Update field preserves comments and blank lines
- **WHEN** a safe FrontMatter field value is updated
- **THEN** Core SHALL produce a patch that changes the target field value while preserving unrelated comments, blank lines, field order, delimiters, and line-ending style

#### Scenario: Add field preserves existing field order
- **WHEN** a safe FrontMatter field is added
- **THEN** Core SHALL insert the new field before the closing delimiter without reordering existing fields or removing trivia

#### Scenario: Rename field preserves value formatting
- **WHEN** a safe FrontMatter field is renamed
- **THEN** Core SHALL change only the key spelling for that field and preserve its value source where possible

#### Scenario: Delete field preserves surrounding trivia
- **WHEN** a safe FrontMatter field is deleted
- **THEN** Core SHALL remove only that field span and SHALL preserve unrelated comments and blank lines

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
