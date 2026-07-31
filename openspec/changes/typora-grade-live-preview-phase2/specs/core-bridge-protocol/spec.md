## ADDED Requirements

### Requirement: Tauri command argument naming is explicit
Every direct Tauri Core Bridge command argument SHALL use camelCase on the wire to match the Tauri dispatcher default. Versioned envelope and nested Serde DTO casing SHALL be declared explicitly in their schema and MUST NOT inherit an accidental command-level convention. Frontend payloads, generated command handlers, request identity, revision fields, and optional values MUST follow this rule.

#### Scenario: Real invoke deserializes every command
- **WHEN** the contract suite invokes each registered Core Bridge command through the real Tauri invoke dispatcher
- **THEN** valid arguments reach the command handler
- **THEN** missing or mis-cased fields fail the contract suite before product E2E
- **THEN** snake_case direct arguments fail unless a reviewed command explicitly declares a compatibility alias

### Requirement: Render IR v2 command lifecycle
The Bridge SHALL provide versioned Render IR v2 requests with session, document, confirmed revision, viewport, schema support, request identity, and cancellation identity. The response SHALL echo routing identity and source hash.

#### Scenario: New revision cancels obsolete render
- **WHEN** a newer confirmed revision or viewport request supersedes an in-flight render
- **THEN** Runtime cancels or marks the old request obsolete
- **THEN** the frontend cannot apply the obsolete response

### Requirement: Confirmed revision notifications drive projection
An accepted patch or resync SHALL produce a confirmed revision event that the active Editor Adapter can consume without waiting for a new user input or viewport event.

#### Scenario: Patch acknowledgment invalidates projection
- **WHEN** Core acknowledges a patch at revision N
- **THEN** the adapter receives a revision-confirmed effect for N
- **THEN** stale projection is mapped or cleared and a matching render request is scheduled

### Requirement: Bridge degradation uses stable errors
Render, command, History, widget, and mode-transition failures SHALL use stable error codes and include session, revision, request, capability, and retry classification where available.

#### Scenario: Render argument mismatch
- **WHEN** render command arguments cannot be deserialized
- **THEN** the error is logged with command and request identity
- **THEN** WYSIWYG enters degraded state instead of silently displaying source
