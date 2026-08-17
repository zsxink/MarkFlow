# Independent P1B final gate run

## Scope

Reviewed P1B design/specs, tasks 3.1-3.11, both prior independent NO-GO reports, ISSUE-005, current human-acceptance assets, Source integration/controller boundaries, Tauri guarded-write/receipt lifecycle, and the frozen candidate evidence manifests.

## Gate results

| Gate | Result |
|---|---|
| `npm test` | PASS — 34 files, 402 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS (non-blocking Vite chunk warnings) |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 147 tests |
| `npm run test:byte-contract` | PASS — fixtures stable; L0 24/23 and L1 95/93 positive/negative cases |
| `npx openspec validate --all` | PASS — 61 artifacts |
| `node e2e/run.mjs lossless` | PASS — 6 real desktop/WebKit scenarios |
| Existing P1B manifests (`shasum -a 256 -c`) | PASS |
| Independent corrective harness | **FAIL — 3/3 regressions reproduced** |

Desktop E2E rebuilt the candidate and passed zero-edit, clean-save, Source edit/save/reopen, CRLF+BOM preservation, and A-to-B scenarios. It does not exercise the adversarial interleavings or stale-resync cases in REVIEW.md.

## Independent corrective harness

Command:

```bash
npx vitest run --config openspec/changes/refactor-lossless-live-preview/validation/evidence/P1B/20260816-p1b-final-independent-review-545692a/harness/vitest.config.ts
```

Result: exit 1; 3 tests failed.

1. `diffText('😀', '😁')` emits `from=1`, splitting a UTF-16 surrogate pair.
2. A composed net-zero batch leaves `hasUnresolvedOptimisticChanges()` true after the document returns to confirmed bytes.
3. A forced stale-resync after an explicit CRLF paste emits recovery provenance `['inherit']`, not `['crlf']`.

The harness imports the candidate's actual `SourceSyncController`; it is retained in this run for deterministic reproduction.

## Human acceptance boundary

Human acceptance was not signed by this reviewer. The repository asset is bound to `e4981e3 + uncommitted changes`, remains READY/unchecked, and has no exact-candidate manifest. The user's chat report cannot be converted into a checklist signature by an independent reviewer.
