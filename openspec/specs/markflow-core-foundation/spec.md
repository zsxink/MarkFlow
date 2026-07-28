# markflow-core-foundation

## Purpose

Define the M1 document kernel (`markflow-core` crate) — a host-independent Rust library that opens, represents, and saves Markdown bytes with full source-format fidelity. The kernel handles text buffering, line ending preservation, atomic revision-bound patching, and multi-coordinate position mapping, enabling the application to build a lossless editing surface without knowledge of Tauri, WebView, or DOM.

## Requirements

### Requirement: Core foundation is an independent Rust crate
The system SHALL provide a top-level independent `markflow-core` Rust crate for the M1 document kernel.

#### Scenario: Core has no host dependencies
- **WHEN** the Core crate dependency graph is inspected
- **THEN** it SHALL NOT contain Tauri, WebView, DOM, CodeMirror, ProseMirror, network, or file IO adapter dependencies

#### Scenario: Core tests run without the application host
- **WHEN** Core unit and fixture tests are executed
- **THEN** they SHALL run without starting Tauri, Vite, WebView, or frontend code

#### Scenario: Product editing path remains unchanged
- **WHEN** M1 implementation is complete
- **THEN** the existing application editor, serializer, save, export, and UI runtime paths SHALL NOT be routed through Core

### Requirement: Core opens supported Markdown bytes losslessly
The system SHALL open UTF-8 and UTF-8 BOM Markdown bytes into a `DocumentSession` while recording enough source-format metadata to reconstruct unedited bytes exactly.

#### Scenario: UTF-8 fixture roundtrips byte-for-byte
- **WHEN** a supported UTF-8 fixture is opened and immediately converted to a save payload
- **THEN** the output bytes SHALL equal the original fixture bytes

#### Scenario: UTF-8 BOM is preserved
- **WHEN** a UTF-8 BOM fixture is opened and saved without edits
- **THEN** the save payload SHALL retain the UTF-8 BOM

#### Scenario: Unsupported encoding is rejected
- **WHEN** invalid UTF-8 or a non-UTF-8 encoding is opened
- **THEN** Core MUST return `UnsupportedEncoding` and MUST NOT silently transcode the document

### Requirement: Core preserves source line endings and trailing newlines
The system SHALL represent logical text with LF while preserving original LF, CRLF, and Mixed EOL source formatting through a line-ending map.

#### Scenario: CRLF fixture remains CRLF
- **WHEN** a CRLF fixture is opened and saved without edits
- **THEN** every original CRLF line ending SHALL remain CRLF in the save payload

#### Scenario: Mixed EOL fixture preserves line-level EOL
- **WHEN** a Mixed EOL fixture is opened and saved without edits
- **THEN** each original line ending SHALL be preserved at its original line boundary

#### Scenario: Trailing empty lines are preserved
- **WHEN** a fixture with trailing newlines is opened and saved without edits
- **THEN** the trailing newline count SHALL remain unchanged

#### Scenario: Inserted lines receive deterministic EOLs
- **WHEN** a patch inserts new logical lines
- **THEN** explicit EOLs from the replacement SHALL be captured and missing inserted EOLs SHALL inherit adjacent or dominant source EOL policy

#### Scenario: Logical newlines inherit source style
- **WHEN** LF-normalized editor replacement text inserts newlines into CRLF or Mixed EOL source
- **THEN** each inserted newline SHALL deterministically reuse removed, right-adjacent, left-adjacent, or concrete dominant EOL style in that priority order

#### Scenario: Explicit source EOL is preserved
- **WHEN** replacement text explicitly contains CRLF or bare CR
- **THEN** the corresponding inserted source EOL SHALL remain CRLF or CR regardless of adjacent source style

#### Scenario: Logical construction rejects source-form CR
- **WHEN** `TextBuffer::from_logical_text` receives text containing bare CR or CRLF
- **THEN** Core MUST return `InvalidLogicalLineEnding` and MUST NOT construct a buffer that can emit duplicated carriage returns

#### Scenario: Empty logical text retains concrete dominant fallback
- **WHEN** an empty LF-only logical buffer is constructed with CRLF or CR as its concrete dominant EOL
- **THEN** a later crate-internal logical newline insertion SHALL use that dominant EOL when no removed or adjacent boundary exists

### Requirement: Core applies revision-bound text patches atomically
The system SHALL apply `TextPatch` values only when revision, transaction, range ordering, overlap, and character-boundary rules are satisfied.

#### Scenario: Successful patch advances revision
- **WHEN** a patch with matching base revision and valid non-overlapping ranges is applied
- **THEN** Core SHALL update the logical text and increment the session revision by one

#### Scenario: Revision mismatch fails without mutation
- **WHEN** a patch base revision does not match the session revision
- **THEN** Core MUST reject the patch and MUST leave session text, line endings, maps, and revision unchanged

#### Scenario: Overlapping changes fail without mutation
- **WHEN** a patch contains overlapping ranges
- **THEN** Core MUST reject the patch and MUST leave session state unchanged

#### Scenario: Caller change order does not affect application
- **WHEN** a patch contains valid non-overlapping changes in any caller-provided order
- **THEN** Core SHALL sort a copy by range, validate the normalized set, apply it in reverse offset order, and produce the same text and outcome as any equivalent ordering

