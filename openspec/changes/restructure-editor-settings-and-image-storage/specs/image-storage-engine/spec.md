# image-storage-engine Specification

## Purpose
定义统一的图片处理服务，覆盖本地文件、剪贴板、网络三种来源的图片存储与路径解析行为。提供跨平台路径解析层，支持 `./images`、`../assets`、POSIX 绝对路径、Windows 盘符路径和 UNC 路径，并确保符号链接和 `..` 遍历不逃逸出授权的图片存储根目录。

## Agent Context
- **源码入口：** `src/lib/imageUtils.ts`、`src/lib/pathUtils.ts`、`src/lib/storage.ts`、`src-tauri/src/commands/files.rs`
- **关联规范：** `image-streaming`（本变更）、`image-naming`（本变更）、`safe-http-fetch`
- **不变量：** 存储位置必须经过授权目录校验；剪贴板图片始终保存到存储位置，不提供引用选项；本地图片默认复制到存储位置
- **验证：** `npm test -- src/lib/imageUtils.test.ts src/lib/pathUtils.test.ts`；`cargo test`

## ADDED Requirements

### Requirement: 统一图片处理入口

系统 SHALL 提供单一入口 `ImageService` 处理所有来源的图片存储与引用，消除按入口分散的逻辑。

#### Scenario: 通过 ImageService 处理本地图片
- **WHEN** 用户粘贴/拖入本地图片文件
- **THEN** `ImageService` 检查 `imageLocalFileBehavior` 设置
- **AND** `imageLocalFileBehavior` 为 `'copy'` 时复制到存储位置并返回引用路径
- **AND** `imageLocalFileBehavior` 为 `'reference'` 时直接引用源文件路径

#### Scenario: 通过 ImageService 处理剪贴板图片
- **WHEN** 用户粘贴来自剪贴板的图片
- **THEN** `ImageService` 始终将图片保存到存储位置
- **AND** 不检查 `imageLocalFileBehavior` 设置
- **AND** 生成的引用路径根据 `imageReferenceStyle` 决定相对或绝对

#### Scenario: 通过 ImageService 处理网络图片
- **WHEN** 用户在 Markdown 中插入网络图片 URL
- **THEN** `ImageService` 检查 `imageNetworkBehavior` 设置
- **AND** `imageNetworkBehavior` 为 `'keep-url'` 时保留原始 URL
- **AND** `imageNetworkBehavior` 为 `'download'` 时下载到存储位置并返回本地路径

### Requirement: 跨平台路径解析层

系统 SHALL 提供一个纯函数集合，统一处理以下路径格式：`./images`、`../assets`、POSIX 绝对路径（`/home/user/images`）、Windows 盘符路径（`D:\Pictures\MarkFlow`）、UNC 路径（`\\server\share\images`）。

#### Scenario: 相对路径以文档目录为基准
- **WHEN** 自定义路径为 `./images` 且活动文档在 `/workspace/docs/readme.md`
- **THEN** 解析后路径为 `/workspace/docs/images`
- **WHEN** 自定义路径为 `../assets` 且活动文档在 `/workspace/docs/sub/readme.md`
- **THEN** 解析后路径为 `/workspace/docs/sub/../assets`（归一化后为 `/workspace/docs/assets`）

#### Scenario: POSIX 绝对路径
- **WHEN** 自定义路径为 `/home/user/Pictures/MarkFlow`（macOS/Linux）
- **THEN** 解析后路径保持 `/home/user/Pictures/MarkFlow`
- **AND** 不做任何前缀添加或转换

#### Scenario: Windows 盘符路径
- **WHEN** 自定义路径为 `D:\Pictures\MarkFlow`
- **THEN** 解析后路径保持 `D:/Pictures/MarkFlow`（转换为 POSIX 风格）
- **AND** 不做任何工作区前缀添加

#### Scenario: UNC 路径
- **WHEN** 自定义路径为 `\\server\share\images`
- **THEN** 解析后路径保持 `//server/share/images`（转换为 POSIX 风格）
- **AND** 不做任何工作区前缀添加

#### Scenario: Windows 驱动器和 UNC 检测
- **WHEN** 路径以 `[A-Za-z]:` 开头（如 `D:\path`）
- **THEN** 系统识别为 Windows 盘符路径
- **WHEN** 路径以 `\\` 开头
- **THEN** 系统识别为 UNC 路径
- **AND** 两种路径都不添加到 `workspace` 前缀

### Requirement: 符号链接和路径遍历保护

