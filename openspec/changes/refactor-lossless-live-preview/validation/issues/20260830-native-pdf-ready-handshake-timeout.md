# Native PDF export page-ready handshake times out

- Severity: Stable regression blocker; outside lossless code path
- Evidence run: `evidence/P4B/20260830-051652-p4b-6432059/`
- Command: `node e2e/run.mjs regression`
- Result: failed at 20.1 seconds with `PDF_TIMEOUT: export page did not become ready`
- Reproduction: a separate isolated diagnostic rerun failed identically at 20.1 seconds
- Scope isolation: C00–C15 and C18 passed, including lossless 15/15 and smoke 5/5; PDF export does not call the 7.2a structural interaction path
- First correction: replaced unreliable custom-scheme navigation with a job-scoped document-title marker and retained resource/two-frame readiness with an occlusion fallback. It passed one isolated two-PDF run and one full candidate run.
- Remaining reproduction: run `20260830-054030-p4b-6432059` exported the first PDF, then timed out observing readiness for the second. The title-poll implementation calls `with_webview` and immediately reads a shared bool; main-thread closure scheduling can occur after that read.
- Second corrective action: await an explicit per-poll result from the main-thread WebView closure, keeping the same total deadline and PDF completeness checks.
- Constraint: do not merely increase timeout, skip the test, or weaken PDF validity/completeness assertions
- Corrective action: diagnose the offscreen WebKit/custom-navigation readiness channel and replace or repair it with a deterministic signal, with direct Rust tests and real regression E2E
- Status: OPEN
- Closure: CLOSED — final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C16 with two validated native PDFs; fresh review independently passed 9 PDF Rust tests and confirmed the single-deadline awaited sampling design.
