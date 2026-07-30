# M7D Search Diagnostics Diagram Evidence

> Issue: #234
> OpenSpec change: `2026-07-30-m7d-search-diagnostics-diagram`
> Date: 2026-07-30

## Functional Matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Search requests bound to `sessionId + revision + queryId` | Implemented | `DocumentSession::search`; covered by `markflow-core/tests/search.rs` |
| Plain text search with case-sensitive and whole-word options | Implemented | Unicode and whole-word tests in `markflow-core/tests/search.rs` |
| Large document paged search over 1 MiB | Implemented | `large_document_search_returns_pages` covers `LargeDocumentPolicy::paged_search` behavior |
| Search result selection mapping | Implemented | Each `SearchMatch` includes `SourceRange`, `UiRange`, and `Selection` |
| Replace single/all preview with base revision check | Implemented | `DocumentSession::preview_search_replace`; covered by replace preview tests |
| Diagnostics bound to `sessionId + revision + requestId` | Implemented | `DocumentSession::diagnostics`; stale and mismatch behavior covered by tests |
| Diagnostics viewport filtering | Implemented | `diagnostics_filter_by_viewport_and_reject_stale_identity` |
| Bad link, missing image, duplicate heading diagnostics | Implemented | Core reports syntactic bad links, identity-bound Host-supplied missing image targets, and duplicate outlines |
| FrontMatter and table diagnostics | Implemented | Unsafe FrontMatter and malformed table-like rows covered in `markflow-core/tests/diagnostics.rs` |
| Mermaid/PlantUML render targets | Implemented | `DocumentSession::diagram_render_targets`; covered by `markflow-core/tests/diagrams.rs` |
| Diagram render error diagnostics | Implemented | Host/UI render failures are passed back as `DiagramRenderError` and filtered by matching session/revision/source range revision |
| Feature flag / rollback switch | Available | `DiagramTargetsRequest.enabled = false` returns no render targets without affecting source editing or saving |

## Test Evidence

```bash
cargo test --manifest-path markflow-core/Cargo.toml --test search --test diagnostics --test diagrams
```

Result: 3 test binaries passed, 11 tests passed.

```bash
cargo test --manifest-path markflow-core/Cargo.toml
```

Result: all markflow-core unit, integration, and doc tests passed.

```bash
cargo clippy --manifest-path markflow-core/Cargo.toml --tests -- -D warnings
```

Result: passed with no warnings.

```bash
npm test
```

Result: 44 files passed, 448 tests passed.

```bash
npm run build
```

Result: passed. Vite reported existing chunk/dynamic-import warnings.

```bash
npx openspec validate --all
```

Result: 81 items passed, 0 failed.

```bash
bash scripts/check-archive-synced.sh
```

Result: passed. M7D archived delta specs are synced to main specs.

Independent review: sub-agent review found three identity hardening issues in the initial Core API shape. The final patch validates diagram error source-range revisions, makes missing asset diagnostics identity-bound, and returns diagram source ranges alongside UI ranges.

## Release Note

M7D adds Core-owned Search, Diagnostics, and Diagram target APIs. Search and replace preview now produce revision-bound ranges and patch proposals, diagnostics aggregate Core parse findings with identity-bound Host-provided missing asset/render failures, and diagram rendering is represented as session/revision/request-bound Mermaid or PlantUML targets with both source and UI ranges plus a rollback switch.
