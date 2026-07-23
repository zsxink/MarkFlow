# image-storage-engine Specification

## Purpose
定义统一的图片处理服务，覆盖本地文件、剪贴板、网络三种来源的图片存储与路径解析行为。提供跨平台路径解析层，支持 `./images`、`../assets`、POSIX 绝对路径、Windows 盘符路径和 UNC 路径，并确保符号链接和 `..` 遍历不逃逸出授权的图片存储根目录。

## Agent Context
- **源码入口：** `src/lib/imageUtils.ts`、`src/lib/pathUtils.ts`、`src/lib/storage.ts`、`src-tauri/src/commands/files.rs`
- **关联规范：** `image-streaming`（本变更）、`image-naming`（本变更）、`safe-http-fetch`
- **不变量：** 存储位置必须经过授权目录校验；剪贴板图片始终保存到存储位置，不提供引用选项；本地图片默认复制到存储位置
- **验证：** `npm test -- src/lib/imageUtils.test.ts src/lib/pathUtils.test.ts`；`cargo test`

## Requirements

### Requirement: 统一图片处理入口

系统 SHALL 由 `imageUtils.ts` 统一处理所有来源的图片存储与引用，消除按入口分散的路径、命名和暂存逻辑。

#### Scenario: 统一处理本地图片
- **WHEN** 用户粘贴/拖入本地图片文件
- **THEN** 统一图片服务检查 `imageApplyToLocal` 设置
- **AND** 为 `true` 时复制到存储位置并返回引用路径
- **AND** 为 `false` 时直接引用源文件路径

#### Scenario: 统一处理剪贴板图片
- **WHEN** 用户粘贴来自剪贴板的图片
- **THEN** 统一图片服务始终将图片保存到存储位置
- **AND** 不受本地或网络来源开关影响
- **AND** 生成的引用路径根据 `imageReferenceStyle` 决定相对或绝对

#### Scenario: 统一处理网络图片
- **WHEN** 用户在 Markdown 中插入网络图片 URL
- **THEN** 统一图片服务检查 `imageApplyToNetwork` 设置
- **AND** 为 `false` 时保留原始 URL
- **AND** 为 `true` 时下载到存储位置并返回本地路径

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

### Requirement: 三种存储目录规则

系统 SHALL 使用明确的枚举值替代松散字符串，定义图片存储位置行为。

#### Scenario: 指定路径模式
- **WHEN** `imageStorageMode` 为 `'custom'`
- **THEN** 图片存储在 `imageCustomPath` 指定的路径下
- **AND** 空值回退为 `./images`

#### Scenario: 文档同级模式
- **WHEN** `imageStorageMode` 为 `'document-dir'`
- **AND** 当前文档为 `/docs/guide.md`
- **THEN** 图片存储在 `/docs/`

#### Scenario: 文档命名目录模式
- **WHEN** `imageStorageMode` 为 `'document-named-dir'`
- **AND** 当前文档为 `/docs/guide.md`
- **THEN** 图片存储在 `/docs/guide-images/`
- **AND** 不创建 `/docs/guide/images/` 二级目录

### Requirement: 按图片来源应用存储规则

系统 SHALL 根据图片来源决定是否应用当前存储目录规则；剪贴板图片始终应用，本地和网络图片由各自开关控制。

#### Scenario: 本地图片开关关闭
- **WHEN** `imageApplyToLocal` 为 `false`
- **THEN** 本地图片保留原始路径，不复制文件

#### Scenario: 网络图片开关关闭
- **WHEN** `imageApplyToNetwork` 为 `false`
- **THEN** 网络图片保留原始 URL，不下载文件

#### Scenario: 来源开关开启
- **WHEN** 对应来源的应用开关为 `true`
- **THEN** 图片进入当前存储目录规则
- **AND** 本地与网络图片不使用剪贴板命名模板

### Requirement: 未保存文档图片暂存

系统 SHALL 将未保存文档且无法立即解析相对目标路径的图片写入当前用户的 MarkFlow 本地应用数据目录。

#### Scenario: 相对路径规则暂存
- **WHEN** 当前文档尚未保存
- **AND** 存储目标依赖文档路径
- **THEN** 图片写入 `MarkFlow/pending-images/<draft-id>/`
- **AND** 不写入公共系统临时目录
- **AND** 不在用户主目录根部创建裸目录

#### Scenario: 绝对路径立即生效
- **WHEN** 当前文档尚未保存
- **AND** 指定路径是有效的绝对路径
- **THEN** 图片直接写入该绝对路径
- **AND** 不创建待迁移暂存项

### Requirement: 首次保存迁移暂存图片

系统 SHALL 在第一次写入 Markdown 文件前迁移该草稿的全部暂存图片，并以迁移结果更新 Markdown 引用。

#### Scenario: 首次保存成功
- **WHEN** 未保存文档包含暂存图片
- **AND** 用户选择最终 Markdown 路径
- **THEN** 系统先将全部暂存图片原子复制到最终存储目录
- **AND** 更新 Markdown 中对应的图片引用
- **AND** 再写入 Markdown 文件
- **AND** 成功后删除对应暂存目录

#### Scenario: 迁移失败
- **WHEN** 任一暂存图片无法复制到最终目录
- **THEN** Markdown 保存被中止
- **AND** 暂存图片与清单均保留以便重试
- **AND** 编辑器内容不引用不存在的最终文件

#### Scenario: 暂存目录清理
- **WHEN** 用户明确放弃未保存文档
- **THEN** 立即删除该文档的暂存目录
- **WHEN** 应用异常退出留下暂存目录
- **THEN** 启动时清理超过 7 天且不属于可恢复文档的目录

#### Scenario: 保存过程中继续插入图片
- **WHEN** 首次保存已经开始迁移当前草稿
- **AND** 用户在保存完成前继续插入图片
- **THEN** 新图片等待当前迁移与 Markdown 写入完成
- **AND** 保存成功时新图片写入新的草稿，不会被旧草稿清理误删
- **AND** Markdown 写入失败时旧草稿保留，新图片继续写入该草稿以便下次统一重试

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
- **THEN** version 1 → 2 中间迁移保留其“引用原路径”语义
- **AND** version 2 → 3 最终迁移后 `imageStorageMode` 为 `'custom'`、`imageCustomPath` 为 `'./images'`
- **AND** `imageApplyToLocal` 为 `false`

#### Scenario: version 2 图片设置迁移到 version 3
- **WHEN** settings.json version 为 2
- **THEN** 新增 `imageApplyToLocal`、`imageApplyToNetwork` 与 `imageClipboardNameTemplate`
- **AND** 旧 `custom` 路径尽量保留
- **AND** 旧目录模式映射到最接近的新目录规则
- **AND** 已有 Markdown 引用和已有图片不被移动或改写
