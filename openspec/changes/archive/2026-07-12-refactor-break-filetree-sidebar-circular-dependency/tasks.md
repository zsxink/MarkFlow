## 0. 消除 sidebar.fileops / sidebar.conflict 循环依赖

- [x] 0.1 移动 `clearActiveDocument` + `clearActiveDocumentIfMatches` 到 `activeDocument.ts`
- [x] 0.2 移动 `confirmDocumentTransition` 到 `sidebar.fileops.ts`
- [x] 0.3 更新 `sidebar.fileops.ts` 从 `activeDocument` 导入而非 `sidebar`
- [x] 0.4 更新 `sidebar.conflict.ts` 从 `activeDocument` 导入而非 `sidebar`
- [x] 0.5 更新 `sidebar.ts` 移除已迁移函数，更新 re-export 和 import

## 1. 创建 activeDocument 共享模块

- [x] 1.1 新建 `src/components/activeDocument.ts`，包含 `getActiveFilePath`、`setActiveFilePath`、`rewriteActiveDocumentPath`、`updateActiveTreeSelection`（私有），仅依赖 `store`
- [x] 1.2 在 `sidebar.ts` 中将 `getActiveFilePath`、`setActiveFilePath`、`rewriteActiveDocumentPath` 的本地定义替换为从 `./activeDocument` re-export

## 2. 更新 fileTree 子模块的 import

- [x] 2.1 `fileTree.dragdrop.ts`：将 `rewriteActiveDocumentPath` 的 import 来源从 `./sidebar` 改为 `./activeDocument`
- [x] 2.2 `fileTree.inline.ts`：将 `rewriteActiveDocumentPath` 的 import 来源从 `./sidebar` 改为 `./activeDocument`（`openFileInEditor` 仍从 `./sidebar` 导入）
- [x] 2.3 `fileTree.core.ts`：将 `getActiveFilePath` 的 import 来源从 `./sidebar` 改为 `./activeDocument`

## 3. 恢复 fileTree.ts 桶文件为纯 re-export

- [x] 3.1 移除 `fileTree.ts` 中的 `initFileTree` 函数定义和 `initMouseDrag` import
- [x] 3.2 `sidebar.ts`：添加 `import { initMouseDrag } from './fileTree.dragdrop'`，将 `initFileTree()` 调用替换为 `initMouseDrag()`

## 4. 移除 sidebar.ts 动态 import

- [x] 4.1 `sidebar.ts` `confirmDocumentTransition` 中：将 `const { saveActiveDocument } = await import('./sidebar.fileops')` 改为顶层静态 import `import { saveActiveDocument } from './sidebar.fileops'`

## 5. 验证

- [x] 5.1 运行 `npm run build` 确认无编译错误
- [x] 5.2 运行 `npm test` 确认无测试回归
- [x] 5.3 检查 `fileTree.ts` 桶文件确认无函数定义，仅含 re-export
