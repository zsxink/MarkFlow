## ADDED Requirements

### Requirement: Panic hook with crash context
The backend SHALL install a panic hook that records the panic location and message with structured context before deferring to the default hook.

#### Scenario: Panic captured with context
- **WHEN** any thread panics
- **THEN** the panic location and message are written to the structured log (redacted) and the default panic behavior still occurs

### Requirement: Log redaction of sensitive content
The logging layer SHALL redact full document bodies, URL secrets/query strings, and private absolute path contents before writing them to logs.

#### Scenario: Document body not logged
- **WHEN** a log call would include full document text
- **THEN** the body is truncated/omitted and only a bounded, non-sensitive summary is recorded

#### Scenario: URL secret redacted
- **WHEN** a log call would include a URL containing query parameters or embedded secrets
- **THEN** the secret/query portion is masked

#### Scenario: Private path summarized
- **WHEN** a log call would include a private absolute file path
- **THEN** the filename or sensitive segment is masked while preserving enough directory hierarchy for diagnosis
