# ADR: Coordinate And EOL Model

- Status: Accepted for M0 baseline
- Date: 2026-07-27
- Evidence: `reports/position-eol-report.md`

## Decision

Core stores logical text as UTF-8 with LF-normalized line endings and a `LineEndingMap` that preserves original source EOL per logical line. Core save reconstructs bytes from BOM, logical UTF-8 text, and `LineEndingMap`.

Coordinate units are typed:

- `ByteOffset`: UTF-8 byte offset in logical LF text.
- `Utf16Offset`: JavaScript/CodeMirror UTF-16 code unit offset in logical LF text.
- `SourceByteOffset`: byte offset in the original/reconstructed saved byte stream.
- `LineCol`: 1-based line and UTF-16/UTF-8 column view.

All ranges are bound to a document revision. Old ranges cannot be applied to a newer revision without conversion or rejection.

## LineEndingMap Rules

- LF, CRLF, CR, and Mixed EOL are preserved per logical line.
- Uniform files should be represented compactly; Mixed EOL can use spans or per-line entries.
- New lines inherit surrounding block EOL first, then document dominant EOL.
- Save must not collapse Mixed EOL to a dominant style.

## Known Failure Cases

- Source byte offsets diverge from logical byte offsets after BOM or CRLF lines and must never be compared as raw integers.
- UTF-16 offsets can land inside a surrogate pair if adapters do not validate boundaries.
- Combining marks create user-visible cursor concerns that are not solved by byte/UTF-16 conversion alone.

## M1 Constraints

M1 should introduce typed newtypes and central conversion APIs before any product path consumes Core ranges.

## M0 Evidence

`reports/position-eol-report.md` confirms the spike passed all small fixtures for UTF-8 byte, UTF-16, line/column, source-byte reconstruction, BOM preservation, trailing newline preservation, and Mixed EOL preservation.
