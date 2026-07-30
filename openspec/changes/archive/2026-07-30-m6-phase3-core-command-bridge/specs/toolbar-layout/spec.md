## ADDED Requirements

### Requirement: Core Source Mode toolbar formatting dispatch
Toolbar formatting controls in Core-backed Source Mode SHALL dispatch semantic Core commands through FormatCommandLayer for bold, italic, strikethrough, inline code, headings, quote, lists, code fence, and link. Outside Core-backed Source Mode these controls SHALL preserve the existing WYSIWYG or legacy source fallback behavior.

#### Scenario: toolbar bold dispatches Core command
- **WHEN** the user clicks the Bold toolbar button in Core-backed Source Mode
- **THEN** the button invokes FormatCommandLayer with the `ToggleStrong` semantic command
- **THEN** it does not call the legacy Tiptap command path

#### Scenario: toolbar code fence dispatches Core command
- **WHEN** the user clicks the Code Fence toolbar button in Core-backed Source Mode
- **THEN** the button invokes FormatCommandLayer with `InsertCodeFence`
- **THEN** CodeMirror is updated from the returned Core patch

#### Scenario: toolbar fallback remains available
- **WHEN** the user clicks a formatting toolbar button outside Core-backed Source Mode
- **THEN** the existing WYSIWYG or legacy source fallback behavior remains available
