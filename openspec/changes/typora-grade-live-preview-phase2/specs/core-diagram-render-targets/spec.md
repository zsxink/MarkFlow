## ADDED Requirements

### Requirement: Diagram targets produce editor widget descriptors
Mermaid and PlantUML render targets SHALL be exposed to WYSIWYG as sandboxed widget descriptors bound to session, document, revision, request, block identity, source range, timeout, and cancellation.

#### Scenario: Diagram renders in WYSIWYG
- **WHEN** a supported diagram fence is visible and rendering is permitted
- **THEN** the editor displays a bounded preview with edit-source, refresh, copy, and export actions
- **THEN** the fence source remains the document truth

#### Scenario: Diagram render fails
- **WHEN** parsing, network, timeout, or sandbox rendering fails
- **THEN** the widget displays a stable diagnostic and source reveal action
- **THEN** no unsafe output executes

### Requirement: Diagram result routing is isolated
Diagram results MUST pass request, session, document, revision, block, and window identity checks before application.

#### Scenario: User edits diagram during render
- **WHEN** the diagram source advances to a new revision before the result returns
- **THEN** the old result is discarded
- **THEN** the new source remains visible or schedules a new render
