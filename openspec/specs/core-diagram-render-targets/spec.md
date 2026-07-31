# Core Diagram Render Targets

## Purpose

Core-level diagram target discovery for MarkFlow documents. Identifies Mermaid and PlantUML code fences without rendering in Core, returning identity-bound source and UI ranges for Host/UI renderers.

## Requirements

### Requirement: Core diagram target discovery
Core SHALL discover Mermaid and PlantUML code fence blocks as render targets without rendering them inside Core.

#### Scenario: Mermaid and PlantUML fences become render targets
- **WHEN** a document contains fenced code blocks whose info string is `mermaid`, `plantuml`, or `puml`
- **THEN** Core returns diagram render targets for those blocks
- **AND** non-diagram code fences remain editable code blocks without render targets

### Requirement: Diagram target identity and ranges
Each diagram render target SHALL include `sessionId`, `documentId`, `revision`, `requestId`, `blockId`, revision-bound source ranges, UTF-16 UI ranges, language, source text, and fallback state.

#### Scenario: Render target carries block source range
- **WHEN** Core returns a diagram render target
- **THEN** the target includes the code fence block source range
- **AND** the target includes the code fence content source range
- **AND** both source ranges use the request revision

### Requirement: Diagram rollback switch
Core SHALL support disabling diagram target generation for rollback or feature flag paths.

#### Scenario: Disabled diagram request returns no targets
- **WHEN** a diagram target request has rendering disabled
- **THEN** Core returns no render targets
- **AND** document text, source editing, and saving remain unaffected

### Requirement: Empty diagram source fallback
Core SHALL mark empty diagram source as a fallback target rather than requiring Host/UI rendering.

#### Scenario: Empty Mermaid source falls back
- **WHEN** a Mermaid or PlantUML code fence has only blank source content
- **THEN** Core returns a target with an empty-source fallback reason

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
