## 1. Phase 2 Baseline and Governance

- [ ] 1.1 Create canonical Markdown fixtures covering CommonMark, GFM, CJK, malformed syntax, tables, FrontMatter, images, diagrams, HTML, EOL variants, and nested structures.
- [ ] 1.2 Create a machine-readable phase-2 capability matrix separating architecture status, implementation status, automated evidence, manual evidence, platform evidence, and product acceptance.
- [ ] 1.3 Update `docs/markflow-core-stages` status language so completed phase-1 document-truth work is not described as Typora-grade WYSIWYG acceptance.
- [ ] 1.4 Add an archive policy that rejects required GUI, IME, visual, platform, or observation tasks marked complete without recorded evidence.
- [ ] 1.5 Record current runtime log failures, screenshots, reproduction steps, active branch, binary revision, and affected fixtures as the R0 baseline.
- [ ] 1.6 Define per-milestone feature flags and rollback behavior without adding any serializer or DOM save fallback.
- [ ] 1.7 Treat this umbrella change as the phase-2 program charter: before implementation, create child Issue/branch/OpenSpec changes for R0-R5, assign every requirement and task ID to exactly one child, and keep completion evidence in the child change rather than editing the same umbrella checklist from multiple branches.

## 2. R0 Parser and Protocol Spikes

- [ ] 2.1 Build a parser comparison harness for `markdown-rs`, `pulldown-cmark`, tree-sitter Markdown, and the existing ParseIndex implementation.
- [ ] 2.2 Measure CommonMark/GFM conformance, byte-range fidelity, nested syntax, error recovery, binary size, memory, and 1/10/50 MiB performance for each parser candidate.
- [ ] 2.3 Produce an ADR selecting the production semantic parser and lossless concrete syntax/source-map strategy.
- [ ] 2.4 Add unchanged-document byte-round-trip tests for the selected parser/source-map combination.
- [ ] 2.5 Audit every frontend Core Bridge invocation and every registered Tauri command argument for casing, optional fields, nested DTOs, and stable errors.
- [ ] 2.6 Fix the Tauri argument naming contract for render, save, flush, resync, text, outline, stats, reload, close, export, commands, Undo, and Redo.
- [ ] 2.7 Add a real Tauri invoke dispatcher contract harness covering every Core Bridge command rather than mocking `invoke` or directly calling Rust functions.
- [ ] 2.8 Verify render, flush, save, and close succeed in a real desktop process and produce no missing-argument or duplicate-session logs.
- [ ] 2.9 Freeze direct Tauri command arguments as camelCase and record explicit versioned casing for envelope and nested Serde DTOs.
- [ ] 2.10 Produce the release-gate ADR and machine-readable manifests for the reference benchmark environment, visual tolerance, IME evidence boundary, structured-widget release scope, and seven-day/twenty-hour observation protocol.

## 3. R0 Projection Correctness

- [ ] 3.1 Define `ProjectionState` and state effects for idle, loading, optimistic, rendered, composing, stale, and degraded states.
- [ ] 3.2 Add a visible degradation bar with stable error, retry, Source Mode, and non-repeating notification behavior.
- [ ] 3.3 Add `revisionConfirmedEffect` from patch ack and resync into the active CodeMirror EditorView.
- [ ] 3.4 Invalidate, map, or remove old decorations immediately when a transaction changes document ranges.
- [ ] 3.5 Change render request identity to include binding generation, session, document, confirmed revision, viewport, source hash, and request id.
- [ ] 3.6 Cancel or obsolete in-flight render and widget requests when session, revision, viewport, mode, or window identity changes.
- [ ] 3.7 Add tests proving projection refresh occurs after ack without another user edit or scroll.
- [ ] 3.8 Add tests proving stale Render IR cannot decorate modified text or another document.
- [ ] 3.9 Make render failure and recovery observable in status, logs, DOM test attributes, and E2E page objects.
- [ ] 3.10 Correct the existing Core WYSIWYG toolbar, keyboard, menu, Undo, and Redo routing as an R0 stopgap; R1 replaces this with the unified `EditorCommandRouter`.

