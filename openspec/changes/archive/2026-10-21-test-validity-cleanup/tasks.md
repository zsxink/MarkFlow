# Tasks

## 1. Remove Confirmed Duplicate and Tautological Tests

- [x] 1.1 Remove the duplicate PlantUML context-menu helper test file and verify the remaining Mermaid helper suite passes.
- [x] 1.2 Consolidate PlantUML/Mermaid export-name cases and fingerprint canonicalization cases without losing unique hidden-file or behavior coverage; verify the focused tests pass.
- [x] 1.3 Remove or replace confirmed always-true toolbar, round-trip baseline, and stage-two gate assertions; preserve allowlisted baseline/security files and a meaningful pipeline-order regression; verify the focused suites and Orca gate pass.
- [x] 1.4 Review table-plugin and dirty-guard tests against existing behavior coverage; merge or rewrite only genuinely redundant cases, preserving real table interaction and save/dirty behavior; verify table and open-dirty suites pass.
- [x] 1.5 Remove the unused app-launch e2e import and consolidate only the overlapping editor-mode/edit-save-reload scenario; verify affected e2e specs parse and build.

## 2. Make Test Gates and Assertions Meaningful

- [x] 2.1 Recompute the stage-one differential gate from the executed corpus results rather than committed summary JSON; derive expected coverage from fixture definitions and verify a deliberately failing computed result fails the gate without modifying tracked evidence.
- [x] 2.2 Replace the TipTap corpus empty-set and unsupported-status magic-number assertions with meaningful derived corpus/status/round-trip assertions; verify the corpus suite and its consumers pass.
- [x] 2.3 Strengthen export-theme and security-regression tests to assert concrete CSS, DOCX style, sanitization, and escaping outputs; verify those focused suites pass.
- [x] 2.4 Strengthen KaTeX and active-document tests to verify rendered formula output and observable editor/document state; verify focused tests pass.
- [x] 2.5 Derive field-scan assertions from the source corpus, avoid silently shrinking coverage when files are missing, and prevent ordinary test runs from unexpectedly changing tracked evidence; verify tests leave the worktree evidence unchanged.
- [x] 2.6 Make optional Poppler-dependent PDF assertions explicitly report skipped checks when tools are unavailable while retaining intentional platform skips; verify the e2e spec parses and its skip/warning paths are covered or directly testable.

## 3. Unify DMG Appearance Verification and Align Specs

- [x] 3.1 Route `build-dmg.mjs` through style followed by isolated appearance collection, preserving nonzero failure on contract violations; verify script references and package scripts have no unintended old verifier callers.
- [x] 3.2 Remove the superseded in-process verifier and `verify:dmg` package script after caller audit; verify `npm run verify:dmg` is absent and the collector remains available.
- [x] 3.3 Update the regression DMG script to keep screenshot failure as an explicit warning while collection/assertion failures remain fatal; verify its error-handling tests or static control flow.
- [x] 3.4 Synchronize the DMG appearance spec delta with the isolated collection flow and remove the vacuous Rust test-output scenario from regression coverage; verify OpenSpec validation and archive-sync checks.

## 4. Integrate and Verify

- [x] 4.1 Run focused tests for all changed suites and confirm the issue's critical keep-list files remain present and exercised.
- [x] 4.2 Run `npm test`, `npx tsc --noEmit`, and `npm run build`; confirm all pass and report test count/runtime.
- [x] 4.3 Run `npm run validate:openspec` and `bash scripts/check-archive-synced.sh`; confirm both pass.
- [x] 4.4 On macOS with a built DMG, run `npm run build:dmg` and `npm run collect:dmg`, confirm `verify:dmg` is removed, and prove appearance assertion failures remain fatal; if no usable DMG is available, report the runtime check as not run.
- [x] 4.5 Run available e2e smoke checks (`npm run test:e2e:build` and `npx wdio run e2e/wdio.conf.mjs --suite smoke`); report environment limitations explicitly rather than treating skipped tests as passed.
