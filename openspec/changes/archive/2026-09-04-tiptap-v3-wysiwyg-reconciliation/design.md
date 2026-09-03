## Context

See `proposal.md` for motivation and scope. The current editor creates one native TipTap v2 `Editor`, parses Markdown through `tiptap-markdown`, and reads Markdown from `editor.storage.markdown.getMarkdown()` in initialization, dirty checking, mode switching and saving. Custom link and diagram extensions expose v2 `storage.markdown.serialize/parse` hooks; table and list behavior is split across multiple v2 packages. When serialization appears truncated, `checkSerializationIntegrity()` compares document text with Markdown length and `extractDocAsFallback()` emits a lossy best-effort document.

The v3 Markdown extension moves conversion into extension-level tokenizer/parser/renderer hooks and editor commands that accept `contentType: 'markdown'`. It is still documented as beta, and known behavior differs from the current markdown-it pipeline, including soft-line-break handling and version-sensitive custom Marked injection. Therefore the migration needs an owned conversion boundary, a frozen compatibility corpus and a Source-only kill switch instead of exposing library calls throughout the application.

Constraints:

- Markdown on disk remains the source of truth; no repository-wide or open-time rewrite is allowed.
- Existing Tauri save/conflict checks, image source restoration, file-tail newline preservation, diagram node views and CodeMirror Source mode must remain operational.
- An internal representation may normalize supported syntax, but unsupported source and opaque payloads must not leak into logs or be silently rewritten.
- Migration commits must remain independently reversible, and each stage must pass the same corpus before the next stage is enabled.

## Goals / Non-Goals

**Goals:**

- Put every Markdown parse/serialize call behind one typed bridge with explicit failure results.
- Preserve the semantic and authored-data contract defined by the round-trip spec while retaining exact original bytes when the user made no content edit.
- Make WYSIWYG admission, opaque preservation and reconcile deterministic and testable without DOM rendering.
- Keep Source mode as a complete, always-available recovery path.
- First deliver only the reduced-risk v3-compatible migration, then enforce a hard stop until measurable exit gates are all PASS.
- Start admission, opaque preservation and reconcile only after the stage-one evidence is accepted.

**Non-Goals:**

- Implement KaTeX/mathematics editing, footnote editing, arbitrary inline HTML editing or CodeMirror Live Preview in this change.
- Guarantee byte-for-byte output after an actual WYSIWYG edit to a supported region; the guarantee is exact opaque restoration plus documented canonicalization of supported Markdown.
- Automatically merge external file edits with a live WYSIWYG transaction; existing external-modification handling remains authoritative and forces reload or explicit user resolution.
- Replace ProseMirror, redesign node views, change the persisted Markdown format or add cloud/server state.

## Decisions

### 1. Introduce an owned Markdown bridge and ban direct library access outside adapters

Create a focused module family, tentatively:

```text
editor.markdown.bridge.ts        public parse/serialize/analyze/reconcile facade
editor.markdown.extensions.ts    TipTap v3 parse/render/tokenizer adapters
editor.markdown.opaque.ts        opaque scanner, registry and token restoration
editor.markdown.reconcile.ts     pure baseline/candidate comparison
editor.markdown.types.ts         discriminated result and session types
```

Stage one creates only the bridge, v3 extension adapters and conversion result subset. Eligibility, opaque and reconcile types/modules are added in stage two after the hard gate; their presence in this target architecture does not authorize implementing them early.

The bridge exposes discriminated results rather than raw strings:

```ts
type ConversionError = {
  stage: 'analyze' | 'parse' | 'serialize' | 'restore' | 'verify' | 'reconcile'
  code: string
  range?: { from: number; to: number }
  details?: Record<string, string | number | boolean>
}

type ParseResult =
  | { ok: true; doc: JSONContent; eligibility: Eligibility; session: MarkdownSession }
  | { ok: false; error: ConversionError; source: string }

type SerializeResult =
  | { ok: true; markdown: string; semanticFingerprint: string }
  | { ok: false; error: ConversionError }
```

