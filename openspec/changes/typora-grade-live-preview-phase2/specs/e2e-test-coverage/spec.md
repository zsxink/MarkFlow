## ADDED Requirements

### Requirement: WYSIWYG E2E validates rendered semantics
Desktop E2E SHALL verify real Core-backed WYSIWYG projection, marker visibility, commands, widgets, mode switching, save persistence, and logs. Assertions against a hidden legacy container or text presence alone MUST NOT count as WYSIWYG coverage.

#### Scenario: Canonical WYSIWYG fixture
- **WHEN** the E2E opens the canonical fixture in WYSIWYG
- **THEN** it asserts active Core surface identity and successful Render IR
- **THEN** it verifies semantic rendering for headings, inline formatting, links, quotes, lists, tasks, code, tables, images, FrontMatter, and diagrams

#### Scenario: Mode switching preserves bytes
- **WHEN** the E2E edits in both modes and repeatedly switches modes
- **THEN** saved disk bytes match the expected fixture exactly
- **THEN** selection, dirty state, and Undo/Redo remain coherent

### Requirement: WYSIWYG smoke runs in required CI
The required pull-request workflow SHALL run the Tauri desktop smoke suite and preserve screenshots, frontend logs, backend logs, and command traces on failure.

#### Scenario: Render failure in CI
- **WHEN** the application logs a render, save, session, stale routing, or command contract error during smoke
- **THEN** the CI job fails
- **THEN** diagnostic artifacts are uploaded

### Requirement: E2E page objects identify the active surface
Page objects SHALL distinguish Source Mode, Core WYSIWYG, degraded projection, structured widgets, and any legacy shell. Tests MUST interact with the visible active CodeMirror surface.

#### Scenario: Core WYSIWYG is visible
- **WHEN** the mode indicator reports Core WYSIWYG
- **THEN** the page object resolves the visible CodeMirror surface with `data-core-wysiwyg`
- **THEN** it does not query a hidden ProseMirror container
