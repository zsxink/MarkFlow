# P1B independent reviewer report

## Decision

**NO-GO — do not advance to P2.**

The happy-path gates pass and the lossless flag remains default-off, but the
current candidate has two reproducible P0 data-integrity defects and multiple
P1 protocol/gate defects. P1B's own design makes blocked/resync safety,
outcome-unknown reconciliation, restart reconciliation, and immutable evidence
non-waivable.

Finding count: **P0 2 / P1 6 / P2 2**.

## Findings

### P0-1 — blocked optimistic edits become clean and can be discarded

- Location: `src/lib/lossless/sourceSyncController.ts:245-246,292-294,352-354`;
  `src/lib/lossless/editorSurfaceBinding.ts:197-206`.
- Trigger: the first local edit is sent, all retries fail, and the controller
  enters `blocked` before any revision is confirmed.
- Impact: `sendFrame` clears `pendingCount`; retry exhaustion clears `inFlight`;
  confirmed revision still equals persisted revision. The binding's exact dirty
  predicate therefore returns false even though CodeMirror still contains the
  unsaved optimistic edit. Close/switch follows the clean path and may discard
  user text without a prompt. The independent harness reproduces
  `pipelineState=blocked` with `bindingDirty=false`.
- Fix: track an explicit unresolved-optimistic/blocked-dirty invariant independent
  of queue and in-flight handles. A blocked pipeline with optimistic text not
  proven equal to Core must remain dirty until recovery copy/export, successful
  resync, explicit discard, or safe close decision. Add binding-level close,
  switch, reload, and autosave tests for the first-edit failure case.

### P0-2 — resync applies the recovery diff twice and silently diverges UI/Core

- Location: `src/lib/lossless/sourceSyncController.ts:297-345`, especially
  `applyLocalChanges(diff)` at line 326.
- Trigger: Core rejects a patch with stale-revision, wrong-identity, or
  duplicate-mismatch; Core snapshot is `base`, while the already optimistic
  CodeMirror document is `Xbase`.
- Impact: the controller computes `base -> Xbase`, then dispatches that diff to
  the already-`Xbase` editor, producing `XXbase`; it sends only one `X` to Core,
  then reports idle/confirmed. The harness reproduces exactly `Xbase -> XXbase`.
  Queued `ChangeSet`s are also not cleared/rebased in this path, so later input
  can replay already-covered changes. This breaks the single-source invariant
  and can save different text from what the user sees.
- Fix: never apply `confirmed -> optimistic` to an editor that already contains
  optimistic text. Use it only as the new Core patch, while atomically replacing
  the controller's in-flight/queued bookkeeping with that recovery patch. If an
  editor reset is ever required, first reset to the confirmed snapshot and then
  apply the diff exactly once under a programmatic origin. Test against a real
  mutable CM document with edits arriving during resync.

### P1-1 — no request timeout exists; a lost/hung patch response blocks forever

- Location: `src/lib/lossless/sourceSyncController.ts:251-290` and
  `src/lib/lossless/sourceSyncController.ts:204-207`.
- Trigger: `applyPatch()` never settles rather than rejecting.
- Impact: the state remains `awaitingAck` indefinitely; `flush()`/Save can wait
  forever and the declared retry policy never starts. While in flight,
  `forceFlushNow()` returns, so `pendingChangeCap` does not actually bound edits
  queued behind the hung request. The harness remains `awaitingAck` after 250 ms.
  Existing tests cover immediate rejection/backoff, not timeout.
- Fix: add a real per-attempt deadline around invoke, retry the same transaction
  ID on deadline, then enter blocked after the frozen retry count. Cancellation
  must invalidate late responses. Enforce the queue cap while in flight and add
  fake-time plus real-dispatcher lost-response tests.

### P1-2 — prepared save authority is not bound to target identity; operation ID permits path traversal

- Location: `src-tauri/src/lossless/guarded_write.rs:100-170,401-425,471-472`;
  `src-tauri/src/lossless/dto.rs:206-218`.
