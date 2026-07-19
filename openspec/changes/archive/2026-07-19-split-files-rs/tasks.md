## 1. 创建新模块文件

- [x] 1.1 创建 `src-tauri/src/commands/files_pagination.rs`，移入 `DirectoryPage` 类型、`directory_generation`、`entry_sort_key`、`read_dir_page_inner`、`read_dir` 函数
- [x] 1.2 创建 `src-tauri/src/commands/files_image.rs`，移入 `download_image`、`fetch_remote_image_as_base64` 函数
- [x] 1.3 创建 `src-tauri/src/commands/files_meta.rs`，移入 `fetch_page_title`、`fetch_page_title_inner`、`extract_title_from_bytes`、`find_case_insensitive` 函数

## 2. 更新模块导出

- [x] 2.1 更新 `src-tauri/src/commands/mod.rs`，添加 `pub mod files_pagination`、`pub mod files_image`、`pub mod files_meta`，以及对应的 `pub use` 重新导出

## 3. 清理 files.rs

- [x] 3.1 从 `files.rs` 中移除已迁移到子模块的函数和类型
- [x] 3.2 确保 `files.rs` 中保留共享类型（`FileEntry`、`FileStats`、`RemoteImageData`）和共享工具函数（`resolve_path`、`validate_path_in_workspace` 等）
- [x] 3.3 清理 `files.rs` 中不再需要的 `use` 语句

## 4. 验证

- [x] 4.1 运行 `cargo build` 确认编译通过
- [x] 4.2 运行 `cargo test` 确认所有测试通过
- [x] 4.3 运行 `cargo clippy -- -D warnings` 确认无警告
- [x] 4.4 检查所有 `#[tauri::command]` 函数签名未改变
