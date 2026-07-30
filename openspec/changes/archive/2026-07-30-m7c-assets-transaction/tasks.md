## 1. Transaction Model

- [x] 1.1 Add asset transaction request, plan, commit, rollback, and recovery result types.
- [x] 1.2 Route existing pending-image preparation through the transaction prepare API.
- [x] 1.3 Validate `sessionId + baseRevision + requestId` before commit or rollback when current session context is supplied.

## 2. Save Integration

- [x] 2.1 Keep legacy sidebar saves using the compatibility wrappers backed by transactions.
- [x] 2.2 Add Core-backed save transaction handling around `saveCoreSession`.
- [x] 2.3 Preserve drafts and rollback/recovery records when document write/save fails.

## 3. Verification

- [x] 3.1 Add tests for plan generation, relative and absolute references, and all storage modes.
- [x] 3.2 Add tests for migration failure, document commit failure, stale session/revision rejection, and requestId mismatch.
- [x] 3.3 Run focused unit tests plus OpenSpec validation and whitespace checks.
