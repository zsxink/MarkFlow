# Editor Bottom Spacer

## Purpose

Provide a visual empty space at the bottom of the editor (both WYSIWYG and source modes) so users can scroll past the document end and see context beyond the final line.

## Requirements

### Requirement: WYSIWYG editor bottom visual spacer

The WYSIWYG editor SHALL include approximately 300px of visual empty space below the last content line, so users can scroll past the document end and see context beyond the final line.

#### Scenario: Scroll past document end displays visual spacer
- **WHEN** the user scrolls to the very bottom of a WYSIWYG document
- **THEN** approximately 300px of empty space SHALL be visible below the last line of content

#### Scenario: Spacer does not interfere with editing
- **WHEN** the user edits content in WYSIWYG mode
- **THEN** the visual spacer SHALL NOT affect cursor positioning, content insertion, or selection behavior at the end of the document

### Requirement: Source editor bottom visual spacer

The source editor textarea SHALL include approximately 300px of visual empty space below the last source line, matching the WYSIWYG bottom spacer.

#### Scenario: Source editor bottom spacer
- **WHEN** the user scrolls to the bottom of the source editor textarea
- **THEN** approximately 300px of empty space SHALL be visible below the last source line

### Requirement: Consistent spacer height across modes

The visual spacer SHALL be the same height in both WYSIWYG and source modes.

#### Scenario: Mode switch without visual jump
- **WHEN** the user switches between WYSIWYG and source mode
- **THEN** the bottom visual space SHALL remain consistent, with no sudden visual jump
