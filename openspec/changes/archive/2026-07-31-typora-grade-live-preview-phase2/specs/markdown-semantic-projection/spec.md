## ADDED Requirements

### Requirement: Production Markdown concrete syntax model
The system SHALL build production editor semantics from a CommonMark and GFM capable parser that preserves source ranges for blocks, inline nodes, delimiters, whitespace, line endings, and unsupported syntax. The parser SHALL cover headings, paragraphs, emphasis, strong, strikethrough, inline code, links, images, autolinks, reference links, blockquotes, nested lists, task lists, code fences, thematic breaks, GFM tables, FrontMatter, HTML blocks/comments, and diagram fences.

#### Scenario: Nested and escaped syntax keeps exact ranges
- **WHEN** a document contains nested emphasis, escaped delimiters, multiple-backtick code spans, nested lists, and a URL containing parentheses
- **THEN** the concrete syntax model returns well-formed, properly nested source/content/marker ranges matching the original UTF-8 bytes
- **THEN** marker ranges of the same node do not overlap each other and remain disjoint from that node's content range, while parent-child containment remains explicit
- **THEN** serializing an unchanged document returns the exact original bytes

#### Scenario: Unsupported syntax remains lossless
- **WHEN** the parser cannot classify a source range
- **THEN** it returns an unknown node with the exact source range and source text
- **THEN** the editor keeps that range editable in source form

### Requirement: Render IR v2 expresses editable projection
Core SHALL expose a versioned Render IR v2 containing session, document, confirmed revision, request identity, viewport, nested block identity, source/content/marker ranges, semantic tokens, widget descriptors, and fallback policy. All editor-facing ranges SHALL use UTF-16 offsets bound to the returned revision.

#### Scenario: Block markers are independently addressable
- **WHEN** Render IR contains a heading, blockquote, list item, task item, or fenced code block
- **THEN** each syntactic marker has an independent marker range
- **THEN** content ranges exclude markers without excluding user-visible content

#### Scenario: Client rejects unsupported schema
- **WHEN** the frontend receives an unsupported Render IR schema version
- **THEN** it rejects the projection with a stable error
- **THEN** it retains the Markdown mirror and exposes Source Mode

### Requirement: Incremental projection invalidation
Core and Editor Adapter SHALL invalidate semantic projection by affected block ranges after an accepted patch. Documents larger than 1 MiB SHALL use viewport plus bounded overscan; they MUST NOT rebuild all widgets for every edit.

#### Scenario: Local paragraph edit has bounded invalidation
- **WHEN** the user edits one paragraph without changing its block boundary
- **THEN** Core invalidates that paragraph and dependent inline ranges
- **THEN** unrelated blocks retain stable identities and projection state

#### Scenario: Boundary-changing edit expands safely
- **WHEN** an edit changes a fence, list boundary, table delimiter, FrontMatter boundary, or HTML block boundary
- **THEN** Core expands invalidation to the smallest provably safe enclosing range
- **THEN** it falls back to background full parse only when a safe local boundary cannot be proven

### Requirement: Optimistic and confirmed projection reconciliation
CodeMirror SHALL provide immediate optimistic projection from its local Markdown syntax tree while Core remains the confirmed semantic authority. Confirmed Render IR SHALL reconcile only when session, document, revision, request, and source hash match the active binding.

#### Scenario: Typing does not wait for IPC
- **WHEN** the user types a Markdown delimiter or content character
- **THEN** CodeMirror commits the visible text and safe local projection in the same UI turn
- **THEN** the input path does not wait for a Tauri command response

#### Scenario: Confirmed projection supersedes optimistic projection
- **WHEN** Core acknowledges the patch and returns matching Render IR
- **THEN** the adapter replaces optimistic semantics with confirmed semantics without moving selection or scroll
- **THEN** visual state does not flicker back to an older revision

### Requirement: Semantic parser conformance gate
The project SHALL maintain deterministic CommonMark/GFM/editor fixtures comparing the production parser, source ranges, StyleMap, Render IR, and byte-preserving edits. Parser selection or replacement MUST pass this gate before becoming the default.

#### Scenario: Parser candidate evaluation
- **WHEN** a parser candidate is evaluated for production use
- **THEN** the report records CommonMark/GFM coverage, range fidelity, incremental cost, unsafe syntax handling, licensing, binary impact, and large-document performance
- **THEN** the candidate is rejected if unchanged fixtures cannot round-trip byte-for-byte