## 4. R1 Single CodeMirror Editor Surface

- [ ] 4.1 Introduce an `EditorSurfaceBinding` that owns EditorView, Core identity, pipeline, compartments, projection state, and cleanup.
- [ ] 4.2 Move shared editor extensions into stable base, input, source, preview, theme, and read-only compartments.
- [ ] 4.3 Replace Source/WYSIWYG destroy-and-remount transitions with extension reconfiguration on one EditorView.
- [ ] 4.4 Preserve document, selection, viewport, scroll anchor, focus, dirty state, pending patches, and revision during mode reconfiguration.
- [ ] 4.5 Remove mode-switch calls that read or write a secondary ProseMirror document or serializer.
- [ ] 4.6 Update statusbar, outline, statistics, settings, read-only, search, and export consumers to use the active Core surface.
- [ ] 4.7 Add a 100-cycle Source/WYSIWYG E2E verifying state and byte preservation.
- [ ] 4.8 Add close, reopen, A/B switch, same-path multi-session, and window-destroy lifecycle coverage for the single surface.

## 5. R1 Commands and Core History

- [ ] 5.1 Implement `EditorCommandRouter` using active Core surface identity and CodeMirror selection.
- [ ] 5.2 Route toolbar formatting, link, quote, lists, task, code, image, horizontal rule, Undo, and Redo through the command router in both modes.
- [ ] 5.3 Route keyboard and menu commands through the same command router without `mode === source` fallback logic.
- [ ] 5.4 Remove CodeMirror independent History from product editor configuration.
- [ ] 5.5 Add Core History metadata for typing burst, composition, paste, semantic command, table command, asset transaction, FrontMatter, and diagram edits.
- [ ] 5.6 Return and apply deterministic `selectionAfter` for every Core command, Undo, and Redo result.
- [ ] 5.7 Add cross-mode tests proving one shared Undo/Redo stack and no duplicate command execution.
- [ ] 5.8 Add failure tests proving rejected Core commands preserve text, selection, dirty state, and recoverable UI.
- [ ] 5.9 Define the ordered pending-transaction protocol and bounded revision barrier for Undo, Redo, and commands that depend on confirmed selection.
- [ ] 5.10 Test immediate Undo before patch ack, repeated Undo/Redo, ack/Undo interleaving, resync/Undo interleaving, barrier timeout, and recovery without undoing an older confirmed edit.

## 6. R2 Render IR v2 and Semantic Model

- [ ] 6.1 Add versioned Render IR v2 types with source hash, nested block identity, source/content/marker ranges, semantic tokens, widget descriptors, invalidation, and fallback descriptors.
- [ ] 6.2 Implement Render IR v2 for headings, paragraphs, thematic breaks, blockquotes, nested lists, task lists, and fenced code blocks.
- [ ] 6.3 Implement Render IR v2 for strong, emphasis, strikethrough, code spans, links, autolinks, reference links, and image references.
- [ ] 6.4 Implement Render IR v2 descriptors for tables, FrontMatter, images, diagrams, HTML comments, raw HTML, and unknown syntax.
- [ ] 6.5 Preserve marker character, length, whitespace, indentation, EOL, list numbering, table padding/alignment, and fence info in StyleMap.
- [ ] 6.6 Add stable block identity and minimal invalidation across local edits.
- [ ] 6.7 Add v1/v2 schema negotiation and reject unsupported versions with Source Mode fallback.
- [ ] 6.8 Add Core fixtures for UTF-16 conversion, emoji, surrogate pairs, nested syntax, malformed syntax, and revision mismatch.
- [ ] 6.9 Benchmark viewport payload size, serialization, cancellation, and projection latency before default-enabling v2.

## 7. R2 Typora Live Preview Projection

