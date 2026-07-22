# image-naming Specification (Delta)

## Purpose
This delta spec updates the image-naming specification to remove the `strategy: 'original'` direct-reference behavior (since "no special operation" mode is removed), ensure naming strategies always generate unique filenames in the storage directory, and enhance URL extension extraction with MIME type fallback.

## Agent Context
Same as `openspec/specs/image-naming/spec.md`.

## MODIFIED Requirements

### Requirement: 粘贴图片生成带时间戳的唯一文件名

当用户通过剪贴板粘贴图片到编辑器时，系统 SHALL 为图片文件生成带有时间戳的唯一文件名，避免因文件名相同导致的互相覆盖。

#### Scenario: 粘贴带有默认文件名 image.png 的图片
- **WHEN** 用户从剪贴板粘贴一张文件名为 `image.png` 的图片
- **THEN** 生成的图片文件名为 `image-{YYYYMMDD}-{HHmmss}.png`（如 `image-20260704-143022.png`）

#### Scenario: 粘贴带语义文件名的图片
- **WHEN** 用户从剪贴板粘贴一张文件名为 `screenshot.png` 的图片
- **THEN** 生成的图片文件名为 `screenshot-{YYYYMMDD}-{HHmmss}.png`

#### Scenario: 同一秒内粘贴多次同名图片
- **WHEN** 用户在 1 秒内连续两次粘贴名为 `image.png` 的图片
- **THEN** 第一张生成为 `image-{YYYYMMDD}-{HHmmss}.png`
- **THEN** 第二张生成为 `image-{YYYYMMDD}-{HHmmss}-1.png`

#### Scenario: 文件名无扩展名时的默认扩展名
- **WHEN** 用户粘贴一张无扩展名的图片文件
- **THEN** 文件扩展名默认为 `.png`

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