`editor.ts`, dirty checking, mode switching and save callers consume the bridge. TipTap-specific calls such as `editor.getMarkdown()` and `setContent(..., { contentType: 'markdown' })` stay inside the adapter. Runtime image URLs are converted at the bridge boundary, while exact original addresses remain in session metadata. File-tail newlines remain a file-level concern and are restored after successful serialization.

Alternative considered: update each existing caller to the new v3 API. Rejected because it would preserve today’s scattered normalization and fallback behavior, making eligibility and reconcile impossible to enforce consistently.

### 2. Use one pinned TipTap v3 package set and an isolated Marked instance

All `@tiptap/*` packages must resolve to one exact v3 patch in the lock file. The implementation spike selects a version at or above the official custom-tokenizer injection fix and verifies it against the corpus before committing the dependency migration. The bridge owns a dedicated Marked instance so parser options and custom tokenizers cannot leak across editor instances or tests. `gfm` is enabled and `breaks` is disabled; soft-break behavior receives an explicit compatibility adapter/test rather than using `breaks: true`, which would change CommonMark semantics.

This is the explicit Orca-alignment contract for complete B. “Same technology stack” means the Markdown core and safety boundaries are architecturally equivalent, while allowing MarkFlow to select a newer verified patch and retain its Tauri + native TypeScript application shell:

| Layer | Complete B contract |
|---|---|
| editor model | TipTap / ProseMirror v3 |
| Markdown engine | first-party `@tiptap/markdown` using the Marked token model |
| parser ownership | one bridge-owned, isolated Marked-compatible instance or facade |
| Markdown entry | `setContent(..., { contentType: 'markdown' })` behind the adapter |
| extension integration | `markdownTokenizer` and `renderMarkdown` for authored syntax that needs custom behavior |
| safety pipeline | eligibility admission → opaque placeholder registry/atom → three-way reconcile → Source recovery |

The alignment is deliberately not patch lockstep or a source-code fork of Orca. Orca-specific UI components, React integration, KaTeX, CodeMirror Live Preview, automatic external-edit merge and unrelated product features remain outside this change unless separately specified. Production code must not keep a parallel `tiptap-markdown`/markdown-it serializer or access TipTap v2 `storage.markdown` APIs; differential tests may retain markdown-it only as a read-only v2 baseline.

Package migration:

- replace `tiptap-markdown` with `@tiptap/markdown`;
- use the v3 aggregate list package for list/task-list extensions;
- use v3 aggregate table exports instead of row/cell/header packages;
- ensure StarterKit does not register a second Link, list, table or code-block extension when MarkFlow supplies a customized instance;
- keep the lowlight, image and placeholder extensions only after their exact v3 peer versions pass build and runtime tests.

Alternative considered: retain markdown-it and port only reconcile concepts. Rejected because it would require a second custom token pipeline, keep table fallback behavior and prevent using the first-party v3 extension contracts being introduced by this change.

### 3. Migrate syntax by explicit adapter ownership, not default behavior

Each syntax with authored attributes gets a named adapter and focused round-trip tests:

- `CustomLink`: parse/render text, href and title; keep autolink and link-on-paste disabled; preserve required escaping.
- `BlockImage`: preserve alt/title/original source while keeping runtime resource resolution outside Markdown data.
- `CodeBlock`: parse/render language or info string, choose a safe fence length, and preserve 0..N trailing newlines.
- `Mermaid`/`PlantUML`: remain code-block subtypes for persistence; node-view render output and errors never participate in Markdown serialization.
- lists: cover bullet, ordered, nested and task-list tokens, including continuation lines and checked state.
- tables: use v3 GFM table support only after empty cells, escaped pipes and inline marks pass the corpus.

