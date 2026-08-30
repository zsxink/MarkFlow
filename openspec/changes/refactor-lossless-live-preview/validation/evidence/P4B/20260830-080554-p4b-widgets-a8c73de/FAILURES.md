# Candidate Failure and Retry Ledger

Historical failures are immutable evidence. A later pass does not erase the first observation.

## Desktop fence boundary failure

- First candidate desktop run: 20/21.
- Observation: the opening-fence language control resolved Lezer at `openMark.from`, a token boundary outside `FencedCode`; the local commit therefore failed closed and the test detected no source change.
- Correction: revalidation now resolves strictly inside the opening mark at `openMark.from + 1`; a unit DOM click + Undo regression was added.
- Subsequent exploratory desktop results: 21/21, then 22/22 after owner, read-only, clipboard, and policy coverage was completed.
- Formal rerun: recorded in `RUN.md` and `gates/`.

## Real IME attempts

| Attempt | Input mechanism | Result | Immutable artifact |
| --- | --- | --- | --- |
| 0 | Real `.app`, system input source, manual-ready harness | FAIL: no composition events before timeout | `ime/attempt-0-manual-timeout.json` |
| 1 | System Pinyin selected; Quartz helper required target activation | FAIL: target app could not become active | `ime/attempt-1-activation-failure.json` |
| 2 | System Pinyin selected; CGEvent posted directly to MarkFlow PID | FAIL: key delivery bypassed the system IME; no real composition commit | `ime/attempt-2-direct-pid-timeout.json` |

Environment finding: `NSWorkspace.shared.frontmostApplication` was `loginwindow` (PID 409), while MarkFlow had activation policy `regular` but `isActive=false`. This is a locked/non-interactive GUI-session limitation, not a product pass. The harness requires `compositionstart`, `compositionupdate`, `compositionend`, committed CJK text, and exactly one Cmd+Z; it therefore correctly rejected raw key delivery.

Cleanup after every attempt:

- current input source explicitly restored to `com.apple.keylayout.ABC`;
- temporary Kotoeri parent input source disabled;
- isolated fixtures remained byte-identical: `# marker\n` and `> marker\n`;
- explicit MarkFlow test PID terminated and E2E port 4445 released;
- launchd test environment variables removed.

Task 7.3 and `P4B-SUBSTRATE-GO` remain open until a real unlocked WebView run passes.
