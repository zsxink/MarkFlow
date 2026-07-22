# image-naming Specification

## Purpose
定义粘贴图片的唯一命名策略，并保证既有图片引用和存储结构不受影响。

## Agent Context
- **源码入口：** `src/lib/imageUtils.ts`、`src/lib/storage.ts` 与 `src-tauri/src/commands/files.rs`。
- **关联规范：** `image-streaming`、`atomic-save`、`sidebar`。
- **不变量：** 新名称必须保留安全扩展名；同名冲突不得覆盖既有图片；既有图片路径与引用不得被迁移。
- **验证：** `npm test -- src/lib/imageUtils.test.ts`；`npx openspec validate image-naming --strict`。

## Requirements

### Requirement: 剪贴板图片按模板生成唯一文件名

当用户通过剪贴板粘贴图片到编辑器时，系统 SHALL 为图片文件生成带有时间戳的唯一文件名，避免因文件名相同导致的互相覆盖。

#### Scenario: 使用默认模板粘贴 PNG 图片
- **WHEN** 剪贴板命名模板为 `img-${date:yyyyMMdd}${time:HHmmss}`
- **AND** 用户在 2026-07-22 16:40:30 粘贴 PNG 图片
- **THEN** 生成的文件名为 `img-20260722164030.png`
- **AND** 扩展名由剪贴板 MIME 决定，不由模板提供

#### Scenario: 模板使用当前文档文件名
- **WHEN** 当前文档为 `guide.md`
- **AND** 模板包含 `${filename}`
- **THEN** `${filename}` 渲染为 `guide`
- **AND** 未保存文档渲染为 `untitled`

#### Scenario: 同一秒内粘贴多次同名图片
- **WHEN** 模板两次渲染出相同的 `img-20260722164030.png`
- **THEN** 第一张保持 `img-20260722164030.png`
- **THEN** 第二张生成为 `img-20260722164030-1.png`
- **AND** 后续冲突依次使用 `-2`、`-3`

#### Scenario: 保留剪贴板图片实际格式
- **WHEN** 剪贴板图片 MIME 为 `image/webp`
- **THEN** 文件扩展名为 `.webp`
- **AND** 系统不把图片转码为 PNG

#### Scenario: 本地与网络图片不使用模板
- **WHEN** 本地图片复制开关或网络图片下载开关已开启
- **THEN** 本地与网络图片保留来源文件名
- **AND** 仅在目标重名时追加递增序号

#### Scenario: URL 含 query/hash 时使用 MIME 类型
- **WHEN** 网络图片 URL 包含 query 参数或 hash 片段
- **THEN** 系统先发送 HEAD 请求获取响应 Content-Type
- **AND** 如果 Content-Type 为 `image/jpeg`，扩展名使用 `.jpg`
- **AND** 如果 Content-Type 不可用，从 URL 路径提取扩展名
- **AND** 如果路径也无扩展名，回退到 `.png`

### Requirement: 不影响已有文件和存储结构

系统 SHALL 在修改文件名格式后，保持原有的存储路径、目录结构和对已有图片文件的引用不变。

#### Scenario: 已有图片引用不受影响
- **WHEN** 用户打开包含已有 `image.png` 引用的 Markdown 文档
- **THEN** 图片 `image.png` 正常显示
- **THEN** 文件系统中原有 `image.png` 未被重命名或移动
