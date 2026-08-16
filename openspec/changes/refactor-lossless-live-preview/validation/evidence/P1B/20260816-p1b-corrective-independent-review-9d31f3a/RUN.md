# P1B corrective independent gate run

## Candidate identity

The candidate is the exact combination of base HEAD
`935195dc8231931dec58d769439365d1f69636e8` and product diff SHA-256
`9d31f3a307d35fd81fb5e4e23baeeb23843a57a68093a06a5cccb3042c3b9972`.

## Independent commands

| Check | Result |
| --- | --- |
| CodeGraph review of SourceSync, binding, save receipt and startup gate call paths | completed |
| `npm test -- src/lib/lossless/sourceSyncController.test.ts src/lib/lossless/lifecycle.test.ts src/main.autosave.test.ts` | PASS — 3 files / 37 tests |
| `npm test` | PASS — 34 files / 402 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 2496 modules transformed |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 139 tests |
| `npm run test:byte-contract` | PASS — L0 24/23; L1 95/93 |
| `npx openspec validate refactor-lossless-live-preview --strict` | PASS |
| `npx openspec validate --all` | PASS — 61 items |
| `git diff --check` | PASS |
| corrective evidence `artifact-manifest.sha256` | PASS — 12/12 |
| desktop rerun `artifact-manifest.sha256` | PASS — 3/3 |
| direct `diffText('😀', '😁')` boundary probe | FAIL contract — `{from:1,to:2,insert:'\\ude01'}` splits the surrogate pair |

The prior real WDIO/WebKit desktop rerun is valid for this exact diff and its
manifest verifies. It proves the normal zero-edit/edit/save/reopen and A/B
workflows listed in that run; it does not exercise the new blocking findings.

## Result

**NO-GO.** The normal gates are green, and most earlier reviewer findings were
substantively repaired, but the native commit authority still has a receipt
bypass and the cross-platform create-if-absent fallback can overwrite a racing
Save As target. Additional lifecycle and durability defects are detailed in
`REVIEW.md`.
