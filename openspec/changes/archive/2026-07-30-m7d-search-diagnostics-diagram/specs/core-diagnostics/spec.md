## ADDED Requirements

### Requirement: Session-bound diagnostics report
Core SHALL provide diagnostics through a request bound to `sessionId`, `revision`, and `requestId`.

#### Scenario: Reject stale diagnostics request
- **WHEN** a diagnostics request revision does not match the current Core session revision
- **THEN** Core returns a stale revision error
- **AND** stale diagnostics are not reported against the active editor

#### Scenario: Viewport diagnostics filtering
- **WHEN** a diagnostics request includes a viewport range
- **THEN** Core returns only diagnostics whose UI source ranges intersect that viewport

### Requirement: Core parse diagnostics
Core SHALL report diagnostics for bad link syntax, duplicate headings, unsafe FrontMatter, and malformed table-like structures that Core can identify without Host IO.

#### Scenario: Unsafe FrontMatter produces diagnostic
- **WHEN** FrontMatter is present but not safe for structured editing
- **THEN** Core emits a FrontMatter diagnostic for each unsafe reason

#### Scenario: Duplicate heading produces diagnostic
- **WHEN** the parse index contains repeated heading titles
- **THEN** Core emits duplicate heading diagnostics bound to the heading ranges

### Requirement: Identity-bound Host diagnostics inputs
Host-supplied missing asset and diagram render failure inputs MUST carry identity and SHALL be ignored unless they match the current Core session and revision.

#### Scenario: Ignore foreign missing asset
- **WHEN** a missing asset input has a different `sessionId`
- **THEN** Core does not report that input in the current diagnostics report

#### Scenario: Ignore stale diagram render error range
- **WHEN** a diagram render error has a matching session and revision but its source range revision is stale
- **THEN** Core ignores that render error
- **AND** the diagnostics request still succeeds
