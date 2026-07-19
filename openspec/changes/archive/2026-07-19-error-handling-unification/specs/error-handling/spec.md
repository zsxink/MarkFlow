# error-handling Delta — Enforcement Pass

_(No requirement changes. This change enforces existing spec requirements with concrete code fixes.)_

All three existing requirements are already satisfied by this change:

- **毒锁门禁助手** — `expect("mutex poisoned")` → `error::lock_mutex()` in `lib.rs`
- **统一后端错误类型和错误码** — `expect("build HTTP client")` → `Result` return in `state.rs`
- **前端没有不明原因的空捕获** — bare catches → `logDebug()`, `console.error` → `logException()` in frontend files
