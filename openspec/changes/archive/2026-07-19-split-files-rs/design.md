## Context

`src-tauri/src/commands/files.rs` 有 1331 行，包含所有文件操作命令。按功能拆分为子模块以提高可维护性。

当前 `commands/` 目录结构：
- `mod.rs` — 仅 `pub mod files; pub mod settings;`
- `files.rs` — 所有文件操作（1331 行）
- `settings.rs` — 设置相关命令

## Goals / Non-Goals

**Goals:**
- 按功能职责将 `files.rs` 拆分为 4 个文件
- 所有 `#[tauri::command]` 函数签名保持不变
- 前端 IPC 不受影响
- 通过 `cargo test` 和 `cargo clippy -- -D warnings`

**Non-Goals:**
- 不改变任何功能逻辑
- 不重构 `settings.rs`
- 不修改前端代码

## Decisions

### 拆分方案

**`files.rs`**（核心文件操作，保留）：
- 共享类型：`FileEntry`、`FileStats`、`RemoteImageData`
- 核心 I/O：`read_file`、`write_file`、`create_file`、`create_dir`
- 管理操作：`rename_path`、`delete_path`、`copy_file`
- 查询操作：`read_single_dir`、`read_path_entry`、`file_exists`、`get_file_stats`
- Base64 I/O：`read_file_as_base64`、`write_file_from_base64`
- 导出操作：`save_mermaid_svg_export`、`save_mermaid_png_export`、`save_image_export`、`save_document_export`
- 共享工具函数：`resolve_path`、`atomic_write`、`cleanup_stale_temp_files`、`validate_parent_in_workspace`、`validate_path_in_workspace`、`normalize_lexical`、`count_lines`、`select_export_path`

**`files_pagination.rs`**（新建）：
- `DirectoryPage` 类型
- `read_dir`（分页目录列表）
- `read_single_dir`（单页目录读取）— **保留在 files.rs**
- 辅助函数：`directory_generation`、`entry_sort_key`、`read_dir_page_inner`

**`files_image.rs`**（新建）：
- `download_image`（异步下载图片）
- `fetch_remote_image_as_base64`（获取远程图片 base64）
- 辅助函数：`fetch_remote_image_bytes`

**`files_meta.rs`**（新建）：
- `fetch_page_title`（获取网页标题）
- `fetch_page_title_inner`（内部实现）
- 辅助函数：`extract_title_from_bytes`、`find_case_insensitive`

### 模块间依赖

- `files_pagination.rs`、`files_image.rs`、`files_meta.rs` 需要 `files.rs` 中的 `resolve_path`、`validate_path_in_workspace` 等共享函数
- 方案：将共享函数和类型保留在 `files.rs` 中，子模块通过 `use super::files::*` 引用
- `mod.rs` 使用 `pub use files::*` 等重新导出所有命令

### 重新导出策略

`mod.rs` 改为：
```rust
pub mod files;
pub mod files_image;
pub mod files_meta;
pub mod files_pagination;
pub mod settings;

pub use files::*;
pub use files_image::*;
pub use files_meta::*;
pub use files_pagination::*;
```

## Risks / Trade-offs

- [编译时间] 拆分模块会略微增加编译时间（更多文件需要分别编译）→ 影响极小，可忽略
- [循环依赖] 子模块依赖 `files.rs` 的共享函数 → 通过 `use super::files::*` 解决，避免循环
- [Tauri 命令注册] 需确认 `mod.rs` 的 `pub use` 确保所有命令在 `lib.rs` 中可见 → 验证 `cargo build` 即可
