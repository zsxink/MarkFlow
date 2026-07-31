## MODIFIED Requirements

### Requirement: Core Render IR for WYSIWYG projection
The system SHALL generate versioned viewport-scoped Render IR v2 from the Core confirmed snapshot for the requested session and revision. Render IR SHALL include session, document, revision, request, viewport, source hash, nested block identity, UTF-16 source/content/marker ranges, semantic tokens, widget descriptors, and fallback policy. Coverage SHALL include all supported CommonMark/GFM blocks and inline constructs; unknown syntax SHALL preserve exact editable source.

#### Scenario: Render IR contains session-bound UTF-16 ranges
- **WHEN** a WYSIWYG render request is made for a session revision and viewport
- **THEN** every returned block, inline span, marker, and widget descriptor carries UTF-16 ranges for that same session revision
- **THEN** no Rust byte offset is exposed over frontend IPC

#### Scenario: Unknown syntax remains editable source
- **WHEN** Core cannot classify or safely project a block
- **THEN** Render IR returns an unknown/source node with the exact source range and reason
- **THEN** the Editor Adapter displays editable Markdown text with a Source Mode path

### Requirement: Source/WYSIWYG switching is byte-preserving
Source and Core-backed WYSIWYG SHALL use the same CodeMirror EditorView, Markdown document, Core session, patch pipeline, selection, viewport, and History. Switching modes SHALL reconfigure extensions and SHALL NOT remount the editor, replace text, serialize a secondary document model, or call ProseMirror.

#### Scenario: Round trip does not change bytes
- **WHEN** a file switches between Source and WYSIWYG without editing
- **THEN** document bytes, revision, dirty state, selection, scroll anchor, and undo depth remain unchanged
- **THEN** no serializer or whole-document synchronization API is called

#### Scenario: Mode switch keeps pending edits
- **WHEN** local edits are pending during a mode switch
- **THEN** the same CodeMirror mirror remains visible
- **THEN** the adapter completes or reports the revision barrier without discarding edits

#### Scenario: WYSIWYG remains available without ProseMirror
- **WHEN** the Core-backed product path is active
- **THEN** WYSIWYG editing, commands, History, saving, and export operate without a ProseMirror editor instance
- **THEN** Source Mode remains the fallback for unsupported or degraded projection

### Requirement: CodeMirror WYSIWYG decorations and marker reveal
The Editor Adapter SHALL convert optimistic local syntax and confirmed Render IR into viewport-scoped decorations, folds, replacements, atomic ranges, and widgets. Supported markers SHALL be hidden outside the active cursor, selection, or composition context and SHALL reveal only the minimum source needed for direct editing.

#### Scenario: Projection does not replace document truth
- **WHEN** decorations, folds, replacements, or widgets are applied
- **THEN** the CodeMirror document remains the complete Markdown source
- **THEN** projection-only transactions do not enter Core History

#### Scenario: Inactive markers are not visible
- **WHEN** the cursor and selection are outside a supported syntax range
- **THEN** its Markdown markers are not visibly rendered
- **THEN** its semantic content remains visible and selectable

#### Scenario: Marker reveal follows editing context
- **WHEN** the cursor, selection, or composition enters or neighbors a supported syntax range
- **THEN** the minimum required markers are revealed without moving selection
- **WHEN** the active context leaves the range
- **THEN** the rendered projection is restored

## ADDED Requirements

### Requirement: WYSIWYG projection state is observable
The active editor SHALL expose projection state and stable diagnostics. Failed rendering MUST enter a visible degraded state rather than silently presenting source as successful WYSIWYG.

#### Scenario: Projection failure is visible
- **WHEN** a render request or projection application fails
- **THEN** the editor remains safely editable and reports degraded state once per relevant failure identity
- **THEN** retry and Source Mode actions are available
