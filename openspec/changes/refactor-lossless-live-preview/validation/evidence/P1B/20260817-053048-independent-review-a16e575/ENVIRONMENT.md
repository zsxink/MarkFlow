# P1B independent review environment

## Candidate identity

| Field | Value |
| --- | --- |
| Base HEAD | `545692a77c2c1d8fabe037e94b9e42ef65f48149` |
| Candidate | `a16e5751ab2af296c3fc2b77ed797e0076d9fd35` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Candidate form | Committed exact candidate (was an uncommitted corrective worktree) |
| Product/spec diff SHA-256 (vs base HEAD, product+design+spec) | `8acf35673cf04b4d16990a8bd3300a363cd92ed5c3a5a4c07527f5b55268f96b` |
| Flag | `losslessCoreSession` remains default-off; tests/product open Lossless opt-in explicitly |
| Host | macOS 26.5.2 (25F84) |
| Node / npm | v24.17.0 / 11.13.0 |
| Rust / Cargo | 1.96.0 (30a34c682) / 1.96.0 |
| Desktop runtime | real local Tauri debug WebKit application built with `--features e2e` |
| Review time (UTC) | `2026-08-17T05:30:48Z` |

## Identity note

The corrective `20260817-p1b-paste-reload-corrective-0c37c227` run recorded
"Full worktree diff SHA-256" = `8acf35673cf04b4d16990a8bd3300a363cd92ed5c3a5a4c07527f5b55268f96b`.
The committed candidate's product+spec diff vs the same base `545692a`
recomputes to the identical SHA. The commit added only the evidence directories
(untracked pre-commit), so the product bytes under review are exactly the
product bytes the corrective verified; the candidate identity is internally
consistent.