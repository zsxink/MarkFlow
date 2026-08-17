# P1B independent review run record

## Result

**GO (conditional).** The two previously reported P1 findings are closed by the
candidate. All ordinary unit/type/build/Core/Tauri/byte/OpenSpec gates, the
real macOS WebKit lifecycle suite, and the lossless/p0s/regression desktop E2E
suites pass. The only residual gaps are the platform-optional desktop cases the
runtime cannot express (WebDriver `tauri-driver` still unavailable in `$PATH`),
and the proof that a failed-reload read cannot strand a visible editor. See
`REVIEW.md` for findings and the exact gates.

## Reviewer

- Reviewer: AI independent Reviewer (fresh context; root cause + static diff
  review of candidate `a16e575`, plus reruns of the deterministic gates).
- Review basis: `git diff 545692a..a16e575` for product source and spec/design,
  plus the evidence directories. No prior-run artifacts were modified.
- Desktop runtime: real macOS WebKit Tauri debug app `--features e2e`.

## Gates run

| Gate | Result |
| --- | --- |
| Candidate product/spec diff SHA-256 (`8acf356...`) | PASS — matches corrective run's recorded full-worktree SHA |
| `npm test` | PASS — 34 files, 414 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — non-blocking Vite chunk-size warning only |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 151 tests in `markflow_lib`, 0 failed |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib dispatcher_contract` | PASS — 22 dispatcher contract tests (01-22) include the new lifecycle-revocation, failed-reload-epoch, old-schema-quarantine, legacy-bypass-refusal cases |
| `npm run test:byte-contract` | PASS — stable L0/L1 positive/negative counts |
| `npx openspec validate refactor-lossless-live-preview --strict` | PASS |
| `npx openspec validate --all` | PASS — 61 items |
| `git diff --check` | PASS |
| `npm run test:e2e:build` | PASS — debug WebKit Tauri app built |
| `node e2e/run.mjs lossless` | PASS — 6 real macOS WebKit lossless lifecycle scenarios |
| `npm run test:e2e:smoke` (`node e2e/run.mjs smoke`) | PASS — 5 smoke scenarios |
| `node e2e/run.mjs regression` | PASS — full regression suite |
| `node e2e/run.mjs p0s` | PASS — p0s zero-edit/no-write suite |

## Targeted proof run by the reviewer

- `cargo test --manifest-path src-tauri/Cargo.toml --lib dispatcher_contract`
  (non-mock, real dispatcher + real guarded write + real receipts) proves:
  - failed reload revokes the prepared epoch before any write/commit;
  - replacement-point revocation (injected in the historical check→exchange
    window) never writes the discarded payload and leaves no bogus recovery
    copy;
  - old-schema/unreadable receipt has an explicit, durable quarantine action
    and post-action the normal lossless open lifts;
  - legacy `write_file` is refused while an unresolved receipt is present.
- `npx vitest run src/lib/lossless/lifecycle.test.ts src/lib/lossless/
  sourceSyncController.test.ts` — 39 tests, includes the product regressions
  for reload-failure survival, dirty-discard reload failure, CRLF/CR paste
  boundary EOL retention and drop-on-delete.

## Commands

(Names and inline flags recorded as executed; individual command outputs are
available in the task/analysis logs and in this run's `RUN.md`.)

## Open items

- The desktop runner is real and passed all four suites, but the WebDriver is
  `driverProvider: 'embedded'` (bundled on port 4445), so a `tauri-driver`
  binary on `$PATH` is not required. The prior corrective run's BLOCKED status
  was an environment-level driver-launch failure that this run's embedded
  provider does not rely on; the lossless/p0s/smoke/regression suites all ran
  against the real macOS WebKit debug app and passed.
- Suite invocation is per-suite (`smoke`, `regression`, `p0s`, `lossless`);
  there is no single script that runs all four in one command.