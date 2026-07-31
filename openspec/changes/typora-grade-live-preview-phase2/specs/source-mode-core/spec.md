## ADDED Requirements

### Requirement: Source and WYSIWYG share Core editor authority
Every active Core CodeMirror surface SHALL route patches, semantic commands, flush, resync, save, History, diagnostics, and projection through the same session authority regardless of visible mode.

#### Scenario: Formatting in WYSIWYG uses Core
- **WHEN** WYSIWYG is active and the user invokes a formatting command
- **THEN** the command targets the visible CodeMirror selection and active Core session
- **THEN** it does not call a hidden or legacy editor

#### Scenario: Save behavior is mode independent
- **WHEN** the same confirmed revision is saved from Source or WYSIWYG
- **THEN** Runtime receives the same session and SavePayload
- **THEN** persisted bytes are identical

### Requirement: Source Mode is the universal safe fallback
Source Mode SHALL remain available for unknown syntax, unsafe structured models, render errors, large-document degradation, and recovery workflows without closing the Core session.

#### Scenario: Degraded WYSIWYG switches to Source
- **WHEN** the user selects Source Mode from a degraded projection
- **THEN** the same Markdown mirror and selection range become visible
- **THEN** pending edits and dirty state are preserved
