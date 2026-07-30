## Why

M7B needs a Core-owned FrontMatter contract before the UI can offer structured editing without treating a serialized form copy as hidden document truth. Markdown FrontMatter must keep field order, comments, blank lines, and line-ending style while rejecting unsafe YAML cases that cannot be patched losslessly.

## What Changes

- Add a Core FrontMatter model for `---` YAML FrontMatter, including source range, format, typed fields, trivia, structured-edit safety, and unsafe reasons.
- Add FrontMatter command support for field add, delete, rename, and value update against a matching session revision.
- Preserve comments, blank lines, field order, and line-ending style for safe top-level YAML mappings.
- Reject stale revisions and unsafe YAML without applying a patch.
- Keep TOML `+++`, JSON, custom delimiters, duplicate keys, anchors, aliases, tags, merge keys, multi-document YAML, damaged syntax, and complex block scalars in source fallback.
- Add focused Rust tests for typed value recognition, field edits, trivia preservation, stale revision rejection, and unsafe fallback.

## Capabilities

### New Capabilities

- `frontmatter-core`: Core-owned lossless FrontMatter model extraction and revision-bound structured edit commands for M7B.

### Modified Capabilities

- None.

## Impact

- `markflow-core/src/document/**` FrontMatter parsing, model extraction, and edit command APIs.
- New Core tests under `markflow-core/tests/`.
- OpenSpec artifacts for the independent M7B milestone.
