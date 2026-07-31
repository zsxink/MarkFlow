## ADDED Requirements

### Requirement: GFM table widget edits through Core
WYSIWYG SHALL replace a supported GFM table source block with an accessible grid editor bound to `sessionId + revision + blockId`. Cell, row, column, alignment, and navigation operations SHALL use Core table commands and preserve unaffected source bytes.

#### Scenario: Cell edit is lossless outside the cell
- **WHEN** a user edits one table cell and commits
- **THEN** Core patches only the cell content range when the table structure is unchanged
- **THEN** pipes, padding, alignment markers, EOL style, and other cells remain byte-for-byte unchanged

#### Scenario: Table keyboard navigation
- **WHEN** a user presses Tab, Shift+Tab, arrows, Enter, or Escape in a table widget
- **THEN** focus moves according to grid semantics or returns to document flow
- **THEN** reaching the last cell follows the configured append-row behavior

### Requirement: Image widget replaces source safely
WYSIWYG SHALL replace supported image syntax with a resolved image widget. The widget SHALL support select, edit alt/title/path, replace, resize presentation, open location, copy, delete, retry, and reveal source while resource writes remain governed by the image asset transaction.

#### Scenario: Local relative image resolves through Host
- **WHEN** Markdown references a permitted relative image path
- **THEN** Host resolves it against the active document under capability checks
- **THEN** the WebView receives a safe asset URL without exposing unrestricted filesystem access

#### Scenario: Broken image is editable
- **WHEN** the image cannot be resolved or decoded
- **THEN** the widget shows an accessible error state with edit, retry, and reveal source actions
- **THEN** the original Markdown remains unchanged until the user commits an edit

### Requirement: Task and code widgets preserve Markdown
Task items SHALL expose operable checkboxes backed by Core commands. Fenced code blocks SHALL hide fences, expose language and code content controls, and preserve fence character, length, indentation, info string, trailing newline, and EOL style unless explicitly changed.

#### Scenario: Toggle task checkbox
- **WHEN** a user activates a task checkbox
- **THEN** Core updates only the task state marker using compatible case and spacing
- **THEN** Undo restores the prior state and focus

#### Scenario: Edit fenced code block
- **WHEN** a user edits code or changes language
- **THEN** code content and info string are patched without normalizing unrelated fence style
- **THEN** exiting an empty trailing line follows deterministic code-block exit behavior

### Requirement: FrontMatter structured editor has safe fallback
Supported FrontMatter SHALL render as a structured form using the Core FrontMatter model. Unsafe or unsupported FrontMatter SHALL remain source-editable with diagnostics and MUST NOT be normalized by opening the form.

#### Scenario: Safe field edit
- **WHEN** a user edits a supported scalar, boolean, number, date, array, or nested field
- **THEN** the corresponding Core FrontMatter command patches the exact field range
- **THEN** comments, quoting style, key order, indentation, and unrelated fields remain unchanged

#### Scenario: Unsafe model falls back to source
- **WHEN** Core reports `structured_edit_safe = false`
- **THEN** the editor presents diagnostics and a source editor for that block
- **THEN** no structured control can commit a lossy rewrite

### Requirement: Diagram and HTML projections are sandboxed
Mermaid and PlantUML fences SHALL render as cancellable, revision-bound widgets with source reveal and diagnostics. HTML comments SHALL fold safely; raw HTML SHALL be inert or rendered only in an explicitly sandboxed preview policy.

#### Scenario: Stale diagram result is dropped
- **WHEN** a diagram result returns after its source revision, session, document, or request identity changes
- **THEN** the result is discarded
- **THEN** it is not applied to the current document

#### Scenario: Unsafe HTML is inert
- **WHEN** source contains scripts, event handlers, unsafe URLs, embedded frames, or unsupported raw HTML
- **THEN** no script executes in the editor WebView
- **THEN** the user can inspect and edit the exact source
