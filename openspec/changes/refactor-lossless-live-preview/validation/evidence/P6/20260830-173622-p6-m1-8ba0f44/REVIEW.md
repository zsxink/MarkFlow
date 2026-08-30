# Independent Review — P6 M1 (hidden-marker substrate + heading/thematic break)

- Reviewer: Independent static walkthrough + gate re-run (fresh context, no implementation chat).
- Candidate commit: `6557c06` (HEAD of `test/issue-255-lossless-byte-contract` at review time).
- Run dir: `validation/evidence/P6/20260830-173622-p6-m1-8ba0f44/`.
- Re-run basis: clean `git checkout --detach 6557c06`, `node v22.22.2`, deps from lockfile.

## Verdict: **FAIL** (1 blocker; 5 minor/nit follow-ups)

The **production mechanism is compliant** with ADR §2/§3 and design §9.1/§9.2/§9.3/§9.7: hidden markers use ONLY `Decoration.replace(...)` + `EditorView.atomicRanges`, the source `EditorState.doc` is never rewritten/serialized, the visibility resolver is the sole owner of `hidden`, rollback degrades to `dimmed`/`source` without touching bytes, empty headings stay discoverable, and composition forces reveal. **However the delivered test harness breaks two required validation gates** (C01, C03) on a clean checkout, and the one broken test is the test that asserts the headline ADR §2 contract — so the AI gate's claimed GREEN is **not reproducible**. That is a merge-blocking defect.

## Gate re-run results (exit code + count)

| Gate | Command | Result | Count |
| --- | --- | --- | --- |
| C01 | `npx vitest run src/lib/lossless/projection.test.ts` | **FAIL** (exit≠0) | 47 tests · 46 passed · **1 failed** (the ADR §2 atomicRanges-facet test) |
| C02 | `npm test` | **FAIL** (exit≠0) | 858 tests · 857 passed · **1 failed** (same test as C01) |
| C03 | `npx tsc --noEmit` | **FAIL** (exit≠0) | 1 error: `TS1361` at `src/lib/lossless/projection.test.ts:1401` |
| C08 | `npm run test:byte-contract` | PASS (exit 0) | L0 positive 24/24, negative 23/23; L1 positive 95/95, negative 93/93 |
| C09 | `npx openspec validate refactor-lossless-live-preview --strict` | PASS (exit 0) | "Change 'refactor-lossless-live-preview' is valid" |
| C10 | `npx openspec validate --all` | PASS (exit 0) | 61 passed, 0 failed |
| build / e2e | (skipped per protocol — no product type/build suspicion; the type error is confined to a `*.test.ts` file excluded from the Vite app build) | — | — |

**Note on divergence from RUN.md:** the implementation AI recorded C01 PASS (43), C02 PASS (854), C03 PASS. On the candidate commit `6557c06`, C01/C02/C03 are all RED. The suite also grew to 47/858 tests (the M1 additions), so the AI's recorded counts do not match the committed artifact either.

## Findings

### Q1 — BLOCKER — test import bug breaks `tsc` and the ADR §2 contract test (not reproducible GREEN)
- **Location:** `src/lib/lossless/projection.test.ts:126` (`import { runScopeHandlers, type EditorView } from '@codemirror/view';`) vs `:1401` (`view.state.facet(EditorView.atomicRanges)`).
- **Observation:** `EditorView` is imported as a *type-only* binding but used as a *runtime value* at line 1401. Consequences, both deterministic on a clean checkout:
  1. `tsc --noEmit` (validation gate C03) fails with `TS1361: 'EditorView' cannot be used as a value because it was imported using 'import type'`.
  2. esbuild elides the type import, so at runtime `EditorView` is `undefined` → the test `hiddenAtomic is published through the EditorView.atomicRanges facet (ADR §2)` throws `ReferenceError: EditorView is not defined` and **never executes**.
- **Impact:** This is exactly the test that proves the central ADR §2 mechanism (the hidden marker range is reachable through `EditorView.atomicRanges`, and reveal clears atomicity). With it throwing, the headline M1 contract is **unverified by the suite as committed**, and the hard `tsc` type gate is broken (CI would fail). The production code itself imports `EditorView` as a value (`projection.ts:28`) and uses the facet correctly, so this is a *test-harness* defect, not a product-logic defect — but it blocks Go because the two gates are RED and the evidence is not reproducible.
- **Recommended action:** change line 126 to `import { runScopeHandlers, EditorView } from '@codemirror/view';` (drop `type`), then re-run C01/C03 (and C02) to green. Only after that does the ADR §2 facet-publish test actually exercise the contract; keep it as a required gate.

### Q2 — MINOR — `thematicBreak` owner is inconsistent between registry and effective rendering
- **Location:** `src/lib/lossless/renderOwnerRegistry.ts:131` (`thematicBreak: 'source-fallback'` + comment) and `src/lib/lossless/projection.test.ts` FALLBACK_KINDS; vs `src/lib/lossless/projection.ts:220-222` (classify early-returns `{ cls: hr }` when `isLivePreviewProjectionOn('thematicBreak')`).
- **Observation:** `classifyLezerNode` special-cases `thematicBreak` and renders it as a local construct (rule) when the projection flag is ON, **bypassing** `resolveConstructOwner('thematicBreak').owner !== 'local'`. So the registry's `'source-fallback'` is never consulted for thematic-break rendering. No current functional bug (grep confirms no other production code reads `owner === 'local'` for `thematicBreak`), but the registry comment "P6 M1 promotes it to a local projected construct … gated in projection.ts classify" **overclaims**: the registry owner is never actually promoted to `'local'`; the value stays `'source-fallback'` even while the construct is rendered locally. This diverges from the ADR §3.3 "exactly one owner per kind" principle and is a latent maintainability landmine.
- **Recommended action:** either (a) set `thematicBreak: 'local'` in `DEFAULT_OWNERS` and let `classify` gate it on the flag (so the registry truthfully reflects effective ownership), or (b) keep `'source-fallback'` but reword the comment/test to state it is the *default-OFF baseline only* and that `classify` special-cases the kind. Reconsider whether `FALLBACK_KINDS` should list a kind that becomes local under a flag.

