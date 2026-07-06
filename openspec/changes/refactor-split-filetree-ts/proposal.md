## Why

`src/components/fileTree.ts` 当前 805 行，树渲染、鼠标拖拽、内联重命名/创建、排序、DOM 操作全部混合在一个文件中。随着功能增加，单一文件模块边界模糊，不利于维护和并行开发。

## What Changes

- 将 `fileTree.ts` 拆分为 3 个独立模块：
  - `fileTree.core.ts` — 树渲染（`createTreeNode`）、展开/折叠、排序、文件树生命周期函数（`initFileTree`, `refreshFileTree`, `setWorkspacePath` 等）
  - `fileTree.dragdrop.ts` — `initMouseDrag` 全部拖拽逻辑（~130行）
  - `fileTree.inline.ts` — `startInlineRename`, `startInlineCreate`, 输入框 helper
- `fileTree.ts` 保留为公共 API 入口，从各子模块 re-export 所有导出符号
- **不改变** 任何外部 API 签名，纯内部重构

## Capabilities

### New Capabilities

- `file-tree-architecture`: 文件树模块的内部架构规范，定义三个子模块的职责边界和公共 API 入口 re-export 约定

### Modified Capabilities

*（无 — 本次重构不改变功能行为，仅调整内部代码组织）*

## Impact

- `src/components/fileTree.ts` 从 ~805 行缩减为纯 re-export 入口
- 新增 3 个文件：`fileTree.core.ts`, `fileTree.dragdrop.ts`, `fileTree.inline.ts`
- 影响内部模块组织，对外接口不变
- 所有 import `fileTree.ts` 的地方无需修改
