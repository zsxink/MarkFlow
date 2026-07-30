## 1. Core Search

- [x] 1.1 Add session-bound search request/result types with query id, options, paging cursor, source range, UI range, and selection mapping.
- [x] 1.2 Implement plain text matching with case-sensitive and whole-word options.
- [x] 1.3 Implement large-document paged results and replace preview patch generation.

## 2. Core Diagnostics

- [x] 2.1 Add session-bound diagnostics request/report types with viewport filtering.
- [x] 2.2 Report bad links, identity-bound missing image assets, duplicate headings, unsafe FrontMatter, and table structure diagnostics.
- [x] 2.3 Accept Host/UI diagram render failures only when session, revision, and source range revision match the current session.

## 3. Core Diagram Targets

- [x] 3.1 Add Mermaid/PlantUML code fence target discovery with session, document, revision, request, block, source range, UI range, language, and source text.
- [x] 3.2 Add enabled/disabled rollback switch and empty-source fallback state.

## 4. Verification and Documentation

- [x] 4.1 Add focused integration tests for search, diagnostics, diagram targets, stale identity guards, paging, and fallback behavior.
- [x] 4.2 Update M7D functional matrix, release note, and stage-document evidence links.
- [x] 4.3 Run Core tests, strict Core clippy, frontend tests/build, whitespace checks, and independent sub-agent review.
