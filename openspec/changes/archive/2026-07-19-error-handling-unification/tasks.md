## 1. 前端 — sidebar.fileops.ts 修复 bare catch

- [x] 1.1 修复行 86 的 bare catch → `logDebug('fileops', '...', { path, error: String(e) })`
- [x] 1.2 修复行 128 的 bare catch → `logDebug('fileops', '...', { path, error: String(e) })`
- [x] 1.3 修复行 172 的 bare catch → `logDebug('fileops', '...', { path, error: String(e) })`
- [x] 1.4 修复行 188 的 bare catch → `logDebug('fileops', '...', { path, error: String(e) })`
- [x] 1.5 修复行 290 的 bare catch → `logDebug('fileops', '...', { path, error: String(e) })`

## 2. 前端 — documentExport.ts 修复 console.error

- [x] 2.1 行 94 `console.error` → `logException('export', '...', error)`
- [x] 2.2 行 114 `console.error` → `logDebug('export', '...', { error: String(e) })`

## 3. 后端 — lib.rs 修复 expect() 调用

- [x] 3.1 行 129 `expect("mutex poisoned")` → `lock_mutex(&mutex)?`
- [x] 3.2 行 138 `expect("mutex poisoned")` → `lock_mutex(&mutex)?`
- [x] 3.3 行 144 `expect("mutex poisoned")` → `lock_mutex(&mutex)?`
- [x] 3.4 行 342 `expect("mutex poisoned")` → `lock_mutex(&mutex)?`
- [x] 3.5 行 386 `expect("mutex poisoned")` → `lock_mutex(&mutex)?`
- [x] 3.6 行 367 `expect("build MarkFlow")` → `match` + `tracing::error!` + `process::exit(1)`

## 4. 后端 — state.rs 修复 expect()

- [x] 4.1 行 39 `expect("build HTTP client")` → `Result` 返回，调用方 `?` 传播

## 5. 后端 — watcher.rs 修复 expect()

- [x] 5.1 行 462 `expect("watcher should start")` → `.unwrap()`

## 6. 验证

- [x] 6.1 运行 `cargo test` 确认 Rust 测试通过
- [x] 6.2 运行 `npm test` 确认前端测试通过
- [x] 6.3 检查 `cargo clippy` 无新 warning
