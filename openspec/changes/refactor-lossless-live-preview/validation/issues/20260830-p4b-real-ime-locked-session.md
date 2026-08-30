# P4B real IME evidence blocked by locked GUI session

状态：**RESOLVED — GUI 会话解锁问题已解决；中文与日文真实 IME 均完全通过**

> **结论修正（2026-08-30 后续）**：本 issue 曾记载日文为「product gap」，该结论**已被推翻**。
> 日文 composition 不结束的根因是 harness **未发送确认键**（Kotoeri ライブ変換需按 **Return** 确认，
> 旧 harness 只送 `nihongo ` 尾随空格后等待），**产品源码零改动**。
> **事实更正（2026-08-30，独立 Reviewer F-9）**：此前本文件称「按的是右方向键」，该叙述与 git 历史
> 不符——`p4b-real-ime.e2e.mjs` 的 `b50e392` 版无方向键、无 `target.id === 'ja'` 分支，
> `git log -S"Arrow"` 仅命中修复提交自身的注释。「右方向键」从未作为已提交基线存在。详见
> `20260830-p4b-ja-kotoeri-undo-compositionend-gap.md` 与
> `../evidence/P4B/20260830-102354-p4b-ime-7869de8/RUN.md`。

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
- 日文 Kotoeri 当时**未触发 `compositionend`、一次 Cmd+Z 不恢复 source**，一度判定为 product gap
  （`P4B-JA-KOTOERI-UNDO-COMPOSITIONEND-GAP`）。后续调查推翻该判定：真实根因是 harness 用错确认键，
  改为 Return 后日文与中文事件形状完全一致，产品代码零改动。

## Actual（最终，corrective run `20260830-102354-p4b-ime-7869de8`）

| 目标 | 提交结果 | Undo | 提交后 `view.composing` |
| --- | --- | --- | --- |
| zh-Hans Pinyin | `# marker\n` → `#中文 marker\n` | 1 次 Cmd+Z 精确还原 | `false` |
| ja Kotoeri（按 Return 确认） | `> marker\n` → `>日本語 marker\n` | 1 次 Cmd+Z 精确还原 | `false` |

两个目标的提交路径均为 `deleteCompositionText` → `insertFromComposition` → `compositionend`。

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

Post-unlock finding (**已修正**): 日文当时不结束 composition 并非产品缺陷。Kotoeri ライブ変換
在显示汉字后仍保持 composition 待确认（末次提交的 `isComposing` 仍为 `true`），必须按 **Return**
确认才会触发真正的 `compositionend`。原 harness **未发送任何确认键**，只送 `nihongo `（尾随空格）
后等待（事实更正：此前所称「按右方向键」与 git 历史不符，见文首 F-9 更正）。
期间 CodeMirror 的 `InputState.ignoreDuringComposition()` 因 `composing > 0` 吞掉所有真实按键，
故 Undo 失效——对一个确实仍打开的 composition，这是正确行为。

## Fix

GUI session blocker: run validation in an unlocked GUI session with the app capable of becoming frontmost.

日文「gap」: **harness 修复**（补发确认键 Return；原先未发送任何确认键），**不需要产品修复**。
harness 仍然严格：不接受 WebDriver 文本注入、合成 `CompositionEvent` 或 `postToPid` 作为证据；
断言反而被收紧（要求 `compositionend`、`undoCount === 1`、提交后 `view.composing === false`）。

## Verification

- Chinese Pinyin: **PASSED**（`20260830-083435-p4b-corrective-a8c73de`，并在
  `20260830-102354-p4b-ime-7869de8` 以严格断言复测通过）。
- Japanese Kotoeri: **PASSED**（`20260830-102354-p4b-ime-7869de8`，严格断言）。

## Closure

- Fix commit for session blocker: not applicable
- Fix commit for Japanese harness: `7869de8`
- Passing run（中/日文均严格通过）: `20260830-102354-p4b-ime-7869de8`
- Reviewer: pending independent review
- Closed date: 2026-08-30
- Follow-up: `P4B-JA-KOTOERI-UNDO-COMPOSITIONEND-GAP` —— 已 RESOLVED（harness 缺陷），保留设计事实
