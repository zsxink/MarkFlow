# OpenSpec implementation audit

## Scope and method

Inventoried all 70 Markdown files in `openspec/specs/`: 65 executable module specifications, `INDEX.md`, and four reference documents. The index-link check (`for f in openspec/specs/*/spec.md; do grep -q "](${f#openspec/specs/})" openspec/specs/INDEX.md || echo "Missing: $f"; done`) returned no missing entries. This is a focused static audit, not a line-by-line runtime proof of every requirement. OpenSpec validation confirms artifact validity, not behavior. Dispositions are document-level: unresolved means claims in that document still need claim-by-claim implementation/test review; absence of evidence is not evidence of obsolescence.

## Per-document inventory and dispositions

| Document | Disposition | Evidence / rationale |
|---|---|---|
| `INDEX.md` | **Contradicted in part; corrected** | Its module link check passes. Its previous `npx openspec validate --specs` command did not match `.github/workflows/ci.yml` and `package.json`; both use `npm run validate:openspec` → `openspec validate --all`. Corrected command and documented scope. |
| `ci-openspec-validation/spec.md` | **Verified for CI invocation** | `.github/workflows/ci.yml` invokes `npm run validate:openspec`; `package.json` maps it to `openspec validate --all`. Behavioral claims beyond this invocation were not exhaustively audited. |
| `ci-type-check/spec.md` | **Verified for CI invocation** | `.github/workflows/ci.yml` runs `npx tsc --noEmit`; broader type-boundary claims remain outside this check. |
| `dep-audit-ci/spec.md` | **Verified for configured CI check** | `.github/workflows/ci.yml` runs `npm audit --omit=dev --audit-level=high`; this verifies the configured check, not the current audit result. |
| `empty-line-preservation/spec.md` | **Contradicted in part; corrected** | `src/lib/editor.serializer.ts` (`fixImageNewlines`, `normalizeImageMarkdown`) adds missing separators but does not collapse user-provided repeated blank lines; `src/lib/editor.serializer.test.ts` covers repeated spacing around images, fenced code, and no-image behavior. Corrected the “at most one blank line” claim. The no-image statement remains qualified by CRLF normalization; its unit test supports this qualification. |
| `trailing-newlines-preservation/spec.md` | **Contradicted in part; corrected** | `src/lib/editor.ts` (`getMarkdownResult`, `appendTrailingNewlines`, Source update callback), `src/lib/editor.init.ts` (dirty check), `src/lib/editor.test.ts`, and `src/lib/editor.admission-ui.test.ts` establish mode-specific behavior. Source mode compares normalized authored content and does not use WYSIWYG tail metadata; unchanged WYSIWYG saves retain captured tails, while safe WYSIWYG edits strip historical EOF newlines. Replaced the overbroad global dirty-agnostic requirement. |
| `product-spec.md` | **Unresolved** | Product positioning and scope require feature-by-feature acceptance evidence; no complete product acceptance review was performed. |
| `architecture.md` | **Unresolved** | Full frontend/backend boundaries and data flow were not traced end to end across `src/` and `src-tauri/src/`. |
| `technical-design.md` | **Partly obsolete; otherwise unresolved** | It explicitly comments out historical architecture/project-layout blocks and refers readers to `architecture.md` for current architecture; those commented blocks are obsolete as current guidance. Remaining design claims were not exhaustively compared against source/tests. |
| `development-flow.md` | **Unresolved** | Process guidance beyond the CI/package command facts above was not independently executed or verified. |
| `active-document-state/spec.md` | **Unresolved** | Lifecycle/multi-window requirements not traced claim by claim; relevant area `src/lib/editor.state.ts` and sidebar/file operations. |
| `archive-sync-gate/spec.md` | **Unresolved** | A CI gate exists (`.github/workflows/ci.yml`, `scripts/check-archive-synced.sh`), but all edge cases were not exercised. |
| `atomic-save/spec.md` | **Unresolved** | Atomicity/failure-recovery claims need filesystem fault tests; implementation spans `src-tauri/src/` and storage code. |
| `autosave-dirty-guard/spec.md` | **Unresolved** | Timing/concurrency guarantees need race-focused tests in editor/autosave code. |
| `autosave-reliability/spec.md` | **Unresolved** | Save failure and dirty retention need failure-injection tests. |
| `background-task-lifecycle/spec.md` | **Unresolved** | Cancellation/cleanup guarantees need lifecycle tests for watchers and async tasks. |
| `block-continuation-paragraph/spec.md` | **Unresolved** | End-of-document behavior across block types needs targeted editor interaction tests. |
| `bundle-budget/spec.md` | **Unresolved** | Budget requires a built artifact and `scripts/check-bundle-size.sh` result; not established by this audit. |
| `codemirror-source-editor/spec.md` | **Unresolved** | Synchronization and mode-switch claims need broader round-trip tests; relevant code `src/lib/editor.source.ts`. |
| `code-block-serialization/spec.md` | **Unresolved** | Code-block newline guarantees need targeted serializer/parser round trips. |
| `context-menu/spec.md` | **Unresolved** | UI/API interactions were not exhaustively verified; relevant code `src/components/contextMenu.ts`. |
| `crash-logging/spec.md` | **Unresolved** | Crash capture/redaction needs deliberate exception and log-content tests. |
| `dialog-system/spec.md` | **Unresolved** | Dialog structure and interaction constraints need UI tests. |
| `dmg-installer-appearance/spec.md` | **Unresolved** | Requires packaged DMG build and appearance inspection. |
| `docx-export/spec.md` | **Unresolved** | OOXML output and semantic mapping need generated-document inspection/tests. |
| `document-size-tier/spec.md` | **Unresolved** | Threshold/degradation guarantees need boundary-size and responsiveness tests. |
| `editor-bottom-spacer/spec.md` | **Unresolved** | Visual behavior across modes needs rendered UI verification. |
| `e2e-test-coverage/spec.md` | **Unresolved** | Journey coverage requires running/mapping the documented E2E suites. |
| `enter-content-integrity/spec.md` | **Unresolved** | Enter and mode-switch integrity need editor interaction and round-trip tests. |
| `error-handling/spec.md` | **Unresolved** | Error classification/recovery needs injected failures and UI assertions. |
| `expensive-task-scheduling/spec.md` | **Unresolved** | Scheduling/responsiveness claims need workload/performance tests. |
| `export-theme/spec.md` | **Unresolved** | Cross-format theme consistency needs generated artifact comparison. |
| `export-workspace-bypass/spec.md` | **Unresolved** | Permission/security behavior needs platform-level tests. |
| `file-tree-architecture/spec.md` | **Unresolved** | Directory loading and filesystem event behavior need scale/integration tests. |
| `file-tree-incremental-update/spec.md` | **Unresolved** | DOM batching/performance claims need mutation tests and benchmark evidence. |
| `font-stack/spec.md` | **Unresolved** | Cross-platform availability/distribution cannot be established without asset/build inspection. |
| `frontmatter-visual-editor/spec.md` | **Unresolved** | YAML safety and formatting preservation need adversarial input tests. |
| `html-export/spec.md` | **Unresolved** | Self-contained output requires generated HTML inspection and standalone opening. |
| `image-naming/spec.md` | **Unresolved** | Naming/collision behavior needs filesystem tests. |
| `image-storage-engine/spec.md` | **Unresolved** | Storage/path/staging lifecycle needs filesystem and platform tests. |
| `image-streaming/spec.md` | **Unresolved** | Large-image transfer and concurrency need load/cancellation tests. |
| `issue-workflow/spec.md` | **Unresolved** | Workflow automation needs script inspection and end-to-end exercise. |
| `katex-math-render/spec.md` | **Unresolved** | Lazy loading/rendering claims need browser tests; a subset of round-trip tests exists but full scope was not run. |
| `keyboard-shortcuts/spec.md` | **Unresolved** | Shortcut/focus behavior needs cross-platform UI tests. |
| `lazy-code-languages/spec.md` | **Unresolved** | Runtime lazy loading/fallback and bundle impact need execution/build evidence. |
| `lazy-mermaid/spec.md` | **Unresolved** | Lazy loading/render state needs browser tests and bundle inspection. |
| `m0-architecture-baseline/spec.md` | **Unresolved** | Its phase-specific title is not sufficient evidence of obsolescence; current maintainer intent and baseline applicability need confirmation. |
| `multi-window-close-isolation/spec.md` | **Unresolved** | Window-targeting and one-shot permission require multi-window integration tests. |
| `paragraph-block-prefix-escape/spec.md` | **Unresolved** | Escaped-prefix fidelity needs targeted parser/serializer tests. |
| `pdf-export/spec.md` | **Unresolved** | Native PDF generation requires platform execution and artifact inspection. |
| `plantuml-export/spec.md` | **Unresolved** | Export menu, file and clipboard behavior need UI/platform tests. |
| `plantuml-render/spec.md` | **Unresolved** | Rendering/fallback behavior needs runtime/network tests. |
| `readme-sync/spec.md` | **Unresolved** | P0 feature coverage requires complete README-to-product mapping. |
| `regression-coverage/spec.md` | **Unresolved** | Coverage claims need relevant suites run and mapped to risk areas. |
| `rendered-document-export/spec.md` | **Unresolved** | Generated HTML/Word/PDF parity requires artifact and platform testing. |
| `safe-dom-construction/spec.md` | **Unresolved** | User-content sink safety requires hostile-input tests and broad sink review. |
| `safe-http-fetch/spec.md` | **Unresolved** | DNS/redirect/HTTP security claims require adversarial network tests. |
| `settings-code-highlight/spec.md` | **Unresolved** | Immediate setting effect needs UI/runtime verification. |
| `sidebar/spec.md` | **Unresolved** | File operations/conflict resolution need filesystem and interaction tests. |
| `source-toolbar-cm6/spec.md` | **Unresolved** | Insertion, selection, undo behavior needs CodeMirror interaction tests. |
| `statusbar/spec.md` | **Unresolved** | Statistics/save-status interactions need rendered UI tests. |
| `table-wysiwyg-interaction/spec.md` | **Unresolved** | Table interactions and Markdown fidelity need editor UI/round-trip tests. |
| `toolbar-layout/spec.md` | **Unresolved** | ARIA grouping and visual layout need accessibility/rendered layout checks. |
| `type-system/spec.md` | **Unresolved** | A type-check passing does not prove every shared type/runtime boundary requirement. |
| `ui-aria-attributes/spec.md` | **Unresolved** | Attribute correctness requires rendered DOM/accessibility tests. |
| `url-decoration/spec.md` | **Unresolved** | Decoration/open/copy behavior needs interaction tests. |
| `vitest-coverage-threshold/spec.md` | **Unresolved** | Threshold and current coverage require coverage configuration/run evidence. |
| `write-file-permission/spec.md` | **Unresolved** | Atomicity and workspace-boundary enforcement need filesystem/path traversal tests. |
| `wysiwyg-markdown-reconciliation/spec.md` | **Unresolved** | Reconcile mechanisms exist in `src/lib/editor.markdown.opaque.integration.ts` and `src/lib/editor.ts`; full conflict/adversarial round-trip claims were not all exercised. |
| `wysiwyg-markdown-round-trip/spec.md` | **Unresolved** | Adapter/bridge and tests exist (`src/lib/editor.markdown.adapter.ts`, `src/lib/editor.markdown.bridge.ts`); complete supported-syntax fidelity corpus was not run. |

