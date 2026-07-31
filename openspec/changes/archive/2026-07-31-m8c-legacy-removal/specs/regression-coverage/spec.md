## ADDED Requirements

### Requirement: M8C removal audit prevents legacy truth paths
The project SHALL provide an automated M8C removal audit that fails when product main paths contain ProseMirror serializer save, `getMarkdown()` save path, WYSIWYG whole-document serializer sync, DOM-based export main path, `tiptap-markdown` product dependency usage, or non-empty legacy allowlist entries.

#### Scenario: Audit fails on legacy save path
- **WHEN** product source contains a call that saves Markdown through ProseMirror serializer or `getMarkdown()`
- **THEN** the M8C removal audit SHALL fail
- **AND** the failure SHALL identify the matched path or symbol

#### Scenario: Audit permits historical records
- **WHEN** archived OpenSpec records, migration notes, or test fixtures mention legacy serializer terms
- **THEN** the M8C removal audit SHALL allow those paths only if they are explicitly excluded as non-product evidence

### Requirement: M8C evidence records release and session isolation
M8C implementation SHALL update `docs/markflow-core-stages/m8c-legacy-removal-evidence.md` with feature matrix status, observation-period findings, automated test commands, independent agent review, cross-platform smoke status, session isolation checks, fallback markers, and removal audit result.

#### Scenario: Evidence distinguishes unverified platforms
- **WHEN** a release smoke platform was not executed
- **THEN** the evidence SHALL mark that platform as `未验证`
- **AND** MUST NOT describe it as passed

#### Scenario: Session isolation evidence is recorded
- **WHEN** M8C removal is ready for archive or merge
- **THEN** evidence SHALL cover A/B document switching, same-path multi-session, export during edit, window close, and cancellation
- **AND** missing checks SHALL block removal unless documented as a follow-up issue before observation completes
