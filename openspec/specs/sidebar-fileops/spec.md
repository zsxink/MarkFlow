# sidebar-fileops Specification

## Purpose
TBD - created by archiving change refactor-sidebar-split. Update Purpose after archive.
## Requirements
### Requirement: Save active document
The system SHALL save the currently active document to disk, handling both existing files and new files without a path.

#### Scenario: Save existing file
- **WHEN** `saveActiveDocument()` is called
- **AND** the active file has a known path
- **THEN** the content SHALL be written to disk at that path
- **THEN** the document SHALL be marked as persisted
- **THEN** a success toast SHALL be shown

#### Scenario: Save new file prompts for path
- **WHEN** `saveActiveDocument()` is called
- **AND** the active file has no path
- **AND** `interactive` is true
- **THEN** a save dialog SHALL be shown to choose a file path
- **THEN** the content SHALL be written to the selected path
- **THEN** the active file path SHALL be updated

#### Scenario: Save file with external modification warning
- **WHEN** `saveActiveDocument()` is called
- **AND** the file has an external modification
- **AND** `interactive` is true
- **THEN** a confirm dialog SHALL ask whether to overwrite
- **WHEN** user cancels
- **THEN** save SHALL be aborted

### Requirement: Reload active document from disk
The system SHALL reload the active document content from disk, discarding in-memory changes.

#### Scenario: Reload force discards changes
- **WHEN** `reloadActiveDocumentFromDisk({ force: true })` is called
- **THEN** the file SHALL be re-read from disk
- **THEN** the editor content SHALL be replaced with the disk content

#### Scenario: Reload aborted when document is dirty
- **WHEN** `reloadActiveDocumentFromDisk()` is called without `force`
- **AND** the document is dirty
- **THEN** the reload SHALL be aborted and return false

### Requirement: Open file in editor
The system SHALL open a file in the editor, handling special cases when the file is already open.

#### Scenario: Open new file
- **WHEN** `openFileInEditor(path)` is called
- **AND** the file is not already open
- **THEN** the file content SHALL be read from disk
- **THEN** the editor SHALL display the content
- **THEN** the active file path SHALL be updated

#### Scenario: Re-open active file with external modification
- **WHEN** `openFileInEditor(path)` is called
- **AND** the file is already active
- **AND** it has external modification but no dirty edits
- **THEN** the file SHALL be reloaded from disk

#### Scenario: Re-open active file with conflict
- **WHEN** `openFileInEditor(path)` is called
- **AND** the file is already active
- **AND** it has both external modification and dirty edits
- **THEN** the conflict dialog SHALL be shown

