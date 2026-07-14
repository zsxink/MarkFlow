## ADDED Requirements

### Requirement: Debounced expensive tasks
Expensive operations SHALL be debounced to avoid per-keystroke execution.

- Markdown serialization: 400ms debounce
- Word count: 200ms debounce
- Outline refresh: 300ms debounce
- Line number recalculation: 150ms debounce

#### Scenario: Debounce prevents redundant execution
- **WHEN** user types rapidly in the editor
- **THEN** the serialization task is not executed until 400ms after the last keystroke
- **THEN** the word count task is not executed until 200ms after the last keystroke
- **THEN** each task queue operates independently

#### Scenario: Debounce timer resets on new trigger
- **WHEN** a debounced task has a pending timer and a new trigger arrives
- **THEN** the previous timer is cancelled and a new timer starts

### Requirement: Task cancellation
The system SHALL support cancellation of in-flight expensive tasks when a new trigger arrives.

#### Scenario: Cancellation prevents stale results
- **WHEN** a new serialization request arrives while a previous one is pending
- **THEN** the previous pending request is cancelled (via AbortController)
- **THEN** only the latest request executes

#### Scenario: Partial computation is valid after cancellation
- **WHEN** a task is cancelled mid-execution
- **THEN** any partial results are discarded
- **THEN** no partial state is applied to the document

### Requirement: Complexity limits for rendering
The system SHALL enforce complexity limits on rendering subsystems to prevent main thread blocking.

#### Scenario: Syntax highlighting with line limit
- **WHEN** a code block exceeds the configured maximum line count for syntax highlighting
- **THEN** syntax highlighting is disabled for that block
- **THEN** the block is rendered as plain text
- **THEN** a note is shown on hover explaining why highlighting is disabled

#### Scenario: Mermaid rendering timeout
- **WHEN** a Mermaid diagram takes longer than 5 seconds to render
- **THEN** rendering is aborted
- **THEN** a fallback display shows the source code with a "Render failed" message
- **THEN** a retry button is available

#### Scenario: Image parsing limit per document
- **WHEN** the document contains more than 50 image references
- **THEN** images beyond the 50th are not resolved/loaded
- **THEN** placeholder elements are shown instead with count of unresolved images

### Requirement: Incremental computation
Where feasible, expensive computations SHALL use incremental updates rather than full recalculation.

#### Scenario: Word count is recalculated incrementally
- **WHEN** user edits a small portion of a large document
- **THEN** the word count is updated by computing the delta rather than recounting the entire document
- **THEN** the result is consistent with a full recount

#### Scenario: Outline updates only changed headings
- **WHEN** user modifies a single heading in the document
- **THEN** only the changed heading entry is updated in the outline
- **THEN** the order of unchanged headings is preserved
