## ADDED Requirements

### Requirement: Core Source Mode semantic shortcuts
Keyboard shortcuts in Core-backed Source Mode SHALL dispatch semantic Core commands through FormatCommandLayer for bold, italic, strikethrough, link, undo, and redo. Handled shortcuts MUST prevent browser defaults.

#### Scenario: bold shortcut dispatches Core command
- **WHEN** the user presses Ctrl/Cmd+B in Core-backed Source Mode
- **THEN** the shortcut invokes FormatCommandLayer with the `ToggleStrong` semantic command
- **THEN** it does not call the legacy Tiptap command path

#### Scenario: link shortcut uses safe dialog then Core command
- **WHEN** the user presses Ctrl/Cmd+K in Core-backed Source Mode and submits a supported URL
- **THEN** the shortcut validates the link through the shared link dialog behavior
- **THEN** it invokes FormatCommandLayer with `InsertLink`

#### Scenario: undo redo shortcuts use Core history
- **WHEN** the user presses Ctrl/Cmd+Z or platform redo equivalent in Core-backed Source Mode
- **THEN** the shortcut invokes FormatCommandLayer undo or redo
- **THEN** it does not rely on browser or legacy editor history
