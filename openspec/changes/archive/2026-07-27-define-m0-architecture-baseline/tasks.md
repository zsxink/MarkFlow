## 1. Flow And Scope Setup

- [x] 1.1 Record issue #193 and branch `docs/issue-193-m0-architecture-baseline-openspec` in the M0 implementation notes.
- [x] 1.2 Review `docs/markflow-core-stages/m0-architecture-baseline.md`, `product-plan.md`, `technical-plan.md`, and `feature-migration-matrix.md` before editing M0 artifacts.
- [x] 1.3 Create a short M0 scope note that marks production `markflow-core` crate API, Core-backed Source Mode, save-chain replacement, SolidJS migration, Core-backed WYSIWYG, plugin ABI, and export migration as out of scope.
- [x] 1.4 Choose and document the M0 artifact locations for ADRs, fixture corpus, spike code, benchmark outputs, and final reports.

## 2. ADR Drafts

- [x] 2.1 Draft the Core / Runtime / Host dependency direction ADR.
- [x] 2.2 Draft the Markdown document truth, optimistic editor mirror, pending patch, confirmed revision, and save owner ADR.
- [x] 2.3 Draft the coordinate and EOL model ADR covering UTF-8 bytes, UTF-16 offsets, source-byte offsets, LineEndingMap, and revision-bound ranges.
- [x] 2.4 Draft the History single owner ADR covering migration-period editor history and future Core History ownership.
- [x] 2.5 Draft the parser and buffer selection ADR with placeholders for spike evidence.
- [x] 2.6 Draft the `bekoedit-markdown` adoption strategy ADR with the three allowed outcomes: reference only, wrapped stable subset, or trimmed fork.
- [x] 2.7 Draft the performance baseline ADR with required fields for machine, OS, CPU, memory, Rust version, Node version, fixture size, command, p50, p95, and peak memory where measurable.

## 3. Shared Fixture Corpus And Harness

- [x] 3.1 Add a shared M0 fixture manifest listing LF, CRLF, Mixed EOL, UTF-8 BOM, Unicode offsets, trailing newlines, FrontMatter, HTML comments, mixed list markers, ordered marker styles, backtick fence, tilde fence, and GFM table alignment fixtures.
- [x] 3.2 Add or generate the small lossless fixtures referenced by the manifest.
- [x] 3.3 Add a reproducible generator for 1MB, 10MB, and 50MB Markdown benchmark fixtures, avoiding repository bloat if generated files are too large to commit.
- [x] 3.4 Add a spike harness command or documented command set that can run each M0 spike independently and write JSON or Markdown results.
- [x] 3.5 Define the shared report schema for fixture path, command, parser or engine candidate, p50, p95, peak memory when available, failures, allowlist reason, and ADR reference.

## 4. Parser Spike

- [x] 4.1 Implement a parser comparison spike for `markdown-rs` and at least one reference parser candidate.
- [x] 4.2 Normalize parser output into comparable block kind, source range, line/column, diagnostic, and unsupported-feature records.
- [x] 4.3 Run parser comparison on all shared small fixtures and record differences for position accuracy, GFM table/task list behavior, FrontMatter, HTML block, and error recovery.
- [x] 4.4 Attempt parser benchmarks on 1MB, 10MB, and 50MB fixtures; record the release opt-in command, timeout risk, and that parser p50/p95 are not frozen by this apply run.
- [x] 4.5 Update the parser/buffer ADR evidence section with parser results and a tentative M1 recommendation.

## 5. Buffer, Position, And EOL Spike

- [x] 5.1 Implement a spike for logical LF text, source-byte reconstruction, LineEndingMap, and typed UTF-8/UTF-16/source-byte offsets.
- [x] 5.2 Add property tests for Unicode text including Chinese, emoji, combining marks, surrogate pairs, LF, CRLF, and Mixed EOL.
- [x] 5.3 Verify round-trip mapping for byte offset to UTF-16 offset, UTF-16 offset to byte offset, line/column to offset, and source-byte reconstruction.
- [x] 5.4 Verify that small patches preserve untouched bytes, BOM, trailing newlines, and per-line Mixed EOL.
- [x] 5.5 Update the coordinate/EOL ADR with the chosen model, known failure cases, and M1 implementation constraints.

