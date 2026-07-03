---
status: draft
date: 2026-07-03
---

# Specs: 图片 URL 路径膨胀修复

## 概述

WYSIWYG 模式下 `imageSrcResolverPlugin` 不应重复处理已转换为 `asset://` 协议的图片 URL。

## 变更前行为

每次文档变化时，`appendTransaction` 扫描所有图片节点。如果 src 不是 `http` 或 `data:` 开头，就将其通过 `resolveImagePath()` + `convertFileSrc()` 转换。但 `asset://` URL 也被当作非 HTTP 路径重新处理，导致路径拼接。

## 变更后行为

`imageSrcResolverPlugin` 的 `appendTransaction` 跳过 src 以 `asset:` 开头的图片节点，只处理原始本地路径（相对/绝对路径）。

## 边界条件

### 正常流程

| 输入 src | 初始处理 | 后续处理 |
|----------|----------|----------|
| `./assets/image.png` | → `asset://localhost/.../image.png` | 跳过（已转换） |
| `/abs/path/image.png` | → `asset://localhost/abs/path/image.png` | 跳过（已转换） |
| `https://example.com/img.png` | 跳过（HTTP 协议） | 跳过（HTTP 协议） |
| `data:image/png;base64,...` | 跳过（data 协议） | 跳过（data 协议） |

### 用户编辑

用户通过 image bubble 编辑图片路径后：
- 新路径如果是相对/绝对路径 → 正常转换 → 跳过
- 新路径如果是 HTTP URL → 跳过
- `assetToOriginalMap` 更新为新映射

### Save 流程

- `replaceAssetUrlsWithOriginal()` 仍然正常工作，不受影响
- 写入 Markdown 文件的是原始路径（而不是 asset:// URL）

## 回归检查

1. 相对路径图片（`./assets/foo.png`）在 WYSIWYG 中正常显示
2. 绝对路径图片（`/Users/.../foo.png`）在 WYSIWYG 中正常显示
3. HTTP 图片正常显示
4. Base64 data URL 图片正常显示
5. Save 后 Markdown 中保存的是原始路径
6. 切换到 source mode 再切回来，图片路径不变
