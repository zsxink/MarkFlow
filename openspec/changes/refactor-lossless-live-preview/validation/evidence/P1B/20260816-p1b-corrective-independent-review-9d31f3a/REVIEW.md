# P1B corrective independent reviewer report

## Decision

**NO-GO — do not advance to P2.**

The candidate closes the original blocked-dirty and duplicate-resync P0s and
passes every normal automated gate, but it still contains three actionable P0
data-integrity defects and four P1 protocol/recovery defects. Finding count:
**P0 3 / P1 4 / P2 1**.

## Findings

### P0-1 — `commit_document_save` can mark unsaved Core text persisted without any receipt or disk write

- Location: `src-tauri/src/lossless/dto.rs:142-150`;
  `src-tauri/src/lossless/mod.rs:402-428`;
  `src-tauri/src/dispatcher_contract.rs:516-570`.
- Trigger: invoke `commit_document_save` with `saveOperationId=None`, a current
  session/document and any revision not greater than the current Core revision.
- Actual impact: receipt validation is conditional on `Some(op_id)`. The existing
  dispatcher test edits Core from `body` to `BODY`, performs no guarded write,
  passes `None`, and successfully marks revision 1 persisted using the identity
  of the still-old disk file. Dirty becomes false while disk and Core differ.
- Suggested fix: make `saveOperationId` required for every lossless commit; reject
  missing IDs; require a `Written`/matching durable receipt before mutating Core.
  Replace the current positive bypass test with a negative test proving disk/core/
  persisted state remain unchanged when the receipt is absent or mismatched.

### P0-2 — non-macOS Save As can overwrite a target created at the replace instant

- Location: `src-tauri/src/lossless/guarded_write.rs:179-186,245-253,872-888`.
- Trigger: on Linux, Save As prepares an absent target, then another process
  creates that path after the precheck and before `create_if_absent`.
- Actual impact: the non-macOS fallback calls `std::fs::rename(tmp, target)`.
  POSIX rename replaces an existing destination, so it is not create-if-absent.
  The external file can be silently overwritten, violating the explicit
  no-replace requirement. Windows behavior does not make the shared Linux path
  safe.
- Suggested fix: implement platform-specific no-replace primitives (Linux
  `renameat2(RENAME_NOREPLACE)`, Windows create/move semantics that fail if the
  destination exists), or return `unsupported-platform` and force Save Copy.
  Add target-race integration tests on each supported OS.

### P0-3 — a prepared save is not invalidated by reload and can persist the wrong generation

- Location: `src/lib/lossless/editorSurfaceBinding.ts:290-371,484-521`;
  `src-tauri/src/lossless/dto.rs:206-231`;
  `src-tauri/src/lossless/mod.rs:374-431`;
  `markflow-core/src/session.rs:231-255,478-496`.
- Trigger: pause save after prepare, explicitly discard/reload the same binding,
  edit the reloaded generation back to the same numeric revision, then allow the
  old guarded write/commit to finish.
- Actual impact: reload keeps session/document IDs, resets revision to zero, and
  does not wait for or invalidate `saving`. Receipt/commit authority carries no
  lifecycle epoch. The old payload can be written and its revision can match the
  new generation numerically, causing different current text to be marked
  persisted. Even without the second edit, a late old save can write content the
  user explicitly discarded by reload.
- Suggested fix: serialize reload/close/Save As against the save coordinator and
  invalidate outstanding operations on generation change. Bind prepare, receipt,
  reconcile and commit to a save epoch/binding generation (or allocate a new
  document identity on reload), and add delayed prepare/write/commit tests across
  discard-reload and close.

### P1-1 — guarded write deletes the displaced original before the Written receipt is durable

- Location: `src-tauri/src/lossless/guarded_write.rs:212-275,705-733`.
- Trigger: atomic exchange succeeds and the displaced identity matches, but
  deleting the displaced temp is followed by a receipt update/rename failure or
  process crash.
- Actual impact: line 243 removes the old target before line 258 durably advances
  the receipt. If receipt persistence fails, the command returns failure with the
  disk already changed, the receipt can remain Prepared, and no recovery copy
  remains. Receipt replacement also fsyncs the file but not its parent directory,
  so crash durability of the receipt name is not established.
- Suggested fix: keep the displaced file until the Written receipt (including new
  identity and recovery path) is fsynced and the receipt directory is fsynced;
  then delete/finalize recovery with another durable state transition. Fsync the
  target parent after exchange/create and inject receipt-write/crash failures.

### P1-2 — resync loses explicit paste EOL provenance and leaves stale provenance queued

- Location: `src/lib/lossless/editorSurfaceBinding.ts:157-203`;
  `src/lib/lossless/sourceSyncController.ts:331-381`.
- Trigger: paste CRLF/CR text, then make the patch enter stale/wrong-identity
  resync before it is confirmed.
