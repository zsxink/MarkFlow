# P1B independent Reviewer report — candidate a16e575

## Verdict

**GO (conditional).** The candidate closes the two P1 findings that blocked
advancement, and adds the deterministic lifecycle-linearization tests the prior
reviews required. All unit/type/build/Core/Tauri/byte/OpenSpec gates pass, and
all four runnable desktop E2E suites (lossless, smoke, regression, p0s) pass on
a real macOS WebKit debug app. Remaining conditions are environment/tooling
(real `tauri-driver` WebDriver in `$PATH`) and the standing requirement that
Program Owner perform the manual acceptance.

## Review basis

- Fresh context; `git status` clean; branch `test/issue-255-lossless-byte-contract`.
- Base: `545692a` (last independently-reviewed candidate). Product+spec diff vs
  base recomputes to SHA-256 `8acf35673cf04b4d16990a8bd3300a363cd92ed5c3a5a4c07527f5b55268f96b`,
  byte-identical to the corrective run's recorded full-worktree diff SHA.
- The 14 changed product files are additive to the previously-reviewed core; no
  previously-passed path was removed.

## Closing the two P1 findings

### P1-1 — editing at a pending paste boundary loses explicit EOL provenance — PASS

The fix replaces the whole-paste range/string provenance with one **anchored
annotation per pasted logical LF**. `mapPasteProvenance` uses
`ChangeSet.mapPos(.., MapMode.TrackAfter)` on every doc-changing transaction, so
each anchor:

- follows its LF when text is inserted immediately before it (`TrackAfter`), the
  historical gap (typing at the start of a `[0,2]` CRLF span);
- keeps its LF family across internal edits;
- is **discarded** (`mapPos` → `null`) only when that actual LF char is
  deleted/replaced, preventing a stale clipboard family from leaking onto a
  replacement newline.

`bindRawPasteToTransaction` attaches a raw browser paste to the exact
CodeMirror transaction whose inserted text equals the normalized logical text;
`annotatePasteProvenance` then resolves each newline in composed and
confirmed→optimistic rebase changes by exact post-change position. The
`fromAfter` field carries the post-change anchor through the
confirmed→optimistic rebase diff into the controller's `annotateChanges` hook.

Product regression tests use a **real CodeMirror editor**: CRLF/CR paste
followed within one batch by start/internal/end typing, in-span deletion, a
composition transaction, and a forced stale resync — Core's bridge DTO retains
`[crlf, cr, crlf]`; drop-on-delete is covered. `markflow-core` EOL golden tests
additionally verify explicit DTO entries serialize to those source bytes.

### P1-2 — failed reload permanently disposes the active synchronization pipeline — PASS

`EditorSurfaceBinding.reload()` is now **transactional**:

- input is made read-only before the Host `reload_lossless_document` request;
- the existing controller and queued ChangeSets stay live until the Host
  successfully returns a new image;
- on any failure (`setReadOnly(false)` + `syncDirty()` + rethrow) the visible
  binding is restored writable **without** a disposed controller — subsequent
  edits re-enter Core, and save/flush/close still work.

Product regression tests cover both a clean reload read/parse failure (edit →
flush/save → close) and a dirty-discard reload failure (optimistic text remains
connected to the prior Core session; further edit and save succeed).

## Lifecycle linearization (the prior P0 review closure)

Holding the per-session lifecycle mutex across the native replacement and across
commit is now real, not sampled:

- `SaveOperationLease` (session/document/generation + **non-resampled epoch** +
  lifecycle `Arc<Mutex<()>>`) is captured at `prepare`, frozen into the durable
  receipt (`save_epoch`), and resumed only for that exact epoch.
- reload/close run `with_lifecycle_transition`, which bumps the epoch **inside**
  the lifecycle lock; a guarded write/commit must re-validate the exact epoch
  and identity under the same lock immediately before its native
  exchange/create.
- The deterministic `test_revoke_lease_before_replace` hook fires in exactly the
  historical check→exchange window, and the mpsc/barrier test proves a
  reload/close that loses the lifecycle race waits while a validated replacement
  owns the lock.

Dispatcher tests (real prepare/guarded-write/commit/reload/close, no invoke
mock) prove: failed-reload epoch revocation blocks both write and commit with
disk unchanged; replacement-point revocation never lands the discarded payload
and leaves **no** bogus recovery copy; a post-close prepare/write is refused;
old-schema receipt is quarantined durably and lifts the open gate.

## Recovery UI (P1-1 of the prior post-repair review) — PASS

`list_startup_recovery` now emits an `unreadable-receipt` structured item for
every undecodable receipt (stable UUID-shaped recovery id derived from the
receipt path, no path-join primitive over the WebView). `resolve_startup_recovery`
accepts `quarantine-invalid-receipt`, which renames the opaque receipt under
`receipts/quarantined-invalid/` and fsyncs both directories — it never guesses
the historical target/outcome. Product lifecycle tests assert the recovery-only
Source surface renders an explicit quarantine button (not auto-resolution).
The legacy `write_file` entry point additionally repeats `ensure_target_reconciled`,
so the escaped legacy fallback is refused while an unresolved receipt stands
(dispatcher test proves `save-outcome-unknown:`).

## Findings

- **P0: 0** — the two lifecycle P0 races are closed; the same linearization
  extends to commit via the exact-epoch resume + identity re-check inside the
  lifecycle lock.
- **P1: 0** — the two P1 findings above are closed with product regressions.
- **P2: 1** — `ENVIRONMENT.md`/`RUN.md` of this run records the desktop E2E
  runner must be invoked per suite (`smoke`, `regression`, `p0s`, `lossless`);
  a single `npm test` script does not run all four, so a CI-style "one command"
  coverage claim is weaker than a per-suite invocation. Not product-blocking.

## Conditions for P1B → P2

1. All four desktop E2E suites passed in this review on the real macOS WebKit
   debug app (embedded WebDriver, no `tauri-driver` binary needed). The standing
   requirement that Program Owner performs the manual acceptance checklist on
   the frozen candidate remains — the desktop suites do not replace the
   acceptance record.
2. Program Owner must record the manual acceptance result in `phases/P1B.md`
   before P1B is archived/GO is unconditional.

## Recommendation

P1B may advance to P2 once the Program Owner completes and records the manual
acceptance (the offline run is the only remaining gate). No further corrective
code is required by this review; P2 may treat the P2 note above as documentation
only.