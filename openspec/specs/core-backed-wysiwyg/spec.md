# core-backed-wysiwyg Specification

## Purpose
TBD - created by archiving change m5-core-backed-wysiwyg-mvp. Update Purpose after archive.
## Requirements
### Requirement: Core Render IR for WYSIWYG projection
The system SHALL generate a viewport-scoped Render IR from the Core confirmed snapshot for the requested session and revision. The Render IR SHALL include `sessionId`, `documentId`, `revision`, `requestId`, `viewport`, and render blocks with UTF-16 source ranges. M5 block coverage SHALL include heading, paragraph, blockquote, bullet list, ordered list, task list, code fence, image, and unknown/source fallback. M5 inline coverage SHALL include strong, emphasis, inline code, link, image reference, and marker ranges.

#### Scenario: Render IR contains session-bound UTF-16 ranges
- **WHEN** a WYSIWYG render request is made for a session revision and viewport
- **THEN** every returned block and inline span carries a UTF-16 source range for that same session revision
- **THEN** no Rust byte offset is exposed over frontend IPC

#### Scenario: Unknown syntax remains editable source
- **WHEN** Core cannot classify a block in the requested viewport
- **THEN** the Render IR returns an unknown/source block for that source range
- **THEN** the Editor Adapter displays editable Markdown text instead of blocking editing

### Requirement: Source/WYSIWYG switching is byte-preserving
The Core-backed WYSIWYG path SHALL use the same Markdown text mirror and Core confirmed snapshot model as Source Mode. Switching between Source Mode and Core-backed WYSIWYG SHALL flush pending patches before leaving a mode and SHALL NOT call the ProseMirror serializer.

#### Scenario: Round trip does not change bytes
- **WHEN** a file is opened through Core-backed Source Mode
- **WHEN** the user switches to Core-backed WYSIWYG and back without editing
- **THEN** the document text remains byte-for-byte unchanged
- **THEN** no ProseMirror serializer API is called by the new path

#### Scenario: Source to Core WYSIWYG keeps Core session
- **WHEN** a Core-backed Source Mode session is active
- **WHEN** the user switches to WYSIWYG with Core-backed WYSIWYG enabled
- **THEN** the existing Core session remains active
- **THEN** CodeMirror is remounted with Render IR projection for the same session and confirmed revision
- **THEN** legacy ProseMirror `setContent` and Markdown serializer APIs are not called

#### Scenario: Core WYSIWYG to Source keeps source text
- **WHEN** the user switches from Core-backed WYSIWYG back to Source Mode
- **THEN** the editor flushes pending Core patches
- **THEN** CodeMirror is remounted as Source Mode with the same Markdown source text
- **THEN** the Core session remains active and the legacy ProseMirror path is not used

#### Scenario: Legacy WYSIWYG remains available
- **WHEN** the Core-backed WYSIWYG feature is disabled or unsupported
- **THEN** the existing ProseMirror WYSIWYG compatibility path remains reachable
- **THEN** existing legacy behavior is not removed by M5

### Requirement: CodeMirror WYSIWYG decorations and marker reveal
The Editor Adapter SHALL convert Render IR into viewport-scoped CodeMirror decorations and widgets. Heading, emphasis, inline code, link, blockquote/list indentation, code block style, and image preview SHALL be rendered as projection state only. Marker reveal SHALL weaken markers while the cursor is outside the relevant range and reveal markers when the cursor, selection, or composition is inside or near the range.

#### Scenario: Decorations do not replace document truth
- **WHEN** Render IR is applied to CodeMirror
- **THEN** decorations and widgets affect only presentation
- **THEN** the CodeMirror document text remains the Markdown source text

#### Scenario: Marker reveal follows selection
- **WHEN** the cursor or selection enters an emphasized range
- **THEN** the Markdown markers for that range are visibly revealed
- **WHEN** the cursor and selection leave the range
- **THEN** the markers return to the weakened presentation

### Requirement: Stale Render IR and widget results are isolated
The Editor Adapter SHALL apply Render IR only when the current editor binding still matches the response `sessionId`, `revision`, and latest `requestId`. Widget async results SHALL be isolated by `sessionId`, `revision`, and block or range identity.

#### Scenario: Stale revision is dropped
- **WHEN** Render IR for revision 1 arrives after the editor has advanced to revision 2
- **THEN** the adapter drops the old Render IR
- **THEN** no decorations or widgets from revision 1 are applied to revision 2

#### Scenario: Cross-session result is dropped
- **WHEN** a render or widget result for document A arrives after the active editor switched to document B
- **THEN** the adapter drops or leaves the result in document A's projection
- **THEN** document B is not polluted by document A's Render IR or widget state

### Requirement: Large document WYSIWYG is viewport-only
Documents over 1 MiB SHALL still be allowed to enter Core-backed WYSIWYG, but render requests SHALL be limited to the viewport plus bounded overscan. Heavy widgets such as images and diagrams SHALL be lazy or opt-in by default for large documents.

#### Scenario: Large document does not request whole-document widgets
- **WHEN** a document larger than 1 MiB enters Core-backed WYSIWYG
- **THEN** the adapter requests only viewport render ranges with bounded overscan
- **THEN** automatic image or diagram widget construction is not performed for the whole document

### Requirement: Widgets are safe and accessible
Widgets SHALL provide a keyboard path and screen-reader fallback text. Widget commands SHALL return through Core/Host command boundaries and SHALL NOT directly mutate the CodeMirror document or Solid text stores. Raw HTML, SVG event handlers, JavaScript URLs, and oversized widget payloads SHALL NOT execute in the editor WebView.

#### Scenario: Image widget can locate source range
- **WHEN** an image preview widget receives keyboard focus
- **THEN** the user can move to or reveal the original Markdown image source range
- **THEN** copying the document text preserves the Markdown image syntax

#### Scenario: Unsafe content is inert
- **WHEN** Markdown contains raw HTML, an SVG event handler, or a `javascript:` link
- **THEN** Core-backed WYSIWYG displays safe editable source or sanitized inert projection
- **THEN** no script executes in the editor WebView