- Actual impact: normal batching attaches raw EOL provenance by string search,
  but resync discards queued ChangeSets and sends a new `diffText` result whose
  newlines default to `inherit`. `discardPendingChanges` does not clear or carry
  `pendingPasteProvenance`, so it can later attach stale metadata to unrelated
  text. The repaired normal-paste tests do not cover this path.
- Suggested fix: bind provenance to the exact CodeMirror transaction/change via
  annotation, retain it through rebase, and clear only metadata proven included
  in the replacement recovery patch. Add CRLF/CR/mixed paste + forced stale
  resync + save/reopen byte tests.

### P1-3 — Unicode resync diff can split a surrogate pair and always block recovery

- Location: `src/lib/lossless/sourceSyncController.ts:351-381,462-476`.
- Trigger: Core snapshot contains one astral character and optimistic text
  replaces it with another sharing the same high surrogate, e.g. `😀` → `😁`.
- Actual impact: the independent probe returns
  `{from:1,to:2,insert:'\\ude01'}`. Offset 1 is inside a UTF-16 surrogate pair;
  Core correctly rejects it as `invalid-boundary`. The controller retries this
  deterministic invalid patch and ends blocked rather than recovering the user's
  emoji edit.
- Suggested fix: move prefix/suffix boundaries to valid Unicode code-point/CM
  boundaries (and prevent overlap after adjustment), or derive recovery changes
  from CodeMirror `ChangeSet` mapping. Add astral replacement/deletion/insertion
  resync tests.

### P1-4 — a net-zero batch remains permanently dirty

- Location: `src/lib/lossless/sourceSyncController.ts:246-260`;
  `src/lib/lossless/editorSurfaceBinding.ts:224-235`.
- Trigger: user types and deletes within one batch window so composed pending
  changes are empty and the optimistic document again equals Core.
- Actual impact: `sendFrame` clears `pendingCount` and returns idle but does not
  clear `unresolvedOptimistic`. The binding stays dirty indefinitely, clean Save
  skips, and close/switch can keep prompting despite byte equality.
- Suggested fix: when composition is empty, prove `currentDoc` equals confirmed
  snapshot/hash before clearing the unresolved invariant; otherwise resync/block.
  Add real-CM type-delete, undo-to-base and multi-change cancellation tests.

### P2-1 — startup Written/Conflict gates are safe but have no product recovery path

- Location: `src-tauri/src/lossless/guarded_write.rs:457-581`;
  `src-tauri/src/lib.rs:417-448`.
- Trigger: restart with a valid Written or Conflict receipt.
- Actual impact: startup classification and open/prepare gates prevent unsafe
  autosave, which closes the prior safety finding, but the product only logs the
  operation ID. Opening the path is blocked and no UI enumerates/reconciles or
  resolves the receipt, so the lossless path can remain unavailable indefinitely.
- Suggested fix: expose a structured startup recovery list and explicit
  reconcile/compare/save-copy/resolve actions. Keep the current host gate until a
  terminal recovery decision is durably recorded.

## Verified closures and positives

- The original blocked-first-edit dirty hole is closed: unresolved optimistic
  text remains dirty and reload without explicit discard is refused.
- Stale resync no longer applies the same diff twice to CodeMirror in the normal
  ASCII path.
- Patch attempts have deadlines; retry reuses the transaction ID; late results
  are generation-filtered; the queue enters a bounded blocked state.
- Prepared receipts now bind target, expected identity, session, document,
  revision and payload; operation filenames are hashed and UUID input is checked.
- True write/commit response-loss and Save As rebind tests mutate backend state
  before the simulated response loss.
- Startup Prepared/Written/Conflict/corrupt receipts are classified and host
  gates prevent subsequent open/prepare writes.
- Normal LF/CRLF/CR paste provenance reaches Core; blocked/conflict autosave is a
  typed skip; successful reconciliation reports saved.
- The lossless path remains default-off and audited normal paths do not use
  `setMarkdown`, `getMarkdown`, `normalizeImageMarkdown` or the PM serializer.
- Existing corrective and desktop evidence manifests verify with zero mismatch.

## Required re-review gate

After repair, require a new exact-diff immutable run proving:

1. receipt-less commit is rejected and cannot clear dirty;
2. Linux/Windows/macOS Save As races use true no-replace or safe refusal;
3. delayed old-generation prepare/write/commit cannot cross reload/close;
4. receipt failure/crash after exchange retains a discoverable recovery copy and
   both target/receipt directory durability points are tested;
5. CRLF/CR paste survives forced resync with exact bytes;
6. emoji resync and net-zero batches converge correctly;
7. full frontend/Core/Tauri/byte/OpenSpec gates and real desktop lifecycle pass
   with zero-mismatch manifests.

Until then, keep `losslessCoreSession=false` and do not start P2.
