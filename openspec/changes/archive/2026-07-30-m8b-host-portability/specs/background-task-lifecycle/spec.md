## ADDED Requirements

### Requirement: Host jobs are request-bound and cancellable

Host jobs for file writes, resource transactions, network fetches, diagram rendering, and export SHALL bind to a stable request id and support cancellation and timeout. Window close or session close SHALL cancel jobs bound to that window/session unless the job has been explicitly handed to an OS-level background operation with documented ownership and cleanup semantics.

#### Scenario: Window close cancels bound export

- **WHEN** an export job is bound to a window label and that window closes before completion
- **THEN** Runtime cancels the job
- **THEN** Host returns or records `EXPORT_CANCELLED`
- **THEN** no completion toast is routed to another window

#### Scenario: Session close cancels bound render job

- **WHEN** a diagram render job is bound to a session and that session closes
- **THEN** Runtime cancels the job
- **THEN** stale render output is not applied to any editor surface

#### Scenario: Timeout cleans up Host job

- **WHEN** a Host network, render, or export job exceeds its configured timeout
- **THEN** Runtime cancels or abandons the job according to capability semantics
- **THEN** Host returns `HOST_TIMEOUT` or `EXPORT_TIMEOUT`
- **THEN** temporary files or pending job handles are cleaned up

### Requirement: OS-level background exceptions are documented

If a Host operation is handed to an OS-level background job that cannot be cancelled directly, the Host capability matrix SHALL document result ownership, cleanup responsibility, timeout behavior, and whether UI/session result routing is disabled.

#### Scenario: Native print exception is recorded

- **WHEN** a platform print operation is handed to the OS and cannot be cancelled by Runtime
- **THEN** the Host capability matrix records that exception
- **THEN** Runtime does not later apply a stale result to a closed session or different window