## 6. IPC Patch Spike

- [x] 6.1 Implement an isolated IPC patch benchmark that simulates CodeMirror-shaped transactions against a Rust ack path without replacing product Source Mode.
- [x] 6.2 Measure 10MB patch ack latency with batching, pending queue behavior, transaction idempotency, revision mismatch, and resync cases.
- [x] 6.3 Measure or document the 50MB first-text transport strategy, including whether JSON string transport remains acceptable or requires chunking.
- [x] 6.4 Record p50, p95, max observed latency, payload size, and reproduction command.
- [x] 6.5 Update the document truth/save owner ADR and performance baseline ADR with IPC results.

## 7. FrontMatter Spike

- [x] 7.1 Choose one or more lossless YAML/CST candidates for FrontMatter evaluation.
- [x] 7.2 Test comments, key order, quotes, blank lines, arrays, nested objects, anchors, aliases, multiline strings, and invalid YAML.
- [x] 7.3 Define a safe structured-edit subset and explicit fallback-to-source cases for complex YAML.
- [x] 7.4 Record fixture results, rejected cases, and corruption risks.
- [x] 7.5 Update the relevant ADR evidence with the FrontMatter safe-edit boundary.

## 8. Reference Implementation Spike

- [x] 8.1 Review `bekoedit` / `bekoedit-markdown` architecture for Markdown source truth, revision-scoped `BlockId`, minimal `SourcePatch`, Raw Markdown Island, and typed UI contract.
- [x] 8.2 Run MarkFlow lossless fixtures through the reference comparison harness.
- [x] 8.3 Compare semantic command behavior and stale revision behavior against MarkFlow target contracts.
- [x] 8.4 Run 1MB, 10MB, and 50MB benchmarks where the reference implementation supports them.
- [x] 8.5 Complete license and NOTICE review for Apache-2.0 compatibility.
- [x] 8.6 Finalize the `bekoedit-markdown` adoption ADR with one selected outcome and evidence.

## 9. Baseline Documents And Matrix

- [x] 9.1 Update M0 stage documentation with final ADR links, spike commands, fixture paths, benchmark reports, and p95 budgets.
- [x] 9.2 Update `feature-migration-matrix.md` with the frozen current baseline for files, editing, images, diagrams, export, settings, conflict paths, and platform-specific release matrix notes.
- [x] 9.3 Update architecture/product/technical docs or notes to state that Tauri is Host Adapter, Markdown source is sole truth, WYSIWYG remains long-term, plugin system is out of scope, and files over 1MB enter the future Core Large Document strategy.
- [x] 9.4 Record any follow-up OpenSpec changes needed to reconcile existing `document-size-tier` line-count behavior with the future byte-based Core Large Document model.

## 10. Validation And Review

- [x] 10.1 Run `openspec validate define-m0-architecture-baseline --strict` and record the result.
- [x] 10.2 Run `npm test` and record the result.
- [x] 10.3 Run `npx tsc --noEmit` and record the result.
- [x] 10.4 Run relevant Rust tests or spike benchmark commands and record the result.
- [x] 10.5 Confirm baseline Rust/TS tests do not require public network access; mock DNS, HTTP, or remote image behavior with local resolver/server where needed.
- [x] 10.6 Record independent sub-agent implementation review findings and resolution.

## 11. Archive Readiness Preparation

- [x] 11.1 Prepare an artifact link checklist for ADR/spike/report artifacts and record any intentionally pending review items.
- [x] 11.2 Prepare the archive-time spec sync note; do not sync or archive during apply.
- [x] 11.3 Record the archive-time `npx openspec validate --all` command and latest apply-time result.
- [x] 11.4 Record the archive-time `bash scripts/check-archive-synced.sh` command without running archive sync during apply.
- [x] 11.5 Prepare the final independent sub-agent archive review checklist for merge/archive; do not claim it has run.
