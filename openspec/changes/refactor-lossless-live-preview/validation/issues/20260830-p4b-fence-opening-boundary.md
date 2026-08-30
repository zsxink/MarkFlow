# P4B fence language commit at opening-token boundary

状态：CLOSED

| 字段 | 值 |
| --- | --- |
| Issue ID | `P4B-FENCE-OPENING-BOUNDARY` |
| Severity | Functional |
| Phase | P4B 7.6/7.9 |
| First run | exploratory desktop candidate, 20/21 |
| Commit/flags | base `a8c73de`; lossless + Live Preview + `codeFenceControls` ON |
| Environment | macOS 26.5.2, Tauri WebKit 605.1.15 |
| Owner | Codex root executor |

## Expected

Activating the opening-fence language control revalidates the current trusted fence range, changes only the language token, and one Undo restores the exact source.

## Actual

The control was visible but the commit failed closed, leaving the source unchanged. The desktop contract correctly failed one test.

## Minimal reproduction

1. Open the isolated fixture `````js title="keep"\nconst x = 1;\n``` `` in lossless Preview.
2. Enable `codeFenceControls`.
3. Activate the language control at document offset 0.
4. Observe no `js → ts` local patch.

## Byte/file impact

No disk write and no byte corruption. The unsafe/stale path failed closed; only the requested interaction was unavailable.

## Root cause

The revalidation resolved Lezer at `openMark.from`. At offset 0 that boundary resolves outside `FencedCode`, so the trusted target lookup returns null.

## Fix

Revalidate strictly inside the opening marker at `openMark.from + 1` in both commit and widget redraw paths. Add a DOM click + single-Undo unit regression and desktop source-patch assertion.

## Verification

- formal candidate run `../evidence/P4B/20260830-080554-p4b-widgets-a8c73de/`: C01 279/279, C03 843/843, C12 22/22;
- independent reviewer `/root/review_p4b_widget_e2e_v1`: PASS;
- exact source and byte restoration asserted after Undo/save.

## Closure

- Fix commit: pending the P4B implementation checkpoint commit
- Passing run: `20260830-080554-p4b-widgets-a8c73de`
- Reviewer: `/root/review_p4b_widget_e2e_v1`
- Closed date: 2026-08-30
