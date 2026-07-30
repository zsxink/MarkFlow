## ADDED Requirements

### Requirement: FormatCommandLayer flushes and applies command patches
FormatCommandLayer SHALL be the Source Mode semantic command seam. Before command, undo, or redo execution it SHALL flush SourceSyncController pending patches. After success it SHALL apply the returned UTF-16 patch to CodeMirror under a programmatic update guard, update confirmed revision, apply selection_after, and verify the session did not switch before mutating editor state.

#### Scenario: pending source edits flush before command
- **WHEN** a toolbar or keyboard semantic action is invoked in Core-backed Source Mode
- **THEN** FormatCommandLayer flushes pending SourceSyncController patches before reading the command base revision
- **THEN** the semantic command is sent using the flushed confirmed revision

#### Scenario: command patch updates editor without normal resync
- **WHEN** `execute_edit_command` returns a successful patch-first result
- **THEN** FormatCommandLayer applies that patch to CodeMirror
- **THEN** the programmatic update does not enqueue a user patch back into SourceSyncController
- **THEN** FormatCommandLayer does not call whole-document resync on the normal path

#### Scenario: stale session result is discarded
- **WHEN** a semantic command result returns after the active Core session changed
- **THEN** FormatCommandLayer discards the result without applying patch or selection to the current editor

### Requirement: Source Mode undo redo use Core history
Core-backed Source Mode undo and redo SHALL flush pending source patches first, call Core undo/redo IPC, and apply the returned patch/selection/revision through FormatCommandLayer.

#### Scenario: undo uses Core history owner
- **WHEN** the user invokes undo in Core-backed Source Mode
- **THEN** pending source patches are flushed
- **THEN** the frontend calls `undo_document`
- **THEN** the returned patch is applied to CodeMirror and confirmed revision is updated
