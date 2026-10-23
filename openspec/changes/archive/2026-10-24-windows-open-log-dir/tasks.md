# Tasks

## 1. 后端命令

- [x] 1.1 `src-tauri/Cargo.toml` 添加 `tauri-plugin-opener = "2"` 依赖，`src-tauri/src/lib.rs` 注册插件（`.plugin(tauri_plugin_opener::init())`），验证 `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- [x] 1.2 新建 `src-tauri/src/fs/open.rs`：实现 `open_in_file_manager` 命令（目录→`open_path`、文件→`reveal_item_in_dir`、不存在→`AppError::io`），抽出可单测的判定纯函数（目录/文件/不存在分类），挂到 `fs/mod.rs`，并在 `lib.rs` `invoke_handler` 注册 `fs::open_in_file_manager`，验证 `cargo test --manifest-path src-tauri/Cargo.toml fs::` 通过
- [x] 1.3 为 `fs/open.rs` 补单元测试（正斜杠/反斜杠路径形态、目录/文件/不存在三类判定与错误码），验证 `cargo test --manifest-path src-tauri/Cargo.toml` 全绿，且 `cargo fmt --manifest-path src-tauri/Cargo.toml --check` 与 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过

## 2. 前端接入

- [x] 2.1 `src/ui/native-menu.ts`：`openLogDirectory()` 改为 `invoke('open_in_file_manager', { path: directory })`（`shellOpen` 仅保留给 `openFeedback` 的 URL），验证 `npm test -- src/ui/__tests__/native-menu.test.ts` 通过
- [x] 2.2 `src/ui/native-menu.ts`：`dispatchNativeMenuAction` 的 catch 在 `logException` 基础上增加基于 `classifyError` 的 `showToast` 用户可见提示，验证 `npm test -- src/ui/__tests__/native-menu.test.ts` 通过且新增/更新对应用例覆盖「失败→toast」路径
- [x] 2.3 `src/ui/file-tree-context-menu.ts`：`reveal` 分支改为调用 `open_in_file_manager`（移除该文件的 `plugin-shell` import），保留失败 toast 兜底，验证 `npm test -- src/ui/__tests__/file-tree-context-menu.test.ts` 通过
- [x] 2.4 `src/ui/image-context-menu.ts`：`openContainingFolder` 改为调用 `open_in_file_manager`（移除该文件的 `plugin-shell` import），保留 `reportUserActionError` 兜底，验证相关测试通过
- [x] 2.5 前端全量门禁：`npx tsc --noEmit`、`npm test`、`node scripts/check-layering.mjs` 全部通过，确认 `src/ui` 中除外部 URL 外无残留 `plugin-shell` 本地路径调用

## 3. 集成验证

- [x] 3.1 跑通 `npm run validate:openspec`（或 `npx openspec validate --all --strict`）与 `npm run build`，确认 change 校验与构建全绿
