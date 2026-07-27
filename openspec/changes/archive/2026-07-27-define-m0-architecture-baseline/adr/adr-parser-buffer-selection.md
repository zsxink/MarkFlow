# ADR: Parser And Buffer Selection

- Status: Accepted as M0 recommendation
- Date: 2026-07-27
- Evidence: `reports/parser-comparison-report.md`, `reports/parser-comparison.json`, `reports/parser-benchmark.json`

## Decision

M1 should begin with a MarkFlow-owned parser facade over `markdown-rs` for full Markdown AST/source position evaluation, plus a MarkFlow-owned Level 0/1 line/block index for large document readiness.

The initial buffer should be `String` plus `LineIndex` plus `LineEndingMap`. Rope/chunked text is deferred until benchmark evidence shows patch or memory budgets cannot be met for 10MB/50MB target documents.

`pulldown-cmark` remains a reference parser for event/range comparison and performance checks, not the primary M1 parser facade.

## Evidence Summary

The M0 parser spike normalizes `markdown-rs` mdast nodes and `pulldown-cmark` event ranges across the shared small fixture corpus. Benchmark fixtures are generated on demand for 1MB, 10MB, and 50MB sizes.

Observed recommendation:

- `markdown-rs` exposes mdast positions with line/column/offset and supports GFM/FrontMatter constructs through parse options.
- `pulldown-cmark` exposes byte ranges through `into_offset_iter()` and is useful as a fast reference stream.
- Neither parser should leak its AST/event types into Core public API.
- Parser size benchmarks were attempted during apply and interrupted because both dev-profile and release opt-in runs exceeded the bounded validation window. `reports/parser-comparison.json` records the 1MB/10MB/50MB generated fixtures and the opt-in release-mode command needed before final M0 exit.

## M1 Constraints

- Define MarkFlow-owned `BlockRecord`, `InlineRecord`, `SourceRange`, `StyleMap`, and diagnostics.
- Keep parser replacement possible behind the facade.
- Add large-file fallback to Level 0/1 scanning before relying on full AST for first-input readiness.
- Treat parser p95 budgets as unsettled until `M0_RUN_PARSER_BENCH=1 cargo run --release ... -- parser` completes on the frozen benchmark machine, or until the harness is split into per-candidate/per-size commands that can finish predictably.
