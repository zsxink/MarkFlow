## Purpose

为 Markdown 文档顶部的 YAML frontmatter 提供安全、可感知的可视化编辑，同时确保不支持的 YAML 仍以原始文本无损保留。

## ADDED Requirements

### Requirement: Frontmatter is presented as a distinct editor region
The system SHALL present a document-leading, delimiter-bounded YAML frontmatter block separately from the Markdown body in the editing experience. The region SHALL remain visually identifiable as metadata and SHALL not cause its delimiters or source text to be absorbed into body content.

#### Scenario: Document with frontmatter opens in the editor
- **WHEN** a document begins with a valid frontmatter opening delimiter and closing delimiter
- **THEN** the frontmatter appears in a visually distinct region above the document body
- **THEN** the body begins after the closing delimiter without frontmatter text rendered as body content

#### Scenario: Document has no frontmatter
- **WHEN** a document does not begin with a complete frontmatter block
- **THEN** the editor shows the document body without an empty frontmatter region

#### Scenario: User creates frontmatter from the top menu
- **WHEN** an editable active document has no frontmatter and the user chooses "新增 Frontmatter" from the top MarkFlow menu
- **THEN** the system inserts an empty, complete frontmatter block before the Markdown body using the document's existing line ending, or LF when the document has no established line ending
- **THEN** the frontmatter region opens and focuses the new-field control
- **THEN** the creation is recorded as a user edit

#### Scenario: Create action is unavailable when frontmatter exists
- **WHEN** the active document already has a complete leading frontmatter block
- **THEN** the top-menu create action is disabled

### Requirement: YAML frontmatter source is syntax highlighted
The system SHALL syntax-highlight YAML frontmatter source so that mapping keys, scalar values, type-specific literals, structural punctuation, and comments are visually distinguishable. Highlighting SHALL not modify the persisted YAML text.

#### Scenario: Supported YAML source is displayed
- **WHEN** frontmatter contains mapping keys, quoted or plain strings, dates, boolean values, arrays, comments, and delimiters
- **THEN** each applicable YAML token category is visually distinguishable in the source presentation
- **THEN** the persisted YAML source remains byte-for-byte unchanged unless the user performs an edit

### Requirement: Visual editor supports the safe frontmatter subset
The system SHALL interpret frontmatter using YAML 1.2 Core and SHALL offer a field editor only when it is a safe top-level mapping. Keys SHALL be unique, non-empty string scalars and SHALL NOT use merge keys. Supported values SHALL be text, ISO calendar date, boolean, null, canonical decimal number, or a supported simple array. The field editor SHALL allow users to add fields, remove fields, and reorder fields by dragging.

#### Scenario: Supported values are rendered with appropriate controls
- **WHEN** frontmatter contains supported top-level scalar fields and simple scalar arrays
- **THEN** text, date, boolean, numeric/null, and array values are displayed with controls appropriate to their detected type

#### Scenario: Scalar types are inferred deterministically
- **WHEN** a plain scalar is exactly `true` or `false`, `null` or `~`, a canonical base-10 integer/decimal, or a valid calendar date in `YYYY-MM-DD` form
- **THEN** the field editor classifies it respectively as boolean, null, number, or date
- **WHEN** the same spelling is quoted, or a plain scalar matches none of those forms
- **THEN** the field editor classifies it as text

#### Scenario: Scalar edits use canonical output
- **WHEN** the user changes a typed value through the field editor
- **THEN** boolean values are emitted as lowercase `true` or `false`, null as `null`, numbers as finite base-10 values, and dates as valid zero-padded `YYYY-MM-DD`
- **THEN** text values are quoted when required to prevent YAML type or structure changes

#### Scenario: Simple array is eligible
- **WHEN** a flow-style or block-style sequence contains only comment-free scalar items of one supported non-null type, or is empty
- **THEN** the field editor exposes it as a simple array and preserves its flow or block presentation style when editing

