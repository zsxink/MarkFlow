# P1B corrective environment

## Candidate identity

| Field | Value |
| --- | --- |
| Base HEAD | `935195dc8231931dec58d769439365d1f69636e8` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Candidate form | Uncommitted corrective worktree; **not a Go candidate** |
| Product-diff SHA-256 | `9d31f3a307d35fd81fb5e4e23baeeb23843a57a68093a06a5cccb3042c3b9972` |
| Product files changed | 13 (`git diff --stat` at run start) |
| Flag | `losslessCoreSession` remains default-off; tests opt in explicitly |
| Host | macOS, local desktop workspace |
| Desktop driver | `tauri-driver` absent from `PATH` |

The diff hash was computed from `git diff --binary` **before this evidence
directory was created**, so it identifies the corrective product diff rather
than the evidence files themselves. The existing independent-review evidence
directory is intentionally untouched.
