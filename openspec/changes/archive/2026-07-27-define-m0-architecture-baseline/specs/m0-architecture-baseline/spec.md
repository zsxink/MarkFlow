## ADDED Requirements

### Requirement: M0 freezes executable architecture baseline
M0 SHALL freeze the MarkFlow Core architecture baseline as an executable planning artifact, not as a documentation-only discussion.

#### Scenario: Baseline references stage documents
- **WHEN** M0 artifacts are reviewed
- **THEN** they SHALL reference `docs/markflow-core-stages/product-plan.md`, `technical-plan.md`, `feature-migration-matrix.md`, and `m0-architecture-baseline.md` through `m8-export-ir-host-portability-full-migration.md`

#### Scenario: Later proposals can cite M0
- **WHEN** a later M1-M8 OpenSpec proposal is created
- **THEN** it SHALL be able to cite M0 for architecture boundaries, migration sequence, spike results, fixture policy, and performance budgets

### Requirement: M0 defines required ADRs
M0 SHALL produce ADRs for architecture boundaries, document truth, coordinates, history ownership, parser/buffer selection, `bekoedit-markdown` adoption, and performance baseline.

#### Scenario: ADR set is complete
- **WHEN** M0 exits
- **THEN** the ADR set SHALL include Core/Runtime/Host dependency direction, document truth and save owner, coordinate and EOL model, History single owner, parser/buffer tentative selection, `bekoedit-markdown` adoption strategy, and p95 performance budget records

#### Scenario: ADR decisions are evidence based
- **WHEN** an ADR chooses a parser, buffer, IPC protocol, FrontMatter editing boundary, or `bekoedit-markdown` adoption strategy
- **THEN** the ADR MUST cite repeatable fixture or benchmark evidence from M0

### Requirement: M0 delivers five repeatable spikes
M0 SHALL deliver repeatable spike code and result reports for parser comparison, Buffer/Position/EOL mapping, IPC patch flow, FrontMatter lossless editing, and `bekoedit` / `bekoedit-markdown` reference comparison.

#### Scenario: Parser spike is repeatable
- **WHEN** the parser spike is run
- **THEN** it SHALL compare `markdown-rs` with at least one reference parser on MarkFlow fixtures for source positions, GFM, error recovery, and 1MB, 10MB, and 50MB performance

#### Scenario: Position spike is repeatable
- **WHEN** the Buffer/Position/EOL spike is run
- **THEN** it SHALL verify UTF-8 byte offset, UTF-16 offset, LF, CRLF, Mixed EOL, and source-byte mapping with property tests

#### Scenario: IPC spike is repeatable
- **WHEN** the IPC patch spike is run
- **THEN** it SHALL report p95 latency for a 10MB CodeMirror transaction through Tauri IPC to Rust ack, including batching, revision mismatch, and resync cases

#### Scenario: FrontMatter spike is repeatable
- **WHEN** the FrontMatter spike is run
- **THEN** it SHALL verify lossless behavior for comments, key order, quotes, blank lines, and complex YAML fallback boundaries

#### Scenario: Reference implementation spike is repeatable
- **WHEN** the `bekoedit` reference spike is run
- **THEN** it SHALL compare MarkFlow lossless fixtures, semantic command behavior, stale revision behavior, and 1MB, 10MB, and 50MB benchmark results before any dependency or fork decision

### Requirement: M0 fixture and benchmark reports are shared
M0 SHALL use a shared fixture corpus and shared benchmark reporting format across all spikes.

#### Scenario: Shared fixtures exist
- **WHEN** M0 spike code is committed
- **THEN** the fixture corpus SHALL include LF, CRLF, Mixed EOL, UTF-8 BOM, Unicode offsets, trailing newlines, FrontMatter, HTML comments, mixed list markers, code fence styles, GFM tables, and generated 1MB, 10MB, and 50MB Markdown files

#### Scenario: Benchmark machine is recorded
- **WHEN** a benchmark result is recorded
- **THEN** it SHALL include machine, operating system, CPU, memory, Rust version, Node version, fixture size, p95 value, and command used to reproduce it

### Requirement: M0 remains non-product-path implementation
M0 SHALL NOT migrate product editing, saving, rendering, history, export, or UI shell paths.

#### Scenario: M0 spike code is isolated
- **WHEN** M0 implementation adds code
- **THEN** the code SHALL be isolated to spike, benchmark, fixture, test, or documentation locations and SHALL NOT replace Source Mode, WYSIWYG, save, export, or runtime product commands

#### Scenario: Core foundation waits for M1
- **WHEN** a task proposes creating the production `markflow-core` crate API
- **THEN** that task SHALL be deferred to M1 unless it is a disposable workspace/build spike with an explicit non-product-path label

### Requirement: M0 validates without external network dependency
M0 SHALL keep baseline Rust and TypeScript validation independent from public network access.

#### Scenario: DNS-dependent tests are mocked
- **WHEN** M0 validation runs
- **THEN** DNS, HTTP, or remote image behavior used by tests SHALL be mocked or served by a local resolver/server

#### Scenario: Standard validation commands pass
- **WHEN** M0 is ready for implementation review
- **THEN** `openspec validate`, `npm test`, `npx tsc --noEmit`, and relevant Rust tests or documented spike benchmark commands SHALL have recorded results

### Requirement: M0 requires independent sub-agent review
M0 SHALL include an independent sub-agent review before implementation completion and before archive.

#### Scenario: Implementation review is recorded
- **WHEN** M0 implementation claims tasks complete
- **THEN** an independent sub-agent SHALL perform static review plus `npm test` and `npx tsc --noEmit` where applicable, and its conclusion SHALL be recorded before merge or archive

#### Scenario: Archive review follows project gates
- **WHEN** M0 is archived
- **THEN** specs SHALL be synchronized before moving the change to archive, and archive validation SHALL include `npx openspec validate --all` plus `bash scripts/check-archive-synced.sh`
