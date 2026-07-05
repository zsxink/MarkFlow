## ADDED Requirements

### Requirement: WYSIWYG Enter produces valid Markdown

The system SHALL ensure that pressing Enter in WYSIWYG mode always produces a ProseMirror document state that serializes to complete, valid Markdown without content loss.

#### Scenario: Paragraph split preserves surrounding content
- **WHEN** user presses Enter in the middle of a paragraph in WYSIWYG mode
- **THEN** all content before and after the split point SHALL be preserved in the Markdown serialization
- **THEN** the serialized Markdown SHALL contain the exact same number of non-whitespace characters as the original document (excluding the added newline)

#### Scenario: List item split preserves list continuation
- **WHEN** user presses Enter in the middle of a list item in WYSIWYG mode
- **THEN** the remaining list items after the split point SHALL be preserved when serialized to Markdown
- **THEN** the total count of list items in serialized Markdown SHALL equal the pre-Enter count + 1 (the new item)

#### Scenario: Blockquote Enter preserves quoted content
- **WHEN** user presses Enter inside a blockquote in WYSIWYG mode
- **THEN** all quoted content SHALL be serialized to Markdown without loss
- **THEN** the blockquote structure SHALL remain valid after round-trip (Markdown → ProseMirror → Markdown)

#### Scenario: Nested structure Enter preserves hierarchy
- **WHEN** user presses Enter inside a complex nested structure (e.g., list inside blockquote) in WYSIWYG mode
- **THEN** the full hierarchy SHALL be preserved in Markdown serialization
- **THEN** switching to source mode and back SHALL produce an identical-looking document (visual fidelity preserved)

#### Scenario: Code block near Enter point unaffected
- **WHEN** user presses Enter near a fenced code block in WYSIWYG mode
- **THEN** the code block content SHALL remain complete and unchanged in the serialized Markdown

### Requirement: Source switch integrity check

The system SHALL perform a content integrity check when switching from WYSIWYG to source mode to detect serialization truncation.

#### Scenario: Truncation detected on switch
- **WHEN** `getMarkdown()` output contains significantly fewer lines or characters than expected (based on ProseMirror doc node count)
- **THEN** the system SHALL log a warning via `logException`
- **THEN** the system SHALL display a warning toast to the user
- **THEN** the truncated content SHALL NOT overwrite the source textarea without user confirmation

#### Scenario: Normal switch proceeds without warning
- **WHEN** `getMarkdown()` output is complete and valid
- **THEN** the system SHALL update the source textarea as normal
- **THEN** no warning SHALL be shown

### Requirement: Round-trip fidelity

The system SHALL maintain content fidelity through WYSIWYG↔source mode switches.

#### Scenario: Multiple mode switches preserve content
- **WHEN** user switches from WYSIWYG to source mode and back repeatedly
- **THEN** each mode switch SHALL produce consistent content
- **THEN** after N round-trips, the Markdown content SHALL be identical to the original (modulo normalization of whitespace and image URLs)

#### Scenario: Edit then switch preserves edits
- **WHEN** user makes edits in WYSIWYG mode then switches to source
- **THEN** all WYSIWYG edits SHALL be reflected in the source textarea content
- **WHEN** user makes edits in source mode then switches to WYSIWYG
- **THEN** all source edits SHALL be reflected in the WYSIWYG editor content
