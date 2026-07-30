## Context

The parse index already recognizes top-of-document `---` FrontMatter as a block and records a source/content range. M7B builds on that Core boundary by adding a lossless structured model and revision-bound edit commands before any WYSIWYG/side-panel UI writes FrontMatter.

The editor's document truth remains the Core `DocumentSession` text. Structured UI state can keep only per-field drafts; every committed change must go through Core and produce a text patch against the current session revision.

## Goals / Non-Goals

**Goals:**

- Extract a structured model for safe YAML `---` FrontMatter.
- Preserve field order, comments, blank lines, and dominant line ending style.
- Support field add, delete, rename, and value update for scalar values, scalar arrays, and simple nested mappings.
- Reject stale revisions and unsafe YAML without modifying document text.
- Surface unsafe reasons so UI can fall back to source rendering.

**Non-Goals:**

- Structured editing for TOML `+++`, JSON, or custom delimiters.
- Full YAML feature support, including anchors, aliases, tags, merge keys, multi-document input, or complex block scalar patching.
- Frontend panel work, Assets, Search, Diagnostics, or Diagram renderer behavior.

## Decisions

1. **Core model over serde round-trip**

   M7B will add `frontmatter` Core types and parser logic that operate on the original source lines. This avoids serializing an AST back into YAML and accidentally dropping comments, blank lines, key order, quotes, or line endings.

   Alternative considered: parse with a generic YAML AST and serialize the whole block. That is rejected because it violates the lossless requirement for comments and trivia.

2. **Safe subset with explicit fallback**

   The first implementation accepts only a top-level YAML mapping with simple key paths, scalar values, scalar arrays, and simple nested mappings. Duplicate keys, anchors, aliases, tags, merge keys, multi-document markers, damaged lines, and block scalars mark the model unsafe.

   Alternative considered: best-effort editing for complex YAML. That is rejected because an incorrect local patch could overwrite user formatting or meaning.

3. **Line-oriented lossless patching**

   Existing field edits will patch only the source range for the affected field line or simple field span. Additions insert a newly formatted line before the closing delimiter, using the document's dominant line ending. Deletions remove only the field span and leave unrelated trivia intact.

   Alternative considered: normalize and rewrite the full FrontMatter block. That is too broad for M7B and makes comments/blank-line preservation harder to verify.

4. **Revision-bound commands**

   `FrontMatterCommandRequest` will carry the expected base revision. Core will reject requests when the session revision differs from the request or the current FrontMatter model is unsafe. The caller must refresh before retrying.

   Alternative considered: apply against the active editor state. That would recreate the cross-session/stale-result risks M7 explicitly forbids.

## Risks / Trade-offs

- [Risk] YAML has many equivalent syntaxes that exceed the safe subset. → Mitigation: return structured-edit unsafe with concrete reasons and require source fallback.
- [Risk] Local patching can accidentally disturb trivia. → Mitigation: keep field source ranges explicit and add tests for comments, blank lines, order, and CRLF.
- [Risk] Future UI may assume a hidden full FrontMatter copy is authoritative. → Mitigation: expose command APIs that require current session revision and do not mutate without Core patch application.
