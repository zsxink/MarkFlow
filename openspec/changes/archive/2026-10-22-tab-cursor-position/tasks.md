# Tasks

## 1. Reproduce and Fix

- [x] 1.1 Add a regression test with two documents and distinct WYSIWYG selections; verify switching back restores the expected ProseMirror and DOM selection.
- [x] 1.2 Synchronize the restored WYSIWYG selection with the visible editor caret without regressing source-mode selection or undo history; verify focused editor selection behavior.

- [x] 1.3 Measure small/large document projection work and remove duplicate outline/frontmatter refreshes; add a deterministic regression for one refresh per tab switch.

## 2. Integration Verification

- [x] 2.1 Run TypeScript, build, unit, E2E, OpenSpec, and Rust validation checks; record passing results for review.

## Validation Evidence

- Native WKWebView fail-before: temporarily omitting the focus-preserving mousedown listener leaves the restored PM selection at `1` while DOM anchor/head are outside the editor (`null`). The handler was restored before final validation.
- Native smoke: 10 cases passed, including blank/document selection restore, Source focus transfer, Ctrl+Tab return, insertion at the restored heading offset, and undo. The embedded driver omits mousedown and forces focus after `element.click()`; the regression models cancelable mousedown/default focus before click and verifies the actual WebView DOM selection and text insertion.
- E2E command: `node e2e/.tmp-cursor-run.mjs smoke`, using a temporary copy of `e2e/run.mjs` whose build command adds `-- --config '{"identifier":"com.markflow.editor.e2e"}'`. This avoids the user's running app's bundle identifier. The temporary runner has been removed; tracked E2E configuration is unchanged.
- `npx tsc --noEmit`, `npm run build`, `npm test` (84 files / 793 cases), and `npm run validate:openspec` (67 passed) all passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, and `cargo test --manifest-path src-tauri/Cargo.toml` (141 tests) all passed.
- Projection measurement with real mounted outline/frontmatter in happy-dom: 5 headings changed from 10 outline appends / 2 Markdown reads to 5 / 1; 500 headings changed from 1,000 / 2 to 500 / 1. Illustrative 500-heading switch samples were 104.09 ms before and 54.40 ms after; these are environment-specific unit-harness measurements, not native latency guarantees. The retained regression asserts work counts and rendered content instead of timing.
- Screenshot reviewed: `e2e/artifacts/document-tabs-caret.png`; actual caret position is verified by DOM selection mapping and insertion assertions because a blinking caret may not appear in a static capture.
