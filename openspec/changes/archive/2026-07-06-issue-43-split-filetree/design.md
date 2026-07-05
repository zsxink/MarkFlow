## Context

`src/components/fileTree.ts` 当前 806 行，混合了以下职责：

| 职责 | 行数 | 说明 |
|------|------|------|
| 树渲染 | ~175 行 | `createTreeNode`、`createFolderNode`、`createFileNode`、`renderFileTree` |
| 展开/折叠 | ~75 行 | `saveExpandedState`、`buildPathFromNode`、`restoreExpandedState` |
| 鼠标拖拽 | ~135 行 | `initMouseDrag`（mousemove + mouseup 全局监听器） |
| 内联重命名 | ~75 行 | `startInlineRename`、相关输入框逻辑 |
| 内联创建 | ~110 行 | `startInlineCreate`、`insertSorted` |
| 输入框 helper | ~60 行 | `createInlineInput`、`setupInlineInput` |
| 手术级 DOM 操作 | ~110 行 | `insertEntryIntoTree`、`removeEntryFromTree`、`renameEntryInTree`、`getChildrenContainer`、`getDepth` |
| 模块状态/共享 | ~40 行 | `workspacePath`、`expandedPaths`、`suppressPaths`、`dbClickTimers`、拖拽状态变量 |
| 公共入口/导出 | ~15 行 | `initFileTree`、`refreshFileTree`、`getWorkspacePath`、`setWorkspacePath` |

Issue #43 要求拆分 fileTree.ts 为 3 个模块，每文件控制在 300 行左右。

## Goals / Non-Goals

**Goals:**
- 将 `fileTree.ts` 按职责拆为 `fileTree.core.ts`、`fileTree.dragdrop.ts`、`fileTree.inline.ts`
- `fileTree.ts` 保留为入口，从三个新模块 re-export 所有公共 API
- 对外接口完全不变，零行为变更
- 所有现有测试通过

**Non-Goals:**
- 不重构或优化任何逻辑
- 不改变量名、函数签名（内部函数也保持原名以最小化 diff）
- 不改变 DOM 结构或 CSS class 名
- 不新增或删除功能

## Decisions

### 1. 模块划分边界

| 新文件 | 包含内容 |
|--------|----------|
| `fileTree.core.ts` | `escapePathSelector`、`escapeHtml`、`getWorkspacePath`、`setWorkspacePath`、`suppressNextWatcherRefresh`、`isSuppressedPath`、`suppressAllDescendants`、`refreshFileTree`、`saveExpandedState`、`buildPathFromNode`、`restoreExpandedState`、`renderFileTree`、`createTreeNode`、`createFolderNode`、`createFileNode`、`getChildrenContainer`、`getDepth`、`insertEntryIntoTree`、`removeEntryFromTree`、`renameEntryInTree`、`initFileTree`（保留调用 initMouseDrag） |
| `fileTree.dragdrop.ts` | `dragSrcPath`、`dragSrcEl`、`isDragging` 状态变量、`initMouseDrag`（含 mousemove/mouseup 全局监听器） |
| `fileTree.inline.ts` | `startInlineRename`、`startInlineCreate`、`insertSorted`、`createInlineInput`、`setupInlineInput` |

**理由**：按职责垂直拆分，每个模块内聚度高。拖拽和 inline 编辑是独立的功能单元，core 包含树渲染和模块共享的工具函数。

### 2. 共享状态的传递方式

**方案**：core 模块持有所有模块级状态变量并导出 getter/setter；dragdrop 和 inline 模块通过 import 访问。

**理由**：
- 最简单，零重构风险
- 状态变量原本就在模块作用域中，拆分后只需从 core import
- 如果后续需要进一步重构（如 class 封装），从 import 点很容易追踪

### 3. fileTree.ts 入口文件

**方案**：`fileTree.ts` 只做三件事：import 三个子模块、持有少量无法归类的状态（如 `dbClickTimers`、`expandedPaths`、`suppressPaths`）、从子模块 re-export 所有 public API。

**理由**：保持向后兼容的最简方式。引用 `fileTree.ts` 的代码无需任何改动。

### 4. initMouseDrag 的 initFileTree 调用

**方案**：`initFileTree()` 留在 `fileTree.core.ts` 中 import 并调用 `initMouseDrag()`。

**理由**：外部只调用 `initFileTree()` 一个入口，它调用拖拽初始化是内部细节。不需要改调用方。

### 5. 循环依赖避免

`fileTree.dragdrop.ts` 需要访问 `suppressNextWatcherRefresh`、`suppressAllDescendants`、`refreshFileTree`、`removeEntryFromTree`、`insertEntryIntoTree` — 这些都在 core。  
`fileTree.inline.ts` 需要访问 `createTreeNode`、`escapePathSelector`、`suppressNextWatcherRefresh`、`suppressAllDescendants`、`refreshFileTree` — 这些也在 core。

Core 不依赖 dragdrop 或 inline → 无循环依赖风险。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 拆分后 import 路径变化导致编译错误 | 严格按职责提取，逐函数移动后立即 `npm test` |
| 共享状态（如 `dragSrcPath`）跨模块引用断裂 | dragdrop 中状态变量保持私有，import 必要的 core 函数 |
| 内部函数（如 `insertSorted`）只在 inline 中使用却被外部误 import | 保持为非导出函数，仅在 inline 模块内可见 |
| 文件行数估算偏差 | 拆分后每文件 ~300 行左右；如个别文件超限可进一步微调 |
