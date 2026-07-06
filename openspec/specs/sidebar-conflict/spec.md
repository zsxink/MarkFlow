# sidebar-conflict Specification

## Purpose
TBD - created by archiving change refactor-sidebar-split. Update Purpose after archive.
## Requirements
### Requirement: Handle external file deletion
The system SHALL detect and handle cases where the active document's file has been deleted externally.

#### Scenario: Clean document deleted externally
- **WHEN** `handleExternalDeletion(path)` is called
- **AND** the active document is not dirty and has no external modification
- **THEN** the active document SHALL be cleared
- **THEN** the function SHALL return `'cleared'`

#### Scenario: Dirty document deleted externally — discard
- **WHEN** `handleExternalDeletion(path)` is called
- **AND** the active document is dirty or has external modification
- **AND** user chooses "discard"
- **THEN** the active document SHALL be cleared
- **THEN** the function SHALL return `'discarded'`

#### Scenario: Dirty document deleted externally — resave
- **WHEN** `handleExternalDeletion(path)` is called
- **AND** the active document is dirty or has external modification
- **AND** user chooses "resave"
- **THEN** the content SHALL be written back to disk
- **THEN** the function SHALL return `'resaved'`

#### Scenario: Unrelated deletion ignored
- **WHEN** `handleExternalDeletion(path)` is called
- **AND** the path does not match the active document
- **THEN** the function SHALL return `'ignored'`

### Requirement: Handle external file modification
The system SHALL detect and handle cases where the active document's file has been modified externally.

#### Scenario: Clean document modified externally — auto-reload
- **WHEN** `handleActiveDocumentExternalModification()` is called
- **AND** the active document is not dirty
- **THEN** the file SHALL be reloaded from disk automatically
- **THEN** the function SHALL return `'reloaded'`

#### Scenario: Dirty document modified externally — conflict dialog
- **WHEN** `handleActiveDocumentExternalModification()` is called
- **AND** the active document is dirty
- **THEN** a conflict dialog SHALL be shown with options: "keep current", "load disk version", "save as"

#### Scenario: Conflict dialog — load disk version
- **WHEN** user selects "load disk version"
- **THEN** the file SHALL be reloaded from disk, discarding in-memory changes

#### Scenario: Conflict dialog — save as new file
- **WHEN** user selects "save as"
- **THEN** a save dialog SHALL be shown to choose a new file path
- **THEN** the current content SHALL be written to the new path

#### Scenario: Conflict dialog — keep current
- **WHEN** user selects "keep current"
- **THEN** the in-memory content SHALL be retained as-is
- **THEN** the function SHALL return `'kept'`

