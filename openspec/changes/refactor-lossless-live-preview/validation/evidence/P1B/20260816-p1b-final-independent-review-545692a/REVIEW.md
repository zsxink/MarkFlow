# P1B independent final gate review

## Verdict

**NO-GO. Stop the P1B -> P2 gate.**

The ordinary unit/build/byte-contract/OpenSpec gates and the six desktop happy-path scenarios pass, but the frozen candidate still has two P0 integrity failures and six P1 gate failures. P1B task 3.11 must remain unchecked.

## Findings

### P0 — generation validation has a check-to-replace race

- Location: `src-tauri/src/lossless/guarded_write.rs:243-248,293-395`; `src-tauri/src/lossless/mod.rs:451-477`; `src/lib/lossless/editorSurfaceBinding.ts:504-554`.
- Trigger: a gen-0 save passes backend generation validation; before its atomic exchange/create, reload-with-discard or close advances/removes the session generation.
- Impact: the old gen-0 payload can still replace the file. Commit later rejects, but the explicitly discarded bytes have already reached disk.
- Evidence gap: the existing reload-generation dispatcher test reloads before guarded write starts; it does not place a barrier between generation check and exchange.
- Required fix: serialize guarded write/commit and reload/close using a per-session backend operation lease held through the replacement commit point. Frontend should also await/cancel an in-flight save, but backend enforcement is authoritative. Add deterministic barrier tests for reload and close after validation/before replace.

### P0 — ISSUE-005 fallback bypasses the unresolved-receipt safety gate

- Location: `src-tauri/src/lossless/guarded_write.rs:637-648`; `src/lib/lossless/integration.ts:83-112`; `src/components/sidebar/sidebar.fileops.ts:360-418,140-170`; `src-tauri/src/commands/files.rs:262`.
- Trigger: an old/corrupt receipt makes lossless open return `save-outcome-unknown`.
- Impact: frontend catches the safety error, silently restores writable WYSIWYG, then legacy `write_file` can overwrite the target without `ensure_target_reconciled`. The blank editor is avoided by disabling the safety boundary, not by resolving the crash state.
- Required fix: classify safety failures and never fall through to a writable legacy editor for unresolved/corrupt receipts. Show recovery UI or raw read-only Source; guard legacy writes against unresolved receipts while the dual path exists. Add open-failure -> legacy-save bypass coverage.

### P1 — Unicode resync diff splits surrogate pairs

- Location: `src/lib/lossless/sourceSyncController.ts:462-476`.
- Trigger: replace one astral Unicode character with another, e.g. `😀` -> `😁`.
- Impact: the recovery patch starts inside the UTF-16 surrogate (`from=1`) and is rejected as an invalid boundary, blocking resync.
- Reproduction: independent harness test 1 fails.
- Required fix: compute boundaries over Unicode scalar/code-point-safe offsets or derive a CodeMirror `ChangeSet`; add astral replacement/insertion/deletion cases.

### P1 — net-zero composed edits remain dirty

- Location: `src/lib/lossless/sourceSyncController.ts:246-260`.
- Trigger: a pending batch inserts and then deletes the same content before flush, composing to zero changes and returning exactly to confirmed bytes.
- Impact: unresolved optimistic state remains true indefinitely, causing false dirty/close prompts and blocking lifecycle operations.
- Reproduction: independent harness test 2 fails.
- Required fix: when composition is empty, compare the current document with the confirmed Core snapshot/hash and clear unresolved state only on equality.

### P1 — stale-resync loses explicit paste line-ending provenance

- Location: `src/lib/lossless/sourceSyncController.ts:351-375`; `src/lib/lossless/editorSurfaceBinding.ts:168-203`.
- Trigger: explicit CRLF/CR paste followed by stale revision or wrong-document-identity resync.
- Impact: recovery rebuilds the patch with `inherit`, so pasted bytes can be persisted with the wrong line-ending family.
- Reproduction: independent harness test 3 expects `crlf` and receives `inherit`.
- Required fix: attach provenance to the exact CodeMirror transaction/change and carry/rebase it through resync; avoid `indexOf`-based matching.

### P1 — post-exchange receipt failure does not expose the retained recovery copy

- Location: `src-tauri/src/lossless/guarded_write.rs:347-427,541-554`; startup recovery listing at `src-tauri/src/lossless/mod.rs:123-138`.
- Trigger: atomic exchange succeeds, then persisting the Written receipt fails.
- Impact: old bytes remain in the deterministic temporary path, but the Conflict receipt still has `recovery_path=None`; startup recovery cannot offer the retained copy through its structured API.
- Required fix: persist the recovery path and identities in the conflict transition; if receipt persistence also fails, discover deterministic recovery artifacts. Extend the dispatcher test to assert startup listing exposes the old copy.

### P1 — startup recovery is not connected to product UI

- Location: backend `list_startup_recovery` / `resolve_startup_recovery` registrations and tests; no caller under `src/`.
- Trigger: restart with a Written or Conflict receipt.
- Impact: the backend can enumerate/resolve recovery, but the user has no product surface to choose accept/compare/save-copy/discard. Preventing the unsafe legacy fallback would otherwise leave the document blocked.
- Required fix: wire startup enumeration and explicit resolution UI before enabling lossless by default; do not auto-resolve ambiguous states.

### P1 — phase and human evidence are not exact-candidate truthful

- Location: `validation/phases/P1B.md`; `validation/evidence/P1B/20260816-p1b-human-acceptance-uncommitted-e4981e3/HUMAN-ACCEPTANCE.md`.
- Trigger: using the phase header or human asset as the gate record for `545692a`.
- Impact: phase still reports an older conditional GO/candidate and human NOT STARTED; the human asset is tied to `e4981e3 + uncommitted`, unchecked, and lacks a manifest. It cannot establish exact-candidate acceptance.
- Required fix: after code correction, create fresh AI and human evidence bound to one clean immutable SHA, update phase/tasks truthfully, then request another independent review.

## Confirmed closures

Receipt-less commit is rejected; Save As uses no-replace primitives/refusal per platform; normal pre-write generation rejection, lost-response reconciliation, default-off flag behavior, serializer/ProseMirror isolation tests, corrupt-receipt nonblank fallback, and registered receipt list/resolve backend paths are present. These closures do not neutralize the findings above.

## Conditions to enter P2

1. Close both P0 paths with deterministic race and safety-bypass tests.
2. Make all three retained corrective harness cases pass without weakening assertions.
3. Surface retained crash recovery metadata and connect explicit startup recovery UI.
4. Rerun all gates and desktop E2E on one clean immutable candidate.
5. Record human UI acceptance against that exact candidate; a fresh independent reviewer must issue GO.

Recommendation: **do not merge, archive, or enter P2 yet.**