- Trigger: reuse a prepared operation with the same payload hash but a different
  request path or expected identity; or pass a save operation ID containing path
  components such as `../../name`.
- Impact: `record_prepared` and `guarded_atomic_write` compare only payload hash.
  The write uses `req.path`/`req.expected_file_identity`, not the receipt's
  recorded target/identity, so a payload prepared for A can be written to B.
  `receipt_path_for` directly joins the caller-controlled operation ID, allowing
  receipt JSON to escape the receipt directory. The receipt also lacks
  session/document/revision/new identity, so commit cannot cryptographically or
  structurally prove it is committing the operation that wrote that revision.
- Fix: strictly validate operation IDs (UUID or fixed safe alphabet) and derive
  receipt filenames from a hash. Bind session ID, document ID, binding/save
  revision, canonical target/path hash, expected identity, payload hash, new
  identity, and recovery path in the durable receipt. The guarded command must
  treat the receipt as authoritative and reject every request/receipt mismatch;
  commit must verify the same binding and receipt state.

### P1-3 — true commit-response loss cannot reconcile; Save As recovery does not rebind path

- Location: `src-tauri/src/lossless/guarded_write.rs:386-390`;
  `src/lib/lossless/editorSurfaceBinding.ts:339-363,424-433`;
  `src/lib/lossless/lifecycle.test.ts:177-205`.
- Trigger: backend `commit_document_save` succeeds and marks the receipt
  Committed, but its response is lost; or a Save As write/commit lands and the
  frontend catches a lost response.
- Impact: Rust returns `state=committed` with `newFileIdentity=None`, while the
  frontend only converges if `newFileIdentity` is present. The session remains
  dirty with the old expected identity, so the next save can misclassify its own
  successful write as external conflict. For Save As, even a successful
  `reconcileOutcomeUnknown` updates only identity/revision; it never sets
  `this.path=targetPath`, leaving the binding attached to the old path. The
  current test throws before mutating backend receipt/session state, so it models
  a lost commit request, not a lost commit response.
- Fix: persist and return `newFileIdentity` for Written and Committed receipts;
  make reconcile return the bound session/document/revision. Give Save As a
  recovery context that includes target path and rebind it after verified
  reconcile. Add a test double that commits state first and rejects only the
  response, plus real dispatcher tests for both write-response and
  commit-response loss.

### P1-4 — restart receipt reconciliation is explicitly not implemented

- Location: `src-tauri/src/lib.rs:417-441`;
  `validation/phases/P1B.md:25,67-72`;
  P1B design `design/phases/P1B-source-vertical-slice.md:49,99`.
- Trigger: application restarts with Prepared, Written, or Conflict receipt.
- Impact: startup only logs receipts and does not reconcile or block the related
  path before autosave. In a replace-time conflict, the target may contain the
  app payload while the external version is held in recovery; reopening and
  autosaving without resolving that state violates the explicit restart safety
  requirement. The phase record itself leaves this mandatory case unchecked but
  calls it nonblocking.
- Fix: persist a path-level unresolved-operation gate. On startup classify each
  receipt against disk/recovery, and prevent open/autosave/write for that target
  until it is reconciled or explicitly resolved. Cover restart after each
  receipt state in real filesystem/dispatcher tests and at least one desktop
  workflow.

### P1-5 — explicit pasted CRLF/CR provenance is discarded

- Location: `src/lib/lossless/sourceSyncController.ts:237-243,334-339`;
  no lossless paste/clipboard provenance handler exists.
- Trigger: paste text containing explicit CRLF or CR into the lossless Source
  editor, especially into a mixed-EOL document.
- Impact: every inserted newline is labeled `inherit`, so Core cannot preserve
  the pasted newline types required by the frozen byte/EOL contract. Core unit
  tests prove explicit provenance when supplied, but the product bridge never
  supplies it.