- [ ] 7.1 Add local Lezer-based optimistic projection for safe visible syntax and active editing context.
- [ ] 7.2 Implement heading marker replacement and active prefix reveal.
- [ ] 7.3 Implement strong, emphasis, strikethrough, and inline-code delimiter replacement and reveal.
- [ ] 7.4 Implement label-only link rendering with destination reveal, edit, and modifier-key open behavior.
- [ ] 7.5 Implement blockquote rail and current-line marker reveal.
- [ ] 7.6 Implement ordered, unordered, nested, and task-list marker presentation with current-item reveal.
- [ ] 7.7 Implement thematic break and code-fence projection with stable dimensions.
- [ ] 7.8 Implement atomic ranges and cursor motion across folded markers.
- [ ] 7.9 Add projection mapping for mouse drag, Shift+Arrow, Home, End, Select All, and Source reveal.
- [ ] 7.10 Add per-construct fallback flags and exact source fallback for unsupported or unsafe ranges.
- [ ] 7.11 Verify supported inactive syntax exposes zero visible markers in semantic DOM and visual baselines.
- [ ] 7.12 Add composition-neighborhood protection and core selection-mapping fixtures for every construct that folds or replaces markers.
- [ ] 7.13 Keep each folding construct experimental and default-off until its composition and selection fixtures pass; verify exact source fallback on failure.

## 8. R3 Structured Block Widgets

- [ ] 8.1 Define the common `StructuredWidget` identity, lifecycle, focus, commit, reveal-source, and cleanup contract.
- [ ] 8.2 Implement GFM table grid rendering from Core table descriptors without reparsing pipes in the frontend.
- [ ] 8.3 Implement table cell edit, row/column insert/delete, alignment, Tab/Shift+Tab, arrows, Enter, Escape, and source fallback.
- [ ] 8.4 Add table lossless tests proving cell edits preserve unrelated pipes, padding, markers, cells, and EOL.
- [ ] 8.5 Implement safe Host asset URL resolution and replacement-style image widget.
- [ ] 8.6 Implement image alt/title/path edit, replace, copy, delete, retry, open location, broken state, and source reveal through resource transactions.
- [ ] 8.7 Implement operable Task List checkbox widgets backed by Core commands.
- [ ] 8.8 Implement fenced code panel, language selector, lazy language highlighting, trailing newline preservation, and deterministic exit behavior.
- [ ] 8.9 Implement safe FrontMatter structured form, nested fields, typed values, diagnostics, and source submode.
- [ ] 8.10 Implement Mermaid and PlantUML widgets with sandbox, timeout, cancellation, stale drop, diagnostics, refresh, copy/export, and source reveal.
- [ ] 8.11 Implement folded HTML comments and inert or sandboxed raw HTML policy selected by ADR.
- [ ] 8.12 Add keyboard-only and accessibility tests for every structured widget.

## 9. R4 Input Integrity and Natural Editing

- [ ] 9.1 Add compositionstart/update/end tracking with `compositionId`, protected range, and one Core History group.
- [ ] 9.2 Suspend or adjust marker replacement near active composition and defer conflicting confirmed projection.
- [ ] 9.3 Add Chinese, Japanese, Korean, emoji, combining-mark, RTL, and surrogate-pair input fixtures.
- [ ] 9.4 Implement deterministic Enter behavior for paragraph, heading, quote, list, task, table, and code contexts.
- [ ] 9.5 Implement deterministic Backspace/Delete behavior at folded markers, empty blocks, widget boundaries, and nested list indentation.
- [ ] 9.6 Implement Tab/Shift+Tab behavior for lists, tables, code indentation, FrontMatter forms, and focus traversal.
- [ ] 9.7 Implement clipboard MIME policy for internal Markdown, rendered HTML, plain text, files, and images.
- [ ] 9.8 Implement sanitized external HTML-to-Markdown paste and plain-text fallback.
- [ ] 9.9 Integrate drag/drop and clipboard images with resource transactions and revision identity.
- [ ] 9.10 Add selection/copy/paste tests across hidden markers, multiple blocks, widgets, and Source/WYSIWYG mode switches.
- [ ] 9.11 Add keyboard focus, screen-reader text, zoom 200%, high-contrast, and reduced-motion accessibility smoke.

