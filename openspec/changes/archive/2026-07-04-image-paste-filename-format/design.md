## Context

当前通过剪贴板粘贴图片时，若 `namingStrategy` 为 `'timestamp'`（默认值），`generateImageName` 函数的执行路径为：

```
strategy='original'? → No
strategy='sequence'? → No
return originalName || `image-${ts}.png`
```

由于 `originalName` 通常为 `image.png`，函数直接返回 `image.png`，不包含时间戳，导致多次粘贴时互相覆盖。

已有 `'sequence'` strategy 能正确处理带时间戳的文件名，但其设计意图是产生顺序递增的文件名（`image-20260704-143022.png`、`image-20260704-143022-1.png`）而非保留原文件名语义。`'timestamp'` strategy 应作为默认策略，保留原文件名语义的同时附加时间戳。

## Goals / Non-Goals

**Goals:**
- 为粘贴的图片生成带有时间戳的唯一文件名
- 保留原始文件名的语义部分（如 `image`、`screenshot`）以便辨识
- 当天同一秒内多次粘贴同名图片时自动递增序号
- 后端无额外依赖，仅修改 `generateImageName` 函数逻辑

**Non-Goals:**
- 不改动存储方式、目录结构或图片上传流程
- 不改动其他 strategy（`original`、`sequence`）
- 不涉及已有图片文件的迁移

## Decisions

### 核心方案：修改 `generateImageName` 的 `'timestamp'` 策略逻辑

**决策**: 当 `namingStrategy === 'timestamp'` 时，始终在文件名中加入时间戳，保留原文件名主体部分。

**文件名格式**:
```
{basename}-{YYYYMMDD}-{HHmmss}.{ext}
```

示例：
- `image-20260704-143022.png`
- `screenshot-20260704-143023.png`
- `image-20260704-143022-1.png`（同一秒内重复粘贴时递增）

**理由**:
- `YYYYMMDD` 紧凑且排序友好
- 短横线分隔日期和时间部分，视觉清晰
- 保留原始文件名主体（`image`、`screenshot`）提供语义上下文
- 与现有 `'sequence'` 策略的 `image-{ts}` 基础格式保持一致，降低认知负担

**实现方式**:
在 `generateImageName` 中为 `'timestamp'` 策略增加处理分支：

```typescript
export async function generateImageName(
  originalName: string,
  strategy: string,
  existingNames?: string[]
): Promise<string> {
  // 1) 'original' 策略保持不变
  if (strategy === 'original' && originalName) return originalName;

  const now = new Date();
  const ts = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const ext = originalName ? getExtension(originalName) : 'png';

  // 2) 'timestamp' 策略：在文件名中追加时间戳
  if (strategy === 'timestamp') {
    const baseName = originalName ? stripExtension(originalName) : 'image';
    const base = `${baseName}-${ts}`;
    if (!existingNames) return `${base}.${ext}`;
    let n = 1;
    while (existingNames.includes(`${base}-${n}.${ext}`)) n++;
    return `${base}-${n}.${ext}`;
  }

  // 3) 'sequence' 策略：使用统一的 'image-' 前缀（保持不变）
  if (strategy === 'sequence' || !originalName) {
    const base = `image-${ts}`;
    if (!existingNames) return `${base}.${ext}`;
    let n = 1;
    while (existingNames.includes(`${base}-${n}.${ext}`)) n++;
    return `${base}-${n}.${ext}`;
  }

  return originalName || `image-${ts}.${ext}`;
}
```

### 不需要新增设置项

**决策**: 不新增 UI 设置。`'timestamp'` 已经是默认值且用户可自行切换为 `'original'`（无时间戳）或 `'sequence'`（统一 `image-` 前缀+时间戳）。

**理由**: 当前 `settings.ts` 中已有下拉菜单可选三种策略。只需修复 `'timestamp'` 的逻辑，无需改动 UI。

## Risks / Trade-offs

- **[文件重复风险]** 同一秒内粘贴多个同名文件 → 递增序号（`-1`、`-2`）处理，已有 `existingNames` 参数支持
- **[文件名长度]** 长原文件名+时间戳可能产生较长文件名 → 大多数系统支持 255 字符，不会达到限制
- **[向后兼容]** 策略变更后新文件名格式不同 → 不影响已有图片，仅新粘贴的文件使用新格式
