## Why

PlantUML diagrams are common in Markdown technical documents, but MarkFlow currently shows them only as source code. Providing an opt-in renderer lets users preview those diagrams while keeping control over where potentially sensitive diagram text is sent.

## What Changes

- Add a configurable PlantUML server address to application settings; its default is empty.
- Render `plantuml` fenced code blocks only when a server address is configured; otherwise preserve ordinary code-block fallback behavior without making a request.
- Load PlantUML rendering code only on first encounter with a PlantUML code block, show a loading state, cache the loader, and surface safe rendering errors.
- Explain that an external PlantUML server receives diagram text and may create privacy or data-leakage risk; recommend a self-hosted server for sensitive content.

## Capabilities

### New Capabilities

- `plantuml-render`: Opt-in, lazy PlantUML diagram rendering backed by a user-configured server.

### Modified Capabilities

- None.

## Impact

- Frontend settings model and settings dialog.
- ProseMirror code-block node view and diagram-rendering utilities.
- Frontend unit tests and Vite chunk output.
- No new bundled renderer dependency; the configured PlantUML server supplies diagram output.
