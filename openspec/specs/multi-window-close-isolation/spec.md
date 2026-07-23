# multi-window-close-isolation Specification

## Purpose
确保多窗口关闭请求事件精确投递到发起窗口，关闭权限按窗口隔离且一次性消费，防止窗口间关闭串扰。

## Requirements

### Requirement: Close request event targets only the originating window

The system SHALL deliver `close-requested` events exclusively to the window that triggered the native close action. The event payload SHALL include the originating window's label. No other window SHALL receive a `close-requested` event from a close action on a different window.

#### Scenario: Closing window B does not affect window A

- **WHEN** two windows A and B are open, and the user clicks the close button on window B
- **THEN** only window B receives a `close-requested` event, and window A remains open and unaffected

#### Scenario: Event payload contains window label

- **WHEN** the backend emits a `close-requested` event for a window with label `"main-2"`
- **THEN** the event payload includes `{ windowLabel: "main-2" }`

#### Scenario: Frontend validates event target

- **WHEN** a frontend window receives a `close-requested` event
- **THEN** the frontend checks the event payload's `windowLabel` against its own window label and ignores the event if they do not match

### Requirement: Close permission is per-window and one-time consumable

The system SHALL maintain close permissions keyed by window label. Each permission entry SHALL be a one-time-use token: once consumed by a successful close attempt, the entry SHALL be removed. Permissions for one window SHALL NOT affect any other window's close behavior.

#### Scenario: Confirming close on window B grants permission only to B

- **WHEN** window B calls `confirm_window_close` and receives a permission grant
- **THEN** only window B's label is added to the permission set, and window A has no permission entry

#### Scenario: Permission is consumed on use

- **WHEN** window B has a granted close permission and the `CloseRequested` event fires for B
- **THEN** the permission is consumed (removed) and the close is allowed to proceed; a subsequent close attempt on B will require a new confirmation

#### Scenario: Consumed permission does not leak to other windows

- **WHEN** window B's close permission is consumed, and window A subsequently triggers a close
- **THEN** window A does NOT inherit B's consumed permission and must go through its own confirmation flow

#### Scenario: Failed or destroyed window cleans up permission

- **WHEN** a window is destroyed or its close fails after permission was granted, and a permission entry still exists for that window's label
- **THEN** the permission entry for that label is removed from the set

### Requirement: Window label logging throughout close flow

The system SHALL log the window label at each step of the close flow: event interception, event emission, permission grant, permission consumption, and actual window close. Log messages SHALL include the label to enable debugging multi-window close sequences.

#### Scenario: Debug logs include window label

- **WHEN** a close flow executes (intercept → emit → confirm → close)
- **THEN** each log entry in the flow includes the window's label string

### Requirement: Unsaved changes confirmation is window-scoped

When a window has unsaved changes and receives a close request, the unsaved confirmation dialog SHALL appear only in that window. Canceling the dialog SHALL keep all windows open. Confirming SHALL only close the requesting window.

#### Scenario: Dirty window B shows confirmation, dirty window A is unaffected

- **WHEN** both windows A and B have unsaved changes, and the user clicks close on B
- **THEN** window B shows the unsaved changes confirmation dialog, and window A remains open and does not show any dialog

#### Scenario: Canceling close on dirty window keeps both open

- **WHEN** window B has unsaved changes and the user cancels the close confirmation
- **THEN** both window A and window B remain open

#### Scenario: Confirming close on dirty window only closes that window

- **WHEN** both windows A and B have unsaved changes, the user confirms close on B
- **THEN** only window B closes, and window A remains open with its unsaved changes intact
