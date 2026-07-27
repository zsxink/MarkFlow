# `bekoedit-markdown` Reference Report

- JSON: `reports/bekoedit-reference.json`
- Command: `cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- bekoedit --output openspec/changes/define-m0-architecture-baseline/reports/bekoedit-reference.json`
- ADR: `adr/adr-bekoedit-adoption.md`

## Package Review

- Crate: `bekoedit-markdown`
- Version: `0.13.1`
- License: `Apache-2.0`
- Repository: `https://github.com/nabbisen/bekoedit`
- Related crates observed: `bekoedit-core`, `bekoedit-ui-contract`

## Contract Review

The local crate source and spike output confirm the reference implementation has:

- Canonical Markdown source truth.
- Revision-scoped `BlockId` using `revision_created`.
- Minimal `SourcePatch` with revision validation.
- Raw Markdown Island fallback.
- A versioned typed UI contract crate.
- Stale revision rejection.

## Fixture Run

All MarkFlow small fixtures were passed through `MarkdownIndex::build`. The report records block counts, headings, raw islands, diagnostics, and sample revision-scoped block ids.

## Benchmark Status

1MB, 10MB, and 50MB generated fixtures were benchmarked in release mode:

| Fixture | Iterations | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| 1MB | 3 | 11,548 us | 12,890 us | 12,890 us |
| 10MB | 3 | 104,339 us | 111,267 us | 111,267 us |
| 50MB | 1 | 693,452 us | 693,452 us | 693,452 us |

Peak memory is not measured by the portable harness.

## Adoption Decision

M0 keeps the adoption outcome as `reference only`. Do not add `bekoedit-markdown` to production dependencies unless a later ADR update passes compatibility, performance, maintenance, API stability, license, and NOTICE gates.
