# P4B lossless E2E semantic assertion corrections

- Severity: Functional test-harness blocker (no product data loss)
- Run: `evidence/P4B/20260830-044524-p4b-6432059/`
- Command: `node e2e/run.mjs lossless`
- Result: 13 tests passed; heading mode transition and fence semantic count failed
- Heading root cause: the test used a toolbar element click even though this suite validates the lossless surface through its E2E semantic hooks; WebDriver reported a JavaScript exception on that first click
- Fence root cause: the test counted `.mf-fence` DOM spans, but CodeMirror splits one multiline mark decoration across its three line DOM nodes
- Corrective action: set and verify preview mode through `__markflowLossless.setMode/getMode`; assert the fence count through the existing `decorations()` semantic snapshot and retain the raw-source body assertion
- Product behavior: unchanged; one semantic fence construct already exists in the projection snapshot
- Status: CLOSED — final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C14 15/15 with semantic projection assertions.
