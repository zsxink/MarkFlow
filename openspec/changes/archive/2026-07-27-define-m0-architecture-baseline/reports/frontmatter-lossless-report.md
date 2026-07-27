# FrontMatter Lossless Report

- JSON: `reports/frontmatter-lossless.json`
- Command: `cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- frontmatter --output openspec/changes/define-m0-architecture-baseline/reports/frontmatter-lossless.json`
- ADR: `adr/adr-document-truth-save-owner.md`

## Candidate

The spike uses `yaml-rust2` as a parser candidate plus MarkFlow-owned source-slice preservation. `yaml-rust2` is not a lossless CST and does not preserve comments or quote style after parsing.

## Result

Safe structured-edit subset:

- Top-level mapping.
- String, number, bool, or null scalar update.
- New top-level scalar key only when no duplicate keys exist.

Fallback-to-source cases:

- Anchors and aliases.
- Custom tags.
- Duplicate keys.
- Flow-style rewrites.
- Invalid YAML.
- Non-YAML delimiters.

The fixture `small/frontmatter-lossless.md` parsed successfully and was considered safe for simple scalar structured edits, while anchors/aliases, duplicate keys, invalid YAML, and custom tags were rejected or marked fallback-only.

## Decision Input

FrontMatter UI in later stages must preserve the original source slice and only emit structured patches for the safe subset. Complex YAML must remain raw-source editable.

