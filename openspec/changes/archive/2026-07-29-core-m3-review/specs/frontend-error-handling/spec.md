## ADDED Requirements

### Requirement: Structured error reporting in TypeScript frontend

`contextMenu.ts:178,185` SHALL replace `showToast(打开失败: ${e})` with `reportUserActionError` + structured message.
`newFileDialog.ts:67,84,121` SHALL call `logException` before showing user-facing messages.
`codemirror-languages.ts:39` SHALL log via `logDebug` instead of silent `.catch(() => null)`.

#### Scenario: no raw error objects in toast

- **WHEN** a context menu action fails
- **THEN** the error message SHALL be a structured user-facing message, not a raw caught exception

#### Scenario: errors logged before showing

- **WHEN** a new file dialog operation fails
- **THEN** the error SHALL first be logged via `logException`, then shown to the user

#### Scenario: catch errors not silent

- **WHEN** a code mirror language load fails
- **THEN** the error SHALL be recorded via `logDebug`, not silently discarded
