## ADDED Requirements

### Requirement: Canonical fixtures manifest
The system SHALL provide a canonical set of synthetic Markdown byte fixtures covering UTF-8 without BOM and with UTF-8 BOM; LF, CRLF, CR and mixed EOL; 0, 1, 2 and 3 trailing line-break boundaries; inter-paragraph blank lines; CJK, emoji, combining marks and ZWJ emoji; headings, `-/*/+` lists, nested lists, blockquotes, fenced code blocks, frontmatter, tables, reference links, images and malformed Markdown. Every fixture SHALL have a manifest entry recording its relative path, byte length, SHA-256, encoding/BOM, EOL profile and trailing boundary count. Fixtures SHALL be generated from synthetic data and SHALL never be sourced from or written into `/Users/xian/markflow-test`.

#### Scenario: Manifest covers required matrix
- **WHEN** the fixture manifest is generated
- **THEN** it lists one entry per fixture with byte length, SHA-256, BOM/encoding, EOL profile and trailing line-break count, covering at least UTF-8/BOM, LF/CRLF/CR/Mixed EOL, trailing 0/1/2/3 boundaries and Unicode samples

#### Scenario: Fixture hashes are stable
- **WHEN** a fixture file is re-hashed on a later run
- **THEN** its SHA-256 equals the manifest value

### Requirement: L0 no-edit byte fidelity verification
The L0 harness SHALL verify that a document which is opened and saved without any body transaction produces output bytes byte-for-byte identical to the input: equal SHA-256, equal byte length and zero byte diff. The harness SHALL emit a machine-readable JSON diff report and SHALL NOT accept string-equality after trimming, normalizing or re-serializing as proof of L0.

#### Scenario: Clean save matches input bytes
- **WHEN** the harness opens an unedited fixture and compares input bytes to saved output
- **THEN** SHA-256, length and byte diff all match, and the report records a zero-diff result

#### Scenario: Trim comparison is rejected
- **WHEN** only a trimmed string comparison would pass but raw bytes differ
- **THEN** the harness reports L0 failure with a byte-level diff

### Requirement: L1 surviving-interval fidelity verification
For each declared edit intent `replace(old[start..end], inserted)`, the L1 harness SHALL verify that all bytes outside the replaced range survive byte-for-byte: the prefix `old[..start]`, the suffix `old[end..]` and any tracked surviving intervals SHALL equal the corresponding output bytes. Only the replacement range, explicitly declared adjacent ranges and newly inserted bytes SHALL differ. The harness SHALL emit a JSON report of surviving intervals with old/new byte comparisons and SHALL assert trailing line-break boundaries, BOM and untouched EOL entries separately.

#### Scenario: Body edit preserves untouched tail
- **WHEN** a single character in the document body is edited and the fixture is saved
- **THEN** the L1 harness reports the suffix including trailing line-break boundaries byte-identical, with the difference confined to the edit range and inserted bytes

#### Scenario: Explicit tail edit is the only change
- **WHEN** the edit intent explicitly adds or removes trailing line-break boundaries
- **THEN** only the covered tail range differs and the surviving prefix remains byte-identical

### Requirement: Negative controls
The L0/L1 harness SHALL include negative controls in which an untouched byte is deliberately corrupted; such a run MUST fail verification. The harness SHALL NOT pass when only the corrupted byte is hidden by normalization or trimming.

#### Scenario: Corrupted untouched byte is detected
- **WHEN** a negative control flips one byte in a surviving interval and the harness runs L1 verification
- **THEN** the harness reports failure identifying the corrupted surviving interval

### Requirement: PM tail-newline-loss baseline characterization
The repository SHALL provide a baseline characterization test that reproduces, on the current ProseMirror path, the loss of trailing line-break bytes after editing the document body, demonstrating that the `trailingNewlines` metadata compensation does not satisfy L1. The test SHALL operate on byte-level fixtures (for example CRLF/CR trailing boundaries restored as LF, or a user's explicit tail edit overwritten by stale metadata) and SHALL NOT use trim-normalized string equality. The test SHALL live outside the default always-green test suite, run as an explicit characterization command, and SHALL record input/output bytes and the failing diff in the validation evidence.

#### Scenario: Characterization fails with byte diff
- **WHEN** the characterization command edits a body character of a CRLF-trailing fixture and saves
- **THEN** the test reports failure whose diff is a byte-level tail difference, and the run record stores the input/output SHA-256 and diff

#### Scenario: Characterization is not in the default suite
- **WHEN** `npm test` runs the default suite
- **THEN** the characterization test does not run as a permanent red failure; it runs only via its explicit command

### Requirement: Real Tauri dispatcher contract harness
The harness SHALL exercise the real Tauri dispatcher for the current `read_file`/`write_file` commands and the future Core commands, SHALL NOT mock `invoke`, and SHALL assert command names, argument shapes, error codes and session lifecycle behavior against the documented contract. The harness SHALL record command, exit code, payload hash and any failure separately.

#### Scenario: Real dispatcher command round-trip
- **WHEN** the harness invokes `read_file` through the real dispatcher on an isolated synthetic file
- **THEN** it receives the real command response and records command name, payload and result, with no `invoke` mock in the call path
