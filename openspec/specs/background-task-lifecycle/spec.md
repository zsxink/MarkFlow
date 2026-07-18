## Purpose

Give the file watcher and other background work a single, explicit, cancellable lifecycle so the app never leaks threads or hangs on exit.

## ADDED Requirements

### Requirement: Watcher is explicitly stoppable
The file watcher SHALL expose an explicit stop that signals the worker thread to exit and joins it, releasing the underlying notify handle.

#### Scenario: Workspace switch stops previous watcher
- **WHEN** a new workspace is set while a watcher is active
- **THEN** the previous watcher is stopped (thread joined) before the new one is started, with no leaked threads

#### Scenario: App exit stops watcher
- **WHEN** the application receives an exit request
- **THEN** all active watchers are stopped before the process terminates

### Requirement: Bounded watcher queue with overflow handling
The watcher worker SHALL use a bounded event queue; on overflow it SHALL record a `warn` log with drop count and schedule exactly one controlled rescan.

#### Scenario: Queue overflow triggers rescan
- **WHEN** the bounded queue is full and a file event cannot be enqueued
- **THEN** the drop is counted and logged, and a single controlled directory rescan is triggered once load subsides

#### Scenario: Watcher thread error is logged not silent
- **WHEN** the underlying notify backend returns a runtime error inside the worker
- **THEN** the error is logged with context and the worker remains alive or restarts, rather than silently ending

### Requirement: Timer and network tasks are cancellable
Backend timers and in-flight network requests SHALL be cancellable on workspace switch, window close, and app exit.

#### Scenario: Close with running tasks
- **WHEN** the app closes while network/file tasks are still in flight
- **THEN** the tasks are signalled to cancel and the exit proceeds without hanging on them

#### Scenario: Receive-end closed
- **WHEN** the frontend event receiver for `file-changed` is closed
- **THEN** the backend emit is treated as best-effort and logged, not panicking
