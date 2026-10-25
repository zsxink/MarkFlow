# Design

## 调研结论（已实测，apply 时可直接引用）

- 打开链路唯一收敛点：文件树/最近文件/系统多开 → `uiPorts.openDocument` → `openFileInEditor`（`src/ui/sidebar/fileops.ts:380-423`，端口装配 `src/main.ts:60-79`）。`openFileInEditor` 已调用 `getFileMetadata`（返回小写 `extension`，`src-tauri/src/commands/files/entry.rs:50-65`）。
- tab 会话：`src/ui/documents/session.ts`——`DocumentSession`（:20-29，无类型字段）、`DocumentTab` 快照（:30）、容量 20（:19,60-64）、`project()` 空态占位（:69-88）、`suspendCurrent`/`restore`（:94-123）、`closeDocumentTab`/`reopenClosedDocumentTab`（:293-301）、`rewriteDocumentTabPaths`（:363）。
- 内容区 `#editor-area`（`index.html:143`）由 `initEditor` 挂 `.editor-container`（`src/editor/init.ts:83-96`）；所有 tab 共享该挂载点，无按类型切换机制——需新增。
- Markdown 扩展名全应用统一为 `.md`（fileops 过滤器/冲突后缀/inline 新建均写死）——支持集 = `.md` + 7 图片扩展名，无既有白名单可复用。
- asset 协议：CSP `img-src` 已含 `asset:`；静态 scope `$HOME/**/*.{png,jpg,jpeg,gif,webp,svg,bmp}`（`src-tauri/tauri.conf.json:24-31`）恰好覆盖 7 格式但仅限 `$HOME`；动态授权现成模式 `allow_asset_directory(app, root)`（`src-tauri/src/commands/images/io.rs:13-17`）。注意 `authorize_image_storage` 授权的是**图片存储根**（粘贴图片落盘目录），不是任意预览目录——预览需新授权命令。
- 文件列表 Rust 侧分页：`read_dir_page_inner`（`src-tauri/src/commands/files_pagination.rs:42-91`，已有 ignore 过滤 + 排序分页）；单条目 `read_path_entry`（`src-tauri/src/commands/files/entry.rs:21-47`）与 `read_single_dir`（`src-tauri/src/commands/files/crud.rs:124`，watcher create 插入用）。设置读取范例 `files_pagination.rs:109-110`。
- 设置链路（复刻 #403）：TS 类型+默认值 `src/types/settings.ts:42-53,91-98`；Rust `src-tauri/src/config/settings.rs:66-85,136-159,175-228`（三处 default）；面板 markup/helpers `src/ui/settings/markup.ts:44-58`、`fields.ts:42-85,173-221`；`settings:changed` 消费 `src/main.ts:147-157`（ignore/pageSize 变化触发 `refreshFileTree()` 的既有模式）；Rust 契约测试 `src-tauri/src/commands/settings/tests.rs:33-78`。
- toast：UI 层 `showToast`（`src/ui/toast.ts:5-25`）；文件树测试范例 `src/ui/file-tree/__tests__/lazy.test.ts`；会话测试范例 `src/ui/documents/__tests__/session.test.ts`（mock `convertFileSrc` 于 :26）；Rust 分页测试范例 `src-tauri/src/commands/files_pagination/tests.rs:19-52`。

## D1 支持格式常量与分类（TS 单真相 + Rust 同步副本）

- `src/utils/openable-files.ts`（新，纯函数无 DOM/Tauri 依赖）：
  - `IMAGE_EXTENSIONS = ['svg','jpg','jpeg','png','gif','webp','bmp']`
  - `classifyOpenableFile(name: string): 'markdown' | 'image' | 'unsupported'`（取最后一个 `.` 后小写后缀；`.md` → markdown；∈ IMAGE_EXTENSIONS → image；无扩展名/其他 → unsupported）
  - `isFileBrowserSupported(name)`（= classify !== 'unsupported'）供 UI 复用
- Rust 侧副本：`src-tauri/src/commands/files/entry.rs`（或同模块新小节）`pub(crate) fn is_supported_browser_entry(name: &str) -> bool`（目录由调用方放行；`.md` + 7 图片后缀，小写比较）。TS/Rust 双侧同步靠两侧测试断言同一清单（注释互指，与设置字段同步同性质）。

## D2 设置字段 `fileBrowserShowUnsupportedFiles`（默认 false）

- TS：`AppSettings` 可选布尔字段 + `DEFAULT_SETTINGS` 补 `fileBrowserShowUnsupportedFiles: false`（单真相）。
- Rust：`settings.rs` 结构体字段 `file_browser_show_unsupported_files: bool` + serde default 函数 `false` + `Default` impl，三处与既有字段一致；契约测试补：默认 false、旧设置缺字段补 false、round-trip。
- UI：设置面板「文件树性能」组（markup.ts:44-58）加 checkbox「显示不支持格式的文件」（默认不勾选）；`buildSettingsFromUI`/`applySettingsToUI` 各补一行。
- 即时刷新：`src/main.ts` settings:changed 比较列表加 `fileBrowserShowUnsupportedFiles`，变化即 `refreshFileTree()`。

## D3 Rust 侧格式过滤（枚举链路统一实施）

- `read_dir_page_inner`（files_pagination.rs:42-91）：`load_settings_inner()` 取开关（与 :109-110 ignore patterns 同法）；关闭时 entry 过滤 `is_dir || is_supported_browser_entry(name)`。放在 ignore 过滤之后、排序分页之前——分页游标基于过滤后流，可见性与「加载更多」天然一致（这是选 Rust 侧而非 TS 侧过滤的根因：TS 侧过滤会破坏「页满触发加载更多」判定，大片不支持文件会遮蔽后续支持文件）。
- `read_single_dir`（crud.rs:124）与 `read_path_entry`（entry.rs:21-47）：同样规则——watcher create 增量插入与全量列表一致（开关关闭时 `notes.txt` 事件被滤掉；打开时正常插入）。
- 开关只影响「列出」，不影响任何读写/重命名/删除命令。

