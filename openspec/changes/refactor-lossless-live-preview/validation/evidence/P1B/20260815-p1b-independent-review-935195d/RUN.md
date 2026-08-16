# P1B independent gate review run

## Candidate identity

The audited tree is HEAD `935195dc8231931dec58d769439365d1f69636e8`.
The last commit that changed product behavior before HEAD is `79dec4a`; HEAD also
changes the startup-receipt comment to admit that reconciliation is deferred.
The phase document and original evidence still identify `06c4b0a`, so that run
does not by itself freeze or prove the current candidate.

## Commands and outcomes

| Command | Outcome |
| --- | --- |
| `npm test` | PASS — 34 files, 391 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 2496 modules transformed |
| `npm run test:byte-contract` | PASS — L0 24 positive/23 negative; L1 95 positive/93 negative |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 134 tests |
| `npm run test:e2e:build` | PASS |
| `node e2e/run.mjs lossless` | PASS — 6 desktop tests, WebKit 605.1.15 |
| `npx openspec validate refactor-lossless-live-preview --strict` | PASS |
| `npx openspec validate --all` | PASS — 61 items |
| historical P1B `shasum -a 256 -c artifact-manifest.sha256` | **FAIL** — `RUN.md` mismatch |
| independent adversarial SourceSync harness | **FAIL as expected** — 3/3 required invariants reproduced broken |

## Independent adversarial results

The harness imports the current product `SourceSyncController` and drives
mutable optimistic text rather than treating `applyLocalChanges` as a no-op.
It reproduced:

1. after retry exhaustion the pipeline is `blocked`, but the binding dirty
   predicate evaluates `false`;
2. stale-revision resync changes `Xbase` into `XXbase` while Core receives only
   the single `X` patch;
3. a never-settling `applyPatch` remains `awaitingAck` after 250 ms; no request
   timeout or retry is armed.

Exact output is in `logs/adversarial-source-sync.log`.

## Coverage interpretation

The happy-path suites establish that the default-off flag, Core byte replay,
ordinary edit/save/reopen, and current desktop fixtures work. They do not close
the failure-path contract. The desktop lossless suite has six tests and does
not inject timeout, stale-resync with a mutable editor, blocked-close recovery,
prepare/replace races, true write/commit response loss, restart receipt
reconciliation, duplicate-operation target mismatch, or explicit CRLF paste.

## Gate result

**NO-GO. Do not advance from P1B to P2.** The full reasoning and fixes are in
`REVIEW.md`.
