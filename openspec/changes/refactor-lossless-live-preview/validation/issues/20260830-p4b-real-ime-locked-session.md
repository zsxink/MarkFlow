# P4B real IME evidence blocked by locked GUI session

状态：OPEN

| 字段 | 值 |
| --- | --- |
| Issue ID | `P4B-REAL-IME-LOCKED-SESSION` |
| Severity | Functional validation blocker (environment) |
| Phase | P4B 7.3/7.9/7.10 |
| First run ID | external manual-ready attempt; preserved in the linked candidate run |
| Commit/flags | base `a8c73de`; lossless + Live Preview ON |
| Environment | macOS 26.5.2; real bundled Tauri `.app`; system Pinyin/Kotoeri |
| Owner | Codex root executor |

## Expected

In an unlocked Tauri WebView, real system Chinese and Japanese input each emit `compositionstart`, one or more `compositionupdate`, and `compositionend`; the committed CJK text is adjacent to a Markdown marker without loss/cancellation, and exactly one Cmd+Z restores the initial source.

## Actual

The process runs in a locked/non-interactive GUI session. `NSWorkspace.shared.frontmostApplication` reports `loginwindow` PID 409; MarkFlow is a regular visible app but cannot become active. Global Quartz input therefore cannot target its WebView. Direct `CGEventPostToPid` reaches the process but bypasses the system input-method composition path; the strict harness times out because it sees no real composition commit.

## Minimal reproduction

1. Build and launch the real E2E-feature `.app` with an isolated data/workspace.
2. Connect to embedded WebDriver port 4445 and focus `.cm-content` at the marker-adjacent position.
3. Select `com.apple.inputmethod.SCIM.ITABC`.
4. Attempt to activate MarkFlow and post physical keycodes for `zhongwen` + Space.
5. Observe the frontmost application remains `loginwindow`; the harness never satisfies the composition event predicate.

## Byte/file impact

None. Autosave was disabled. Both isolated files remained exactly `# marker\n` and `> marker\n` on disk. The current input source was explicitly restored to ABC, Kotoeri was disabled again, the test PID was terminated, port 4445 was released, and launchd test variables were removed.

## Evidence

- `../evidence/P4B/20260830-080554-p4b-widgets-a8c73de/FAILURES.md`
- immutable `ime/attempt-0-manual-timeout.json`
- immutable `ime/attempt-1-activation-failure.json`
- immutable `ime/attempt-2-direct-pid-timeout.json`

## Root cause

Host GUI session state, not yet a product-code diagnosis. Direct PID key delivery is intentionally not accepted as equivalent to a real OS IME.

## Fix

Run the same strict harness when the GUI session is unlocked and MarkFlow can become frontmost. Do not weaken the required event predicate and do not replace it with WebDriver text injection.

## Verification

NOT STARTED. Chinese and Japanese must each pass in a new corrective run with event trace, commit/Undo screenshots, fixture hashes, and cleanup proof.

## Closure

- Fix commit: not applicable unless the unlocked run exposes a product defect
- Passing run: NOT RECORDED
- Reviewer: NOT RECORDED
- Closed date: NOT RECORDED
