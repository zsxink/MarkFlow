# P1B save-epoch corrective independent review

## Verdict

**NO-GO. Do not enter P2 yet.**

The two previously reported P0 lifecycle races are closed by the current
candidate: prepared receipts bind a non-resampled `saveEpoch`; reload/close and
the native exchange/create or receipt+Core commit share the per-session
lifecycle mutex; failed reload revokes the old epoch; and deterministic Rust
tests cover revoke-first and writer-first linearization. The corrupt/old-schema
receipt path also remains write-blocking and now exposes an explicit durable
quarantine action.

However, two independently reproduced P1 failures remain in P1B behavior.

## Findings

### P1 — editing at a pending paste boundary loses explicit EOL provenance

- Location: `src/lib/lossless/editorSurfaceBinding.ts:196-231`, especially
  `mapPasteProvenance` at lines 223-229 and the `logicalText` index lookup at
  lines 203-213.
- Trigger: paste text containing CRLF or CR, then—within the same batch or
  before a stale-resync—type at the start of the pasted range. For example,
  paste `a\r\n` (CM stores `a\n`) and immediately type `x` at offset 0.
- Evidence: the independent harness maps the paste span `[0,2]` to `[0,3]`,
  not `[1,3]`. The composed insertion is `xa\n`; calculating the newline index
  against the unchanged `logicalText='a\n'` yields no matching ending, so the
  bridge falls back to `inherit` instead of `crlf`.
- Actual impact: a normal rapid edit can silently persist the pasted newline in
  the document's inherited/dominant EOL family rather than its clipboard byte
  family. This violates P1B's explicit paste provenance and byte-fidelity
  contract.
- Recommended fix: model provenance as mapped per-newline annotations (or at
  minimum use non-expanding range boundary associations and update/split the
  provenance payload when edits intersect it). Add tests for insertion at both
  boundaries, deletion/replacement inside the pasted span, multiple pasted
  newlines, and stale-resync after each mutation.

### P1 — failed reload permanently disposes the active synchronization pipeline

- Location: `src/lib/lossless/editorSurfaceBinding.ts:560-598` and
  `src/lib/lossless/integration.ts:268-285`.
- Trigger: reload starts, then the Host read/parse fails—for example the file is
  deleted, permissions change, or bytes become invalid immediately before the
  reload command reads them.
- Evidence: `reload()` calls `controller.dispose()` and clears every pending
  queue before awaiting `reload_lossless_document`; the independent injected-I/O
  harness proves that the rejected call leaves that disposed controller in the
  still-active binding. The integration catch only returns `false`.
- Actual impact: the old editor remains visible and registered as the active
  lossless document, but later edits cannot enter Core and save/flush returns a
  disposed/failed outcome. The user is left in a misleading, non-operational
  document session and may need to close/reopen to recover.
- Recommended fix: make frontend reload transactional. Freeze input during the
  Host transition, but do not irreversibly dispose the old controller/queues
  until Host reload succeeds. On failure, restore or rebuild a live controller
  from the unchanged Core session and retain truthful dirty/blocked state. Add
  clean reload-failure and dirty-discard reload-failure lifecycle tests,
  followed by edit/flush/save recovery assertions.

## Confirmed closures

- P0 save/reload/close TOCTOU: closed at native replace/create and commit
  linearization points.
- Old/corrupt receipt: recovery-only Source UI, no writable legacy fallback,
  guarded legacy `write_file`, durable quarantine action.
- Receipt-less or stale-epoch commit: rejected.
- Unicode scalar diff and net-zero reconciliation: candidate unit tests pass.
- Normal and immediate stale-resync paste cases: pass; the remaining defect is
  the subsequent boundary-edit mapping case above.
- Full unit/Core/Tauri/type/build/byte/OpenSpec gates and real desktop happy
  paths: pass.

## Merge/stage recommendation

Do not merge, archive P1B, or start P2. Fix both P1 findings, add the missing
regressions to product tests, rerun all gates on the new exact candidate, then
commission another independent Reviewer.
