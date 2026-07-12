## Why

切换文档时，editor-area 的滚动容器 scrollTop 没有被重置。打开长文档后向下滚动，再切换到较短文档，之前的滚动位置会导致前几行内容被遮挡。这是一个影响多文档编辑体验的 bug。

## What Changes

- 在 `loadDocument` 或 `handleDocumentChange` 中重置 editor-area 的 scrollTop 为 0
- 确保每次加载新文档时，滚动容器回到顶部

## Capabilities

### New Capabilities

### Modified Capabilities

- `active-document-state`: 在文档切换流程中增加滚动位置重置步骤

## Impact

- 受影响代码：`editor.init.ts`（loadDocument / handleDocumentChange 流程）
- 无 API 变更、无依赖变更
- 仅影响编辑器文档切换的 UI 行为
