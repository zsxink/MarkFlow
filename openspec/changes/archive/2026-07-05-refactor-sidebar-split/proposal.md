## Why

`src/components/sidebar.ts` 当前 498 行，UI 初始化、文件保存/加载/重载、外部修改冲突处理、外部删除处理全部混合在一个文件中，导致：
- 模块职责不清晰，难以维护
- 单文件过长（近 500 行），导航困难
- 新增功能时容易在同一个文件中堆积更多代码

## What Changes

- 将 `sidebar.ts` 拆分为三个独立文件，每个文件职责单一
- 不修改任何外部行为（纯重构）
- 保持所有导出函数的签名不变

### 拆分方案

| 新文件 | 保留内容 |
|--------|---------|
| `src/components/sidebar.ts`（精简后 ~150 行） | 仅保留 `initSidebar`（UI 挂载、tab 切换、resize handle）以及 `activeFilePath` 状态管理、`confirmDocumentTransition` |
| `src/components/sidebar.fileops.ts`（~120 行） | `saveActiveDocument`, `reloadActiveDocumentFromDisk`, `openFileInEditor` 及其私有辅助函数 |
| `src/components/sidebar.conflict.ts`（~100 行） | `handleExternalDeletion`, `handleActiveDocumentExternalModification`, `showExternalConflictDialog`, `showExternalDeletionDialog` 及其私有辅助函数 |

## Capabilities

### New Capabilities

- `sidebar`: 侧边栏 UI 模块（初始化、tab 切换、resize）
- `sidebar-fileops`: 侧边栏文件操作模块（保存、重载、打开文件）
- `sidebar-conflict`: 侧边栏外部修改/删除冲突处理模块

### Modified Capabilities

（无 spec 级行为变更，仅为实现层面的拆分）

## Impact

- 修改 `src/components/sidebar.ts`：大幅精简，移出 fileops 和 conflict 逻辑
- 新建 `src/components/sidebar.fileops.ts`
- 新建 `src/components/sidebar.conflict.ts`
- 所有 `import` 语句需要更新为从新模块导入
- 无外部 API 变更，无新依赖