系统 MUST 禁止图片存储操作通过符号链接或 `..` 遍历逃逸出已授权的图片存储根目录。

#### Scenario: 符号链接保护
- **WHEN** 图片存储路径中包含指向授权目录外的符号链接
- **THEN** 操作被拒绝，返回错误：「不允许的路径：符号链接指向存储目录外」
- **AND** 没有文件被写入或读取

#### Scenario: `..` 遍历逃逸检测
- **WHEN** 解析后的存储路径通过 `..` 遍历到授权根目录之外
- **THEN** 操作被拒绝，返回错误：「不允许的路径：路径超出允许范围」
- **AND** 使用 `fs::canonicalize` 或等效方式归一化后再比较

### Requirement: 存储模式枚举化

系统 SHALL 使用明确的枚举值替代松散字符串，定义图片存储位置行为。

#### Scenario: 存储模式定义
- **WHEN** `imageStorageMode` 为 `'workspace-assets'`
- **THEN** 图片存储在工作区根目录的 `assets/` 下
- **WHEN** `imageStorageMode` 为 `'doc-assets'`
- **THEN** 图片存储在当前 Markdown 文档同级的 `assets/` 下
- **WHEN** `imageStorageMode` 为 `'custom'`
- **THEN** 图片存储在用户指定的自定义路径下
- **AND** 不再存在 `'none'`（无特殊操作）模式

### Requirement: 统一存储路径计算

系统 SHALL 通过统一的 `getStoragePath` 函数计算图片存储目标路径，消除因入口不同导致的路径不一致。

#### Scenario: 各入口存储路径一致
- **WHEN** 用户通过粘贴、拖拽、工具栏插入三种方式插入图片
- **AND** 三者使用相同的 `imageStorageMode` 和 `customPath` 设置
- **THEN** 三者的 `getStoragePath()` 返回值相同

### Requirement: 网络图片 URL 扩展名提取增强

当 URL 包含 query 或 hash 时，系统 SHALL 先尝试从 `Content-Type` 头部提取 MIME 类型以确定扩展名，仅在 MIME 类型不可用时回退到 URL 路径中的扩展名。

#### Scenario: URL 含 query 参数时使用 MIME 类型
- **WHEN** 网络图片 URL 为 `https://example.com/image?format=png&size=large`
- **AND** 服务器响应 `Content-Type: image/jpeg`
- **THEN** 生成的本地文件名使用 `.jpg` 扩展名
- **AND** 不信任 URL 中的 `format=png` 参数

#### Scenario: 无 MIME 类型时回退 URL 扩展名
- **WHEN** 网络图片服务器未返回 `Content-Type` 头
- **AND** URL 路径部分以 `.png` 结尾
- **THEN** 扩展名回退为 `.png`

### Requirement: 图片专用后端命令

系统 SHALL 提供专门的 Rust 命令处理图片文件操作，不走通用文件 IPC 命令，以限制操作范围和权限。

#### Scenario: 专用图片复制命令
- **WHEN** 需要将本地图片复制到存储位置
- **THEN** 调用 `copy_image_to_storage` 专用命令
- **AND** 该命令校验源路径和目标路径都在授权存储范围内
- **AND** 不使用通用 `copy_file` 命令

#### Scenario: 专用图片下载命令
- **WHEN** 需要从网络下载图片到存储位置
- **THEN** 调用 `download_image_to_storage` 专用命令
- **AND** 该命令校验下载路径在授权存储范围内
- **AND** 并发限制（最多 4 个）在原 `image-streaming` 规范中定义

### Requirement: 设置版本升级与向后兼容

系统 SHALL 在加载旧版 settings.json（version: 1）时自动将废弃字段映射到新枚举字段，确保用户设置不丢失。

#### Scenario: 旧版设置加载迁移
- **WHEN** settings.json version 为 1
- **AND** `imageAutoCopyLocal` 为 `true`
- **THEN** 迁移后 `imageLocalFileBehavior` 设为 `'copy'`
- **WHEN** settings.json version 为 1
- **AND** `imageAutoCopyLocal` 为 `false`
- **THEN** 迁移后 `imageLocalFileBehavior` 设为 `'reference'`

#### Scenario: 旧版 storageMode none 迁移
- **WHEN** settings.json version 为 1
- **AND** `imageStorageMode` 为 `'none'`
- **THEN** 迁移后 `imageStorageMode` 设为 `'workspace-assets'`（默认值）
- **AND** `imageLocalFileBehavior` 设为 `'reference'`（因其旧行为等同于引用原路径）
