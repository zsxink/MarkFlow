## 实施清单

### 1. 拆分目录校验与创建（Rust）

- [x] 在 `src-tauri/src/commands/files_image.rs` 新增只校验不创建的函数（如 `reject_unsafe_existing_dir`）：目录已存在时校验非符号链接、非普通文件；目录不存在时直接成功返回。
- [x] 在 `authorize_image_storage` 中将 `ensure_safe_directory(&root)?` 替换为新校验函数，保留 `reject_symlink_hops` 与 `allow_asset_directory`。
- [x] 确认所有图片写入命令（`write_image_to_storage`、`copy_image_to_storage`、`download_image_to_storage`、`migrate_pending_images_to_root`）仍各自调用 `ensure_safe_directory`。

### 2. 单元测试（Rust）

- [x] 新增测试：打开文档时 storage root 不存在 → `authorize_image_storage` 返回成功但不创建目录。
- [x] 新增测试：storage root 已存在且为安全普通目录 → `authorize_image_storage` 仍成功授权。
- [x] 新增测试：storage root 已存在但为符号链接/普通文件 → `authorize_image_storage` 仍拒绝。

### 3. 前端/调用链确认

- [x] 确认前端 `prepareImageLifecycleForOpenedDocument` 调用链无需修改。
- [x] 确认现有前端测试不依赖「打开文件即创建目录」的行为；如有，调整断言为「不创建」。

### 4. 回归验证

- [x] 运行 `cargo test`（或 `cargo test --features e2e` 涉及图片模块的测试）。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build` 与 `npx tsc --noEmit`。
- [x] 手动验证：打开无图片文档不产生 `images` 目录；粘贴/拖入图片后目录按需创建且图片正常写入。