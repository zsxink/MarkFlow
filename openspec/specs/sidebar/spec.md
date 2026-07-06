# sidebar Specification

## Purpose
TBD - created by archiving change refactor-sidebar-split. Update Purpose after archive.
## Requirements
### Requirement: Sidebar UI initialization
The system SHALL initialize the sidebar UI by mounting event listeners for file tree and outline interactions, tab switching, and sidebar resize.

#### Scenario: Init sidebar mounts event listeners
- **WHEN** `initSidebar()` is called
- **THEN** the file tree and outline components SHALL be initialized
- **THEN** the sidebar SHALL listen for right-click context menu events
- **THEN** the "open folder" button SHALL trigger folder selection dialog
- **THEN** the "new folder" button SHALL trigger inline folder creation
- **THEN** tab clicking SHALL switch between files and outline views

#### Scenario: Resize handle allows width adjustment
- **WHEN** user drags the sidebar resize handle
- **THEN** sidebar width SHALL change between 200px and 400px
- **WHEN** sidebar is collapsed
- **THEN** dragging the resize handle SHALL be ignored

### Requirement: Document transition confirmation
The system SHALL show a confirmation modal when the user attempts to switch to another file while the current document has unsaved changes or external conflicts.

#### Scenario: Confirm before switching with unsaved changes
- **WHEN** user tries to switch files
- **AND** current document is dirty
- **THEN** a modal SHALL appear with "Save", "Discard", and "Cancel" options
- **WHEN** user clicks "Save"
- **THEN** the document SHALL be saved before proceeding

#### Scenario: Confirm with external conflict
- **WHEN** user tries to switch files
- **AND** current document has external modifications
- **THEN** the modal title SHALL be "外部修改冲突"
- **THEN** the modal SHALL show save/discard/cancel options

#### Scenario: Skip confirmation when clean
- **WHEN** user tries to switch files
- **AND** current document is not dirty and has no external modification
- **THEN** the transition SHALL proceed without showing a modal

### Requirement: Active file path state management
The system SHALL manage the active file path state and synchronize it with the file tree UI.

#### Scenario: Set active file path updates tree selection
- **WHEN** `setActiveFilePath(path)` is called
- **THEN** the file tree SHALL highlight the matching file node
- **THEN** `getActiveFilePath()` SHALL return the new path

#### Scenario: Clear active document resets state
- **WHEN** `clearActiveDocument()` is called
- **THEN** the active file path SHALL be set to null
- **THEN** the editor content SHALL be cleared
- **THEN** the outline SHALL be refreshed
- **THEN** the tree selection SHALL be cleared

#### Scenario: Rewrite active document path
- **WHEN** a directory is renamed
- **AND** `rewriteActiveDocumentPath(from, to)` is called
- **THEN** the active file path SHALL be updated to reflect the new path prefix

#### Scenario: Clear active document if path matches
- **WHEN** a file or directory is deleted
- **AND** it matches the active document path
- **THEN** `clearActiveDocumentIfMatches(path)` SHALL clear the active document

