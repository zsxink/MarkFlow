## 1. 创建 fileTree.core.ts

- [x] 1.1 创建 `src/components/fileTree.core.ts`，从 `fileTree.ts` 提取以下内容：
  - 工具函数：`escapePathSelector`、`escapeHtml`
  - 公共状态：`workspacePath`（getter/setter）、`expandedPaths`、`suppressPaths`/`SUPPRESS_DURATION_MS`
  - 导出函数：`getWorkspacePath`、`setWorkspacePath`、`suppressNextWatcherRefresh`、`isSuppressedPath`、`suppressAllDescendants`、`refreshFileTree`、`saveExpandedState`、`buildPathFromNode`、`restoreExpandedState`、`renderFileTree`、`createTreeNode`、`createFolderNode`、`createFileNode`、`initFileTree`、`getChildrenContainer`、`getDepth`、`insertEntryIntoTree`、`removeEntryFromTree`、`renameEntryInTree`
  - 确认 `initFileTree()` 中保留对 `initMouseDrag()` 的调用（import 自 dragdrop 模块）

## 2. 创建 fileTree.dragdrop.ts

- [x] 2.1 创建 `src/components/fileTree.dragdrop.ts`，从 `fileTree.ts` 提取：
  - 拖拽状态：`dragSrcPath`、`dragSrcEl`、`isDragging`
  - `initMouseDrag` 函数及其内部变量（`dragoverTimer`、`dragGhost`）
- [x] 2.2 import 必要的 core 模块函数（`suppressNextWatcherRefresh`、`suppressAllDescendants`、`refreshFileTree`、`removeEntryFromTree`、`insertEntryIntoTree`、`showToast`、`getFileName`、`rewriteActiveDocumentPath`、`readSingleDir`、`workspacePath`）
- [x] 2.3 导出 `initMouseDrag`

## 3. 创建 fileTree.inline.ts

- [x] 3.1 创建 `src/components/fileTree.inline.ts`，从 `fileTree.ts` 提取：
  - `startInlineRename`、`startInlineCreate`、`insertSorted`、`createInlineInput`、`setupInlineInput`
- [x] 3.2 import 必要的 core 模块函数
- [x] 3.3 导出 `startInlineRename`、`startInlineCreate`

## 4. 重写 fileTree.ts 为入口文件

- [x] 4.1 从 `fileTree.ts` 中删除被提取的函数和状态
- [x] 4.2 从三个子模块 import 所有公共 API
- [x] 4.3 保留模块唯一的状态：`dbClickTimers`（WeakMap）
- [x] 4.4 re-export 所有原导出的公共 API

## 5. 验证

- [x] 5.1 运行 `npm test`（所有测试通过）
- [x] 5.2 运行 `npm run build`（TypeScript 编译无错误）
- [x] 5.3 检查 `insertEntryIntoTree` / `removeEntryFromTree` 在 dragdrop 中的调用是否正常
- [x] 5.4 确认所有文件行数：entry=28, core=420, dragdrop=138, inline=245
