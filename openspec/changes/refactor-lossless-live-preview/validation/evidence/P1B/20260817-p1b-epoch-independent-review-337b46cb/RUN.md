# P1B save-epoch corrective independent run

## Result

Ordinary gates and real desktop lifecycle: **PASS**. Independent adversarial
harness: **FAIL (2/2)**. See `REVIEW.md` for the gate decision.

## Gate results

| Gate | Result |
| --- | --- |
| Candidate product/spec diff SHA-256 | PASS — `337b46cb3bad2e9918882236f44b9ac75bed96707e2b19d621adc3e3c46ec6ab` |
| `npm test` | PASS — 34 files, 410 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — non-blocking Vite warnings only |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS — 93 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 151 tests |
| `npm run test:byte-contract` | PASS — stable; L0 24/23, L1 95/93 positive/negative |
| `npx openspec validate --all` | PASS — 61 artifacts |
| `git diff --check` | PASS |
| `npm run test:e2e:build` | PASS |
| `node e2e/run.mjs lossless` | PASS — 6 real macOS WebKit lifecycle scenarios |
| Independent harness | **FAIL — 2/2 findings reproduced** |

Desktop coverage passed zero-edit/two-autosave (13 fixture iterations), clean
Cmd+S, Source edit/save/reopen, CRLF+BOM body edits, and A-to-B isolation. It
does not exercise the two adversarial cases below.

## Independent harness

Command:

```bash
npx vitest run --config \
  openspec/changes/refactor-lossless-live-preview/validation/evidence/P1B/20260817-p1b-epoch-independent-review-337b46cb/harness/vitest.config.ts
```

Result: exit 1, two deterministic failures:

1. A CRLF paste at `[0,2]`, followed before flush by typing at its start,
   maps to `[0,3]` instead of `[1,3]`; explicit CRLF provenance is lost.
2. A failed `reload_lossless_document` has already called
   `controller.dispose()`, leaving the live binding without a working pipeline.

The harness imports the candidate's real `EditorSurfaceBinding` and
CodeMirror `ChangeSet`; it is retained in this evidence run.
