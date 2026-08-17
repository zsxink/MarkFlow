# P1B paste/reload corrective automated run

## Result

The two targeted P1 regressions are **PASS** in the product's real CodeMirror
lifecycle suite. Full TypeScript, Core, Tauri, byte-contract and OpenSpec
gates also pass. Desktop lossless E2E is **BLOCKED by local test
infrastructure**: the debug app built, but WDIO could not connect because
`tauri-driver` was unavailable. This is not a P1B Go decision and does not
replace a fresh independent review.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run src/lib/lossless/lifecycle.test.ts src/lib/lossless/sourceSyncController.test.ts` | PASS — 39 tests |
| `npm test` | PASS — 34 files, 414 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — existing Vite dynamic-import/chunk-size warnings only |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests; includes explicit CRLF/CR provenance golden tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 151 tests |
| `npm run test:byte-contract` | PASS — L0 24/23 and L1 95/93 positive/negative cases |
| `npx openspec validate --all` | PASS — 61 items |
| `git diff --check` | PASS |
| `npm run test:e2e:build` | PASS — debug Tauri app built |
| `node e2e/run.mjs lossless` | BLOCKED — WebDriver connection refused; diagnostics reports missing `tauri-driver` |

## Targeted proof

- The SourceSync lifecycle test exercises direct CodeMirror transactions at
  pasted range start, inside and after its final line break; it deletes a
  non-newline pasted character, marks an input transaction as composition, and
  forces stale resync. The last Core-bound patch carries exact EOL provenance
  `[crlf, cr, crlf]`.
- Reload failure tests assert that the active registry still points to the same
  non-disposed binding. New input reaches Core, save succeeds, and close removes
  the old session.

## Remaining gate work

1. Freeze and commit this exact candidate before commissioning the required
   independent Reviewer.
2. Provide the approved `tauri-driver` and rerun real desktop lossless E2E on
   the frozen candidate.
3. Keep P1B task 3.11 and phase Go status unchanged until independent review
   and the applicable product acceptance decision are complete.