Unknown nodes or marks are conversion errors unless they are registered opaque nodes. The existing generic `extractDocAsFallback()` may remain temporarily as an emergency “copy recoverable text” utility, but its output is never considered a successful save candidate and it is removed from normal Source switching after reconcile is enabled.

Alternative considered: accept v3 built-in output for all StarterKit extensions. Rejected because current regressions are concentrated at extension boundaries and default behavior does not establish MarkFlow’s authored-data contract.

### 4. Classify WYSIWYG eligibility before constructing an editable session

Eligibility analysis runs on exact source and returns:

- `eligible`: every construct is supported and a parse→serialize→parse verification succeeds;
- `eligible-with-opaque`: unsupported constructs are entirely covered by registered opaque spans and verification succeeds after restoration;
- `source-only`: boundaries are ambiguous, parsing/verification fails, or a construct crosses supported and opaque regions.

The initial opaque allowlist is deliberately narrow:

- YAML front matter at the start of the file;
- complete block HTML and HTML comments whose source ranges are unambiguous.

Reference-style links, footnotes, inline HTML, math delimiters and malformed/unclosed blocks are `source-only` in the first release because their meaning can cross span boundaries. They can move to supported or opaque in later changes after dedicated contracts exist. Generic fenced code blocks remain supported rather than opaque.

Admission verification does not require byte equality. It parses the restored candidate again and compares a semantic fingerprint of supported structure plus exact opaque bytes. Any difference not listed in the canonicalization policy rejects admission.

Unsupported-syntax detection runs only on prose ranges: opaque spans, fenced code regions and complete inline-code spans are masked before scanning for inline HTML, math, footnotes or reference links. The fingerprint normalizes parser-path-only defaults (null attributes, default list/table values, extension link defaults and mark-set ordering) without erasing non-default authored values. Independently, malformed GFM tables with inconsistent column counts are rejected before admission because parse→serialize→parse alone cannot prove that the initial parse retained every source cell.

Alternative considered: allow every parseable document into WYSIWYG and rely on save-time checks. Rejected because damage may already be introduced by a lossy initial parse, leaving no trustworthy editor baseline.

### 5. Represent opaque blocks as atom nodes backed by a session registry

Before parsing, the opaque scanner replaces each allowed raw span with a block sentinel recognized by a dedicated tokenizer. The tokenizer creates a non-editable atom node containing only a session-local slot ID and display category. The raw payload is stored only in `MarkdownSession.opaqueRegistry`:

```ts
type OpaqueEntry = {
  slot: string
  category: 'frontmatter' | 'html-block' | 'html-comment'
  raw: string
  originalRange: { from: number; to: number }
  digest: string
}
```

Sentinels include a cryptographically random session nonce and are rejected if the exact sentinel namespace already appears in user source. Serialization emits sentinels, then the bridge validates one-to-one occurrence, order and digest before replacing them with raw payloads. Missing, duplicated, reordered or unknown slots produce a conflict. Node views display a safe label and do not inject raw HTML.

Clipboard handlers must serialize selected opaque atoms to their original raw Markdown, never the sentinel. A pasted sentinel from plain text is treated as user text or rejected; it cannot resolve without the current registry. Session teardown clears the registry.

Alternative considered: store raw payload in ProseMirror node attributes. Rejected because attributes can leak through JSON inspection, clipboard, undo history or accidental renderer output and make it easier to persist internal data.

### 6. Reconcile exact source with a verified editor candidate; do not attempt arbitrary text merge

Each WYSIWYG session records:

```ts
type MarkdownSession = {
  sourceBaseline: string              // exact source at admission
  verifiedRenderBaseline: string      // restored, verified initial serialization
  baselineFingerprint: string
  sourceRevision: number
  userRevisionAtAdmission: number
  opaqueRegistry: Map<string, OpaqueEntry>
}
```

At Source switch and save, the bridge performs:

