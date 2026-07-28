## Context

M0 established that Markdown source is the document truth and that `markflow-core` must not depend on Tauri, DOM, CodeMirror, ProseMirror, network, or host file IO. The current application still opens, edits, serializes, and saves through the existing TypeScript/Tauri path. M1 introduces only the minimal Rust Core foundation needed to prove byte-preserving Markdown document handling before product paths are migrated in later stages.

## Goals / Non-Goals

**Goals:**
- Add a top-level Cargo workspace and an independent `markflow-core` crate.
- Provide MarkFlow-owned public API types for document sessions, snapshots, logical text, line endings, line/position mapping, patches, and save payloads.
- Preserve UTF-8 BOM, LF/CRLF/Mixed EOL, trailing newlines, and untouched source bytes across open/save and small patch scenarios.
- Reject unsupported encodings and invalid ranges without silently changing session state.
- Keep Core tests runnable without Tauri or frontend startup.

**Non-Goals:**
- No parser, style map, render IR, export IR, Runtime session registry, or Host Adapter implementation.
- No Source Mode, WYSIWYG, save workflow, UI, or IPC migration.
- No `bekoedit-markdown` production dependency or public API exposure.
- No rope storage in M1 unless String proves insufficient for the acceptance suite.

## Decisions

1. **Use a top-level Rust workspace with independent `markflow-core`.**
   - Rationale: M0 and the M1 stage document prefer an independent crate unless workspace viability blocks Tauri builds. Keeping `src-tauri` as a workspace member preserves existing Tauri build commands while allowing `cargo test -p markflow-core`.
   - Alternative considered: incubate under `src-tauri/src/core/`. This would reduce workspace churn but would make dependency-boundary enforcement weaker.

2. **Store logical text as LF plus a run-length encoded `LineEndingMap`.**
   - Rationale: CodeMirror, parsers, and position scans are simpler on LF-normalized text, while RLE spans avoid per-line overhead for uniform LF/CRLF documents and preserve Mixed EOL line-by-line.
   - Alternative considered: keep raw bytes as the primary edit buffer. That preserves source bytes naturally but makes UTF-16 and line/column mapping harder and pushes EOL complexity into every edit operation.

3. **Generate save bytes from Core into an owned payload instead of writing files.**
   - Rationale: Core must be pure and host-independent. Runtime/Host will own file identity, permissions, atomic write, watcher suppression, and conflict policy in later stages.
   - Alternative considered: expose a writer-only API. M1 still includes `write_save_payload` for streaming boundaries, but tests use owned bytes for direct byte comparisons.

4. **Make patch application atomic and revision/transaction scoped.**
   - Rationale: later IPC and editor adapters need stale-range detection and retry safety. M1.1 retains the 256 most recent successful transaction ids with a deterministic 128-bit payload fingerprint and `PatchOutcome`, so identical retries return the same revision without retaining full replacement payloads or reapplying changes.
   - Alternative considered: only check revision. That is simpler but would duplicate edits on retry after an IPC ack is lost.

5. **Use MarkFlow-owned newtypes at public boundaries.**
   - Rationale: UTF-8 byte offsets, UTF-16 offsets, source byte offsets, revisions, session ids, and document ids have different meanings and MUST NOT be exposed as interchangeable `usize` values.
   - Alternative considered: plain ranges for a smaller API. That would fail the M1 coordinate-boundary goal.

## M1.1 Correction Decisions

6. **Make logical-byte and source-byte mapping strictly bidirectional.**
   - `PositionMap` maps both `ByteOffset -> SourceByteOffset` and `SourceByteOffset -> ByteOffset`.
   - Source offsets inside the UTF-8 BOM, between CR and LF in a CRLF pair, beyond the save payload, or inside a UTF-8 code point return `CoreError::InvalidSourceOffset` with a distinct `SourceOffsetError` reason. Invalid positions never snap to a nearby valid boundary.
   - Rationale: later diagnostics and save conflict reporting cannot safely share ranges unless every accepted source coordinate roundtrips exactly.

7. **Distinguish editor-logical LF from explicit source EOL without changing `TextChange` fields.**
   - A bare LF in `TextChange.replacement` is an LF-normalized editor newline and inherits EOL style.
   - CRLF and bare CR in the replacement are explicit source EOLs and are preserved as CRLF and CR respectively.
   - An inherited newline first reuses the corresponding EOL removed by the replacement, then the last removed EOL for additional inserted lines, then the right adjacent EOL, then the left adjacent EOL, and finally the document's concrete dominant EOL. This ordering is deterministic.
   - Explicit LF is intentionally not represented separately in M1.1; a future replacement object can add that distinction without changing the current logical-editor default.

8. **Normalize multi-change patches inside Core.**
   - Core clones and sorts changes by range and deterministic payload tie-breakers, validates overlap and boundaries on that normalized copy, and applies it in reverse offset order.
   - Caller order is not part of patch semantics. Equivalent change sets produce the same text and transaction fingerprint.

