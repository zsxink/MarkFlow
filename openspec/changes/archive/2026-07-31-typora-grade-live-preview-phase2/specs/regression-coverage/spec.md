## ADDED Requirements

### Requirement: Editor projection regressions have executable coverage
The automated suite SHALL cover real command argument contracts, optimistic/confirmed reconciliation, ack-driven render refresh, stale decoration removal, marker folding, structured widgets, mode reconfiguration, single History ownership, and degraded recovery.

#### Scenario: Edit advances confirmed projection
- **WHEN** a CodeMirror edit is acknowledged by Core
- **THEN** a test proves that projection refreshes for the acknowledged revision without requiring another user edit or scroll

#### Scenario: Old ranges cannot decorate new text
- **WHEN** an edit changes source length before an existing projection range
- **THEN** stale ranges are mapped safely or removed before decoration rebuilding

### Requirement: Input integrity regressions have executable coverage
The suite SHALL cover CJK composition, emoji and surrogate pairs, selection across folds/widgets, copy/paste representations, Enter/Backspace/Delete boundaries, keyboard-only widget navigation, and Undo grouping.

#### Scenario: Composition and Undo
- **WHEN** a CJK composition commits inside projected Markdown
- **THEN** text is exact and one Undo reverses the composition
- **THEN** no hidden marker is corrupted

### Requirement: Visual and performance regressions block release
Required visual baselines and performance budgets SHALL run against versioned fixtures. Unexpected pixels, layout shifts, unbounded rendering, or p95 budget regressions SHALL fail the applicable gate.

#### Scenario: Hidden marker becomes visible
- **WHEN** a change causes a supported inactive marker to appear in a baseline
- **THEN** visual regression fails with a diff artifact

### Requirement: Product gate cannot be deferred during archive
GUI E2E, visual, IME, required platform, and current observation evidence SHALL remain unchecked until executed successfully. Archive tooling or review SHALL reject a change whose required product gates are relabeled as deferred.

#### Scenario: Required gate is not executed
- **WHEN** a required product gate is unavailable or has not run
- **THEN** the phase remains incomplete and unarchived
- **THEN** evidence records the blocker without marking the task complete