1. serialize the current editor document;
2. validate and restore opaque slots;
3. reparse the restored candidate and compare it with the current editor semantic fingerprint;
4. confirm the active source/file revision still matches the session baseline;
5. classify the result:
   - `unchanged`: no user revision and candidate differs only by allowed canonicalization; return `sourceBaseline` exactly;
   - `safe-edit`: user revision exists, opaque integrity holds, and candidate reparses to the current editor semantics; return the restored candidate;
   - `conflict`: any conversion error, placeholder mismatch, stale source revision or semantic mismatch; return no save candidate.

This is a three-way safety comparison, not a general merge engine. Existing external-modification UI remains responsible for user choice. Reload invalidates the entire session and reruns admission against new source.

Alternative considered: compare only normalized strings or document text length. Rejected because both miss structural loss, attribute changes and reordering. Alternative considered: automatically merge source and WYSIWYG diffs. Rejected because Markdown token boundaries make an unsupervised merge too risky for this migration.

### 7. Separate user revisions from representation work

The current boolean `programmaticUpdate` guard becomes a scoped guard with `try/finally` semantics and nesting support so parse, resource resolution, baseline creation, mode sync and reconcile cannot accidentally emit user revisions. Dirty is derived only from a successful persistent candidate compared with the persisted baseline:

- no user revision + `unchanged` → keep `dirty=false` and original bytes;
- user revision + `safe-edit` → compare candidate with persisted baseline and set dirty accordingly;
- `conflict` → set a separate reconciliation error state, suppress autosave, and do not report a successful save.

Scheduled dirty checks capture the document/session revision and discard stale results. The save path re-runs synchronous reconcile at the boundary rather than trusting a debounced result.

Alternative considered: keep a boolean guard and patch new call sites. Rejected because nested async-adjacent editor operations can clear a shared boolean too early and misclassify representation updates.

### 8. Keep diagnostics structured, bounded and content-minimal

Conversion and reconcile logs include stage, stable reason code, editor/source revision, construct category, range, length and digest prefix. They do not include raw Markdown, opaque payloads, URLs with query strings or diagram source. User messages remain short and actionable: stay in Source, switch to Source, retry after reload, or copy recoverable content.

The bridge records bounded in-memory debug events for the current session so test failures can assert stages without sending telemetry. No new network reporting is introduced.

### 9. Separate reduced-risk B from full B with a hard evidence gate

Delivery is split into two implementation phases, not merely a sequence of feature flags.

**Phase 1 — reduced-risk B (`v3-compatible`)** includes only:

- freeze v2 behavior and known losses;
- pin and migrate the TipTap v3 package set;
- replace v2 Markdown hooks with v3 adapters;
- route existing open/edit/mode-switch/save behavior through the bridge;
- preserve current user-visible behavior and Source fallback.

Phase 1 explicitly excludes admission classification, opaque scanning/nodes, three-way reconcile and new conflict/dirty semantics. Unsupported or failed conversions continue to use the existing safe recovery behavior while phase-one evidence is collected; the lossy fallback cannot be treated as a successful automatic save.

**Phase 1 acceptance matrix:**

| Gate | PASS condition |
|---|---|
| Dependency | one exact v3 patch across all TipTap packages; no v2 Markdown/list/table packages or peer conflicts |
| Compile | `npx tsc --noEmit` and `npm run build` both exit 0 |
| Existing regression | `npm test` exits 0 twice from clean invocations; no quarantined or skipped migration failures |
| Differential corpus | 100% of supported fixtures preserve text, structure and authored attributes; every output difference is either an approved named canonicalization or a fixed defect |
| Disk safety E2E | no-edit open/switch/save/reload fixtures have zero unintended byte changes; edited fixtures match reviewed expected output |
| Read-only field scan | at least 30 representative Markdown documents complete v2/v3 differential analysis without writes; zero unclassified content loss or truncation |
| Interaction smoke | links, paste/drop images, nested/task lists, tables, code blocks, Mermaid and PlantUML pass the recorded manual/DOM checklist with no new console error |
| Performance | normal-tier fixture per-open parse latency regresses by no more than 25% against the v2 baseline, existing bundle budget passes, and no unbounded memory growth is observed; large/dense fixtures are routed to `source-only` by a measured latency/size threshold (recorded in the stage-one report; see Open Question) rather than required to parse fast in WYSIWYG |
| Rollback | reverting the isolated v3 dependency/adapter commits restores the v2 build and opens the same fixtures without data migration |

