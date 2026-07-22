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
- [x] 2.4 Rust 端新增图片存储根目录授权、词法归一化、前缀比较和符号链接逐段检测，阻止 `..` 与符号链接逃逸

## 3. 图片处理服务统一

- [x] 3.1 `imageUtils.ts` 重写为统一入口：`copyImageToStorage()`、`copyLocalFileToStorage()`、`handleNetworkImage()` 三个方法分别对应剪贴板、本地文件、网络图片三种来源
- [x] 3.2 剪贴板图片（`copyImageToStorage` / `pasteImageFile`）始终保存到存储位置，不再检查 `localFileBehavior`
- [x] 3.3 `copyLocalFileToStorage()`：`localFileBehavior === 'reference'` 时保留原始路径，否则复制到存储位置
- [x] 3.4 `handleNetworkImage()`：`networkBehavior === 'download'` 时下载，否则保留 URL
- [x] 3.5 `editor.init.ts` 中 paste/drop 事件处理适配（类型导入改为 `types/image`）
- [x] 3.6 `editor.image.bubble.ts` 气泡编辑适配（调用 `getImageSettings()` 返回新类型，`handleNetworkImage` 接受新枚举）

## 4. 设置面板 UI 重构

- [x] 4.1 通用标签页精简：移出拼写检查、自动换行到编辑器标签页
- [x] 4.2 编辑器标签页重组：拼写检查+自动换行归入编辑器组；代码高亮归入代码块组，与行号/自动换行集中展示；PlantUML + 界面组保留
- [x] 4.3 移除实时预览（livePreview）DOM 元素和事件绑定
- [x] 4.4 图片面板表单更新：本地文件行为 dropdown（复制/引用）、网络图片行为 dropdown（保留URL/下载）、引用路径样式 dropdown（相对/绝对）、移除旧 toggle 开关、移除「无特殊操作」选项
- [x] 4.5 自定义路径输入框占位文本和描述更新，支持更多路径格式
- [x] 4.6 PlantUML 布局调整：风险提示与可复制的默认服务器独立成块，输入框全宽放在说明下方
- [x] 4.7 `hydrateSettingsUI` / `buildSettingsFromUI` 适配新字段
- [x] 4.8 新增可复用垂直表单、全宽控件、路径选择器和提示块 CSS，并修正条件字段的隐藏优先级

## 5. 代码高亮真实生效

- [x] 5.1 WYSIWYG 模式：`applyCodeBlockSettings()` 通过 `.no-code-highlight` CSS class 控制代码高亮显示
- [x] 5.2 WYSIWYG CSS：`.no-code-highlight .hljs-*` 所有 token 颜色设置为 `inherit !important`
- [x] 5.3 源码模式：`editor.source.ts` 使用 `highlightCompartment` 动态控制 CodeMirror `syntaxHighlighting` extension
- [x] 5.4 `applyCodeBlockSettings()` 响应式调用：`settings:changed` 事件触发时同时应用高亮、行号、自动换行

## 6. Rust 后端专用图片命令

- [x] 6.1 新增 `write_image_to_storage`、`copy_image_to_storage`、`download_image_to_storage` 图片专用命令，图片入口不再调用通用写入/复制/下载 IPC
- [x] 6.2 图片专用命令从持久化设置和当前文档/工作区重新计算授权根目录，并拒绝前端传入的不一致目录
- [x] 6.3 图片专用命令限制图片格式和 20MB 大小，检测符号链接/路径逃逸，创建目标目录并使用临时文件原子落盘；网络下载保留 SSRF 与并发限制

## 7. 测试覆盖

- [x] 7.1 Rust: 设置迁移函数 `migrate_v1_to_v2` 已实现并补充 version 1 → 2 字段映射回归测试
- [x] 7.2 Rust: 新增图片存储根目录内/外、缺失子目录、符号链接路径安全测试
- [x] 7.3 Rust: 新增图片专用命令辅助逻辑测试（格式扩展名、目标校验），并通过完整 Rust 测试
- [x] 7.4 前端: 已更新 `pathUtils.test.ts` 中 Windows 路径测试以匹配新 POSIX 规范化行为
- [x] 7.5 前端: `imageUtils.test.ts` 已更新 `getImageSettings` 测试适配新枚举
- [x] 7.6 前端: `settings.test.ts` 覆盖代码高亮分组、PlantUML 全宽输入及自定义路径条件显示
- [x] 7.7 前端: 代码高亮开关 CSS、CodeMirror compartment 与首次创建时的关闭状态均已实现

## 8. 验证与清理

- [x] 8.1 `npx tsc --noEmit` 通过
- [x] 8.2 `npm test` 283 全部通过（26 test files）
- [x] 8.3 `cargo test --lib -- --test-threads=1` 112 全部通过
- [x] 8.4 `npm run build` 通过
- [x] 8.5 在本地运行界面验证编辑器/图片标签页布局、滚动、条件字段和控件层级
- [ ] 8.6 手动验证图片粘贴/拖拽/网络三种入口行为符合 spec
- [ ] 8.7 手动验证旧版 settings.json 升级迁移后的设置值正确

## 9. version 3 设置模型与图片界面

- [x] 9.1 将图片存储模式调整为 `custom | document-dir | document-named-dir`，默认 `custom + ./images`
- [x] 9.2 新增本地/网络图片应用开关与剪贴板命名模板字段，完成 Rust/TypeScript 默认值和 version 2 → 3 迁移
- [x] 9.3 重做图片设置界面：三种目录规则、条件路径输入与目录选择器、来源开关、引用样式、剪贴板模板及变量说明
- [x] 9.4 更新设置界面和迁移单元测试，覆盖条件显示、默认值与旧设置映射

## 10. 路径与剪贴板命名

- [x] 10.1 实现文档同级目录和单层 `${filename}-images` 目录解析，覆盖多点文件名与跨平台路径
- [x] 10.2 实现剪贴板模板 `${filename}`、`${date:<format>}`、`${time:<format>}` 的安全渲染
- [x] 10.3 保留剪贴板 MIME 对应扩展名；只在冲突时追加 `-1`、`-2`，本地/网络来源保留原名
- [x] 10.4 补充路径、模板、格式和冲突命名测试

## 11. 未保存文档暂存与首次保存迁移

- [x] 11.1 在 Rust 中增加跨平台 MarkFlow 本地数据目录和 `pending-images/<draft-id>` 管理，禁止前端指定暂存根路径
- [x] 11.2 增加暂存图片写入、清单、迁移和清理专用命令，保持格式、大小、路径与符号链接安全约束
- [x] 11.3 前端为未保存文档维护 draft id 和待迁移映射；绝对路径直接写入，相对规则写入暂存
- [x] 11.4 首次保存接入“迁移 → 替换 Markdown 引用 → 写文件 → 清理”事务流程；失败时中止保存并保留暂存
- [x] 11.5 明确放弃草稿时清理，异常退出遗留目录启动时按 7 天规则清理
- [x] 11.6 补充 Rust 与前端测试，覆盖成功、失败重试、重名、清理和绝对路径旁路
- [x] 11.7 保存事务增加图片写入屏障，覆盖保存过程中继续插图及保存失败重试

## 12. 最终验证

- [x] 12.1 运行 `npx tsc --noEmit`、`npm test`、`cargo test --lib -- --test-threads=1`、`npm run build`
- [ ] 12.2 在 Tauri 中手动验证三种目录模式、三种图片来源、未保存首次保存和失败提示
- [x] 12.3 复核 Issue #156 方案、OpenSpec 规范与实现一致，并更新 issue 说明