### Q3 — MINOR — revealed thematic break is still styled as a rule, hiding the editable source
- **Location:** `src/styles/editor.css:758-769` (`.mf-hr { display:block; height:0; border-top:2px solid; … }`) applied to any `mf-hr` span, including the *revealed* construct mark (`mf-construct mf-hr mf-active`).
- **Observation:** When the caret enters a thematic break it enters `revealed` state (verified by test), but the CSS still turns the `---`/`***`/`___` source into a 0-height rule box, so the raw characters are visually obscured and an edit like `---`→`***` is not visible. This is a source-only-UI limitation for the revealed state (no true data loss — `doc` bytes are intact and textContent is correct).
- **Recommended action:** scope the rule styling to the hidden/widget case only (e.g. `.mf-hr:not(.mf-active)`, or restrict to the `ThematicBreakWidget` span), and let the revealed construct show the raw source. Track under the PENDING-MANUAL visual baseline.

### Q4 — MINOR — `hiddenAtomicRanges` module singleton (latent cross-editor pollution)
- **Location:** `src/lib/lossless/projection.ts:254` (`let hiddenAtomicRanges`) reset on every build (`:692`), constructor (`:715`), update-degrade (`:751`), `destroy()` (`:761`), `resetProjectionSnapshot`/`setProjectionDisposed`.
- **Observation:** The closure is correctly reset on every build and on teardown, so mode-switch / document-reload / reconfigure do not leak ranges. However it is a **module-level singleton shared across all EditorViews** that mount `projectionExtension` — the same pattern as the pre-existing `lastSnapshot` singleton. If more than one projected editor were ever mounted concurrently they would overwrite each other's published atomic ranges. Acceptable for the current single-surface editor, but a latent risk worth a note.
- **Recommended action:** accept for M1 (single surface); add a comment that both `hiddenAtomicRanges` and `lastSnapshot` are process singletons tied to one live editor, and revisit if multi-editor projection is ever introduced.

### Q5 — MINOR/NIT — "no doc transaction" test overclaims vs what it asserts
- **Location:** `src/lib/lossless/projection.test.ts` (test `hidden marker production does not create a doc transaction (History / bytes stable)`).
- **Observation:** The test asserts `doc.toString()` and `doc.length` are equal before/after `setMode('preview')` + a selection dispatch, and `snapshot.state === 'rendered'`. It does **not** assert that no `Transaction` was dispatched or that `History` is empty (a selection-only transaction is still a transaction). The underlying guarantee holds because `buildDecorations` never dispatches, but the test name/assertions should match the claim.
- **Recommended action:** tighten to assert no `docChanged` transaction occurred (count transactions or assert `!any(t => t.docChanged)`), so the "no doc transaction / no History entry" claim is actually proven.

### Q6 — NIT — flag toggle does not force a rebuild until the next interaction
- **Location:** `src/lib/lossless/livePreviewFlags.ts` (`setLivePreviewProjection`/`setLivePreviewHidden`); consumed in `buildDecorations` (`:649`).
- **Observation:** The hidden/projection switches are read inside `buildDecorations`, which only runs on doc/viewport/selection/composing updates. Toggling a flag while the editor is idle does not itself dispatch a transaction, so the view won't update until the next keystroke/selection. All M1 tests dispatch a selection after toggling, so the behavior is covered in tests, but a real settings toggle with no follow-up interaction would not re-render immediately.
- **Recommended action:** have the settings toggle path dispatch a benign selection/reconfigure transaction to force a rebuild, or document the dependency.

## Compliance verification (positive)
- Hidden markers: heading uses `Decoration.replace({})` (no widget, no class) + `EditorView.atomicRanges` (`:318`, `:692`, `:782`); thematic break uses `Decoration.replace({ widget, atomic:true })` — the read-only placeholder is explicitly sanctioned by ADR §3 ("空 construct 可使用只读 placeholder/glyph，但 placeholder 不是正文") and carries no source/user text (`:261-274`, empty `<span>`). No `doc` rewrite, no serializer, no CSS zero-width marker. ✓
- `hidden` is produced ONLY when `hiddenRequested` (P6-capable kind) AND `isLivePreviewHiddenOn(kind)` (per-construct `.hidden` switch on) — `projection.ts:446-449`. P4B-only kinds never hide. ✓
- Rollback: turning `.hidden` OFF → `dimmed`; construct OFF → source; `doc`/History/dirty/revision/bytes unchanged (test `rollback …` + `hidden marker production does not create a doc transaction`). ✓
- Empty heading: `buildHiddenConstruct` returns `'visible'` for empty heading (`:315`) and the call site resets `range.visibility` (`:664-665`); no atomic span, no vanish. ✓
- Composition: `resolveConstructVisibility` reveals the adjacent construct under `composing` (`:436-441`); distant construct stays hidden. ✓
- `hiddenAtomicRanges` reset on every build + teardown (Q4). ✓
- No data loss, no network/SSRF, no XSS (no `innerHTML`/user text in DOM), no selection trap verified (reveal path clears atomicity at one-char approach — the broken test Q1 was *meant* to assert this; once fixed it should confirm).

## Continuity
No prior `REVIEW.md` exists in this run dir (fresh independent review). No carry-over items.
