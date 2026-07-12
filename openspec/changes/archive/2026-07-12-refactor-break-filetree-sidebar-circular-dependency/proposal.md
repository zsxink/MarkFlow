## Why

审查发现循环依赖链：`fileTree.dragdrop → sidebar → fileTree → fileTree.dragdrop`。`fileTree.ts` 桶文件被迫包含 `initFileTree` 逻辑来绕开，`sidebar.ts` 第 76 行有多余的动态 import 作为防御措施。这增加了认知负担、阻碍 tree-shaking，并且使模块职责边界模糊。

## What Changes

- 将 `rewriteActiveDocumentPath` 从 `sidebar.ts` 提取到独立的共享模块 `activeDocument.ts`，使 `fileTree.dragdrop` 和 `fileTree.inline` 无需 import sidebar
- 移除 `fileTree.ts` 桶文件中的 `initFileTree` 定义，将其移入 `fileTree.core.ts`，恢复桶文件为纯 re-export
- 移除 `sidebar.ts` 中 `confirmDocumentTransition` 内的动态 import（改为静态 import，因为循环依赖已被打破）
- 更新所有受影响的 import 路径

## Capabilities

### New Capabilities

- `active-document-state`: 管理当前活动文档路径的独立共享模块，包含 `rewriteActiveDocumentPath`、`getActiveFilePath`、`setActiveFilePath` 等路径管理函数

### Modified Capabilities

- `file-tree-architecture`: 桶文件恢复为纯 re-export，`initFileTree` 从桶文件移入 core 模块

## Impact

- `src/components/sidebar.ts` — 移除 `rewriteActiveDocumentPath` 定义，改从 `activeDocument.ts` re-export
- `src/components/activeDocument.ts` — 新建文件
- `src/components/fileTree.ts` — 移除 `initFileTree` 函数定义，改为从 `fileTree.core.ts` re-export
- `src/components/fileTree.core.ts` — 接收 `initFileTree` 函数
- `src/components/fileTree.dragdrop.ts` — import 路径从 `sidebar` 改为 `activeDocument`
- `src/components/fileTree.inline.ts` — import 路径从 `sidebar` 改为 `activeDocument`（仅 `rewriteActiveDocumentPath`）
- `src/components/sidebar.ts` 第 76 行 — 动态 import 改为静态 import
