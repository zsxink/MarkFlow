# P6 M1 Corrective Review — commit 4f010c3

**Reviewer:** independent code Reviewer (re-verification)
**Subject commit:** `4f010c3fd587081ebf1ee8a139ef999b970ce1fc` (HEAD of `test/issue-255-lossless-byte-contract`)
**Prior verdict on candidate 6557c06:** FAIL (Q1 blocker — `import type` of `EditorView` used as runtime value → TS1361 + runtime `ReferenceError`)

---

## Verdict: **PASS**

The Q1 blocker is resolved. `tsc --noEmit` exits 0 (no TS1361), and all 47 projection tests pass with the ADR §2 `atomicRanges` contract test genuinely executing (it previously never ran because esbuild erased the type-only import). Production logic is unchanged.

---

## Evidence

| Check | Command | Result |
|-------|---------|--------|
| Type-check | `npx tsc --noEmit` | **exit 0** — no TS1361, no errors |
| Unit tests | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | **47 passed**, exit 0 |
| atomicRanges contract | isolated `-t "atomicRanges facet"` | **1 passed** (46 skipped) — proves the test runs, not skipped |
| Commit scope | `git show 4f010c3 --stat` | 1 file changed: `src/lib/lossless/projection.test.ts` only (12 insertions, 8 deletions) |

### atomicRanges test — execution confirmation
- Test name: **`hiddenAtomic is published through the EditorView.atomicRanges facet (ADR §2)`** — `src/lib/lossless/projection.test.ts:1399`.
- It calls `view.state.facet(EditorView.atomicRanges)` at line 1405. With `EditorView` now a **value** import, this evaluates at runtime (no `ReferenceError`) and the assertion passes.
- File scan for `.skip`/`.todo`: **none** — all 47 are real, executed tests. The prior "green" gate was a stale-cache false-green; this run is `--no-cache` and thus authoritative.

### projection.ts value-import confirmation (production unchanged)
- `src/lib/lossless/projection.ts:28`: `import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view';`
- `EditorView` is imported as a **value** (not `type EditorView`) and is used at line 793: `EditorView.atomicRanges.of(() => hiddenAtomicRanges)`.
- `git show 4f010c3 --stat` confirms **`projection.ts` was NOT touched** by the corrective commit. The fix is test-only; production projection logic is byte-for-byte unchanged.

### Secondary type-as-value scan
- `tsc --noEmit` passing (exit 0) is itself conclusive: any `import type` used in a value position (e.g. `EditorView.atomicRanges`) raises **TS1361**, so none exists anywhere in the tree.
- Explicit enumeration of `import type` in `src/lib/lossless/**/*.test.ts` (p4bWidgets.test.ts, protocol.test.ts, structuralInteraction.test.ts, projection.test.ts, commandMatrix.test.ts) — all such imports (`EditorSelection`, `EditorState`, `ViewUpdate`, `SyntaxNode`, `Transaction`) are used only in type-annotation positions. No further misuse.

### Test selector fix (`span.mf-h1` → `span.mf-h`)
- The active hidden heading marker carries `mf-h` + `mf-construct mf-active` (expected specs at `projection.test.ts:141-146`; assertion at `:1137`), so the earlier fix to `span.mf-h` is **correct**.
- Remaining `span.mf-h1` usages at `:1111` and `:1213` are legitimate: they assert the non-active `decorationFor` path, which still emits level classes `mf-h1..mf-h6` (see test at `:313` "heading level classes (mf-h1..mf-h6) are applied (P2-A corrective)"). These are not the same defect and correctly pass.

---

## Q1 resolution
**Confirmed fixed.** The import at `projection.test.ts:126` changed from `import { runScopeHandlers, type EditorView }` to `import { runScopeHandlers, EditorView }`. `EditorView` is now usable as both type and value; `tsc` is clean and the `atomicRanges` contract test genuinely executes and passes. No production code affected.

> Note (discrepancy): The commit is reported as "ONLY changes the EditorView import," but the diff also renames and strengthens the Q5-related test (see below). This is test-only and harmless, but the "only the import" characterization is slightly inaccurate. Recorded for traceability; it does not affect the verdict.

---

## Q2–Q6 re-evaluation

- **Q2 (thematicBreak "promotes to local" comment):** **Nit** — `renderOwnerRegistry.ts:128-138` explicitly states `thematicBreak` stays `'source-fallback'` and is *not* promoted to the `'local'` *owner-registry value*; `projection.ts:217` says it is "promoted to a local projected construct" when the flag is ON. The two comments use "local" in different senses (registry owner value vs. locally-rendered construct). Functionally correct: when `livePreview.thematicBreak` is ON, `classifyLezerNode` returns `{ cls: mf-hr }` and the rule renders (verified by test `:1239` asserting `span.mf-hr:not(.mf-construct)` is present). Comment wording is ambiguous, not overclaiming; no functional impact.

- **Q3 (0-height `.mf-hr` rule hides editable `---`):** **Minor** — In revealed/source-only UI the themed rule can be invisible if its CSS height collapses, making the source `---` undiscoverable. Visual defect, not a gate failure. Recommend a manual UI check; not a blocker.

- **Q4 (`hiddenAtomicRanges` module singleton):** **Nit** — `projection.ts:265` is a module-level singleton, already documented as a single-surface limitation (`projection.ts:262-263`: "Revisit both singletons together if multi-editor projection is ever introduced"). Current app is single-surface; no concurrency today. Not a blocker.

- **Q5 ("no doc transaction" test):** **Nit (improved)** — The corrective commit renamed the test to `…does not create a doc-changing transaction` and now asserts `view.state.doc` **object identity** (`projection.test.ts:1288`: `expect(view.state.doc).toBe(docBefore)`). Because `EditorState.doc` is immutable and reused across every non-doc-changing transaction, this directly proves no `docChanged` transaction was dispatched (and therefore no History entry). Residual: it does not *explicitly* assert transaction count / `History.isUndoable`, but the identity check is strictly stronger than the old length/string compare. Substantially addressed; not a blocker.

- **Q6 (idle flag switch doesn't force rebuild):** **Nit** — Toggling `livePreview.*` flags while idle takes effect on the next interaction rather than forcing an immediate re-decorate. Acceptable design behavior for a default-OFF feature; not a blocker.

---

## New issues found
1. **Commit-scope discrepancy (informational):** `4f010c3` changes more than the `EditorView` import — it also rewrites the Q5 test (rename + object-identity assertion). Harmless and arguably beneficial, but the "only the import" claim in the commit description is inaccurate. Logged above; no action required for this verdict.
2. **"local" terminology ambiguity (doc):** The dual meaning of "local" between `renderOwnerRegistry.ts` (owner value) and `projection.ts` (rendered construct) could mislead a future maintainer into "fixing" `thematicBreak` to `'local'` in the registry — which the comment at `renderOwnerRegistry.ts:136-137` explicitly warns against. Suggest a one-line clarifying note. Folded into Q2; not blocking.

---

## Gate summary
- `tsc --noEmit`: PASS (exit 0)
- `vitest` projection suite (`--no-cache`): PASS (47/47)
- ADR §2 `atomicRanges` contract: PASS (executes + passes)
- Production `projection.ts` integrity: PASS (untouched, value import intact)

**Final: PASS.** No remaining blocker.
