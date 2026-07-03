---
status: draft
date: 2026-07-03
---

# Proposal: 修复 asset:// 图片 URL 在 appendTransaction 中反复拼接

## 问题

WYSIWYG 模式下，`imageSrcResolverPlugin` 的 `appendTransaction` 会将 `asset://` 协议的 URL 当作相对路径重复处理，导致每次文档变更时路径无限变长，图片最终无法加载。

## 根因

`src/lib/editor.ts:430` 的 guard 条件：

```typescript
if (!src || src.startsWith('http') || src.startsWith('data:')) return;
```

只排除了 `http` 和 `data:` 协议，没有排除 `asset:` 协议。`appendTransaction` 第一次将相对路径转换为 `asset://` URL 后，第二次发起时 `asset://` URL 被当作相对路径传入 `resolveImagePath()`，导致路径被不断拼接。

## 修复方案

在 guard 中添加 `|| src.startsWith('asset:')`，一行改动。

## 影响范围

- `src/lib/editor.ts` —— 仅 `imageSrcResolverPlugin` 中第 430 行
- 不影响 save/load 流程（`assetToOriginalMap` 和 `replaceAssetUrlsWithOriginal` 不受影响）
- 不影响 source mode
