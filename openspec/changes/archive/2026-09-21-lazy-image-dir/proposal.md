## Why

打开（浏览/只读预览/正常打开）一个 Markdown 文档时，即使完全没有触发任何图片操作，系统也会在当前文档目录（或配置的图片存储位置）下创建 `images` 文件夹。用户只是浏览文件，却被悄悄创建了目录，属于无意的副作用。

## What Changes

- 将图片存储目录的**创建时机**推迟到真正写入图片时：仅打开/浏览文件不再创建目录。
- `authorize_image_storage` 命令改为**只授权、不建目录**：仍校验路径合法性（符号链接、`..` 逃逸）并把目录加入 asset 协议 scope，但不再 `fs::create_dir_all`。
- 目录的物理创建由真正写入图片的命令按需完成（`write_image_to_storage`、`copy_image_to_storage` 等内部已有 `ensure_safe_directory`，保持不变）。
- 打开文件时前端仍调用 `authorizeImageStorage(path)` 用于路径校验与 asset 授权，调用链不变，仅后端行为收敛。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `image-storage-engine`: 新增 requirement —— 图片存储目录只在真正写入图片时创建；打开/浏览文档不得创建目录。配套明确 `authorize_image_storage` 只授权不创建的语义。

## Impact

- **代码**：`src-tauri/src/commands/files_image.rs`（`authorize_image_storage` 移除 `ensure_safe_directory`）；前端 `src/lib/storage.ts`/`src/components/sidebar.fileops.ts` 调用链不变。
- **行为**：首个图像写入前存储目录不存在；写入命令负责创建（现有逻辑已覆盖）。
- **测试**：`src-tauri/`（Rust 单元测试确认目录不被预创建）、`npm test`、`cargo test`。
- **兼容性**：无破坏性变更。已有目录不受影响；目录被删除后再次写入图片仍会按需重建。