9. **Treat `selection_after` as a post-edit projection and bind the outcome to the committed revision.**
   - Input selection coordinates refer to the text after all changes. Its input revision must equal `base_revision` to prove it was projected from the current request.
   - Core validates the projected coordinates against the candidate post-edit text and returns a cloned selection rebound to `next_revision`.
   - Any selection or patch validation failure leaves session text, maps, revision, and retry state unchanged.

10. **Bound transaction idempotency to the most recent 256 successful transactions.**
    - The retry cache stores only a deterministic 128-bit payload fingerprint and `PatchOutcome`, ordered by successful commit.
    - An identical retry inside the window returns the exact stored outcome. A different payload with the same transaction id inside the window returns `TransactionConflict`.
    - The oldest entry is evicted when capacity is exceeded. A retry after eviction receives normal patch validation; an old base revision therefore returns `StaleRevision`. Transaction ids MAY be reused only after eviction with a patch valid for the current revision.
    - Rationale: retry safety is needed for lost acknowledgements, but retaining every full replacement for the life of a session is unbounded.

11. **Record String-backend performance evidence without changing storage in M1.1.**
    - A std-only release example measures open, localized patch, and save for generated 1 MB, 10 MB, and 50 MB documents.
    - The report records timings together with known full-document copies, scans, and output allocations. It does not claim profiler-derived peak memory.
    - Failing future M2 budgets triggers a rope/chunked-buffer decision before product integration; M1.1 does not introduce a storage dependency based on one machine's result.

12. **Keep session text and coordinate indexes coherent by construction.**
    - `DocumentSession` owns private text, revision, snapshot, line index, and position map state. Public getters return shared references or copy values only; mutation remains available solely through `apply_patch`.
    - `TextBuffer::replace` and `TextBuffer::apply_changes` are crate-internal implementation methods.
    - Public coordinate conversion is exposed through `DocumentSession`, which always pairs the session-owned `TextBuffer` with its matching `PositionMap`. Direct `PositionMap` conversion methods are crate-internal, so external callers cannot pass unrelated text to an old map and receive a plausible stale result.
    - `PositionMap` remains a public read-only API type for revision inspection and future facade evolution.

13. **Reject CR in logical-text construction.**
    - `TextBuffer::from_logical_text` returns `CoreResult<TextBuffer>` and accepts LF-only logical text. Any CR, including a CRLF pair, returns `InvalidLogicalLineEnding`.
    - Empty LF-only logical text retains the requested concrete dominant EOL as its insertion fallback; `Mixed` is normalized to LF because it is not a concrete output style.
    - Rationale: silently treating source-form CRLF as already-logical text can emit `\r\r\n` under a CRLF line-ending map. Rejection makes the logical/source boundary explicit and type checked.

## Risks / Trade-offs

- [Mixed EOL patch updates are subtle] -> Keep the M1 insertion policy deterministic: bare LF is a logical newline that inherits style, explicit CRLF/CR in replacement is captured into local EOL spans, and inheritance follows removed, right, left, then dominant EOL.
- [Public state can desynchronize derived indexes] -> Keep session-owned mutable state private, expose read-only getters and session-bound conversion facades, and retain all text mutation inside atomic patch application.
- [Source text passed to the logical constructor can duplicate CR] -> Reject every CR with `InvalidLogicalLineEnding`; source-form text must enter through `open_bytes`.
- [String replacement is not scalable for huge files] -> M1 keeps the future rope boundary through `TextBuffer` methods and focuses tests on correctness; performance migration belongs to later stages.
- [Retry fingerprint collisions] -> Use a deterministic 128-bit fingerprint with length-delimited fields; the remaining theoretical collision risk is documented and does not justify an external dependency in M1.1.
- [M1.1 benchmark does not measure peak RSS] -> Record owned-buffer and scan behavior explicitly and require native profiling before M2/M3 large-file gates are frozen.
- [Workspace changes can disturb Tauri builds] -> Keep `src-tauri` package metadata intact and validate `npm run build` plus relevant Rust tests.
- [Byte-for-byte untouched-region checks can be misleading after insertions] -> Fixture tests compare prefix/suffix source bytes around a single localized edit rather than assuming absolute offsets remain stable after insertion.

## Migration Plan

1. Add root workspace metadata and the `markflow-core` crate.
2. Implement the document modules and lossless fixture corpus.
3. Add focused unit, fixture, and property-style tests in `markflow-core`.
4. Validate OpenSpec, Rust Core tests, TypeScript tests/build, and Tauri workspace viability.
5. Apply the M1.1 correction gate and capture 1/10/50 MB release evidence.
6. Leave product editor and save paths unchanged; later M3 work can wire Source Mode and Runtime to this API.

## Open Questions

None for M1. Parser choice, Runtime save orchestration, Core-backed Source Mode, and WYSIWYG migration remain later-stage decisions.
