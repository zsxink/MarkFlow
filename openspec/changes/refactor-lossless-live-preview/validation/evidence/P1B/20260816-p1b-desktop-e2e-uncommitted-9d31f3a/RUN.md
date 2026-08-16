# P1B corrective desktop E2E rerun

## Result

**PASS.** This is a new immutable follow-up run. It supersedes neither the earlier historical P1B run nor the 20260816 corrective non-desktop run; the latter remains correctly recorded as blocked before the temporary test driver was available.

## Command

```text
PATH="/tmp/markflow-tauri-driver.3yjKwS/bin:$PATH" node e2e/run.mjs lossless
```

The command rebuilt the Tauri debug E2E app and ran the real WDIO/WebKit desktop workflow with `losslessCoreSession` enabled and autosave enabled.

## Assertions passed

- Zero-edit open followed by two autosave ticks preserves bytes and mtime without writes (13 canonical fixture cases across two matrix assertions).
- Clean Cmd+S does not write.
- Source edit becomes dirty, saves, and reopens with the expected hash.
- A real body edit preserves CRLF and UTF-8 BOM bytes and reopens with the expected hash.
- Switching A to B neither writes A nor makes B dirty.

The exact sanitized WDIO result is retained in `logs/desktop-e2e-rerun.log`.

