## 1. 创建 sidebar.fileops.ts

- [x] 1.1 从 sidebar.ts 提取文件操作相关代码到新文件 `src/components/sidebar.fileops.ts`
- [x] 1.2 包括函数：`saveActiveDocument`, `reloadActiveDocumentFromDisk`, `openFileInEditor`, `saveActiveDocumentAsNewFile`, `getConflictSavePath`
- [x] 1.3 从 sidebar.ts 导入 `activeFilePath` 相关状态管理函数（`getActiveFilePath`, `setActiveFilePath`, `reloadActiveDocumentFromDisk` 等依赖）
- [x] 1.4 保留所有导出函数签名不变

## 2. 创建 sidebar.conflict.ts

- [x] 2.1 从 sidebar.ts 提取冲突处理相关代码到新文件 `src/components/sidebar.conflict.ts`
- [x] 2.2 包括函数：`handleExternalDeletion`, `handleActiveDocumentExternalModification`, `showExternalConflictDialog`, `showExternalDeletionDialog`, `restoreDeletedActiveDocument`
- [x] 2.3 从 sidebar.ts 导入所需的状态函数和从 sidebar.fileops.ts 导入 `saveActiveDocumentAsNewFile`
- [x] 2.4 保留所有导出函数签名不变

## 3. 精简 sidebar.ts

- [x] 3.1 删除已移出的函数代码，保留以下函数：`updateActiveTreeSelection`, `getActiveFilePath`, `setActiveFilePath`, `rewriteActiveDocumentPath`, `clearActiveDocumentIfMatches`, `clearActiveDocument`, `confirmDocumentTransition`, `initSidebar`, `switchSidebarTab`
- [x] 3.2 添加从新模块的 import 语句：`import { saveActiveDocument } from './sidebar.fileops'` 等
- [x] 3.3 确保 `activeFilePath` 状态变量和 `externalConflictDialogPromise`/`externalDeletionDialogPromise` 变量保留在 sidebar.ts 中（或移至对应模块）

## 4. 验证

- [x] 4.1 运行 `npm test` 确认所有测试通过
- [x] 4.2 TypeScript 编译检查（`npx tsc --noEmit`）
- [x] 4.3 确认三个文件行数合理（sidebar.ts 228 行，sidebar.fileops.ts 144 行，sidebar.conflict.ts 153 行）
