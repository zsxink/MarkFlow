## Context

打开文件流程会调用 `authorizeImageStorage(path)`（前端 `sidebar.fileops.ts` → `prepareImageLifecycleForOpenedDocument`）。后端 `authorize_image_storage`（`files_image.rs`）里调用了 `ensure_safe_directory(&root)`，而该函数内部执行 `fs::create_dir_all`，因此在打开/浏览文档时图片存储目录就被真实创建了。

真正需要目录的写入命令（`write_image_to_storage`、`copy_image_to_storage`、`download_image_to_storage`、`migrate_pending_images_to_root`）内部都已经各自调用 `ensure_safe_directory`，并不依赖打开时的预创建。

## Goals / Non-Goals

**Goals:**
- 打开/浏览文档不创建图片存储目录。
- 保持打开文件时的路径校验（符号链接、`..` 逃逸）与 asset 协议授权不缺失。
- 目录的物理创建完全下沉到图片写入命令。

**Non-Goals:**
- 不改变 `getStoragePath` 等路径计算逻辑。
- 不改动暂存（pending-images）机制。
- 不改变资产显示授权的行为（打开文件仍要把 storage root 加入 asset scope，否则已存在的图片无法渲染）。

## Decisions

**Decision 1：`authorize_image_storage` 移除目录创建，保留校验与授权。**

在 `files_image.rs` 的 `authorize_image_storage` 中删除 `ensure_safe_directory(&root)?`，改为只检查目录「若已存在且不是普通目录/是符号链接则拒绝」——即把创建与校验分离：新建一个只读校验函数（如 `reject_unsafe_existing_dir`）替换原来的 `ensure_safe_directory` 调用，`asset_protocol_scope().allow_directory(root)` 与 `reject_symlink_hops` 保持不变。

理由：`allow_directory` 允许授权一个尚不存在的目录（Tauri 会在写入时按需处理），因此打开文件时不必创建。写入命令仍各自用 `ensure_safe_directory` 真建目录。

**Decision 2：校验分两步——已存在则校验类型，不存在则不创建。**

`ensure_safe_directory` 目前的语义是「校验 + 建目录」。拆分：

- 打开文件的授权路径使用「只校验不创建」：
  - 目录已存在 → 校验非符号链接、非普通文件（保持原安全约束）；
  - 目录不存在 → 什么都不做，返回成功。
- 图片写入命令路径维持 `ensure_safe_directory` 原语义（校验 + `create_dir_all`）。

**Decision 3：前端调用链保持不变。**

`prepareImageLifecycleForOpenedDocument` 仍调用 `authorizeImageStorage(path)`。该命令返回值（normalize 后的 root 路径）当前未在读取端被用于建目录，改动仅在后端收敛行为，前端与测试无需改动（除非补充断言目录未被创建）。

## Risks / Trade-offs

- **风险：asset 授权不存在的目录**。Tauri 的 `allow_directory` 允许授权尚不存在的路径；首张图片写入命令内又会 `ensure_safe_directory` + `allow_asset_directory`，故渲染不受影响。该假设需在实现时用现有测试或手动验证确认。
- **风险：读取已存在的图片**。storage root 若已存在并含旧的图片引用，打开时其「类型/符号链接校验」仍需保留，避免授权到符号链接逃逸目录 —— Decision 1/2 已保留该校验。
- **权衡**：把「建目录」挪进写入路径后，万一将来某个读操作期望目录存在，会改变行为；当前所有需要目录的操作均为写操作，无此问题。