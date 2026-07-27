# Buffer / Position / EOL Report

- JSON: `reports/position-eol.json`
- Command: `cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- position --output openspec/changes/define-m0-architecture-baseline/reports/position-eol.json`
- ADR: `adr/adr-position-eol-model.md`

## Result

All small fixtures passed round-trip mapping checks:

- UTF-8 byte offset to UTF-16 offset.
- UTF-16 offset to UTF-8 byte offset.
- Line/column to byte offset.
- Source-byte reconstruction.

The fixture corpus includes LF, CRLF, Mixed EOL, UTF-8 BOM, Unicode, combining marks, surrogate pairs, and trailing newlines. Mixed EOL was preserved as `CRLF`, `CRLF`, `LF`, `CR`, `LF` for `small/mixed-eol.md`.

## Patch Preservation

The spike inserts a small logical patch after the first line and verifies that BOM and existing per-line EOL records remain preserved. Every fixture reported `lineEndingsPreserved: true`.

## Decision Input

M1 should use typed offsets and an explicit `LineEndingMap`. Source-byte offsets must stay separate from logical UTF-8 offsets because BOM and CRLF/Mixed EOL make raw integer comparison unsafe.

