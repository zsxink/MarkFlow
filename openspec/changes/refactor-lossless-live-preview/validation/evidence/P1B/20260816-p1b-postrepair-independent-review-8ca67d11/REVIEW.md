# P1B post-repair independent reviewer report

## Decision

**NO-GO — P1B cannot advance to P2.**

All ordinary frontend/Core/Tauri/byte/OpenSpec gates and the real macOS WebKit
6-scenario lifecycle pass. The corrective candidate also closes the prior
Unicode, net-zero dirty, paste provenance, legacy fallback, parseable receipt
recovery-path, and basic recovery-UI findings. It nevertheless leaves two
backend P0 consistency races and one actionable P1 recovery dead end.

Finding count: **P0 2 / P1 1**.

## Findings

### P0-1 — the save epoch check still has a check-to-replacement race

- Severity: P0, data integrity.
- Location: `src-tauri/src/lossless/mod.rs:135-195`;
  `src-tauri/src/lossless/guarded_write.rs:373-386,415-432`;
  `src-tauri/src/dispatcher_contract.rs:509-574`.
- Trigger: a guarded save calls `validate_save_lease()` successfully; reload or
  close then calls `invalidate_save_leases()` after that function returns but
  before `atomic_exchange()` / `create_if_absent()` executes.
- Actual impact: validation only loads an atomic epoch and returns. It holds no
  mutex/read guard across the native replacement. Revocation in the remaining
  interval cannot retract a completed validation, so an old-generation payload
  can still reach disk after the user chose reload/discard or close. Commit may
  later reject, but the forbidden write has already occurred.
- Evidence: the new dispatcher hook runs at guarded-write lines 379/416, before
  the line 380/417 validation. It proves only `revoke -> validate -> reject`.
  It cannot schedule `validate -> revoke -> atomic exchange`, which is the
  remaining interval. The production source has a plain function return between
  lines 380 and 383 (or 417 and 419) and no guard held across it.
- Suggested fix: add a real per-session lifecycle read/write gate. Guarded write
  must hold a save/read guard through the native exchange/create and durable
  Written receipt. Reload/close must take the exclusive lifecycle guard before
  revoking/reading/replacing/removing the session. Whichever operation acquires
  the gate first defines the order. Add barriers both immediately before and
  immediately after final validation for reload and close.

### P0-2 — commit can cross reload and terminalize the old receipt before rechecking generation

- Severity: P0, session/disk consistency and recovery-data loss.
- Location: `src-tauri/src/lossless/mod.rs:471-527,534-562`;
  `src-tauri/src/lossless/guarded_write.rs:654-676`.
- Trigger: `commit_document_save` snapshots `session_before_commit`; reload then
  advances the binding generation before `registry.update`; commit continues
  using the old snapshot's generation.
- Actual impact: `mark_committed()` durably changes the receipt to Committed and
  deletes its displaced recovery copy before the later registry mutation. That
  mutation rechecks only `document_id`, not `binding_generation`. At minimum the
  receipt/recovery can be finalized even though session persistence fails after
  reload. If the reloaded generation has reached the same numeric revision, the
  old receipt can also mark unrelated new-generation text persisted/clean.
- Suggested fix: synchronize commit with the same lifecycle gate and validate
  session/document/binding-generation/revision inside one registry mutation.
  Prefer the safe order `Written receipt -> exact-generation session persisted ->
  Committed receipt/recovery finalization`; a receipt-finalization failure must
  remain retryable and must not authorize another generation. Add deterministic
  old-commit vs reload tests where the new generation is at revision 0 and at the
  same numeric revision as the old save.

### P1-1 — corrupt or old-schema receipt opens a recovery UI with no recovery action

- Severity: P1, recoverability/product availability (the safety gate itself is
  correct and prevents data loss).
- Location: `src-tauri/src/lossless/guarded_write.rs:694-705,766-775`;
  `src-tauri/src/lossless/guarded_write.rs:147-166`;
  `src/lib/lossless/integration.ts:95-155`.
- Trigger: any `.json` receipt cannot be deserialized, including the old-schema
  receipt that motivated ISSUE-005.
- Actual impact: `receipt_store_has_corruption()` globally rejects open/write,
  while `scan_unfinished_receipts()` silently omits unreadable receipts.
  `list_startup_recovery()` therefore returns no corresponding item, and the UI
  renders only the blocking prose with no button or read-only document view.
  The user cannot resolve or quarantine the corrupt receipt in-product, so all
  lossless opens (and guarded legacy writes) can remain blocked indefinitely.
- Suggested fix: list corrupt receipt artifacts as structured recovery items
  using a stable artifact id/hash and parse error, offer an explicit
  quarantine/export/delete decision, and provide raw read-only Source access to
  the requested document while writes remain gated. Add an actual old-schema
  receipt product test asserting at least one usable recovery action.

## Confirmed closures

- Receipt-less commit is rejected.
- Save As uses native no-replace behavior or safe refusal.
- Unresolved parseable receipts cannot fall through to writable ProseMirror,
  and legacy `write_file` repeats the Host gate.
- Emoji resync boundaries, net-zero dirty convergence, and forced stale-resync
  CRLF/CR provenance pass.
- Post-exchange receipt failure retains and lists the displaced recovery copy.
- Parseable Written/Conflict receipts have explicit UI resolution actions.
- Normal lossless paths remain Source/Core-owned and default-off; real WebKit
  edit/save/reopen preserves the tested bytes.

## Required re-review gate

1. Hold a real lifecycle synchronization guard across replacement and commit,
   with deterministic both-side race tests for reload and close.
2. Make old-generation commit unable to terminalize a receipt or mark a new
   generation persisted.
3. Give corrupt/old-schema receipts an explicit product recovery action while
   retaining the no-legacy-fallback safety boundary.
4. Freeze a clean immutable candidate, rerun all gates and WebKit E2E, and obtain
   a fresh independent GO before marking P1B task 3.11 complete.