## 10. R4 Performance, Security, and Resilience

- [ ] 10.1 Add deterministic 1/10/50 MiB editor fixtures and trace local input, patch ack, projection, scroll, mode switch, save, and memory.
- [ ] 10.2 Enforce local commit p95 <=16 ms, normal projection p95 <=50 ms, large projection p95 <=100 ms, and mode reconfigure p95 <=50 ms.
- [ ] 10.3 Enforce viewport-only projection and bounded overscan for documents over 1 MiB.
- [ ] 10.4 Make image and diagram widgets lazy for large documents and policy-controlled for huge documents.
- [ ] 10.5 Reserve stable widget layout dimensions and verify async results do not cause unbounded layout shift.
- [ ] 10.6 Add raw HTML, SVG event, unsafe URL, path traversal, symlink escape, oversized payload, timeout, and cancellation security regressions.
- [ ] 10.7 Verify Huge documents retain Source and WYSIWYG entry, editing, scrolling, saving, and explicit degradation behavior.
- [ ] 10.8 Add telemetry for render latency, dropped stale results, degradation, resync, widget errors, and session leaks without logging document content.

## 11. R5 Desktop, Visual, and Platform Gates

- [ ] 11.1 Update E2E page objects to target the visible Core Source/WYSIWYG surface and structured widgets, never a hidden legacy container.
- [ ] 11.2 Add canonical WYSIWYG desktop E2E with semantic assertions for every supported block and inline construct.
- [ ] 11.3 Add desktop E2E for commands, shared History, mode switching, save bytes, degraded recovery, A/B sessions, and window lifecycle.
- [ ] 11.4 Fail E2E on frontend/backend render, save, command, session, stale-routing, or panic log markers.
- [ ] 11.5 Add deterministic light/dark visual baselines for inactive, active, composing, selected, widget, Source, and degraded states.
- [ ] 11.6 Add reviewed pixel-diff artifacts and baseline-update approval workflow.
- [ ] 11.7 Add required PR CI execution for Tauri desktop smoke and preserve logs/screenshots on failure.
- [ ] 11.8 Execute macOS GUI smoke including Chinese IME, keyboard navigation, image, table, FrontMatter, diagram, save, and export.
- [ ] 11.9 Execute Windows GUI smoke including IME, keyboard navigation, image, table, FrontMatter, diagram, save, and export.
- [ ] 11.10 Execute Linux GUI smoke including keyboard navigation, image, table, FrontMatter, diagram, save, and export.
- [ ] 11.11 Run the current-build stability observation period and verify no silent fallback, lost input, revision divergence, session leak, or wrong-result routing.

## 12. Legacy Cleanup and Final Acceptance

- [ ] 12.1 Confirm every phase-2 P0/P1 capability has implementation, automated, GUI, visual, IME, platform, and observation evidence.
- [ ] 12.2 Dispatch an independent agent to review the final diff, run `npm test`, `npx tsc --noEmit`, desktop smoke, and inspect evidence honesty.
- [ ] 12.3 Remove the hidden ProseMirror editor shell and all remaining product command fallbacks.
- [ ] 12.4 Remove Tiptap/ProseMirror dependencies, extensions, plugins, state, helper modules, and editor-only CSS no longer used by export.
- [ ] 12.5 Run the M8C removal audit and add a phase-2 audit preventing reintroduction of a second document truth or legacy editor command path.
- [ ] 12.6 Update user and developer documentation, architecture diagrams, capability matrix, troubleshooting, performance budgets, and release notes.
- [ ] 12.7 Run the full local CI-equivalent frontend, Rust/Tauri, Core, OpenSpec, bundle, audit, E2E, visual, and archive-sync gates.
- [ ] 12.8 Synchronize every delta spec into `openspec/specs/` before archive.
- [ ] 12.9 Run `npm run validate:openspec` and `bash scripts/check-archive-synced.sh` after sync and archive.
- [ ] 12.10 Archive only when no required task is deferred, blocked, unverified, or supported solely by stale evidence.
