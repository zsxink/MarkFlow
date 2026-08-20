# RUN.md — P3 start identity run

- Run ID: `20260820-p3-start-95f215b`
- Date: 2026-08-20
- HEAD: `95f215b22e681e6f90f35f0d7062bd30ddc97aa1`
- Branch: `test/issue-255-lossless-byte-contract`
- Purpose: record the P3 start identity — the "unaccepted default-on candidate" state that P3 must gate. **Not** a PASS/GO run.

## What this run records

1. `ENVIRONMENT.md` — full environment facts (see sibling file).
2. Start identity: HEAD `95f215b` post-commits the previously-uncommitted
   `src/lib/editor.ts`, `src/lib/lossless/{editorSurfaceBinding,integration,lifecycle.test,modePreference}.ts`.
3. Flag state: `losslessCoreSession` = ON, `codemirrorLivePreview` = ON (both
   default-ON since `7ff9da1`, before P3 minimum-parity/signing — treated as an
   UNACCEPTED candidate, per task instructions).
4. Working tree: clean.

## Baseline gates captured at start (must not be treated as P3 evidence)

All gates are GREEN on the unaccepted default-on candidate `95f215b`. These are
the START state, not completion evidence:

- [x] npm test — **36 files / 439 tests PASS** (`gates/npm-test.log`)
- [x] npx tsc --noEmit — PASS (`gates/tsc.log`)
- [x] npm run build — PASS (`gates/npm-build.log`)
- [x] npm run test:byte-contract — PASS, 93 fixtures, 0 missed (`gates/byte-contract.log`)
- [x] npm run test:characterization — **2 files / 9 tests PASS** (`gates/characterization.log`)
- [x] cargo test markflow-core --all-targets — **93 tests PASS** (`gates/core-rust.log`)
- [x] cargo test src-tauri --all-targets — **151 tests PASS** (`gates/tauri-rust.log`)
- [x] npm run validate:openspec — **61 PASS** (`gates/openspec.log`)

Note: plain `cargo test` without `--all-targets` reports 0 tests (integration
tests live under `tests/`); the correct invocation is with `--all-targets`.

E2E suites (smoke / regression / p0s / lossless) are NOT run in this start run —
they require a built desktop app; they will be captured under dedicated P3
evidence runs as tasks 5.9/5.12 complete. The P0S zero-edit lifecycle default
green gate runs inside `npm test` (`src/main.lifecycle.guard.test.ts`, 19 tests,
all green under the default-on flags).

## Git note

The five files the pre-task instructions flagged as "uncommitted/untracked"
(`src/lib/editor.ts`, `src/lib/lossless/editorSurfaceBinding.ts`,
`src/lib/lossless/integration.ts`, `src/lib/lossless/lifecycle.test.ts`,
`src/lib/lossless/modePreference.ts`) are now COMMITTED at `95f215b`
("fix: 跨文档切换保留用户选择的编辑器模式"). None are at risk of being
reset/stashed; the work tree is clean.
