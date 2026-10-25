# Proposal

## Why

Issue #433：MarkFlow 目前把所有文件当文本/Markdown 处理——点击图片文件会以源码模式打开二进制内容，不可用也不安全；文件浏览器把所有文件一并列出，用户无法快速定位可编辑/可预览的文件。需要：

1. **图片预览 tab**：svg/jpg/png（含 jpeg/gif/webp/bmp）在 tab 中直接预览渲染，自适应窗口缩放并支持查看原始尺寸。
2. **文件浏览器格式过滤设置**：新增开关控制是否显示不支持格式的文件；「显示」模式下点击不支持格式给出明确提示，不崩溃。

## What Changes

- **打开分流**（单一入口 `openFileInEditor`，`src/ui/sidebar/fileops.ts:380`）：按扩展名分类——`.md` 走既有编辑器链路；图片扩展名（svg/jpg/jpeg/png/gif/webp/bmp）打开图片预览 tab；其余格式 toast「不支持该格式: .xxx」并返回，不进入任何编辑器/预览
- **图片预览 tab**（`src/ui/documents/session.ts`）：`DocumentSession` 增加图片类型会话（无编辑器上下文、无 dirty 语义），共享既有 tab 栏、容量上限（20）、按 path 去重、关闭/重开、路径重写；内容区按活动 tab 类型切换编辑器挂载点与预览容器
- **预览渲染**：`<img src={convertFileSrc(path)}>`（asset 协议），默认「适应窗口」等比缩放，可切换「原始尺寸」（容器滚动）；非 `$HOME` 工作区通过新增轻量 command 对图片父目录做 asset 协议动态授权（复用 `allow_asset_directory` 模式）
- **格式过滤设置**：`fileBrowserShowUnsupportedFiles`（默认 `false`，即默认隐藏不支持格式的文件，用户指示），TS/Rust 两侧同步、默认值单真相在 `src/types/settings.ts`；过滤在 Rust 侧目录枚举链路（`read_dir_page_inner`、`read_single_dir`/`read_path_entry`）统一实施——目录始终显示，开关关闭时仅保留 `.md` + 7 种图片扩展名（大小写不敏感）；watcher 增量事件天然同规则；设置切换后文件树即时刷新（复用 `settings:changed` → `refreshFileTree` 链路）

## Capabilities

### New Capabilities

- `image-preview-tabs`：图片文件预览打开分流、预览渲染与缩放、预览资源授权

### Modified Capabilities

- `document-tabs`：新增「图片预览标签会话」requirement——图片 tab 复用标签栏/容量/去重/关闭恢复语义，无 dirty 确认，切换时正确挂起/恢复编辑器上下文
- `file-tree-architecture`：新增「支持格式过滤」requirement——设置开关、Rust 侧枚举过滤、目录恒显、即时刷新

## Impact

- `src/types/settings.ts`、`src-tauri/src/config/settings.rs`：新设置字段（含 Rust 三处 default + 契约测试）
- `src/types/file-tree.ts`（或 `src/utils/`）：可打开格式常量与分类纯函数（TS 单真相）；Rust 侧 `src-tauri/src/commands/files/` 同步常量 + 测试
- `src-tauri/src/commands/files_pagination.rs`、`src-tauri/src/commands/files/entry.rs`、`src-tauri/src/commands/files/crud.rs`：扩展名过滤
- `src-tauri/src/commands/images/`（或 files）：`authorize_asset_directory` 预览授权 command；`src-tauri/src/lib.rs` 注册
- `src/ui/documents/session.ts`、`src/ui/document-tabs.ts`、`src/ui/sidebar/fileops.ts`：图片会话与分流
- `src/ui/`（新预览容器模块 + CSS）：预览渲染与缩放切换
- `src/ui/settings/{markup,fields,panel}.ts`、`src/main.ts`：设置开关与即时刷新
- 测试：`src/ui/documents/__tests__/session.test.ts` 扩充、fileops/设置面板/Rust files_pagination 与 settings 契约测试扩充
- Non-Goals：图片 EXIF/元信息面板、多图画廊/缩略图模式、预览缩放百分比自由调节（仅「适应/原始」两态）、非图片二进制（pdf 等）预览、文件树图标按类型区分