No item was marked obsolete: the available evidence did not justify retiring a behavior contract. Unresolved entries are explicit follow-up scope, not verified claims.

## Validation and test evidence

- CI invocation: `.github/workflows/ci.yml` step “Validate OpenSpec specs” runs `npm run validate:openspec`.
- Package scope: `package.json` maps `validate:openspec` to `openspec validate --all`.
- `npm run validate:openspec` — passed, 66 OpenSpec artifacts; 0 failures. Existing warnings include brief Purpose sections, long requirement text, and one RFC-2119 wording advisory; no warning failed validation.
- `npm test -- --run src/lib/editor.serializer.test.ts src/lib/editor.test.ts src/lib/editor.admission-ui.test.ts` — passed, 3 files / 57 tests.

## Unresolved questions and unreviewed scope

- The 60 module specs labeled unresolved, along with the four reference documents, still need requirement-by-requirement implementation/test review. This report does not infer deprecation from missing evidence.
- `normalizeImageMarkdown()` canonicalizes CRLF and repairs malformed image/heading adjacency. “No images means identical output” is supported for ordinary no-image input apart from line-ending normalization; serializer tests cover the stated case. Full end-to-end disk persistence and desktop cross-mode workflows were not run.
- No product implementation, test, or CI configuration files were modified.
