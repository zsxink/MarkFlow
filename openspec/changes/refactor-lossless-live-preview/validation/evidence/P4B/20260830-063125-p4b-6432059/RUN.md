# Validation Run — P4B 7.2a final candidate

状态：FAIL（已封存于 C17）

| Field | Value |
| --- | --- |
| Run ID | `20260830-063125-p4b-6432059` |
| Environment | `./ENVIRONMENT.md` |
| Operator | `/root` |

Raw gate logs are immutable once written. C00–C16 passed, but C17 failed because the immediate dirty A→B P0S scenario did not observe the discard dialog even though the E2E hook reported dirty immediately before the click. The screenshot shows B opened. This run is sealed; C18 was not executed.

- AI gate: FAIL — see `gates/C17-e2e-p0s.log`
- Human acceptance: PENDING-MANUAL (later P4B)
- Program decision: NOT STARTED; no `P4B-SUBSTRATE-GO`
