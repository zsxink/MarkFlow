# atomic-save Specification

## Purpose
Define the atomic write infrastructure that prevents file corruption on crash or power loss, used by document save and settings persistence.

## Requirements

### Requirement: Atomic file write
The system SHALL provide an `atomic_write` function that writes content to a file atomically, ensuring the target file is never left in a truncated or corrupted state.

#### Scenario: Successful atomic write
- **WHEN** `atomic_write(path, content)` is called
- **THEN** a temporary file SHALL be created in the same directory as the target
- **THEN** the content SHALL be written to the temporary file
- **THEN** the temporary file SHALL be synced to disk
- **THEN** the temporary file SHALL be atomically renamed to the target path
- **THEN** the old target file content SHALL be fully replaced

#### Scenario: Write failure preserves old file
- **WHEN** `atomic_write(path, content)` is called
- **AND** the write to the temporary file fails (e.g., disk full, permission error)
- **THEN** the temporary file SHALL be deleted
- **THEN** the original file at `path` SHALL remain unchanged and uncorrupted

#### Scenario: Rename failure cleans up
- **WHEN** `atomic_write(path, content)` is called
- **AND** the write succeeds but the rename to target fails
- **THEN** the temporary file SHALL be deleted
- **THEN** the original file at `path` SHALL remain unchanged

#### Scenario: Parent directory auto-created
- **WHEN** `atomic_write(path, content)` is called
- **AND** the parent directory of `path` does not exist
- **THEN** the parent directory SHALL be created before writing

### Requirement: Cleanup of leftover temporary files
The system SHALL clean up leftover temporary files from previous failed writes on startup.

#### Scenario: Leftover temp files are removed
- **WHEN** the application starts
- **AND** temporary files matching the pattern `*.pid.tmp` or `*.tmp` exist in a watched directory
- **THEN** stale temporary files (older than a threshold or from dead processes) SHALL be deleted

#### Scenario: Active temp files are not removed
- **WHEN** the application starts
- **AND** a temporary file belongs to a still-running process
- **THEN** the temporary file SHALL NOT be deleted

### Requirement: Document save uses atomic write
The `write_file` Tauri command SHALL use `atomic_write` to save document content.

#### Scenario: Document save is atomic
- **WHEN** the `write_file` command is invoked to save a markdown file
- **THEN** the write SHALL use `atomic_write` under the hood
- **THEN** if the write fails, the original file SHALL remain intact

### Requirement: Settings save uses atomic write
The `save_settings_inner` function SHALL use `atomic_write` to persist settings.

#### Scenario: Settings save is atomic
- **WHEN** `save_settings_inner(settings)` is called
- **THEN** the write SHALL use `atomic_write` to write `settings.json`
- **THEN** if the write fails, the original `settings.json` SHALL remain intact
