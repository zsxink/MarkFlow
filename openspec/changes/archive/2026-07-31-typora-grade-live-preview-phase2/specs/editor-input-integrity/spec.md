## ADDED Requirements

### Requirement: Core is the single History owner
All user-visible text edits, semantic commands, structured widget commits, paste operations, and composition commits SHALL enter Core History with stable transaction identity and grouping. CodeMirror independent undo/redo history MUST be disabled for the product editor.

#### Scenario: Undo from either mode uses the same stack
- **WHEN** a user edits in WYSIWYG, switches to Source, and invokes Undo
- **THEN** Core reverses the latest logical edit
- **THEN** both modes display the same confirmed result and selection mapping

#### Scenario: Programmatic projection does not enter History
- **WHEN** the adapter applies decorations, widget state, confirmed revision effects, resync text, or mode reconfiguration
- **THEN** no user History entry is created

#### Scenario: Undo arrives before the latest patch acknowledgment
- **WHEN** the user invokes Undo or Redo while one or more ordered local transactions are not yet confirmed by Core
- **THEN** the command waits at a bounded pending-revision barrier or references the pending transaction through the ordered Core protocol
- **THEN** Core never undoes an older confirmed edit in place of the pending edit
- **THEN** a barrier failure preserves local text and selection and exposes recoverable synchronization state

### Requirement: IME composition is atomic and projection safe
The editor SHALL recognize composition start, update, and end. During composition it MUST preserve the native composition range, suspend marker replacement that intersects or neighbors the range, and commit one logical Core History entry at composition end.

#### Scenario: CJK composition crosses a formatted range
- **WHEN** a user composes Chinese, Japanese, or Korean text adjacent to or inside emphasis, link, list, table, or code syntax
- **THEN** the composition text is not lost, duplicated, reordered, or prematurely committed
- **THEN** Undo removes the completed composition as one logical edit

#### Scenario: Core ack arrives during composition
- **WHEN** a previous patch acknowledgment arrives while a new composition is active
- **THEN** the adapter does not replace or move the native composition range
- **THEN** confirmed projection reconciliation waits or excludes that range

#### Scenario: Marker folding cannot become default without composition safety
- **WHEN** a projected construct can replace or fold source markers
- **THEN** that construct remains behind an experimental default-off flag until its composition-neighborhood and core selection-mapping fixtures pass
- **THEN** a failing construct falls back to exact editable source without changing document bytes

### Requirement: Selection and clipboard preserve user intent
Selection SHALL remain coherent across hidden markers and widgets. Copy SHALL provide safe rendered HTML and deterministic plain text; Markdown-aware internal copy SHALL preserve exact source syntax without exposing hidden marker artifacts unexpectedly.

#### Scenario: Copy across hidden markers
- **WHEN** a selection spans formatted text, a link, and a widget
- **THEN** plain text contains the visible textual content in document order
- **THEN** HTML contains sanitized rendered semantics
- **THEN** internal Markdown payload contains the exact selected Markdown source

#### Scenario: Paste Markdown and rich content
- **WHEN** the clipboard contains internal Markdown, external HTML, plain text, files, or images
- **THEN** a deterministic policy chooses the supported representation
- **THEN** generated changes are submitted through Core commands and asset transactions

### Requirement: Natural block editing behavior
The editor SHALL define deterministic Enter, Backspace, Delete, Tab, Shift+Tab, arrow, Home, End, and Escape behavior for projected Markdown structures. These behaviors SHALL emit Core commands or patch transactions and preserve the configured StyleMap.

#### Scenario: List continuation and exit
- **WHEN** Enter is pressed in a non-empty list item
- **THEN** a sibling item is created using compatible marker, indentation, task syntax, and EOL style
- **WHEN** Enter is pressed in an empty list item
- **THEN** the list item exits without leaving invalid markers

#### Scenario: Delete across hidden boundary
- **WHEN** Backspace or Delete crosses a folded marker or widget boundary
- **THEN** the command reveals or deletes a semantic unit predictably
- **THEN** it never deletes hidden source outside the intended unit

### Requirement: Keyboard and accessibility paths are complete
Every structured control SHALL have keyboard navigation, focus indication, accessible name, and source fallback. Screen readers SHALL receive meaningful text without duplicate hidden Markdown markers.

#### Scenario: Keyboard-only structured editing
- **WHEN** a keyboard-only user navigates images, task items, tables, FrontMatter, code blocks, or diagrams
- **THEN** the user can enter, operate, commit, cancel, and return to text flow
- **THEN** focus never becomes trapped in a widget
