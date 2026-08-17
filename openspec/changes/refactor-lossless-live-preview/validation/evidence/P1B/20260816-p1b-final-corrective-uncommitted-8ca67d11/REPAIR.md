# P1B final-review corrective repair

This repair addresses every P0/P1 code finding in the frozen `545692a` final
review. It does not claim that the uncommitted worktree has passed the P1B gate.

| Review finding | Corrective implementation and automated proof |
| --- | --- |
| P0 lifecycle TOCTOU, including reload failure | `LosslessSessionRegistry` has explicit capture/resume leases: prepare persists `saveEpoch`; write/commit must resume the exact epoch. `reload`/`close` hold the per-session lifecycle mutex across revoke and the full transition. Dispatcher covers replacement-point revocation, writer-first ordering, failed reload with unchanged generation, and actual close; stale bytes do not write or commit. |
| P0 unsafe legacy fallback | Recovery-only Source surface on unresolved safety errors; file-open caller refuses legacy fallback; `write_file` repeats `ensure_target_reconciled`; dispatcher proves legacy bypass fails. |
| P1 surrogate split | `diffText` compares Unicode scalar values while retaining UTF-16 offsets; emoji replacement, insertion and deletion tests. |
| P1 net-zero dirty | Empty composed frame fetches Core snapshot and clears optimistic state only on exact equality; otherwise rebase/block path remains authoritative. |
| P1 stale paste EOL | Raw EOL provenance attaches to the matching CodeMirror transaction range, maps through later transactions, and annotates resync diff; real-CM forced-stale test covers CRLF + CR. |
| P1 receipt recovery path | Error transition writes Conflict state plus deterministic recovery path and landed identity; startup listing test asserts it is visible. |
| P1 startup recovery UI | Structured list and explicit accept/discard actions are connected to a recovery-only Source surface; unreadable/old-schema receipts expose only a durable quarantine action. No automatic resolution. |
| P1 exact-candidate evidence | This new run binds base SHA plus product diff SHA and leaves phase/manual acceptance unmodified pending an immutable candidate. |
