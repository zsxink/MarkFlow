## ADDED Requirements

### Requirement: Single CodeMirror editing surface
Source Mode and WYSIWYG Mode SHALL use the same CodeMirror EditorView and document. Mode switching SHALL reconfigure extensions without destroying the view, replacing the document, or changing Core session, selection, scroll position, pending patches, or History.

#### Scenario: Repeated mode switching preserves state
- **WHEN** a user switches Source and WYSIWYG modes 100 times without editing
- **THEN** document bytes, selection, scroll anchor, session identity, dirty state, and undo depth remain unchanged

#### Scenario: Switching during pending patch flushes safely
- **WHEN** a mode switch occurs while local patches are pending
- **THEN** the visible CodeMirror document remains editable
- **THEN** the adapter either completes the revision barrier or keeps the current mode with a visible synchronization state

### Requirement: Supported Markdown markers are hidden outside active context
WYSIWYG Mode SHALL replace or fold supported Markdown markers outside the active cursor, selection, or composition context. Heading markers, inline delimiters, link destinations, blockquote markers, list markers, task syntax, code fences, image syntax, table delimiters, and FrontMatter fences SHALL NOT remain visibly rendered in inactive supported regions.

#### Scenario: Inactive document resembles rendered Markdown
- **WHEN** the cursor is in a plain paragraph
- **THEN** supported syntax outside the active paragraph displays rendered typography or widgets
- **THEN** no supported marker is visible outside ranges intentionally exposed by fallback policy

#### Scenario: Active inline syntax reveals locally
- **WHEN** the cursor or selection enters a strong, emphasis, code, link, or image range
- **THEN** only the syntactic source needed to edit that range is revealed
- **THEN** leaving the range restores the rendered projection

#### Scenario: Active block syntax reveals safely
- **WHEN** the cursor enters a heading, quote, list item, task item, code fence, table, FrontMatter, or diagram block
- **THEN** the adapter reveals the minimum editable source or structured control required by that block
- **THEN** surrounding blocks remain rendered

### Requirement: Projection lifecycle is explicit and user visible
Each editor binding SHALL expose `idle`, `loading`, `optimistic`, `rendered`, `degraded`, `stale`, and `composing` projection states. A render failure MUST NOT be silently presented as successful WYSIWYG.

#### Scenario: Render request fails
- **WHEN** Render IR cannot be requested, decoded, validated, or applied
- **THEN** the editor enters `degraded` state and keeps the Markdown mirror editable
- **THEN** the UI displays a non-repeating message with retry and Source Mode actions

#### Scenario: Render recovers
- **WHEN** a later matching Render IR succeeds
- **THEN** the editor returns to `rendered`
- **THEN** the degradation message clears without changing document content

### Requirement: Typora-grade block presentation
WYSIWYG Mode SHALL provide stable layout and typography for headings, paragraphs, quotes, lists, task lists, code blocks, thematic breaks, tables, images, FrontMatter, and diagrams. Projection changes MUST NOT cause unrelated lines to jump during cursor movement.

#### Scenario: Cursor movement does not resize unrelated blocks
- **WHEN** the cursor moves between supported blocks
- **THEN** only the entered and exited projection ranges may change marker visibility
- **THEN** unrelated blocks retain their measured layout and scroll position

### Requirement: Source Mode remains complete and authoritative
Source Mode SHALL display the complete Markdown mirror with line numbers, syntax highlighting, folding, bracket matching, search/replace, and exact selection. Unsupported or degraded WYSIWYG content SHALL always be reachable in Source Mode.

#### Scenario: Switch to Source from structured widget
- **WHEN** a user invokes reveal source from a table, image, FrontMatter, code, or diagram widget
- **THEN** Source Mode selects the exact source range represented by the widget
- **THEN** no intermediate serialization occurs
