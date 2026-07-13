## ADDED Requirements

### Requirement: DOM construction with user-controlled content SHALL use safe DOM APIs

The system SHALL NOT use `innerHTML` (or `insertAdjacentHTML`, `outerHTML`) to insert user-controlled strings — including file names, file paths, folder paths, document content, or any data deserialized from external sources — into the document. Code SHALL use `document.createElement` + `textContent` / `dataset` / `setAttribute` instead.

#### Scenario: File name with HTML special characters is displayed as plain text
- **WHEN** a recent file entry has a name containing `<`, `>`, `"`, `'`, or `&`
- **THEN** the name SHALL appear as literal text in the menu, with no HTML parsing occurring

#### Scenario: File name with script-like content opens the file correctly
- **WHEN** a recent file entry has a name like `<img src=x onerror=alert(1)>`
- **THEN** clicking the entry SHALL open the actual file path, not execute the injected content

#### Scenario: File path with injected attributes is treated as path data
- **WHEN** a recent file entry's path string contains characters like `"` or `>`
- **THEN** the path SHALL be stored in `dataset.path` as-is, with no HTML attribute injection

### Requirement: Menu events SHALL use event delegation

The recent files and recent folders menus SHALL use event delegation (a single `click` listener on the container) instead of per-item `addEventListener` calls, matching the `dataset.path` and `dataset.type` attributes on the target element.

#### Scenario: Clicking a recent file menu item opens the file
- **WHEN** user clicks a `.app-menu-item` button in the recent files container
- **THEN** the file at `dataset.path` SHALL be opened in the editor

#### Scenario: Clicking a recent folder menu item opens the folder
- **WHEN** user clicks a `.app-menu-item` button in the recent folders container
- **THEN** the folder at `dataset.path` SHALL be set as workspace

### Requirement: Empty state messages SHALL use safe DOM APIs

The "无" empty state message SHALL be constructed using `document.createTextNode` or `textContent`, not `innerHTML`.

#### Scenario: No recent files shows empty state text
- **WHEN** `recentFiles` array is empty
- **THEN** the container SHALL display the empty state text as plain text

### Requirement: Section titles are static and safe for innerHTML

Menu section title strings (e.g., "最近打开的文件") are compile-time constants with no user data — they SHALL remain as `innerHTML` or be migrated to safe DOM at implementor's discretion.

#### Scenario: Static section title renders correctly
- **WHEN** the menu renders
- **THEN** section titles SHALL display normally
