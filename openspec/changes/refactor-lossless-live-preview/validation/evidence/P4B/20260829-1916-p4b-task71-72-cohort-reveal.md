# P4B task 7.1 / 7.2 — per-cohort marker reveal: implementation + acceptance matrix

Phase: P4B · Task 7.1 (marker replace/reveal refinement per cohort) · Task 7.2 (interaction matrix)
Branch: `test/issue-255-lossless-byte-contract`
Date: 2026-08-29

## Scope of this document

This records the implementation of the per-cohort marker reveal (`projection.ts`
`isConstructRevealed`) and the per-cohort acceptance matrix for task 7.2. The
construct/marker SET is unchanged and stays frozen by the task 6.5 parity
oracle (`GOLDEN` in `projection.test.ts`); only the reveal *decision* is refined.
All five marker cohorts remain default-OFF (no default-on requested).

## Implementation summary

- `projection.ts` extracts the reveal decision into an exported pure function
  `isConstructRevealed(range, selection, docLength)`.
  - Flags OFF (default, parity baseline): byte-identical to the pre-7.1
    radius-2 logic (locked by the "is byte-identical to the legacy radius-2
    formula" unit sweep).
  - Range selection / Select All (`selection.empty === false`): every
    overlapping construct fully reveals — identical across all cohorts.
  - A cohort flag ON switches its constructs to a precise reveal: a collapsed
    caret reveals only when it sits strictly inside the construct content range
    `(from, to)` (covering its delimiter markers), so the base radius-2 "fringe"
    (a caret up to 2 code units OUTSIDE a construct) no longer lights it up.
  - Reveal is selection-driven only, never DOM textContent → identical in
    read-only mode (verified by unit + an integration test that flips the
    `EditorState.readOnly` facet).
- Cohort → reveal mapping uses the existing `cohortFlags.ts` switches by class:
  - `mf-h*`/`mf-strong` → `headingStrong`
  - `mf-emphasis`/`mf-strikethrough`/`mf-inline-code` → `emphasisStrikeInlineCode`
  - `mf-link` → `links`, but ONLY for the four-delimiter `[text](url)` Link
    construct (`markers.length === 4`); naked URL / image-URL / legacy
    link-label `mf-link` shapes (0 / 2 markers, e.g. GOLDEN from:156 / from:302)
    keep the base reveal and their frozen markers — never touched.
  - `mf-blockquote`/`mf-list-item` → `quoteLists`
  - `mf-fence` → `fence` (fence markers are frozen empty by GOLDEN; only the
    active/full reveal timing is refined, and the no-descent-into-body guarantee
    is preserved).

No `renderOwnerRegistry.ts` default table was changed, no widget-owner switch was
made (cohorts stay `'local'`), no new npm dependency, and no doc/serializer
transaction is introduced — the projection only builds decorations.

## Per-cohort reveal rule + unit test evidence

`projection.test.ts` — new independent describes:

| Cohort (flag) | Refinement | Key unit test(s) |
| --- | --- | --- |
| ① headingStrong | content-containment reveal for headings + strong | `P4B task 7.1 ① — …` (caret in `#`/in content reveals; fringe from-2/from-1/to+1 does not; OFF restores radius) |
| ② emphasisStrikeInlineCode | same, for `*`/`~~`/backtick; emoji/CJK surrogate safety | `P4B task 7.1 ② — …`; integration `CJK/emoji: … never splits the surrogate pair` |
| ③ links | four-delimiter `[ ] ( )` Link only; legacy shapes untouched | `P4B task 7.1 ③ — …` (caret in each delimiter reveals; naked URL / legacy 2-marker follow base) |
| ④ quoteLists | `>` / `-`+number marker reveal | `P4B task 7.1 ④ — …` |
| ⑤ fence | content reveal; frozen empty markers; no descent | `P4B task 7.1 ⑤ — …`; integration `fence cohort: … no descent` |

## Task 7.2 interaction matrix

Machine-verifiable dimensions are covered by automated unit/integration tests
(evidence: `projection.test.ts`); genuinely human/IME dimensions are marked
PENDING-MANUAL. Each cohort is verified independently; all five default OFF.

| Interaction | ① headingStrong | ② emphasis… | ③ links | ④ quoteLists | ⑤ fence | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Mouse click caret in delimiter → reveal | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | unit `…caret … reveals` + DOM integration |
| Collapsed caret OUTSIDE (fringe) → weak | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | unit fringe asserts |
| Range selection (Shift+Arrow / drag) overlaps → full reveal | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | `rangeSel` asserts |
| Select All → full reveal | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | unit + integration `Select All fully reveals` |
| Home/End sweep to line start near marker → reveal | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | content-containment covers all marker positions |
| Clipboard (paste) after reveal | — | — | — | — | — | byte-contract (P1B) unchanged; reveal is decoration-only — PENDING-MANUAL spot-check |
| CJK IME composition | — | auto ✓ | — | — | — | surrogate-safe reveal; IME compose path PENDING-MANUAL |
| Emoji / surrogate pair | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | integration emoji test + unit |
| Accessibility (screen reader on reveal) | — | — | — | — | — | PENDING-MANUAL (no a11y harness) |
| Read-only mode parity | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | integration `read-only: reveal is purely selection-driven` |
| Failure fallback (projection throw → exact source) | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | existing P2 §4.9 failure tests (task 4.13) still green |
| Source bytes preserved | auto ✓ | auto ✓ | auto ✓ | auto ✓ | auto ✓ | every integration test asserts `view.state.doc` unchanged |

### PENDING-MANUAL items (require a real operator / real time IME)
1. CJK IME composition reveal timing on the real desktop WebView (unit proves
   the UTF-16 positions; the live under-composition rebuild is P2-tested at a
   different level — a manual IME pass is needed).
2. Accessibility: screen-reader announcement of `mf-active`/`mf-marker` state.
3. Clipboard round-trip after reveal while a cohort is ON (no observed risk —
   reveal is decoration-only — but not desktop-verified).
4. Full desktop E2E of the five cohorts (`e2e/specs/lossless/p4b-cohort-reveal.e2e.mjs`
   — registered, written, PENDING-MANUAL/ENV: requires `npm run test:e2e:build`).

## Gates (this implementation)

All green on 2026-08-29:
- `npx vitest run src/lib/lossless/projection.test.ts src/lib/lossless/cohortFlags.test.ts src/lib/lossless/renderOwnerRegistry.test.ts src/lib/lossless/widgets/protocol.test.ts` → 75 passed
- `npx tsc --noEmit` → 0
- `npm test` → 618 passed (47 files)
- `npm run build` → built (pre-existing chunk-size warnings only)

## Impact on 7.4 / 7.6

- 7.4 (taskCheckbox / codeFenceControls widget pilots): unchanged. The five 7.1
  cohorts remain `'local'` owners — no widget-owner registration was introduced,
  so 7.4 can wire widget owners per-kind behind its own flags without colliding
  with the 7.1 reveal gates. The fence cohort's reveal gate is orthogonal to the
  7.4 fence-controls widget (which will consume the widget protocol).
- 7.6 (frontmatterPolicy / rawHtmlPolicy): unchanged. Those kinds are
  `source-fallback` and gated by their own flags; 7.1 did not touch
  `renderOwnerRegistry.ts` defaults or `cohortFlags` defaults.
- Reverse: if a 7.4 widget later takes over `mf-fence`/`mf-list-item` ownership
  (owner → `'widget'`), the 7.1 reveal gate for that class becomes inert because
  the local projection no longer decorates it (`resolveConstructOwner !== 'local'`
  short-circuits in `classifyLezerNode`) — the rollback contract of design 05 §5
  holds per-class.
