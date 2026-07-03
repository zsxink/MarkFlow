---
status: draft
date: 2026-07-03
---

# Design: 修复 asset:// 图片 URL 路径膨胀

## 核心设计

在 `imageSrcResolverPlugin` 的 `appendTransaction` guard 条件中，增加对 `asset:` 协议的保护，防止已转换的 asset URL 被重复处理。

## 设计方案

### 修改点

**文件**: `src/lib/editor.ts`，`imageSrcResolverPlugin` 函数，第 430 行

**改动前**：
```typescript
if (!src || src.startsWith('http') || src.startsWith('data:')) return;
```

**改动后**：
```typescript
if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset:')) return;
```

### 理由

- `imageSrcResolverPlugin` 的目的是将**非 HTTP 的本地路径**（相对路径、绝对路径）转换为 Tauri asset protocol URL
- 一旦路径已经是 `asset://` 格式，说明已经转换完毕，不应再进入 resolve 流程
- `asset:` 协议是 Tauri v2 中表示本地文件的标准形式，不包含在 HTTP 排除条件中是一个遗漏

### 风险

- **低风险**：这是一个纯追加的 guard，不会影响现有的非 asset 路径处理
- `assetToOriginalMap` 维持不变，`replaceAssetUrlsWithOriginal` 不受影响
- Save/load 路径反向替换不受影响
- Source mode 不受影响

### 不变的内容

- `assetToOriginalMap` 的数据结构和填充逻辑不变
- `replaceAssetUrlsWithOriginal()` 不变
- `resolveImagePath()` 不变
- `imagePathToSrc()` 不变
- `getMarkdown()` 和 `setMarkdown()` 不变
