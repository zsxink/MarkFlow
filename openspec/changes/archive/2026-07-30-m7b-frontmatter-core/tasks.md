## 1. FrontMatter Model

- [x] 1.1 Add Core FrontMatter types for format, fields, typed values, trivia, unsafe reasons, and model extraction results.
- [x] 1.2 Implement safe-subset YAML FrontMatter model extraction from the existing parse index block ranges.
- [x] 1.3 Detect unsafe fallback cases including duplicate keys, anchors, aliases, tags, merge keys, multi-document markers, damaged syntax, and block scalars.

## 2. FrontMatter Commands

- [x] 2.1 Add revision-bound FrontMatter command request/response types and stale-revision rejection.
- [x] 2.2 Implement add, delete, rename, and update field patch generation for structured-safe models.
- [x] 2.3 Preserve comments, blank lines, field order, delimiters, and dominant line-ending style for command patches.

## 3. Verification

- [x] 3.1 Add focused Rust tests for model extraction, type recognition, unsafe fallback, and field edits.
- [x] 3.2 Run OpenSpec validation, Rust tests, clippy, and diff checks.
