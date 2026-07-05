## Why

`src/lib/editor.ts` 当前 1228 行，是典型的上帝文件，包含了编辑器初始化、状态管理、序列化、图像处理、Mermaid 集成、剪贴板事件、统计、模式切换等所有逻辑。这使得模块职责不清、难以测试、新人上手困难。拆分后每个文件职责单一，可维护性显著提升。

## What Changes

- 将 `editor.ts` 按职责拆分为 6 个独立子模块 + 1 个精简后的入口文件
- 不改变任何运行时行为，不改变任何导出函数签名
- 所有已有调用方无需修改代码
- 新文件：
  - `editor.state.ts` — 文档脏检查、dirty/mode 跟踪、`getMarkdown`/`setMarkdown`
  - `editor.extensions.ts` — TipTap 扩展（CustomLink, BlockImage, mermaidCodeBlockExtension 等）
  - `editor.serializer.ts` — `normalizeImageMarkdown`, `checkSerializationIntegrity`, `extractDocAsFallback`
  - `editor.stats.ts` — `getWordCount`, `getLineCount`, `getCursorPos`
  - `editor.image.store.ts` — `assetToOriginalMap`, `imageSrcResolverPlugin`
  - `editor.image.bubble.ts` — `imageBubblePlugin` 全部 UI 逻辑

## Capabilities

### New Capabilities
- `editor-module-split`: 将 editor.ts 拆分为职责单一的模块化结构，不影响外部行为

### Modified Capabilities

- 无 — 本变更纯重构，不修改任何 spec 级别的需求

## Impact

- `src/lib/editor.ts`: 1228 行 → ~200 行（仅保留初始化、paste/drop 事件绑定，导出 getEditor/getMode/setMode）
- 6 个新文件每个 ~100-250 行
- 所有导出函数签名不变，外部模块不受影响
- `import` 路径需在入口文件 editor.ts 中重新导出（barrel export）