The implementation writes `stage-1-validation.md` with command outputs, corpus summary, allowed differences, field-scan counts, performance numbers and rollback evidence. Every gate must be `PASS`; `WAIVED`, `UNKNOWN`, skipped commands or unexplained diffs count as failure. A maintainer must explicitly record approval before phase two tasks begin. Any failure stops work at phase one, triggers fix-or-rollback, and requires the entire acceptance matrix to rerun.

**Phase 2 — full B** extends the central pipeline mode in order:

```text
v3-compatible → gated → opaque → reconcile
```

`source-only` remains an emergency kill switch in every build. Lower modes ignore and clear higher-mode session state. The setting is internal/config-controlled for this change; no end-user preferences UI is added.

### Review-repair safety invariants

All verified WYSIWYG admissions, including plain `eligible` documents, create a `MarkdownSession`; a plain document uses an empty opaque registry. `gated`, `opaque`, and `reconcile` therefore share the same reconcile boundary. A missing session or registry is a conflict, never a legacy serializer fallback.

`sourceRevision` is a monotonic in-memory source/file identity. It advances on load/reload, raw Source edits, and watcher-reported external modification. A reconcile save whose file stat cannot be obtained invalidates the session and follows the existing stale-source conflict policy. The Source editor remains authoritative whenever visible: it receives raw Markdown only, owns EOF newline counts, and has no live opaque registry.

The stage-one 54KiB/~380ms pathological fixture is enforced as deterministic admission limits of 54KiB or 2,500 lines. This routes dense documents to Source without relying on wall-clock measurements. Image fingerprints include authored `src`; resolver-only runtime URLs are normalized only through the node-local authored source (or a reversible mapping).

Exit gates:

- `v3-compatible`: all existing editor unit tests, type check and build pass; supported corpus has no new loss; critical mode-switch/save E2E passes.
- `gated`: every corpus sample has deterministic eligibility and all `source-only` samples remain byte-identical on disk.
- `opaque`: collision, missing/duplicate/reordered slot, clipboard and no-leak tests pass for every allowlisted category.
- `reconcile`: unchanged/safe-edit/conflict matrix, autosave suppression, external reload and recovery E2E all pass.

## Risks / Trade-offs

- [The v3 Markdown package is beta and version behavior can change] → pin every TipTap package to one patch, isolate it behind the bridge, freeze the corpus and upgrade only in separate reviewed changes.
- [Marked and markdown-it parse edge cases differently, especially soft line breaks and list continuation] → maintain explicit compatibility adapters and baseline fixtures; reject WYSIWYG admission when semantic verification differs.
- [StarterKit can register duplicate link/list/code-block capabilities] → disable overlapping defaults and assert a single extension name/schema registration in tests.
- [Opaque scanner misidentifies source ranges] → start with only independently delimited block constructs, require exact offsets/digests, and classify ambiguity as `source-only`.
- [Sentinel corruption could leak internal tokens or lose raw source] → use session nonce + registry validation, atom nodes and a final “no sentinel namespace” save assertion.
- [Semantic fingerprint produces false positives/negatives] → fingerprint normalized JSON with runtime-only attributes removed, then verify candidate reparses to the editor structure; retain original source whenever no user edit occurred.
- [Reconcile adds latency on large documents] → keep analysis/compare pure and linear where possible, cache the admission fingerprint, debounce preview checks, and always perform one bounded synchronous verification at save.
- [Programmatic transaction accounting changes dirty behavior] → add nested-guard and stale-scheduler tests before enabling autosave integration.
- [Diagram node views may regress under TipTap v3] → keep persistence adapters independent from rendering and run Mermaid/PlantUML node-view lifecycle tests before enabling the new pipeline.
- [Source-only fallback is safer but temporarily reduces WYSIWYG availability] → expose a precise reason and prioritize new adapters based on real blocked fixtures rather than weakening the gate.
- [A green test suite can create false confidence] → require independent differential, field-scan, interaction, performance and rollback evidence; treat skipped or unexplained results as failure rather than approval.

