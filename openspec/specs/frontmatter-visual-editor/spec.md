# frontmatter-visual-editor Specification

## Purpose

为 Markdown 文档顶部的 YAML frontmatter 提供安全、可感知的可视化编辑，同时确保不支持的 YAML 仍以原始文本无损保留。

## Agent Context
- **源码入口：** 前置 frontmatter 提取与无损补齐模块（frontmatter 域层）、字段编辑器与同步控制器（编辑 UI）、`src/editor/source.ts`（源码模式 YAML 高亮）；添加 `yaml` v2 直接依赖并提供安全子集扩展证据。
- **关联规范：** `codemirror-source-editor`、`enter-content-integrity`、`atomic-save`、`file-tree-architecture`。
- **不变量：** 完整前置 frontmatter 块是编辑器视图的单层呈现，原始完整 Markdown 始终是权威文档值；结构化编辑仅面向安全子集顶层映射，且必须是无损的源码范围补丁；不支持的 YAML 保持可直接编辑的原始文本并有明确的降级原因。
- **紧凑属性形态：** 属性区默认呈现为紧凑内联行（类型图标即拖动手柄、属性名与值就地可编辑、数组项为标签 chips、新增表单按需展开），常驻的删除/上下移/类型下拉已移除；改名、改类型、移动、移除等辅助操作走 `src/ui/context-menu.ts` 的统一菜单宿主，因此菜单工厂的分隔线索引与子菜单行为变更会直接影响属性面板。
- **验证：** `npm test -- src/utils/__tests__/frontmatter.test.ts src/ui/__tests__/frontmatter-panel.test.ts`（安全子集解析、无损补齐、双向同步、复杂降级、只读、菜单创建、源码 YAML 高亮）；`npx tsc --noEmit`；`npm run build`；`npx openspec validate frontmatter-visual-editor --strict`。

## Requirements

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
