## ADDED Requirements

### Requirement: Document size tier classification
The system SHALL classify documents into size tiers based on file size and line count before opening.

- Normal: file size < 1MB AND line count < 5000
- Large: file size 1MB–10MB OR line count 5000–50000
- Huge: file size > 10MB OR line count > 50000

#### Scenario: Normal document opens without degradation
- **WHEN** user opens a file with size 500KB and 2000 lines
- **THEN** the editor opens in full WYSIWYG mode without any degradation notice
- **THEN** all editor features are available without restrictions

#### Scenario: Large document shows suggestion
- **WHEN** user opens a file with size 5MB and 10000 lines
- **THEN** the editor opens with a non-blocking notification suggesting source mode
- **THEN** user can dismiss the notification and continue editing in WYSIWYG
- **THEN** automatic serialization integrity checks are disabled

#### Scenario: Huge document requires confirmation
- **WHEN** user opens a file with size 50MB and 200000 lines
- **THEN** a confirmation dialog is shown with file size, line count, and two options: read-only preview and force open
- **THEN** if user selects read-only preview, the content is displayed as plain text without editing capability
- **THEN** if user selects force open, the editor attempts to open with all degradation measures active
- **THEN** a persistent warning bar remains visible showing the degradation state

#### Scenario: Manual override for degradation
- **WHEN** a document is in degraded mode (Large or Huge)
- **THEN** the user can click an override button in the status bar to switch modes
- **THEN** override options include: force WYSIWYG, force source mode, and reset to auto-detect

### Requirement: Metadata pre-read before file open
The system SHALL read file metadata (size, line count) before loading the full file content into the editor.

#### Scenario: Metadata read succeeds
- **WHEN** user triggers file open
- **THEN** the system calls `file_metadata` command to get file size and line count
- **THEN** the system determines the size tier from metadata
- **THEN** the system proceeds to load content based on the tier decision

#### Scenario: Metadata read fails
- **WHEN** the `file_metadata` command returns an error
- **THEN** the system SHALL treat the file as Normal tier
- **THEN** the system SHALL log the error
- **THEN** the system SHALL show a non-blocking notification about the metadata error

### Requirement: Configurable thresholds
The thresholds for size tier classification SHALL be configurable in settings.

#### Scenario: User changes thresholds
- **WHEN** user modifies `largeFileThreshold` and `hugeFileThreshold` in settings
- **THEN** the new thresholds apply to the next file open operation
- **THEN** previously opened files are not affected

### Requirement: Degradation UI
The system SHALL provide clear UI indicators for degraded mode.

#### Scenario: Degraded mode indicator visible
- **WHEN** a document is open in Large or Huge tier
- **THEN** a persistent bar at the top of the editor area shows the current tier and reason
- **THEN** the bar includes a button to manually override the tier
- **THEN** the status bar shows an icon indicating degraded mode

#### Scenario: Degradation bar is dismissable for Large tier
- **WHEN** document is in Large tier
- **THEN** the degradation bar can be dismissed by the user
- **THEN** after dismissal, an icon remains in the status bar for reopening the bar
