# P1A corrective final independent review

## Verdict

**Reviewer GO.** No P0 or P1 defects were found in fixed candidate `9ad05131fd3bebd938cf2700a30169889f3dac86`. The four previously reported P1 defects are corrected in implementation and independently reproduced as passing. One bounded transaction-id retention issue is retained as P2 and must be resolved or explicitly frozen in the P1B protocol.

This is not human acceptance and not the Program Owner decision. Those remain pending.

## Corrective findings closed

### Open and reload are clean — PASS

`markflow-core/src/session.rs:154-170` initializes revision zero and `persisted_revision=Some(Revision(0))`. Reload first constructs and validates the new snapshot/text and checked next generation, then commits revision zero and `persisted_revision=Some(Revision(0))` at `session.rs:191-214`. The independent harness verified open clean, reload clean, and no mutation after the rejected delayed patch.

### Delayed pre-reload patch identity/generation — PASS

`markflow-core/src/patch.rs:41-51` adds `binding_generation`, `session_id`, and `document_id` to `TextPatch`; `patch.rs:67-72` rejects any mismatch with `WrongIdentity`. `markflow-core/src/session.rs:188-213` advances generation and clears the retry ledger on reload. A patch captured before reload was independently replayed after reload and rejected while revision remained zero and the reloaded text remained intact.

### Multi-change EOL inheritance uses the base snapshot — PASS

`markflow-core/src/text_buffer.rs:121-157` resolves all replacement EOL maps into locals before applying any reverse-order mutation. `text_buffer.rs:201-247` applies the frozen same-ordinal → right → left → dominant order. The independent discriminator changed the same base revision at two ranges and produced exactly `X\nA\r\nB`, proving the earlier inherit did not observe the later explicit CRLF mutation.

### PositionMap mismatched geometry does not panic — PASS

`markflow-core/src/position_map.rs:25-28,58-65` binds a map to its originating text/EOL geometry. All public conversions call `validate_geometry` before indexing or scanning (`position_map.rs:73-79,91-97,124-130,133-139`), and `position_map.rs:179-184` returns `PositionMapMismatch`. The independent harness wrapped all four public conversions in `catch_unwind`; each returned the stable error and none panicked.

## Open finding

### P2 — Transaction-id duplicate protection expires after 256 accepted transactions

- Severity: **P2 / non-blocking for this P1A corrective candidate**
- File and location: `markflow-core/src/session.rs:29-31`, `session.rs:304-317`, `session.rs:353-371`; behavior is explicitly pinned by `session.rs:675-695`.
- Trigger: within one unchanged binding generation, accept more than `TRANSACTION_RETRY_WINDOW_CAPACITY` (256) transactions, then submit a new valid patch using an evicted transaction ID and the current base revision.
- Actual impact: the old ID is no longer present in `applied_transactions`, so the different payload bypasses `TransactionConflict` and is applied as a new transaction. This narrows the spec's unqualified “same transaction ID with different payload is rejected” guarantee to the retained window. The independent harness reproduced the acceptance after eviction.
- Why this is not P1 here: same-payload retries and different-payload reuse are correctly handled inside the active window; P1A has no IPC controller, and P1B specifies a single in-flight bounded controller with unique IDs. The risk requires an ID generator reset/reuse or a delayed request transformed to a current base revision after more than 256 accepted transactions. It does not reopen any of the four corrective data-integrity defects.
- Recommended fix: before P1B integration, freeze a session-lifetime uniqueness rule and test it at the bridge. With monotonic transaction IDs, retain a high-water mark/tombstone so evicted IDs are rejected (or force resync) rather than treated as new; alternatively retain sufficient fingerprints/outcomes for the documented retry lifetime. Update the public `apply_patch` contract to state the exact bounded behavior if the bounded policy is intentional.

## Coverage and compatibility assessment

- Correctness/regression: Core full suite passed 92/92; independent harness covers the four corrective paths and failure atomicity.
- Boundaries/errors: UTF-16/UTF-8/source-byte properties, BOM/CRLF boundaries, invalid encoding, overlap, stale revision, EOL provenance mismatch, and mismatched PositionMap geometry passed.
- Security/permissions: this P1A crate performs no filesystem I/O and adds no permission surface. No unsafe code or secret-bearing evidence was found.
- Concurrency/consistency: reload state transition is fallible-before-commit; patch apply constructs the next state before mutation. P2 bounded transaction retention is recorded above for P1B.
- API/data compatibility: `TextPatch` intentionally gains three identity fields and Core adds stable `wrong-identity` / `position-map-mismatch` errors. All in-repository call sites compile and test; P1B DTO consumers are not implemented yet, so there is no released bridge wire format to regress.
- Test sufficiency: adequate for the corrective scope. The author tests and independent harness discriminate each prior failure mode; all requested repository gates passed. Miri remains unavailable and is not misreported.

## Merge recommendation

**Recommend merge of candidate `9ad0513` from the independent code-review perspective.** P2 should be tracked into P1B, but it is not a P1A corrective blocker. Do not mark P1A fully complete until xian performs the required human contract acceptance and the Program Owner records the final decision.
