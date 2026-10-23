# Tasks

## 1. 路径规范化

- [x] 1.1 在 `src/utils/paths.ts` 新增并导出 `normalizeWorkspacePath(path)`：`\`→`/`、去尾部斜杠（保留 `/` 与 `C:/`）、盘符小写。
- [x] 1.2 `src/ui/file-tree/workspace.ts` 的 `setWorkspacePath()` 改用 `normalizeWorkspacePath()` 生成写入 `store` 的路径。

## 2. 根目录容器查找容错与可诊断

- [x] 2.1 `src/ui/file-tree/dom.ts` 的 `findChildrenContainer()` 根目录判断改为规范化后比较（大小写不敏感）。
- [x] 2.2 `src/ui/file-tree/render.ts` 的 `renderDirectory()` 在容器缺失时记录 `logWarn('file-tree.render', ...)`，带 `path` 与 `workspacePath` 上下文。
- [x] 2.3 `src/ui/file-tree/loader.ts` 的 `restoreExpandedState()` 用规范化键计算相对路径，修复大写盘符下展开状态恢复失败。

## 3. 打开文件夹统一流程

- [x] 3.1 `src/ui/sidebar/index.ts` 新增并导出 `openWorkspaceFolderFlow()`：选目录 → `setWorkspacePath` → `refreshFileTree` → 展开侧边栏 + `switchSidebarTab('files')` → toast；用户取消时无副作用。
- [x] 3.2 `src/ui/sidebar/index.ts` 的 `sidebar-open-btn` 改用该流程。
- [x] 3.3 `src/ui/toolbar.ts` 的 `sidebar-open-folder` 改用该流程。
- [x] 3.4 `src/ui/native-menu.ts` 的 `openWorkspaceFolder()` 与 `openRecentFolder()` 改用该流程（最近文件夹只跳过目录选择，其余相同）。

## 4. 测试

- [x] 4.1 `src/utils/__tests__/paths.test.ts`：新增 `normalizeWorkspacePath` 用例（Windows 盘符 + 尾部斜杠、POSIX 尾部斜杠、根路径不被削成空串）。
- [x] 4.2 `src/ui/file-tree/__tests__/dom.test.ts`（新增）：`findChildrenContainer` 在根路径盘符大小写不一致时仍返回根容器。
- [x] 4.3 `src/ui/__tests__/native-menu.test.ts`：更新 mock 并断言 `open-folder`、`recent-folder:` 动作后 `switchSidebarTab('files')` 被调用。
- [x] 4.4 `src/ui/sidebar/__tests__/open-folder-flow.test.ts`（新增）：取消选择无副作用；成功时按序设置工作区、刷新树、切到 files 标签页并展开折叠的侧边栏。

## 5. 校验

- [x] 5.1 `npx tsc --noEmit`
- [x] 5.2 `npm test`
- [x] 5.3 `node scripts/check-layering.mjs`
- [x] 5.4 `npx openspec validate windows-open-folder-file-tree --strict`
