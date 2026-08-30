# P4B focused widget keys leaked into the CodeMirror source

状态：FIXED; CORRECTIVE VERIFICATION PENDING

| 字段 | 值 |
| --- | --- |
| Issue ID | `P4B-WIDGET-KEYBOARD-EVENT-LEAK` |
| Severity | Functional / source-integrity risk while widget-focused |
| Phase | P4B 7.4/7.6/7.9 |
| First run ID | `20260830-081754-p4b-matrix-a8c73de` C15 |
| Commit/flags | base `a8c73de`; task/fence widget flag ON |
| Environment | macOS 26.5.2, Tauri WebKit 605.1.15 |
| Owner | Codex root executor |

## Expected

When a widget control owns focus, its activation keys commit exactly one source transaction; plain navigation/editing keys do not fall through to CodeMirror. Tab remains available for focus traversal and platform shortcuts such as Cmd+Z remain available.

## Actual

The expanded desktop matrix reported 24 PASS / 3 FAIL. Task focus followed by Home/Backspace/Delete removed the leading list marker from the source. Fence copy did not activate from Enter. The subsequent roundtrip byte assertion also detected the missing first byte, correctly exposing the earlier leak rather than hiding it.

## Minimal reproduction

1. Enable the task checkbox pilot and focus `.mf-widget-task`.
2. Send Arrow/Home/End/Backspace/Delete/Escape.
3. Observe `- [ ] widget task` become ` [ ] widget task`.
4. Enable fence controls, focus `.mf-widget-fence-copy`, and press Enter; observe no clipboard activation.

## Byte/file impact

The isolated E2E workspace source changed in memory and could be autosaved. No user file was used. The failed run is preserved and its workspace was disposable.

## Root cause

The task key handler only contained Space/Enter; other focused-control keys bubbled into the editor. Fence buttons relied on WebKit's native synthesized click, which was not reliable through the embedded WebDriver path.

## Fix

- contain every non-modified plain key except Tab inside focused widget controls;
- explicitly activate task/fence actions on Space/Enter;
- keep Cmd/Ctrl/Alt shortcuts available;
- make read-only activation inert without leaking;
- add real EditorView unit regressions for key containment, one commit, and one Undo;
- make the desktop keyboard tests restore/save exact original fixture bytes.

## Verification

- focused unit after fix: `p4bWidgets.test.ts` 26/26 PASS;
- TypeScript, E2E syntax, and diff check: PASS;
- fresh full corrective run and independent review: PENDING.

## Closure

- Fix commit: pending P4B checkpoint
- Passing run: NOT RECORDED
- Reviewer: NOT RECORDED
- Closed date: NOT RECORDED