## Migration Plan

### Phase 1 — reduced-risk B

1. **Baseline and spike**
   - Freeze a fixture corpus and capture the current engine’s parse/serialize outcomes, known losses and accepted canonicalization.
   - Test candidate pinned v3 package sets, custom Marked isolation, soft breaks, extension duplication and diagram node views.
   - Select the exact package set and record the decision in the lock file/change notes.

2. **v3-compatible bridge**
   - Add typed bridge/results and route editor initialization, set/get Markdown, dirty checks, mode switching and save reads through it.
   - Upgrade dependencies and implement syntax adapters while defaulting unsupported/failing documents to Source.
   - Keep old lossy fallback available only as an explicit recovery-copy action during this phase.

3. **Hard validation stop**
   - Run the complete phase-one acceptance matrix and produce `stage-1-validation.md`.
   - If any gate is not PASS, stop, fix or revert, and rerun the entire matrix.
   - Start phase two only after the report is all PASS and a maintainer records approval.

### Phase 2 — full B

4. **Eligibility gate**
   - Add source analysis, canonicalization policy and semantic fingerprint verification.
   - Enable `gated` only after every fixture produces a deterministic outcome and no rejected fixture is rewritten.

5. **Opaque blocks**
   - Add the registry, tokenizer/atom renderer, restoration validation and clipboard behavior for the initial allowlist.
   - Enable `opaque` after collision/no-leak/reordering tests pass.

6. **Reconcile and dirty integration**
   - Add session baselines, result classification, scoped programmatic guard, autosave suppression and Source recovery flow.
   - Enable `reconcile` after unit and E2E matrix completion.

7. **Cleanup**
   - Remove any compatibility scaffolding left after phase one, direct Markdown storage access and persistence use of lossy fallback; v2 packages and hooks were already removed by the phase-one migration.
   - Run full unit tests, type check, production build, OpenSpec validation and critical Tauri E2E before merge.

Rollback strategy:

- Lower the pipeline mode to the last passing stage; switching modes invalidates current WYSIWYG sessions and reloads from exact Source.
- If the dependency migration itself is faulty, revert the isolated dependency/adapter commit and lock file together.
- Never migrate or rewrite stored files during rollout, so rollback does not need a data migration.
- Any document in conflict remains unsaved by the WYSIWYG path; the original disk content and Source recovery remain available.

## Open Questions

- Which exact TipTap v3 patch will be pinned? Resolve during the baseline spike using the corpus and official release fixes; this does not change the architecture or capability contract.
- What performance threshold should trigger automatic `source-only` for very large documents? Reuse the existing document-size tiers during implementation and record measured thresholds without weakening correctness requirements.
  - **Resolved (stage-one evidence):** normal-tier fixtures parse well within ±25% of the v2 baseline (medium 5.4KB → parse-median ~2–3ms vs 19.4ms budget, JIT-warmed median). The v3 regression bites in the tens of KB (54KB pathological → ~380ms parse-median), while the stock `determineTier` `large` threshold is 1MB/5000 lines — ~20x too high to protect WYSIWYG from slow large-doc opens. Stage two `gated` must therefore key WYSIWYG admission on a measured parse-latency (or much lower size) bound recorded in `evidence/stage-1-validation.md`, not the 1MB stock file-size tier.