#### Scenario: Array is outside the safe subset
- **WHEN** an array contains nested collections, anchors, aliases, tags, comments inside the array value, mixed scalar types, or null items
- **THEN** the system keeps the frontmatter available for direct YAML editing and does not expose structured field operations

#### Scenario: User changes a supported field
- **WHEN** a user updates a supported value, adds or removes a field, or changes field order through the field editor
- **THEN** the corresponding YAML source is updated immediately
- **THEN** resulting supported values retain their intended YAML type

### Requirement: Field editor and YAML source synchronize bidirectionally
The system SHALL keep supported changes in the visual field editor and frontmatter YAML source synchronized in both directions, including document changes delivered through the editor's existing content synchronization mechanisms.

#### Scenario: YAML source change updates fields
- **WHEN** a user changes valid safe-subset YAML source directly
- **THEN** the field editor reflects the updated fields, values, types, and order

#### Scenario: External document update changes frontmatter
- **WHEN** the active document's Markdown content is replaced or synchronized with changed safe-subset frontmatter
- **THEN** the editor refreshes both the YAML source and the field editor from that same content

### Requirement: Complex YAML falls back safely to source editing
The system SHALL not expose structured editing operations for frontmatter containing nested mappings, nested sequences, anchors, aliases, custom tags, duplicate keys, malformed YAML, or other unsupported YAML constructs. It SHALL preserve the complete frontmatter text for direct YAML editing and SHALL clearly indicate that visual editing is unavailable for that content.

#### Scenario: Nested mapping is encountered
- **WHEN** frontmatter contains a nested mapping or sequence
- **THEN** the field editor does not offer controls that could rewrite the structure
- **THEN** the original YAML remains available for direct editing

#### Scenario: Unsupported YAML becomes safe
- **WHEN** a user directly edits unsupported frontmatter into a valid safe top-level mapping
- **THEN** the system enables the field editor using the newly parsed fields

#### Scenario: Supported YAML becomes unsupported
- **WHEN** direct YAML editing introduces an unsupported construct or invalid syntax
- **THEN** the system disables structured editing without discarding the user's YAML source

### Requirement: Visual frontmatter edits preserve unsupported source details
For a frontmatter document eligible for structured editing, visual edits SHALL update only the intended supported top-level fields while preserving unrelated comments, quoting, blank lines, delimiters, and ordering semantics. If the system cannot apply an edit without violating that preservation boundary, it SHALL retain direct YAML editing rather than perform a lossy rewrite.

#### Scenario: Commented supported mapping is edited
- **WHEN** a safe top-level mapping includes comments, quoted values, or blank lines and a user edits a supported field visually
- **THEN** unrelated comments, quotes, blank lines, and fields are preserved

#### Scenario: Lossless update cannot be produced
- **WHEN** a requested structured edit cannot be applied while preserving the source boundary
- **THEN** the system does not write a lossy YAML replacement
- **THEN** the user can continue editing the original YAML source directly

### Requirement: Frontmatter editing respects document read-only state
The system SHALL keep frontmatter visible in a read-only document while preventing all operations that could mutate its YAML or create a new frontmatter block.

#### Scenario: Existing frontmatter is opened read-only
- **WHEN** the active document is read-only and contains frontmatter
- **THEN** raw YAML editing, field inputs, add/remove actions, and pointer or keyboard reordering are disabled
- **THEN** syntax highlighting, field values, and the complex-YAML fallback reason remain visible

#### Scenario: Read-only document has no frontmatter
- **WHEN** the active document is read-only and has no frontmatter
- **THEN** no frontmatter region is displayed
- **THEN** the top-menu "新增 Frontmatter" action is disabled

#### Scenario: Document becomes read-only while panel is open
- **WHEN** document read-only state changes from editable to read-only
- **THEN** all frontmatter mutation controls are disabled immediately without changing content or dirty state
