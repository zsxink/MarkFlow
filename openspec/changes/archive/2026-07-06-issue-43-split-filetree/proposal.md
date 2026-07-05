## Why

`src/components/fileTree.ts` 当前 805 行，树渲染、鼠标拖拽、内联重命名/创建、排序、DOM 操作全部混合在一个文件中，难以维护和测试。将其按职责拆分为独立模块，每个文件控制在 ~300 行左右。

## What Changes

- 从 `fileTree.ts` 拆出三个新文件：
  - `fileTree.core.ts` — 树渲染（`createTreeNode`）、展开/折叠、排序、`setWorkspacePath`
  - `fileTree.dragdrop.ts` — `initMouseDrag` 全部逻辑（~130 行）
  - `fileTree.inline.ts` — `startInlineRename`、`startInlineCreate`、输入框 helper
- `fileTree.ts` 保留为入口文件，从三个新模块 re-export 所有公共 API
- 对外接口不变，不涉及任何行为变更

## Capabilities

### New Capabilities
<!-- 纯重构，不引入新能力 -->
无

### Modified Capabilities
<!-- 纯重构，不改行为，无需 delta spec -->
无

## Impact

- `src/components/fileTree.ts` — 从 805 行降为少量 re-export + 共享状态声明（~50 行）
- `src/components/fileTree.core.ts` — 新文件，约 300 行（树渲染核心逻辑）
- `src/components/fileTree.dragdrop.ts` — 新文件，约 130 行（拖拽逻辑）
- `src/components/fileTree.inline.ts` — 新文件，约 150 行（内联重命名/创建）
- 所有 import 该模块的地方无需改动