- Fix: capture the raw clipboard/drop text before CodeMirror normalizes it,
  annotate each inserted logical newline as explicit LF/CRLF/CR, and carry that
  annotation through composed batches/resync. Add desktop paste + save + reopen
  byte tests for CRLF, CR, mixed, CJK, and emoji payloads.

### P1-6 — P1B evidence and completion claims are internally invalid

- Location: `validation/phases/P1B.md:3,9-11,23-25,59-64`;
  `tasks.md:61`; historical run
  `validation/evidence/P1B/20260814-p1b-core-bridge-06c4b0a`.
- Trigger: verify the historical manifest on current HEAD and compare phase/task
  claims with the actual test matrix.
- Impact: the manifest fails because commit `935195d` edited historical
  `RUN.md` without creating a new immutable run. The phase says manifest passed,
  records candidate `06c4b0a`/Run ID `NOT RECORDED`, and marks task 3.9 complete,
  while its own mandatory race/lost-response/restart row remains unchecked. The
  current desktop suite has six happy-path tests and none of those injections.
  Therefore the evidence cannot authorize a P1B Go even apart from code defects.
- Fix: never mutate the sealed historical run. Create a new candidate run at the
  post-fix SHA, store exact failure-injection outputs, generate a fresh manifest,
  and update phase/tasks only after the new independent review passes.

### P2-1 — blocked/conflict autosave is counted as a write failure

- Location: `src/lib/lossless/editorSurfaceBinding.ts:265-269`;
  `src/lib/lossless/integration.ts:94-95`; `src/main.ts:221-229`.
- Trigger: autosave tick while the lossless pipeline is blocked.
- Impact: the binding returns `failed`; the autosave coordinator increments
  `autosaveErrorCount`, contrary to the spec that blocked/resync/conflict are
  structured skips. Repeated ticks can present escalating write-failure state
  for a synchronization block.
- Fix: return a structured `blocked`/`conflict` skip distinct from I/O failure;
  only increment the error counter for actual flush/prepare/write/commit errors.

### P2-2 — successful catch-path reconciliation still reports failure

- Location: `src/lib/lossless/editorSurfaceBinding.ts:328-333,339-363`.
- Trigger: a write response is lost, reconcile proves the write and commits the
  revision successfully.
- Impact: the method still increments the interactive error counter and returns
  `failed`, even though it has just made the document clean. UI and logs report a
  false failure and callers may refuse a transition that is already safe.
- Fix: make reconciliation return a typed outcome (`persisted`, `not-written`,
  `conflict`, `unknown`) and map verified persisted to `saved`/`reconciled` without
  incrementing write errors.

## Verified positives

- `losslessCoreSession` is default-off and the happy lossless open/edit/save path
  uses Core + dedicated CodeMirror without calling the legacy serializer.
- Legacy owner remains available when the flag is off; lossless WYSIWYG switching
  is blocked rather than hydrating ProseMirror.
- Core transaction-ID high-water logic is implemented, rejects evicted ID reuse,
  and resets on reload/close; Core tests pass.
- Core byte fixtures, ordinary desktop Source edit/save/reopen, TypeScript,
  frontend, Rust, build, and OpenSpec gates pass on the audited HEAD.
- macOS guarded replacement uses an atomic exchange and verifies displaced
  content hash; ordinary external modification is rejected in tested paths.

## Required re-review gate

After fixes, require a fresh immutable run at one exact SHA with:

1. the three adversarial SourceSync cases green against a real mutable CM view;
2. blocked close/reload/A-to-B recovery and dirty invariants;
3. true timeout and late-ack injection;
4. operation/path/identity mismatch and malicious operation-ID rejection;
5. write-response and commit-response loss after backend state mutation;
6. Save As response-loss rebind;
7. startup Prepared/Written/Conflict reconciliation and autosave blocking;
8. explicit LF/CRLF/CR paste provenance desktop bytes;
9. full normal gates, lossless desktop E2E, and a zero-mismatch manifest.

Until those pass, keep `losslessCoreSession=false` and do not start P2 work.
