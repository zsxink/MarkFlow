# P1B post-repair independent review run

## Scope

Read-only independent review of the current P1B corrective candidate. No product,
phase, task, or historical evidence file was modified. The review checked the
previous final-review findings, the current save/reload/close concurrency model,
startup recovery behavior, Source synchronization, and the real WebKit lifecycle.

## Automated results

| Command | Result |
| --- | --- |
| `npm test` | PASS — 34 files, 409 tests |
| `npx vitest run src/lib/lossless/sourceSyncController.test.ts src/lib/lossless/lifecycle.test.ts` | PASS — 34 tests |
| `npx tsc --noEmit` | PASS |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 148 tests |
| `npm run test:byte-contract` | PASS — L0 24 positive / 23 negative; L1 95 positive / 93 negative |
| `npx openspec validate --all` | PASS — 61 items |
| `git diff --check` | PASS |
| `node e2e/run.mjs lossless` | PASS — real macOS WebKit 605.1.15, 6 lifecycle scenarios |

The desktop run passed zero-edit/two-autosave coverage (6 and 7 fixture
cohorts), clean Cmd+S, Source edit/save/reopen, CRLF+BOM body edit, and A-to-B
isolation. These are normal lifecycle scenarios; they do not schedule reload or
close between the final lease validation and the native replacement syscall.

## Previous finding closure matrix

| Previous final-review finding | Result |
| --- | --- |
| Unsafe legacy fallback around unresolved receipt | CLOSED: frontend recovery-only surface plus backend `write_file` path gate |
| Unicode surrogate split during resync | CLOSED by scalar-safe diff tests |
| Net-zero batch remains dirty | CLOSED by Core snapshot equality reconciliation |
| Paste CRLF/CR provenance lost during stale resync | CLOSED by range-bound provenance and forced-stale lifecycle test |
| Post-exchange recovery copy absent from startup API | CLOSED for parseable receipts |
| Startup recovery absent from product UI | CLOSED for parseable Written/Conflict receipts; corrupt receipt remains a finding |
| Exact-candidate evidence mismatch | NOT A CODE CLOSURE: current candidate remains uncommitted and P1B task 3.11 remains pending |
| Check-to-replace generation race | OPEN: see REVIEW P0-1 and P0-2 |

## Verdict

**NO-GO.** Do not enter P2 until the two P0 lifecycle/commit races are fixed and
independently re-reviewed on an immutable candidate. Keep
`losslessCoreSession=false` by default.

