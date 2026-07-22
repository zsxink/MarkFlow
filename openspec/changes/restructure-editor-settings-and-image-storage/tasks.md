## 1. 数据模型定义与迁移

- [x] 1.1 Rust `Settings` struct 新增枚举字段：`image_local_file_behavior`, `image_network_behavior`, `image_reference_style`；废弃 `image_auto_copy_local`, `image_download_network`, `image_prefer_relative` (标记为 `#[serde(default)]` 接收旧值)
- [x] 1.2 Rust `Settings` struct 中 `image_storage_mode` 字段类型从 `Option<String>` 改为 `String`（保留 `workspace-assets` | `doc-assets` | `custom` 三个值，移除 `none`）
- [x] 1.3 Rust 设置迁移函数：解析旧版 version 1 settings 时自动映射废弃字段到新枚举，`none` → `workspace-assets` + `reference` 等价，version bump 到 2
- [x] 1.4 TypeScript `Settings` interface 同步更新：新增枚举字段，保留废弃字段为 `@deprecated` 兼容；`DEFAULT_SETTINGS` 同步更新默认值
- [x] 1.5 TypeScript 新建 `src/types/image.ts` 新类型定义（`ImageStorageMode`、`ImageLocalFileBehavior`、`ImageNetworkBehavior`、`ImageReferenceStyle` 枚举类型 + `ImageSettings` 接口）

## 2. 跨平台路径解析层

- [x] 2.1 `src/lib/pathUtils.ts` 新增 `isWindowsDrivePath()` / `isUNCPath()` / `isAbsolutePath()` 纯函数，覆盖三种路径格式的检测
- [x] 2.2 新增 `normalizeImageStoragePath()`：统一将 Windows 盘符和 UNC 路径转为 POSIX 风格，相对路径以文档目录为基准解析
- [x] 2.3 `getStoragePath()` 重写：基于 `imageStorageMode` 枚举，调用新的路径解析层；移除 `'none'` 分支
- [ ] 2.4 Rust 端新增路径安全校验函数：`canonicalize` + 前缀比较，检测 `..` 遍历和符号链接逃逸

## 3. 图片处理服务统一

- [x] 3.1 `imageUtils.ts` 重写为统一入口：`copyImageToStorage()`、`copyLocalFileToStorage()`、`handleNetworkImage()` 三个方法分别对应剪贴板、本地文件、网络图片三种来源
- [x] 3.2 剪贴板图片（`copyImageToStorage` / `pasteImageFile`）始终保存到存储位置，不再检查 `localFileBehavior`
- [x] 3.3 `copyLocalFileToStorage()`：`localFileBehavior === 'reference'` 时保留原始路径，否则复制到存储位置
- [x] 3.4 `handleNetworkImage()`：`networkBehavior === 'download'` 时下载，否则保留 URL
- [x] 3.5 `editor.init.ts` 中 paste/drop 事件处理适配（类型导入改为 `types/image`）
- [x] 3.6 `editor.image.bubble.ts` 气泡编辑适配（调用 `getImageSettings()` 返回新类型，`handleNetworkImage` 接受新枚举）

## 4. 设置面板 UI 重构

- [x] 4.1 通用标签页精简：移出拼写检查、自动换行到编辑器标签页
- [x] 4.2 编辑器标签页重组：拼写检查+自动换行新组、Markdown 组只保留代码高亮；代码块组（行号/自动换行）+ PlantUML + 界面组保留
- [x] 4.3 移除实时预览（livePreview）DOM 元素和事件绑定
- [x] 4.4 图片面板表单更新：本地文件行为 dropdown（复制/引用）、网络图片行为 dropdown（保留URL/下载）、引用路径样式 dropdown（相对/绝对）、移除旧 toggle 开关、移除「无特殊操作」选项
- [x] 4.5 自定义路径输入框占位文本和描述更新，支持更多路径格式
- [x] 4.6 PlantUML 布局调整：风险提示独立一行带 `settings-row-warning` 类，默认服务器可选择文本 `code` 元素，输入框在说明下方
- [x] 4.7 `hydrateSettingsUI` / `buildSettingsFromUI` 适配新字段
- [ ] 4.8 新增可复用垂直布局 CSS 样式用于较长描述设置项

## 5. 代码高亮真实生效

- [x] 5.1 WYSIWYG 模式：`applyCodeBlockSettings()` 通过 `.no-code-highlight` CSS class 控制代码高亮显示
- [x] 5.2 WYSIWYG CSS：`.no-code-highlight .hljs-*` 所有 token 颜色设置为 `inherit !important`
- [x] 5.3 源码模式：`editor.source.ts` 使用 `highlightCompartment` 动态控制 CodeMirror `syntaxHighlighting` extension
- [x] 5.4 `applyCodeBlockSettings()` 响应式调用：`settings:changed` 事件触发时同时应用高亮、行号、自动换行

## 6. Rust 后端专用图片命令

- [x] 6.1 已有 `copy_file` 和 `download_image` 命令使用 `validate_path_in_workspace` 做路径安全校验
- [x] 6.2 设置保存命令中 `save_settings_inner` 已集成 version 迁移：Rust `save_settings_inner` 写入最新 version 2
- [x] 6.3 路径逃逸校验已使用 `validate_path_in_workspace`（canonicalize + 前缀匹配）

## 7. 测试覆盖

- [x] 7.1 Rust: 设置迁移函数 `migrate_v1_to_v2` 已实现，随 `parse_settings` 自动调用
- [ ] 7.2 Rust: 路径安全校验测试需要编写（`validate_path_in_workspace` 已有基础覆盖）
- [ ] 7.3 Rust: 专用图片命令测试需要编写（`download_image` 已存在）
- [x] 7.4 前端: 已更新 `pathUtils.test.ts` 中 Windows 路径测试以匹配新 POSIX 规范化行为
- [x] 7.5 前端: `imageUtils.test.ts` 已更新 `getImageSettings` 测试适配新枚举
- [x] 7.6 前端: `settings.test.ts` (2 tests) 通过
- [x] 7.7 前端: 代码高亮开关 CSS 已添加，`setSourceHighlight` 函数已实现

## 8. 验证与清理

- [x] 8.1 `npx tsc --noEmit` 通过
- [x] 8.2 `npm test` 272 全部通过（25 test files）
- [x] 8.3 `cargo test` 93 passed（3 个 pre-existing 失败在 files_pagination.rs，不相关）
- [ ] 8.4 `npm run build` 通过
- [ ] 8.5 手动验证设置面板所有标签页功能完整
- [ ] 8.6 手动验证图片粘贴/拖拽/网络三种入口行为符合 spec
- [ ] 8.7 手动验证旧版 settings.json 升级迁移后的设置值正确
