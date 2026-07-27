# ADR: `bekoedit-markdown` Adoption Strategy

- Status: Accepted for M0 baseline
- Date: 2026-07-27
- Evidence: `reports/bekoedit-reference-report.md`

## Decision

M0 selects the default outcome: reference design only.

Allowed outcomes remain:

- Reference only: study architecture and keep MarkFlow implementation independent.
- Wrapped stable subset: adopt a narrow dependency subset behind MarkFlow-owned APIs.
- Trimmed fork: maintain a small Apache-2.0-compatible fork if dependency adoption fails but a stable subset is valuable.

## Evidence Summary

This apply step records the reference contract to test: Markdown source truth, revision-scoped `BlockId`, minimal `SourcePatch`, Raw Markdown Island, typed UI contract, semantic command behavior, stale revision behavior, 1MB/10MB/50MB benchmarks, and license/NOTICE obligations.

The dependency is not introduced into production code. No M0 artifact assumes `bekoedit-markdown` is the final Core implementation.

`reports/bekoedit-reference-report.md` records crate version `0.13.1`, Apache-2.0 license, canonical source model, `revision_created`-scoped block ids, `SourcePatch` validation, stale revision rejection, Raw Markdown Island fallback, and release 1MB/10MB/50MB benchmark results.

## Upgrade Gate

The decision can move from reference-only to dependency/fork only if a later review passes all of these:

- MarkFlow fixtures preserve source truth and unsupported syntax safely.
- API can be wrapped without leaking third-party types.
- Stale revision behavior matches MarkFlow's conflict contract.
- 1MB/10MB/50MB p95 budgets pass on the M0 benchmark machine.
- License and NOTICE requirements are acceptable for MarkFlow distribution.
- Maintenance activity and release stability are acceptable.
