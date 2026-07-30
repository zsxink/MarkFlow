## ADDED Requirements

### Requirement: Semantic edit command patch result
The Bridge SHALL provide semantic edit command, undo, and redo commands whose successful result includes `session_id`, `transaction_id`, `revision`, UTF-16 `patch`, UTF-16 `affected_ranges`, and UTF-16 `selection_after`. The normal command path SHALL NOT require a whole-document resync to update the editor.

#### Scenario: execute_edit_command returns patch-first result
- **WHEN** the frontend calls `execute_edit_command` with a live session, matching `base_revision`, semantic command, and transaction id
- **THEN** the Bridge applies the Core command through Core history ownership
- **THEN** the result includes the applied UTF-16 patch, affected ranges, selection_after, and new revision

#### Scenario: undo redo return patch-first result
- **WHEN** the frontend calls `undo_document` or `redo_document` for a live session
- **THEN** Core performs the history operation
- **THEN** the result includes the UTF-16 patch needed to update the editor surface and the new revision

#### Scenario: link command preserves dialog display text
- **WHEN** the frontend calls `execute_edit_command` with `InsertLink`, an empty selection, and display text
- **THEN** Core inserts a Markdown link using that display text
- **THEN** the returned patch does not contain an empty link label

#### Scenario: code fence command wraps selected text
- **WHEN** the frontend calls `execute_edit_command` with `InsertCodeFence` and a non-empty UTF-16 selection
- **THEN** Core wraps the selected text in a code fence
- **THEN** the returned patch replaces the selected range instead of inserting an empty fence at the cursor only

### Requirement: undo redo IPC is single-step
The Bridge SHALL expose `undo_document` and `redo_document` as single-step operations while `CommandResultDto` contains one patch. Requests with `max_steps` other than `1` or omitted SHALL be rejected with a stable error until the protocol supports ordered patch sequences.

#### Scenario: multi-step undo is rejected
- **WHEN** the frontend calls `undo_document` with `max_steps=2`
- **THEN** the Bridge returns a stable error
- **THEN** the session history and document text are not changed

### Requirement: Semantic command transaction idempotency
The Bridge SHALL treat `session_id + frontend_txn_id` as an idempotency key for semantic command, undo, and redo requests. A repeated request with the same fingerprint SHALL return the same result. A repeated transaction id with a different fingerprint SHALL return `TRANSACTION_CONFLICT`.

#### Scenario: repeated command returns cached result
- **WHEN** a semantic edit command succeeds
- **WHEN** the same session sends the same `frontend_txn_id` and identical request again
- **THEN** the Bridge returns the original command result without applying the command a second time

#### Scenario: conflicting command retry is rejected
- **WHEN** a semantic edit command succeeds
- **WHEN** the same session sends the same `frontend_txn_id` with a different command or revision
- **THEN** the Bridge returns `TRANSACTION_CONFLICT`

#### Scenario: stale semantic command is rejected
- **WHEN** the frontend sends a new semantic command with `base_revision` lower than the session revision
- **THEN** the Bridge returns `REVISION_MISMATCH`

#### Scenario: unknown session is rejected
- **WHEN** the frontend sends a semantic command, undo, or redo for a closed or unknown session
- **THEN** the Bridge returns `SESSION_NOT_FOUND`
