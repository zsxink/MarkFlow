## 1. Core Parser

- [x] 1.1 Replace raw pipe splitting with delimiter-aware GFM table row parsing.
- [x] 1.2 Keep escaped pipes, inline-code pipes, and empty cells inside the correct cell boundaries.

## 2. Editable Model

- [x] 2.1 Add Core table model types with row roles, cell values, source ranges, and style metadata.
- [x] 2.2 Expose table model extraction that rejects stale revisions, non-table blocks, and malformed rows.

## 3. Verification

- [x] 3.1 Add focused Rust tests for delimiter-aware scanning and model extraction.
- [x] 3.2 Run OpenSpec validation, Rust tests, clippy, and diff checks.
