## ADDED Requirements

### Requirement: Poisoned-lock access helper
The backend SHALL provide a unified lock-access helper that converts a poisoned `Mutex` into a structured error instead of panicking, and SHALL recover state that is safe to reconstruct by taking the inner value.

#### Scenario: Lock poisoned by prior panic
- **WHEN** a `Mutex` guarded by the helper was poisoned by a panic in a previous holder
- **THEN** subsequent access recovers the inner value via `into_inner()` and continues (with a `warn`-level log), and does NOT panic the process

#### Scenario: Recoverable state reconstructed
- **WHEN** the poisoned mutex guards state that is safe to reconstruct (settings cache, pending/cli file maps)
- **THEN** the helper recovers the inner value and continues, surfacing a `warn`-level structured log

### Requirement: Unified backend error type and error codes
The backend SHALL return a unified error type from commands that carries both a stable error code and a human-readable `message` string, so the frontend can classify failures.

#### Scenario: Command returns classified error
- **WHEN** a command fails with an expected error (lock poison, IO, serialization, invalid workspace)
- **THEN** the invocation rejection includes a `message` string (backward-compatible) plus a machine-readable error code

### Requirement: No unexplained empty catch on frontend
The frontend SHALL NOT contain `catch` blocks that silently ignore errors without a category. Only explicit best-effort operations MAY ignore an error, and MUST emit a structured `debug`/`warn` log.

#### Scenario: Best-effort call ignores error with log
- **WHEN** a non-critical fire-and-forget call (e.g. marking initial file handled, window-state save on close) fails
- **THEN** the error is logged with a structured message and the operation is skipped without user-visible disruption

#### Scenario: Recoverable action surfaces categorized error
- **WHEN** a user-initiated action (context menu, image menu) fails
- **THEN** the failure is classified (retry / conflict / degrade / fatal) and the user sees a recoverable prompt rather than a bare toast or silent drop
