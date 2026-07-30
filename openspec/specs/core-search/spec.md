# Core Search

## Purpose

Core-level search support for MarkFlow documents. Provides session-bound plain text search, large-document paging, UTF-16 selection mapping, and replace preview patch generation.

## Requirements

### Requirement: Session-bound Core search
Core SHALL provide document search through a request bound to `sessionId`, `revision`, and `queryId`.

#### Scenario: Reject stale search request
- **WHEN** a search request revision does not match the current Core session revision
- **THEN** Core returns a stale revision error
- **AND** no search results are produced for the active editor

#### Scenario: Return range-mapped search matches
- **WHEN** a search request matches document text
- **THEN** each match includes a revision-bound source range
- **AND** each match includes a UTF-16 UI range
- **AND** each match includes a selection that can be applied to the same revision

### Requirement: Search options
Core SHALL support plain text search with case-sensitive and whole-word options.

#### Scenario: Whole-word matching excludes embedded identifiers
- **WHEN** whole-word search is enabled
- **THEN** Core matches only occurrences whose adjacent characters are not word characters
- **AND** embedded occurrences inside identifiers are excluded

### Requirement: Paged large-document search
Core SHALL return paged search results for documents above the 1 MiB large-document threshold.

#### Scenario: Search page has continuation cursor
- **WHEN** a search request limit is reached before all matches are returned
- **THEN** Core returns a next cursor
- **AND** the caller can request the next page from that cursor without rescanning from the beginning

### Requirement: Replace preview patch
Core SHALL generate replace preview patches instead of mutating document text during search.

#### Scenario: Replace all preview checks base revision
- **WHEN** replace preview is requested for all matches
- **THEN** Core returns a `TextPatch` bound to the requested base revision
- **AND** applying that patch remains subject to normal patch validation and transaction conflict checks
