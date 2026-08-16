# P1B corrective repair record

## Scope and status

This run records an uncommitted corrective candidate following independent
review `20260815-p1b-independent-review-935195d`. It is implementation and
automated-validation evidence only. It does **not** change P1B phase status,
task 3.11, Program Owner status, or human acceptance status.

## Corrected findings

| Review finding | Corrective result | Automated proof |
| --- | --- | --- |
| P0-1 blocked optimistic edit became clean | `SourceSyncController` retains an explicit unresolved-optimistic invariant; binding dirty includes it; blocked reload requires an explicit discard decision. | real CodeMirror lifecycle test plus controller cap/retry tests |
| P0-2 resync duplicated the diff | resync builds one fresh Core patch from confirmed→optimistic text and clears covered pending bookkeeping; it never redispatches that diff into the already-optimistic editor. | mutable `Xbase` resync test |
| P1-1 hung patch request | each attempt has a deadline, retries reuse transaction ID, and stale/late replies are ignored by attempt generation; queued input reaches a bounded blocked recovery state. | timeout/late-ack/cap tests |
| P1-2 receipt authority / path traversal | durable receipts bind session, document, revision, canonical target, expected/new identity, payload and recovery metadata; guarded write treats the receipt as authority; operation IDs are UUID-validated and receipt/temp filenames are hashed. | Rust dispatcher adversarial tests |
| P1-3 response loss / Save As | Written and Committed reconcile return identity; successful reconcile reports saved; Save As rebinds both binding and active registry. | write-loss, commit-loss, Save As response-loss tests |
| P1-4 restart receipt handling | startup classifies Prepared/Written/Conflict and creates a persistent Host path gate for open/prepare/write; unreadable/old receipt schema blocks save rather than being ignored. | Rust receipt classification and corrupt-receipt tests |
| P1-5 paste EOL provenance | browser paste captures raw text before CodeMirror normalizes it; bridge patches carry explicit LF/CRLF/CR provenance. | LF/CRLF/CR/mixed CJK+emoji lifecycle cases; Core EOL tests |
| P2 autosave/reconcile reporting | blocked/conflict are typed safe skips; only real failures increase write error count; successful reconciliation returns saved. | lifecycle and autosave tests |

## Residual gate

Desktop WDIO lossless E2E is **BLOCKED**, not passed: the local environment
does not have `tauri-driver`. See `logs/desktop-e2e.log`. No test result from
that run may be used to authorize P1B Go.
