## 1. Baseline and Observation

- [x] 1.1 Confirm `docs/markflow-core-stages/feature-migration-matrix.md` has every P0/P1 item marked `已验收`, with owner, evidence, and no open blocker.
- [x] 1.2 Create or update `docs/markflow-core-stages/m8c-legacy-removal-evidence.md` with issue/PR links, observation-period scope, validation commands, platform smoke status, and known fallback markers.
- [x] 1.3 Default-enable Core-backed export/Host path for HTML, PDF, print, and DOCX while legacy fallback remains instrumented during the observation PR.
- [x] 1.4 Add structured fallback markers for any remaining legacy path, including request id, session id, revision, client id, window label, fallback reason, issue link, and user-visible error mapping.
- [x] 1.5 Record observation-log verification as deferred acceptance: current local logs predate this M8C removal diff, so stable observation and cross-platform smoke remain follow-up gates before archive/merge.

## 2. Save and Mode-Switch Removal

- [x] 2.1 Remove product-path ProseMirror serializer save and `getMarkdown()` save fallback calls.
- [x] 2.2 Ensure Core-backed Source Mode and WYSIWYG save use Runtime flush, Core SavePayload, Host file context, FileIdentity conflict gate, and atomic write only.
- [x] 2.3 Remove WYSIWYG-to-Source whole-document serializer sync from product mode switching.
- [x] 2.4 Add tests proving Source/WYSIWYG switching preserves bytes without invoking ProseMirror serializer APIs.
- [x] 2.5 Add tests proving save failures return stable errors and never synthesize Markdown from editor DOM.

## 3. Export Removal

- [x] 3.1 Remove DOM-based HTML export main path and require Export IR rendered HTML for HTML export.
- [x] 3.2 Update PDF export so platform PDF generation consumes Export IR rendered HTML bound to initiating `sessionId + revision + exportRequestId + clientId + windowLabel`.
- [x] 3.3 Update DOCX export so semantic mapping consumes Export IR or Export IR-derived structures, not ProseMirror nodes, live DOM, or HTML snapshots.
- [x] 3.4 Replace Core session/revision/export identity gaps with stable export errors instead of DOM fallback.
- [x] 3.5 Add tests for A/B document switch, export during edit, same-path multi-session export, window close cancellation, stale revision, and unsupported Export IR diagnostics.

## 4. Host and Runtime Boundaries

- [x] 4.1 Tighten Host request validation so file/render/export side effects reject missing session, revision, request id, capability, or window scope.
- [x] 4.2 Ensure Host capability and permission failures surface stable errors and do not use active editor/path/window fallback.
- [x] 4.3 Update Host capability matrix and protocol fixtures to show legacy allowlist entries are empty for active product paths.
- [x] 4.4 Extend non-Tauri harness coverage for inspect, search, diagnostics, HTML export, same-path multi-session, stale session/revision, window mismatch, and cancellation.

## 5. Removal Audit and Evidence

- [x] 5.1 Add an automated M8C removal audit that fails on product-path `tiptap-markdown`, ProseMirror serializer save, `getMarkdown()` save, WYSIWYG whole-document serializer sync, DOM-based export, or non-empty legacy allowlist usage.
- [x] 5.2 Add audit allowlist tests proving archived OpenSpec records, migration notes, and fixtures can mention legacy terms without permitting product-path regressions.
- [x] 5.3 Update M8C evidence with removal audit output, automated command results, manual smoke results, fallback marker summary, and explicit `未验证` entries for any untested platform.
- [x] 5.4 Dispatch an independent agent review before archive/merge and record its static review plus `npm test` / `npx tsc --noEmit` conclusion in the evidence.

## 6. Validation Gates

- [x] 6.1 Run `npm audit --omit=dev --audit-level=high`.
- [x] 6.2 Run `npm test`.
- [x] 6.3 Run `npx tsc --noEmit`.
- [x] 6.4 Run `scripts/check-capabilities.sh`.
- [x] 6.5 Run `npm run validate:openspec`.
- [x] 6.6 Run `bash scripts/check-archive-synced.sh`.
- [x] 6.7 Run `npm run build`.
- [x] 6.8 Run `bash scripts/check-bundle-size.sh`.
- [x] 6.9 If Rust/Tauri paths changed, run `(cd src-tauri && cargo test)`, `(cd src-tauri && cargo fmt --all -- --check)`, and `(cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings)`.
- [x] 6.10 If Core paths changed, run `(cd markflow-core && cargo test)` and `(cd markflow-core && cargo clippy --all-targets -- -D warnings)`.
- [x] 6.11 Run `openspec validate m8c-legacy-removal` before implementation PR review.
