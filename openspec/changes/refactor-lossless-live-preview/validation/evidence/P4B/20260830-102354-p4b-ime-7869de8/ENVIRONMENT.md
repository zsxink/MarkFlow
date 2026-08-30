# Immutable Environment Snapshot

| Field | Value |
| --- | --- |
| Captured | 2026-08-30T10:23:54+08:00 |
| Repository | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Base HEAD | `7869de8ac39428d8c9353044670d39a8a337fef6` |
| Candidate | P4B real-IME corrective: harness confirm key + strictened 7.3 assertions |
| Candidate implementation/test diff SHA-256 | `36052e3c61a248dbe5ebed83ac3f9509036e58d9ddc5e561c143809e71a3a369` |
| Supersedes | `20260830-083435-p4b-corrective-a8c73de` — Japanese IME conclusion corrected |
| Product source delta vs superseded run | **none** — `src/`, `src-tauri/`, `markflow-core/` are byte-identical to `b50e392` |
| Change vs superseded run | E2E harness (`e2e/**`) and validation records only |
| OS | macOS 26.5.2 (25F84), arm64 |
| Node / npm | 22.22.2 / 10.9.7 (managed runtime; the superseded run recorded 24.17.0 / 12.0.2 from a different shell PATH) |
| TypeScript / Vite / Vitest | 5.9.3 / 5.4.21 / 2.1.9 |
| Rust / Cargo | 1.96.0 / 1.96.0 |
| Tauri CLI / WebKit | 2.11.3 / 605.1.15 |
| OpenSpec CLI | 1.6.0 |
| Flags | lossless Core + Live Preview ON; P4B item flags independently OFF/ON/rollback |
| Workspace | generated isolated E2E files only; autosave 2s in lossless suite |

The product/test hash excludes validation artifacts and the user-supplied `validation/GOAL-executor-typora-complete.md`; that file remains untouched and unstaged.

## Real IME harness prerequisites (measured, not assumed)

| Prerequisite | Value |
| --- | --- |
| GUI session | unlocked; `/dev/console` owner is the operator |
| Accessibility trust | `AXIsProcessTrustedWithOptions` → true |
| Activation | `NSRunningApplication.activate(.activateIgnoringOtherApps)` → frontmost |
| Key delivery | `CGEvent.post(tap: .cghidEventTap)` — required, because `postToPid` bypasses Text Input Services and would not exercise the IME |
| Input source enumeration | Text Input Services (`TISCreateInputSourceList`) — 320 sources |
| Chinese source | `com.apple.inputmethod.SCIM.ITABC` |
| Japanese source | `com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese` (must be `TISEnableInputSource`d before `TISSelectInputSource`) |

`com.apple.HIToolbox.plist` deliberately is **not** consulted: it is a stale cache
that reported Japanese Kotoeri as absent while TIS correctly reported it
installed, which would have silently reduced 7.3 to a Chinese-only run.
