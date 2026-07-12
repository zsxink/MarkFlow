## Context

当前模块依赖图存在循环：

```
sidebar.ts → fileTree.ts → fileTree.dragdrop.ts → sidebar.ts
sidebar.ts → fileTree.ts → fileTree.inline.ts → sidebar.ts
```

具体路径：
- `sidebar.ts` import `initFileTree` 等 from `fileTree.ts`
- `fileTree.ts` import `initMouseDrag` from `fileTree.dragdrop.ts`（桶文件被迫包含业务逻辑）
- `fileTree.dragdrop.ts` import `rewriteActiveDocumentPath` from `sidebar.ts`
- `fileTree.inline.ts` import `rewriteActiveDocumentPath` + `openFileInEditor` from `sidebar.ts`

此外 `fileTree.core.ts` 也 import `getActiveFilePath` from `sidebar.ts`，形成另一条隐式依赖。`sidebar.ts:76` 有动态 import `sidebar.fileops` 作为防御措施。

## Goals / Non-Goals

**Goals:**
- 消除 fileTree ↔ sidebar 的循环依赖
- 恢复 `fileTree.ts` 桶文件为纯 re-export
- 移除 `sidebar.ts` 中的动态 import hack
- 保持所有公共 API 签名不变（纯内部重构）

**Non-Goals:**
- 不重构 `fileTree.core.ts → sidebar.ts` 的 `openFileInEditor` 依赖（不在本次 issue 范围）
- 不改变 sidebar 的拆分结构（sidebar.fileops / sidebar.conflict）
- 不改变文件树的渲染或交互行为

## Decisions

### 1. 提取 `activeDocument.ts` 共享模块

**选择**：新建 `src/components/activeDocument.ts`，包含以下函数：
- `getActiveFilePath()` — 从 store 读取活动文件路径
- `setActiveFilePath(path)` — 设置路径 + 同步 DOM 树选中状态
- `rewriteActiveDocumentPath(from, to)` — 路径前缀替换
- `updateActiveTreeSelection(path)` — DOM 树选中高亮（私有函数）

**理由**：这些函数仅依赖 `store`，不依赖 sidebar 的其他逻辑（对话框、outline 等），可以干净地抽离。`sidebar.ts` 通过 re-export 保持向后兼容，外部消费者无需改动。

**替代方案**：仅提取 `rewriteActiveDocumentPath` → 不够，因为 `setActiveFilePath` 也被 `fileTree.core.ts` 使用，仍会形成依赖。

### 2. sidebar.ts 直接 import initMouseDrag

**选择**：`sidebar.ts` 中将 `initFileTree()` 调用替换为直接 import `initMouseDrag` from `fileTree.dragdrop`。

**理由**：`initFileTree` 只是 `initMouseDrag()` 的一包装函数（一行代码）。移除它可以恢复桶文件为纯 re-export。sidebar 是唯一调用者，直接调用无额外成本。

**替代方案**：将 `initFileTree` 移入 `fileTree.core.ts` → 会创建 `fileTree.core → fileTree.dragdrop → fileTree.core` 新循环。

### 3. sidebar.ts 动态 import 改为静态 import

**选择**：`confirmDocumentTransition` 中 `const { saveActiveDocument } = await import('./sidebar.fileops')` 改为顶层静态 import。

**理由**：循环依赖已被打破，不再需要动态 import 防御。静态 import 更清晰、tree-shakeable。

## Risks / Trade-offs

- **[风险] 其他未发现的消费者** → `getActiveFilePath` / `setActiveFilePath` / `rewriteActiveDocumentPath` 的调用方均已通过 codegraph 确认，sidebar re-export 确保兼容
- **[风险] barrel 文件纯 re-export 后 tree-shaking 行为变化** → Vite/Rollup 对 re-export barrel 已有成熟优化，无实质影响
- **[权衡] activeDocument.ts 新增一个文件** → 增加文件数量，但职责单一、仅依赖 store，是值得的复杂度换清晰度
