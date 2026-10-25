# Tasks

## 1. 测试先行（实现前红）

- [x] 1.1 新增 `src/utils/__tests__/openable-files.test.ts`：分类矩阵——`.md`/`.MD` → markdown；7 图片后缀大小写混合 → image；`.txt`/`.csv`/无扩展名/多级点（`a.b.png`）→ 对应类。验证：红（模块不存在）
- [x] 1.2 扩充 `src/ui/documents/__tests__/session.test.ts`：`openImagePreviewTab` 去重（同 path 激活既有）、计入容量上限、document↔image 互切编辑器上下文保留、image 关闭无保存确认、快照含 `kind` 且 image 恒不 dirty。验证：红
- [x] 1.3 扩充 fileops 路由测试：图片扩展 → 走 `openImagePreviewTab` 不调 `readFile`；不支持格式 → toast 且不建 tab；`.md` 原链路回归。验证：红
- [x] 1.4 Rust `src-tauri/src/commands/files_pagination/tests.rs` 扩充：`fileBrowserShowUnsupportedFiles: false` 时目录放行、`.md`/`.PNG`/`.webp` 保留、`.txt`/无扩展名隐藏；`true` 时全量返回；单条目读取同规则。验证：红
- [x] 1.5 Rust `src-tauri/src/commands/settings/tests.rs` 契约扩充：默认 `false`、旧设置缺字段补 `false`、round-trip 保真。验证：红

## 2. 常量与设置字段

- [x] 2.1 新建 `src/utils/openable-files.ts`：`IMAGE_EXTENSIONS`、`classifyOpenableFile`、`isFileBrowserSupported` 纯函数。验证：1.1 绿
- [x] 2.2 TS 设置：`src/types/settings.ts` 加可选字段 + `DEFAULT_SETTINGS` 补 `fileBrowserShowUnsupportedFiles: false`（单真相）。验证：`npx tsc --noEmit`
- [x] 2.3 Rust 设置：`src-tauri/src/config/settings.rs` 字段 + serde default（false）+ `Default` impl 三处。验证：1.5 绿、`cargo test`
- [x] 2.4 Rust 支持格式判定：`src-tauri/src/commands/files/entry.rs` 加 `is_supported_browser_entry`（`.md` + 7 图片后缀，小写比较，注释与 TS 常量互指同步）

## 3. Rust 过滤与授权 command

- [x] 3.1 `read_dir_page_inner`（files_pagination.rs）：读设置开关，关闭时 `is_dir || is_supported_browser_entry` 过滤（位于 ignore 过滤后、排序分页前）。验证：1.4 绿
- [x] 3.2 `read_single_dir`（crud.rs）与 `read_path_entry`（entry.rs）：同规则过滤（watcher 增量与全量一致）。验证：cargo test 全量
- [x] 3.3 新 command `authorize_preview_directory`（images/commands.rs：parent 目录 → `allow_asset_directory`）+ `lib.rs` 注册 + `src/infra/storage.ts` invoke 封装。验证：`cargo clippy -D warnings`

## 4. 图片预览 tab

- [x] 4.1 `src/ui/documents/session.ts`：`DocumentSession`/`DocumentTab` 加 `kind`；`openImagePreviewTab`（去重→容量→授权 best-effort→挂起当前→置活→project）；`restore`/`suspendCurrent`/`closeDocumentTab`/`reopenClosedDocumentTab`/`rewriteDocumentTabPaths`/外部变更路由对 image 会话的分支（无 dirty、无确认、路径重写同步刷新）。验证：1.2 绿
- [x] 4.2 新建 `src/ui/documents/image-preview.ts`（≤200 行）：`#image-preview` 容器 + `<img>`（`convertFileSrc`）+ 「适应窗口/原始尺寸」切换 + `onerror` 占位「图片加载失败」；`#editor-area` `preview-active` class 切换编辑器容器显隐；CSS（fit：contain 自适应；original：1:1 + overflow 滚动）
- [x] 4.3 `openFileInEditor`（fileops.ts:380）入口分流：markdown 原链路 / image → `openImagePreviewTab` + `recordRecentFile` / unsupported → toast `不支持该格式: xxx` 返回 false。验证：1.3 绿
- [x] 4.4 Tab 栏（document-tabs.ts）对 image 标签渲染一致（标题/关闭/滚入视野），快照 `kind` 透出。验证：`src/ui/__tests__/document-tabs*.test.ts` 通过

## 5. 设置 UI 与即时刷新

- [x] 5.1 设置面板：markup.ts 文件树组加 checkbox「显示不支持格式的文件」；`buildSettingsFromUI`/`applySettingsToUI` 读写。验证：panel.test 扩充绿
- [x] 5.2 `src/main.ts` settings:changed 比较列表加 `fileBrowserShowUnsupportedFiles` → 变化 `refreshFileTree()`。验证：手动/单测覆盖比较逻辑（如可测）

## 6. 全量门禁

- [x] 6.1 `npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs` 全过
- [x] 6.2 `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`cargo test --manifest-path src-tauri/Cargo.toml` 全过；无 dead code、无调试日志
