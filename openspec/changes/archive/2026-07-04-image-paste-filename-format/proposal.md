## Why

当用户从剪贴板粘贴图片时，无论粘贴多少次，生成的文件名始终是统一的 `image.png`（或截图工具固定的文件名），后粘贴的图片会覆盖之前的文件，导致前面插入的图片全部丢失。需要为粘贴的图片生成带有时间戳的唯一文件名。

## What Changes

- 修改 `generateImageName` 函数，当 `namingStrategy` 为 `'timestamp'`（默认值）时，在文件名中加入时间戳
- 格式化规则：`{originalName}-{YYYYMMDD}-{HHmmss}.{ext}`（如 `image-20260704-143022.png`）
- 保留原文件名中 `image` 等语义信息，仅附加时间戳后缀
- 当同名文件已存在时自动递增序号（保持唯一性）

## Capabilities

### New Capabilities
- `image-naming`: 粘贴图片的文件名生成规则，包括时间戳格式、唯一性保证

### Modified Capabilities

<!-- 无现有 spec 变更 -->

## Impact

- `src/lib/imageUtils.ts` — `generateImageName` 的 `'timestamp'` 策略逻辑变更
- 不影响其他 strategy（`original`、`sequence`）
- 不影响已保存的图片文件
