# Independent Review — P4B 7.2a

Reviewer: `/root/review_p4b_7_2a_v5`

Decision: **FAIL**

## Blocking finding

After a dirty document A receives an explicit discard decision, `confirmDocumentTransition()` releases the transition guard before the asynchronous switch to document B completes. While image lifecycle preparation or `openLosslessDocument()` is still pending, A can remain active and dirty; an autosave tick can therefore write A despite the user's discard decision.

The guard was also a shared boolean, so overlapping transitions could clear one another prematurely.

Required correction:

- hold the guard for the complete open/switch operation, including the post-decision asynchronous work;
- use reference-counted or token-based ownership;
- prove with a deferred-open test that autosave performs zero writes after discard while B is still opening;
- prove overlapping transitions and exceptional exits release ownership correctly.

## Other checks

The reviewer found no additional blocker. C00–C18 evidence counts matched the logs, focused Vitest and PDF Rust tests passed independently, and the PDF readiness implementation remained bounded by a single deadline.
