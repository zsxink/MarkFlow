## ADDED Requirements

### Requirement: Image transactions integrate with WYSIWYG widgets
Image widget insert, replace, edit, paste, drag, delete, and save operations SHALL use the existing resource transaction plan and Core patch authority. Widget state MUST NOT become a second document truth.

#### Scenario: Replace image from widget
- **WHEN** a user selects a replacement image
- **THEN** Host prepares the resource under capability checks
- **THEN** Core commits the Markdown reference only after resource preparation succeeds
- **THEN** failure leaves the original Markdown and resource recoverable

### Requirement: Image preview uses safe resolved identity
Relative and local image references SHALL resolve through the active document identity and Host asset capability. Remote images SHALL follow configured network and storage policy.

#### Scenario: Relative image preview
- **WHEN** the active Markdown references a relative local image
- **THEN** the widget receives a safe resolved asset URL bound to the active document
- **THEN** path traversal or unauthorized symlink targets are rejected

### Requirement: Image widget is fully operable
The WYSIWYG image widget SHALL support keyboard selection, accessible error state, alt/title/path editing, replace, copy, delete, open location, retry, and source reveal.

#### Scenario: Broken image remains editable
- **WHEN** preview resolution fails
- **THEN** the widget exposes error details and recovery actions
- **THEN** the exact Markdown syntax remains recoverable in Source Mode