#### Scenario: Retried transaction is idempotent
- **WHEN** the same transaction id and identical changes are retried while the successful application remains in the 256-entry retry window
- **THEN** Core SHALL return the already-applied result without applying the changes a second time

#### Scenario: Retry storage is bounded
- **WHEN** more than 256 successful transactions are committed in one session
- **THEN** Core SHALL retain only the most recent 256 payload fingerprints and outcomes and SHALL evict the oldest transaction deterministically

#### Scenario: Evicted transaction receives normal validation
- **WHEN** a transaction retry arrives after its retry-window entry was evicted
- **THEN** Core SHALL validate it as a new request and SHALL NOT claim that the old outcome is still idempotently available

#### Scenario: Successful selection targets committed text
- **WHEN** `selection_after` has current request revision and valid UTF-8 boundaries in the candidate post-edit text
- **THEN** Core SHALL return those coordinates bound to the next committed revision

#### Scenario: Invalid projected selection is atomic
- **WHEN** `selection_after` is stale, outside the candidate text, or inside a UTF-8 code point
- **THEN** Core MUST reject the patch and MUST leave session state and retry state unchanged

#### Scenario: Invalid character boundary fails without mutation
- **WHEN** a source range would split a UTF-8 code point or UTF-16 surrogate pair
- **THEN** Core MUST reject the patch and MUST leave session state unchanged

#### Scenario: Public callers cannot bypass patch invariants
- **WHEN** external code accesses a `DocumentSession`
- **THEN** text, revision, snapshot, line index, and position map state SHALL be exposed read-only and text mutation SHALL only be possible through atomic `apply_patch`

### Requirement: Core maps UTF-8, UTF-16, line-column, and source byte coordinates
The system SHALL provide a `PositionMap` and `LineIndex` that convert between Core UTF-8 byte offsets, CodeMirror-compatible UTF-16 offsets, line/column values, and save-source byte offsets for the current revision.

#### Scenario: Unicode coordinate conversion is reversible
- **WHEN** offsets are converted across UTF-8 byte, UTF-16 code unit, and line/column coordinates for ASCII, Chinese text, emoji, and combining marks
- **THEN** conversion back to the original coordinate SHALL produce the same valid boundary

#### Scenario: Source byte conversion accounts for BOM and EOL width
- **WHEN** logical UTF-8 offsets are converted to source byte offsets in UTF-8 BOM, CRLF, or Mixed EOL documents
- **THEN** the result SHALL account for BOM bytes and per-line EOL byte width

#### Scenario: Source byte conversion is reversible
- **WHEN** a valid source byte boundary in UTF-8 BOM, CRLF, Mixed EOL, or Unicode content is converted to a logical byte and back
- **THEN** the original source byte offset SHALL be produced exactly

#### Scenario: Invalid source byte positions are rejected explicitly
- **WHEN** a source offset is inside a BOM, inside a CRLF pair, beyond the save payload, or inside a UTF-8 code point
- **THEN** Core MUST return an `InvalidSourceOffset` error with the corresponding reason and MUST NOT snap the position

#### Scenario: Stale revision ranges are rejected
- **WHEN** a range bound to an old revision is used against a newer session revision
- **THEN** Core MUST reject the range before applying a patch

#### Scenario: Public coordinate conversion is session-bound
- **WHEN** external code converts UTF-8 byte, UTF-16, line-column, or source-byte coordinates
- **THEN** it SHALL call `DocumentSession` conversion methods that pair the current session text and position map, and SHALL NOT be able to supply unrelated text to direct `PositionMap` conversion methods

#### Scenario: Coordinate maps remain coherent after patch
- **WHEN** a successful patch advances the session revision
- **THEN** all public forward and reverse coordinate conversions SHALL use indexes rebuilt for the committed text and revision

### Requirement: Core fixture tests cover M1 lossless behavior
The system SHALL include M1 lossless fixtures and tests that encode the acceptance criteria from `docs/markflow-core-stages/m1-core-foundation.md`.

#### Scenario: Required fixtures exist
- **WHEN** the Core fixture directory is inspected
- **THEN** it SHALL include LF, CRLF, Mixed EOL, UTF-8 BOM, Unicode offsets, trailing newlines, FrontMatter, HTML comment, mixed list markers, backtick code fence, tilde code fence, and table alignment Markdown fixtures

#### Scenario: Untouched source regions survive localized edits
- **WHEN** a single paragraph patch is applied to a fixture
- **THEN** the source bytes before and after the edited range SHALL remain byte-for-byte equal to the corresponding original regions

#### Scenario: Property-style tests cover Unicode patches and EOL maps
- **WHEN** randomized or generated Unicode and EOL patch cases are tested
- **THEN** Core SHALL NOT produce invalid UTF-8 and SHALL preserve reversible coordinate and EOL map behavior

### Requirement: Core records M1.1 large-document evidence
The system SHALL include a reproducible std-only release-mode harness for localized patch and save paths without slowing the default test suite.

#### Scenario: Release harness covers required sizes
- **WHEN** the M1.1 performance harness is run
- **THEN** it SHALL report open, localized patch, and save timings for generated 1 MB, 10 MB, and 50 MB documents

#### Scenario: Memory limitations are not hidden
- **WHEN** M1.1 validation evidence is recorded
- **THEN** it SHALL identify known full-document copies, scans, output allocations, and the lack of profiler-derived peak memory as an M2 precondition
