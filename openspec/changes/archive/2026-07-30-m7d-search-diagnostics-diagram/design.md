## Context

M7D covers Search, Diagnostics, and Diagram renderer contracts. Existing Core already owns session identity, revisions, position maps, ParseIndex, FrontMatter safety, table detection, and render viewport ranges, but search/diagnostic/diagram results were still future planning items without a Core API surface.

These capabilities are asynchronous once wired to Host/UI. The Core slice therefore must make identity and range data explicit so stale work from another session, revision, query, or render request cannot be applied to the currently active editor.

## Goals / Non-Goals

**Goals:**

- Add Core-owned search results with source byte ranges, UTF-16 UI ranges, and CodeMirror-compatible selection targets.
- Add replace preview that returns a `TextPatch` instead of mutating document text directly.
- Page search results for large documents using the existing 1 MiB large-document policy.
- Aggregate diagnostics from Core parse state and identity-bound Host/UI inputs.
- Return diagram render targets for Mermaid and PlantUML fences with both source ranges and UI ranges.
- Keep all APIs bound to `sessionId + revision + requestId/queryId`.

**Non-Goals:**

- Building the frontend search panel, diagnostics panel, or diagram widget UI.
- Implementing Host filesystem checks for missing assets.
- Rendering Mermaid or PlantUML in Core.
- Adding new parser dependencies or a full Markdown AST.

## Decisions

1. Keep M7D APIs on `DocumentSession`.
   - Rationale: `DocumentSession` already owns session identity, revision, text, position map, parse index cache, and patch validation.
   - Alternative considered: add a separate service object. That would add indirection before Runtime has a bridge DTO for these APIs.

2. Search returns both `SourceRange` and `UiRange`.
   - Rationale: Core needs byte ranges for patches and UTF-16 ranges for CodeMirror selection. Returning both avoids Host/UI remapping under a stale revision.
   - Alternative considered: return only byte ranges and let UI convert. That would require extra bridge calls and increase stale mapping risk.

3. Replace is preview-only.
   - Rationale: replacement must participate in existing patch validation, transaction idempotency, history, and stale-revision rejection.
   - Alternative considered: mutate inside search. That would duplicate `TextPatch` commit semantics and make replace harder to preview.

4. Diagnostics accept Host/UI inputs only with explicit identity.
   - Rationale: missing asset and diagram render failure facts come from outside Core. They must carry session/revision/request context and optional source ranges so Core can ignore stale or foreign inputs.
   - Alternative considered: pass plain target strings and render errors. This is simpler but cannot prove isolation when two documents contain the same target.

5. Diagram target discovery does not render.
   - Rationale: Core should identify code fence language and stable source ranges, while Host/UI owns Mermaid/PlantUML rendering, permissions, sanitization, and network behavior.
   - Alternative considered: call renderers from Core. That would violate the host-independent crate boundary.

## Risks / Trade-offs

- [Risk] Plain text search is intentionally simple and not a regex engine -> Mitigation: M7D scope only promises plain text, case-sensitive, whole-word, paging, and replace preview.
- [Risk] Core diagnostics only knows syntactic link issues; real missing files require Host IO -> Mitigation: Host-supplied missing asset diagnostics must carry identity and are filtered before reporting.
- [Risk] Table diagnostics are conservative and may report table-like paragraphs -> Mitigation: M7D flags malformed structures without rewriting text; Source Mode save remains unaffected.
- [Risk] Diagram target API is not wired to the frontend yet -> Mitigation: target/result contracts include request identity and fallback state so UI work can attach incrementally.
