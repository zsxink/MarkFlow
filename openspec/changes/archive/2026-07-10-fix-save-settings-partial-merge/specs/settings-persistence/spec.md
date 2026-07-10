## ADDED Requirements

### Requirement: Partial settings merge before persistence

`saveSettings` SHALL merge partial settings with cached/default values before sending to the Rust backend.

- **WHEN** `saveSettings({ lastSidebarTab: "files" })` is called
- **THEN** the sent payload SHALL be a complete `Settings` object with `lastSidebarTab` set to `"files"` and all other fields populated from cache or defaults

### Requirement: Error reporting for persistence failures

Callers of `saveSettings` SHALL NOT silently swallow errors.

#### Scenario: saveSettings failure is logged

- **WHEN** `saveSettings` fails due to a backend error
- **THEN** the error SHALL be recorded via `logException`

### Requirement: Cache integrity after partial save

`settingsCache` SHALL NOT be overwritten with a partial `Settings` object.

#### Scenario: Cache retains full Settings after partial save

- **WHEN** `saveSettings(partial)` completes (whether success or failure)
- **THEN** `settingsCache` SHALL remain a complete `Settings` object
