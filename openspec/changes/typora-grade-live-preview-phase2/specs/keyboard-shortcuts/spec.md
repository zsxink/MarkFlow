## ADDED Requirements

### Requirement: Shortcut routing follows active Core surface
Formatting, link, list, code, image, save, Undo, Redo, mode, and navigation shortcuts SHALL route according to the active Core editor surface and selection, not according to `mode === source` or the existence of a ProseMirror instance.

#### Scenario: Core WYSIWYG shortcut
- **WHEN** Core WYSIWYG is active and the user presses a supported shortcut
- **THEN** the corresponding Core command executes on the visible CodeMirror selection
- **THEN** no hidden editor command executes

#### Scenario: Widget consumes a shortcut
- **WHEN** focus is inside a structured widget and the shortcut has widget semantics
- **THEN** the widget command is dispatched through Core
- **THEN** global routing does not execute a duplicate command

### Requirement: Native editing keys respect projection boundaries
Backspace, Delete, Enter, Tab, arrows, Home, End, and Escape SHALL honor marker folds, atomic ranges, composition, and widget focus.

#### Scenario: Backspace at folded marker
- **WHEN** Backspace is pressed adjacent to a folded marker
- **THEN** the marker is revealed or a semantic delete command runs
- **THEN** hidden source outside the intended unit is not deleted
