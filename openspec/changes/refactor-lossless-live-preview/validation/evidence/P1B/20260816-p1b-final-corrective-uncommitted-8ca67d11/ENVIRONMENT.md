# P1B final corrective environment

## Candidate identity

| Field | Value |
| --- | --- |
| Base HEAD | `545692a77c2c1d8fabe037e94b9e42ef65f48149` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Candidate form | Uncommitted corrective worktree; not a Go candidate |
| Product-diff SHA-256 | `337b46cb3bad2e9918882236f44b9ac75bed96707e2b19d621adc3e3c46ec6ab` |
| Flag | `losslessCoreSession` remains default-off; tests opt in explicitly |
| Host | macOS 26.5.2 (25F84) |
| Node / npm | v24.17.0 / 11.13.0 |
| Rust / Cargo | 1.96.0 / 1.96.0 |
| Desktop runtime | real local Tauri debug WebKit application built with `--features e2e` |
| Desktop driver | `tauri-driver` absent from `PATH`, `~/.cargo/bin`, repository and `/tmp` search roots |

The diff hash was computed from `git diff --binary` after the final lifecycle
epoch/transition repair and before this evidence update. Historical reviewer
evidence remains untouched.
