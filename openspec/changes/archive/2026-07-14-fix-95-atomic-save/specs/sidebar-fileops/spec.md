## MODIFIED Requirements

### Requirement: Save active document
The system SHALL save the currently active document to disk atomically, handling both existing files and new files without a path. Save operations SHALL be serialized — at most one save SHALL be in progress at any time.

#### Scenario: Save existing file
- **WHEN** `saveActiveDocument()` is called
- **AND** the active file has a known path
- **THEN** the content SHALL be written to disk atomically at that path
- **THEN** the document SHALL be marked as persisted only if no newer edits occurred during the write
- **THEN** a success toast SHALL be shown

#### Scenario: Save new file prompts for path
- **WHEN** `saveActiveDocument()` is called
- **AND** the active file has no path
- **AND** `interactive` is true
- **THEN** a save dialog SHALL be shown to choose a file path
- **THEN** the content SHALL be written atomically to the selected path
- **THEN** the active file path SHALL be updated

#### Scenario: Save file with external modification warning
- **WHEN** `saveActiveDocument()` is called
- **AND** the file has an external modification (detected via mtime + size check)
- **AND** `interactive` is is true
- **THEN** a confirm dialog SHALL ask whether to overwrite
- **WHEN** user cancels
- **THEN** save SHALL be aborted

#### Scenario: Concurrent save is skipped
- **WHEN** `saveActiveDocument()` is called
- **AND** a previous save is already in progress
- **THEN** the new save request SHALL be skipped (not queued)
- **THEN** the document SHALL remain dirty so the next auto-save tick or manual save will persist it

#### Scenario: Save failure preserves dirty state
- **WHEN** `saveActiveDocument()` is called
- **AND** the atomic write fails
- **THEN** the document SHALL remain in dirty state
- **THEN** an error toast SHALL be shown (interactive mode) or a log entry SHALL be written (non-interactive mode)
- **THEN** the original file on disk SHALL remain unchanged

#### Scenario: Save with revision tracking
- **WHEN** `saveActiveDocument()` is called
- **AND** content was edited after the save was initiated but before it completed
- **THEN** the document SHALL remain dirty after the save completes
- **THEN** only the content that was actually persisted SHALL be marked as the last persisted version

## ADDED Requirements

### Requirement: External modification detection via mtime
The system SHALL detect external file modifications by comparing the file's `mtime` and `size` against the values recorded when the file was last read or saved.

#### Scenario: External modification detected before save
- **WHEN** `saveActiveDocument()` is called
- **AND** the file's current mtime or size differs from the last recorded values
- **THEN** the file SHALL be treated as externally modified

#### Scenario: Successful save updates mtime snapshot
- **WHEN** `saveActiveDocument()` completes successfully
- **THEN** the file's mtime and size SHALL be recorded as the new baseline for future comparisons

### Requirement: Serial auto-save scheduling
The auto-save mechanism SHALL be serialized to prevent overlapping writes.

#### Scenario: Auto-save skips when save in progress
- **WHEN** the auto-save timer fires
- **AND** a save is already in progress
- **THEN** the auto-save tick SHALL be skipped
- **THEN** the document SHALL remain dirty for the next tick

#### Scenario: Auto-save does not queue multiple writes
- **WHEN** the user edits content during an auto-save
- **THEN** at most one additional save SHALL be triggered after the current save completes
