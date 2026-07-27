# ADR: Markdown Document Truth And Save Owner

- Status: Accepted for M0 baseline
- Date: 2026-07-27
- Evidence: `reports/ipc-patch-report.md`, `implementation-notes.md`

## Decision

Markdown source bytes reconstructed from the Core confirmed snapshot are the only authoritative document truth.

The editor may hold an optimistic mirror for latency. CodeMirror transactions are converted to small UTF-16 patch DTOs, sent through Runtime/Core, and acknowledged with a new confirmed revision. Pending patches remain untrusted until acknowledged.

Runtime is the only save workflow owner. A save operation must flush pending patches, request confirmed snapshot bytes from Core, and ask Host Adapter to perform the platform write. Host writes bytes and reports platform outcome; Host does not serialize Markdown or decide editing semantics.

## Rejected Behavior

- Saving a front-end full-text fallback while patches are pending.
- Letting ProseMirror serializer output become the final authority after Core-backed stages begin.
- Letting Tauri commands own Markdown session, revision, patch, or history semantics.

## Revision Contract

- Every patch carries `transaction_id` and `base_revision`.
- Duplicate `transaction_id` is idempotent.
- Revision mismatch returns the confirmed revision and resync instruction.
- Save starts from a captured confirmed revision and only clears dirty state if no newer confirmed edit superseded it.

## M1/M3 Constraints

M1 should design `DocumentSession`, `Revision`, `TextPatch`, and `SavePayload` around this contract. M3 Source Mode must send patches, not whole-document saves, except for explicit resync.

## M0 Evidence

`reports/ipc-patch-report.md` records duplicate transaction idempotency and stale revision rejection against a 10MB simulated editor patch stream. `reports/frontmatter-lossless-report.md` records the FrontMatter safe structured-edit subset and fallback-to-source cases. The 10MB release simulation p95 is below the initial target, but M1/M3 must remeasure through native Tauri IPC before relying on the budget.
