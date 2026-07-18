## Purpose

Ensure users are never misled about whether automatic saves succeeded: failures stay visible and the document keeps its dirty state, while transient single failures don't spam the UI.

## ADDED Requirements

### Requirement: Persistent visibility on autosave failure
When automatic save fails, the system SHALL show a persistent, non-transient status (not a brief toast) and SHALL retain the document's dirty state.

#### Scenario: Consecutive autosave failures
- **WHEN** automatic save fails two or more times in a row (non-interactive mode)
- **THEN** a persistent status indicator is shown and the document remains marked dirty

#### Scenario: Autosave recovers
- **WHEN** a subsequent automatic save succeeds after previous failures
- **THEN** the persistent failure indicator is cleared

### Requirement: Dirty state preserved on save failure
The document SHALL remain marked dirty after any save failure so the user is never misled into believing content is persisted.

#### Scenario: Save failure keeps dirty
- **WHEN** an autosave or interactive save fails
- **THEN** the dirty flag is not cleared and the editor continues to prompt on close

#### Scenario: Single intermittent failure does not spam
- **WHEN** a single automatic save fails but the next succeeds
- **THEN** only a transient toast is shown and no persistent indicator appears
