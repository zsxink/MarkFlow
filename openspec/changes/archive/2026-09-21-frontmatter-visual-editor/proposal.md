## Why

YAML frontmatter is currently preserved as an opaque Markdown region, which protects lossless round trips but leaves common document metadata difficult to inspect and update. Authors need a focused, type-aware editing experience without weakening the established safety boundary for arbitrary YAML.

## What Changes

- Add a dedicated frontmatter region at the top of the editing experience, visually separated from document body content and clearly identified as YAML metadata.
- Provide YAML syntax highlighting for frontmatter source, including keys, scalar values, structural punctuation, and supported value types.
- Add a visual field editor for safe top-level YAML values: text, dates, booleans, and simple arrays; support adding, removing, and drag-reordering fields.
- Use an explicit YAML 1.2 Core safe-subset contract so type inference and serialization are deterministic across source and form views.
- Keep the field editor and YAML source synchronized in both directions, including updates arriving through the existing WYSIWYG/source-mode synchronization path.
- Detect unsupported or unsafe YAML (including nested mappings and other complex structures) and retain it as directly editable YAML without exposing unsafe structured operations.
- Keep documents without frontmatter visually unchanged; allow users to create an empty frontmatter block explicitly from the top MarkFlow menu.
- Respect document read-only state across raw YAML, field controls, field ordering, and the create-frontmatter menu action.

## Capabilities

### New Capabilities

- `frontmatter-visual-editor`: Safe, type-aware YAML frontmatter presentation and bidirectional editing while preserving unsupported YAML for direct source editing.

### Modified Capabilities

- `codemirror-source-editor`: Source-mode syntax highlighting and content synchronization accommodate the dedicated frontmatter presentation without breaking existing mode-switch invariants.

## Impact

- Affected editor admission, opaque-frontmatter preservation, source-editor extensions, editor UI components, and editor styles.
- Uses the existing `@codemirror/lang-yaml` dependency for highlighting and adds a direct `yaml` v2 dependency for YAML 1.2 Core document analysis; persisted edits remain source-range patches rather than whole-document serialization.
- Adds focused unit and integration coverage for supported scalar/array edits, reordering, source-to-panel updates, and complex-YAML fallback behavior.
