# P6 M2a immutable environment snapshot

| Field | Measured value |
| --- | --- |
| Recorded at | 2026-08-30T18:52:40+0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (Program Owner branch exception recorded in GOAL) |
| Start commit | `b949fb047d8c239a455719684a3e3d08153f6064` (`b949fb0`) |
| Candidate commit | `228220b` — implementation only (product source); this evidence run is committed on top of it |
| Candidate diff SHA-256 (excluding `validation/**`) | `fe9d3158a3431312af6546305dbc6efda597625eb2d4378a19467ea0d55a2077` |
| OS | macOS 26.5.2 (Build 25F84), Darwin 25.5.0 arm64 |
| Host | macOS desktop (Program Owner machine) |
| Node | v22.22.2 |
| npm | 10.9.7 |
| TypeScript | 5.9.3 |
| Vite | 5.4.21 |
| Vitest | 2.1.9 |
| CodeMirror state/view/markdown | ^6.6.0 / ^6.43.0 / ^6.5.0 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | 1.96.0 (30a34c682 2026-05-25) |
| OpenSpec | 1.6.0 |
| Feature flags | P6 M2a `livePreview.strong` / `.emphasis` / `.strikethrough` / `.inlineCode` and each one's `.hidden`, all default OFF; tests turn them ON per case and restore OFF in `afterEach`. M1 `livePreview.heading[.hidden]` / `livePreview.thematicBreak[.hidden]` remain default OFF and are untouched by this cohort. Constructs outside M1+M2a (link, quote, list, fence, image, widget) remain P4B-only (visible/dimmed/revealed) — M2b/M3 are explicitly out of scope. |
| Input method | Not exercised in automated unit gates; real Chinese/Japanese IME is a PENDING-MANUAL desktop item (9.8 cohort matrix). |
| Screen reader | Not exercised in automated unit gates; desktop a11y remains a PENDING-MANUAL item. |
| Display scaling / Normal-Large SLO | Not exercised by these unit gates; Normal/Large SLO is a PENDING-MANUAL desktop item (9.8). |

## Dirty status at run start

```text
 M src/lib/lossless/livePreviewFlags.ts
 M src/lib/lossless/losslessSourceEditor.ts
 M src/lib/lossless/projection.test.ts
 M src/lib/lossless/projection.ts
?? src/lib/lossless/hiddenMarkerInteraction.ts
?? openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md (user-supplied, always untracked, excluded)
```

> The four modified files plus the one new module were committed as the candidate
> `228220b` during this run. User-supplied `validation/GOAL-executor-typora-complete.md`
> remains untracked and is excluded from every digest and gate.

## Out-of-scope exclusions honoured

- **Q3 CSS fix** (`.mf-hr:not(.mf-construct)`) is an M1 out-of-scope independent
  item. It is **not** bundled here: `git diff --stat b949fb0 228220b` touches no
  `.css` file at all.
- **M2b (link)** and **M3 (quote/list/fence)** are not implemented; no product
  file for them was created or modified.
- **Image/widget** `deletePolicy=whole` whole-range deletion is not touched.

## Safety and isolation

- All automated tests use repository fixtures or generated temporary directories
  (`nodeFs.mkdtemp` under `os.tmpdir()`), as in the M1 run.
- No user Markdown document is opened or modified.
- No credentials, tokens, account data, or network secrets are required.
- Build/cleanup bulk-deletes (`dist/`) run with `CODEBUDDY_SAFE_DELETE_ENABLED=0`;
  `dist/` is gitignored. This is an environment safety-shim bypass for legitimate
  build artifacts, not a product behavior.
