# Parser Comparison Report

- JSON: `reports/parser-comparison.json`
- Command: `cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- parser --output openspec/changes/define-m0-architecture-baseline/reports/parser-comparison.json`
- ADR: `adr/adr-parser-buffer-selection.md`

## Result

The parser spike normalizes `markdown-rs` mdast nodes and `pulldown-cmark` offset events across every small fixture in `fixtures/small/`.

Observed points:

- `markdown-rs` exposes mdast node positions with line, column, and offset. M0 enables GFM plus the explicit `frontmatter` construct.
- `pulldown-cmark` exposes source ranges via `into_offset_iter()` and is useful as a fast reference stream.
- FrontMatter, EOL, and malformed fence differences are recorded in the JSON `differences` arrays.
- Neither candidate should leak public AST/event types into MarkFlow Core.

## Benchmark Status

Generated 1MB, 10MB, and 50MB fixtures exist under `fixtures/generated/`, but parser benchmarks were interrupted during apply. The dev-profile benchmark was interrupted twice, and the release opt-in benchmark was also interrupted after it exceeded the bounded validation window. The JSON report records each generated fixture with `skippedByDefault: true` and an explicit opt-in release-mode command:

```bash
M0_RUN_PARSER_BENCH=1 cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- parser --output openspec/changes/define-m0-architecture-baseline/reports/parser-comparison.json
```

This is a real M0 finding: parser p50/p95 are not frozen by this apply run. A later M0 validation pass should either finish the opt-in command on the frozen benchmark machine or narrow the parser benchmark to per-candidate/per-size commands.

## Recommendation

Use a MarkFlow-owned facade over `markdown-rs` for M1 parser experiments, with `pulldown-cmark` retained as a reference candidate. Pair that with a MarkFlow-owned Level 0/1 line/block index so large files can become editable before full AST work completes.
