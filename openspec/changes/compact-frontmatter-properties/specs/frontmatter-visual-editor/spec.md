# Spec Delta

## ADDED Requirements

### Requirement: Properties use a compact inline presentation
The system SHALL present supported Frontmatter as compact property rows with editable names and values. Routine display SHALL omit per-row type selectors, delete buttons, and up/down buttons. Adding a property SHALL reveal its form on demand. Collapse state SHALL survive ordinary property refreshes.

#### Scenario: Supported properties are displayed
- **WHEN** a document with supported Frontmatter is opened
- **THEN** the editor displays a lightweight properties heading, type affordances, names, values, and an add-property action
- **THEN** fields remain usable at the application's minimum window width without forcing horizontal overflow

#### Scenario: User collapses properties
- **WHEN** the user collapses the property region and the document body is edited
- **THEN** the region remains collapsed and can be expanded even in a read-only document

### Requirement: Property names values and list items are directly editable
The system SHALL allow inline editing of property names, scalar values, and individual simple-array items. Enter or leaving a valid edit SHALL commit it and Escape SHALL cancel it. Invalid edits SHALL be reported without changing YAML. Editing one item SHALL preserve all other items and intended YAML types, including an empty array.

#### Scenario: User edits a property or tag
- **WHEN** the user changes a property name, scalar value, or an individual list item and commits
- **THEN** only that property is patched in the source and unrelated properties and body bytes remain unchanged
- **THEN** focus remains usable for continuing edits or moving to the next control

#### Scenario: User cancels or submits invalid input
- **WHEN** the user cancels an edit, submits a duplicate property name, or enters an invalid typed value
- **THEN** the previously committed YAML remains intact
- **THEN** invalid input is identified and remains correctable

#### Scenario: Last list item is removed
- **WHEN** the user removes the final item of a simple array
- **THEN** the property remains a valid editable empty array

### Requirement: Property actions are available through context menus and reordering affordances
The system SHALL expose property rename, value editing, supported type changes, removal, and movement through a context menu and a keyboard-accessible menu button. Individual array items SHALL offer editing and removal. Property rows SHALL support handle-based drag sorting with visible drop feedback and keyboard or menu alternatives. Actions SHALL reject mutation after the active document changes or becomes read-only.

#### Scenario: User manages a property through its menu
- **WHEN** the user opens a property's context menu or menu button
- **THEN** the menu offers rename, edit, supported type choices, movement, and removal
- **THEN** choosing an enabled action changes only the intended current property

#### Scenario: User drags or moves a property
- **WHEN** the user drags the property handle to a new position or uses an equivalent keyboard/menu action
- **THEN** the property order updates in the panel and YAML
- **THEN** cancellation or an invalid drop leaves the document unchanged

#### Scenario: A menu outlives the editable document
- **WHEN** a property menu was opened and the active document changes or becomes read-only before an action is selected
- **THEN** the action does not change the document

#### Scenario: User edits or removes an array item through its menu
- **WHEN** the user opens an individual array item's menu
- **THEN** edit focuses that item and remove deletes only that item