## D4 图片预览 tab 会话（session.ts 扩展）

- `DocumentSession` 加判别：`kind: 'document' | 'image'`（document 即现状路径，`context` 字段仅 document 会话使用；image 会话 `context` 恒 null、`pendingExternal` 恒 null、`startup` false）。
- 新导出 `openImagePreviewTab(path: string): Promise<boolean>`：
  1. canonical path；既有同 path 会话（任意 kind）→ `activateDocumentTab` 激活并返回 true（复用去重语义）
  2. `hasCapacity()` 否则 toast 并 false
  3. 动态授权（D5，失败仅 logDebug 不阻断——静态 scope 已覆盖 `$HOME`，动态授权是补充）
  4. `suspendCurrent()` 挂起当前会话 → 新建 image 会话置为 active → `project()`
- `restore(tab)` 分支：image 会话时 `store.stageState/setState({ activeFilePath: null, dirty: false })`（清掉切换来源文档的活动路径/脏标记投影，document.title 走文件名无 ●），不 attach 编辑器；`project()` 里 `#editor-area` 加 `preview-active` class → CSS 隐藏 `.editor-container`、显示预览容器（复用空态占位的创建/移除模式，见 :69-88）。
- 预览容器：`session.ts` 内聚过重则拆 `src/ui/documents/image-preview.ts`（新文件，≤200 行）——`ensurePreviewContainer()/hidePreviewContainer()`：`#image-preview` div + `<img>` + 工具行（「适应窗口/原始尺寸」切换按钮 + 文件名），挂 `#editor-area` 下。激活 image 会话时填充 `img.src = convertFileSrc(path)`；`onerror` → 占位「图片加载失败」。
- 缩放两态：容器默认 `fit`（img `max-width/max-height: 100%`、`object-fit: contain`，窗口 resize 天然自适应）；`original` 态 img 定宽高 `auto`（1:1）、容器 `overflow: auto` 可滚动。按钮点击切换（按钮文案随状态互换）。
- `closeDocumentTab(image)`：无 context 释放、无 dirty 确认，直接移除；`reopenClosedDocumentTab`：`closedPaths` 记 path，重开时按 `classifyOpenableFile` 重新分流（图片 → `openImagePreviewTab`）——`closedPaths` 仍可存纯 path，重开走统一分流入口即可。
- `rewriteDocumentTabPaths`：作用于所有会话的 `session.path`，image 会话天然覆盖；激活中的 image 会话同步刷新 `img.src`。
- 外部变更路由（`routeDocumentExternalChanges`）：跳过 image 会话（无 dirty/无确认）；文件被删不弹窗，激活时 img `onerror` 降级。
- `DocumentTab` 快照加 `kind` 字段；`document-tabs.ts` 渲染逻辑复用（标题/关闭按钮/滚入视野一致，可用小图标区分——可选，不做硬性要求）。
- 打开成功后 `recordRecentFile(path)` 与文档一致（最近文件重开走同一分流，行为自洽）。

## D5 预览 asset 授权（新 command）

- Rust：`src-tauri/src/commands/images/commands.rs` 加 `#[tauri::command] authorize_preview_directory(path: String, app: AppHandle)`：取 `Path::new(&path).parent()`（无 parent → Err），调既有 `allow_asset_directory(&app, parent)`；`lib.rs` 注册。
- TS：`src/infra/storage.ts` 加 invoke 封装；`openImagePreviewTab` 打开前 best-effort 调用（失败 logDebug，靠静态 scope 或渲染 onerror 降级）。

## D6 打开分流（fileops.ts）

`openFileInEditor` 入口（normalize 后）按 `classifyOpenableFile(path)`：
- `markdown` → 既有链路不动（tier/只读/readFile/commit 闭包）
- `image` → `await openImagePreviewTab(path)`；成功后 `recordRecentFile`；返回结果
- `unsupported` → `showToast(\`不支持该格式: ${后缀或'无扩展名'}\`)`；返回 false（不记录最近文件、不建 tab、不读文件）

## Non-Goals

- 缩放百分比自由调节/多图画廊/EXIF 面板（仅「适应/原始」两态）
- 非图片二进制（pdf/音视频）预览
- 文件树图标按文件类型区分（保持现状单一文件图标）
- `$HOME` 外授权失败的重试 UI（降级为占位提示即止）

## 测试落点

- `src/utils/__tests__/openable-files.test.ts`（新）：分类矩阵（大小写/多级点/无扩展名/7 格式/`.md`）
- `src/ui/documents/__tests__/session.test.ts` 扩充：图片 tab 去重/容量/切换挂起恢复（编辑器上下文保留）/关闭重开无确认/kind 快照
- `src/ui/sidebar/__tests__/`（fileops 路由）：image → openImagePreviewTab、unsupported → toast 且不 invoke readFile、md 原链路回归
- `src/ui/settings/__tests__/panel.test.ts` 扩充：新开关水合/保存
- Rust `files_pagination/tests.rs` 扩充：开关关闭过滤（目录放行、大小写后缀、无扩展名隐藏）、打开不过滤、增量单条目同规则
- Rust `settings/tests.rs` 契约：默认 false、旧配置补默认、round-trip
- 门禁：`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs`、`cargo fmt --check`、`cargo clippy -D warnings`、`cargo test`（本变更含 src-tauri，Rust 门禁必跑）
