# image-naming Specification (Delta)

## Purpose
This delta spec updates the image-naming specification to remove the `strategy: 'original'` direct-reference behavior (since "no special operation" mode is removed), ensure naming strategies always generate unique filenames in the storage directory, and enhance URL extension extraction with MIME type fallback.

## Agent Context
Same as `openspec/specs/image-naming/spec.md`.

## MODIFIED Requirements

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
- **THEN** 系统先发送 HEAD 请求获取 Content-Type
- **AND** 如果 Content-Type 为 `image/jpeg`，扩展名使用 `.jpg`
- **AND** 如果 Content-Type 不可用，从 URL 路径提取扩展名
- **AND** 如果路径也无扩展名，回退到 `.png`

### Requirement: 不影响已有文件和存储结构

系统 SHALL 在修改文件名格式后，保持原有的存储路径、目录结构和对已有图片文件的引用不变。

#### Scenario: 已有图片引用不受影响
- **WHEN** 用户打开包含已有 `image.png` 引用的 Markdown 文档
- **THEN** 图片 `image.png` 正常显示
- **THEN** 文件系统中原有 `image.png` 未被重命名或移动

## REMOVED Requirements

### Requirement: Original naming strategy direct reference

**Reason**: 随着 `storageMode: 'none'` 模式移除，所有图片在插入时都有确定的存储位置，`strategy: 'original'` 不再有意义 —— 生成的文件名必须是唯一的。`original` 策略保留但语义改变：不再直接保留原始文件名不加修改，而是以原始文件名为基础添加时间戳后缀确保唯一性。

**Migration**: `strategy: 'original'` 的新行为等同于 `strategy: 'timestamp'` + 使用原始文件名作为 baseName。已有引用不受影响。
