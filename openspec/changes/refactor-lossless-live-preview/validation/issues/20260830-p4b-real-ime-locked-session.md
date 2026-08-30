# P4B real IME evidence blocked by locked GUI session

状态：**RESOLVED — GUI 会话解锁问题已解决；日文 IME 发现新的 product gap，见 P4B-JA-KOTOERI-UNDO-COMPOSITIONEND-GAP**

| 字段 | 值 |
| --- | --- |
| Issue ID | `P4B-REAL-IME-LOCKED-SESSION` |
| Severity | Functional validation blocker (environment) |
| Phase | P4B 7.3/7.9/7.10 |
| First run ID | external manual-ready attempt; preserved in the linked candidate run |
| Final corrective run ID | `20260830-083435-p4b-corrective-a8c73de` |
| Commit/flags | after `b50e392`; lossless + Live Preview ON; `p4b*` flags ON for the run |
| Environment | macOS 26.5.2; Tauri v2 debug binary; WebKit 605.1.15; system Pinyin + Kotoeri enabled via TIS |
| Owner | Codex root executor |

## Expected

In an unlocked Tauri WebView, real system Chinese and Japanese input each emit `compositionstart`, one or more `compositionupdate`, and `compositionend`; the committed CJK text is adjacent to a Markdown marker without loss/cancellation, and exactly one Cmd+Z restores the initial source.

## Actual（原始）

The process runs in a locked/non-interactive GUI session. `NSWorkspace.shared.frontmostApplication` reports `loginwindow` PID 409; MarkFlow is a regular visible app but cannot become active. Global Quartz input therefore cannot target its WebView. Direct `CGEventPostToPid` reaches the process but bypasses the system input-method composition path; the strict harness times out because it sees no real composition commit.

## Actual（corrective run 后）

- GUI 会话已确认解锁，MarkFlow 可通过 `NSRunningApplication.activate` 成为 frontmost；
- 通过 Quartz HID event tap 投递的物理按键可驱动真实系统 IME；
- 中文 Pinyin 完全满足期望：`compositionstart`/`compositionupdate`/`compositionend`、CJK 提交在 marker 旁、一次 Cmd+Z 恢复；
- 日文 Kotoeri 完成真实 composition 并提交 CJK 文本，但**未触发 `compositionend`、一次 Cmd+Z 不恢复 source**。此现象在解锁 run 中暴露，判定为新的 product gap，已拆出独立 issue：
  - `P4B-JA-KOTOERI-UNDO-COMPOSITIONEND-GAP`

## Minimal reproduction

1. Build and launch the real E2E-feature `.app` with an isolated data/workspace.
2. Connect to embedded WebDriver port 4445 and focus `.cm-content` at the marker-adjacent position.
3. Select `com.apple.inputmethod.SCIM.ITABC`.
4. Activate MarkFlow and post physical keycodes for `zhongwen` + Space through the HID event tap.
5. Observe real `compositionstart`/`compositionupdate`/`compositionend` and committed CJK text.
6. Repeat with `com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese` and keycodes `nihongo`.
7. Observe the Japanese composition commits CJK text but no `compositionend`, and Cmd+Z does not restore.

## Byte/file impact

None. Autosave was enabled during the run per suite defaults; both isolated files were saved and then discarded with the temp workspace. The current input source was explicitly restored to the original (`com.apple.inputmethod.SCIM.ITABC`), the test PID was terminated, and port 4445 was released.

## Evidence

- `../evidence/P4B/20260830-083435-p4b-corrective-a8c73de/RUN.md`
- `../evidence/P4B/20260830-083435-p4b-corrective-a8c73de/ENVIRONMENT.md`
- `../evidence/P4B/20260830-083435-p4b-corrective-a8c73de/gates/C20-e2e-ime.log`
- `../evidence/P4B/20260830-083435-p4b-corrective-a8c73de/.../p4b-real-ime.json`
- follow-up issue: `20260830-p4b-ja-kotoeri-undo-compositionend-gap.md`

## Root cause

Original blocker: host GUI session state, not product code. Corrective run used a fresh unlocked session and routed keystrokes through the HID event tap.

Post-unlock finding: WebKit/CodeMirror + Kotoeri auto-commit integration does not dispatch `compositionend`, leaving CodeMirror in composition state and suppressing Undo.

## Fix

GUI session blocker: run validation in an unlocked GUI session with the app capable of becoming frontmost.

Japanese gap: requires product fix (see follow-up issue). The harness itself is not changed to accept synthetic events or text injection; it remains strict.

## Verification

- Chinese Pinyin: **PASSED** in `20260830-083435-p4b-corrective-a8c73de`.
- Japanese Kotoeri: **PARTIAL** — real composition + CJK commit verified, but `compositionend`/Undo gap remains open.

## Closure

- Fix commit for session blocker: not applicable
- Passing run for Chinese baseline: `20260830-083435-p4b-corrective-a8c73de`
- Reviewer: pending independent review
- Closed date: 2026-08-30
- Follow-up: `P4B-JA-KOTOERI-UNDO-COMPOSITIONEND-GAP`
