## Context

`src/components/sidebar.ts` 当前 498 行，包含以下职责：
1. **UI 初始化**：`initSidebar` 挂载事件、resize handle、tab 切换
2. **状态管理**：`activeFilePath` 及相关 getter/setter 函数
3. **文件操作**：`saveActiveDocument`、`reloadActiveDocumentFromDisk`、`openFileInEditor`
4. **外部冲突处理**：`handleActiveDocumentExternalModification`、`showExternalConflictDialog`
5. **外部删除处理**：`handleExternalDeletion`、`showExternalDeletionDialog`、`restoreDeletedActiveDocument`

这些职责混合在同一个文件中，导致理解和修改时需要在不同逻辑段之间频繁跳转，且随着功能增加文件将持续膨胀。

## Goals / Non-Goals

**Goals:**
- 将 sidebar.ts 按职责拆分为三个独立模块，每个文件不超过 200 行
- 保持所有导出函数的公开签名不变（无需修改调用方）
- 保持所有跨模块的内部函数可见性一致（私有函数保持私有/module-scoped）
- 确保拆分后 `npm test` 全部通过

**Non-Goals:**
- 不修改任何业务逻辑或 UI 行为
- 不改动现有的测试文件（如果测试仅导入公开 API，则无需修改）
- 不引入新的依赖或架构模式

## Decisions

### 1. 按职责垂直拆分，而非按层级分层

**决策**：将代码按业务领域（fileops / conflict / UI）拆分到三个并列文件，而非按 UI/状态/事件分层。

**理由**：
- 每个文件包含完整的内部函数和状态，易于独立理解和修改
- 与 issue #44 中 community 达成的拆分方案一致
- 垂直拆分比水平分层减少了跨模块的数据传递

**Alternative considered**：按 MVC 模式分成 model/controller/view 三层 — 对于当前规模的代码过于重量级，且与项目现有架构不匹配（现有代码使用函数式模块而非 class）。

### 2. 跨模块共享通过导入实现

**决策**：sidebar.fileops.ts 和 sidebar.conflict.ts 从 sidebar.ts 导入 `activeFilePath` 相关的 getter/setter；sidebar.ts 从 fileops 和 conflict 模块导入文件操作和冲突处理方法。

**理由**：
- JavaScript 模块天然支持循环导入（实际不构成循环：sidebar.conflict 导入 getActiveFilePath/setActiveFilePath，sidebar.ts 导入 conflict 函数，sidebar 不导入自身）
- 保持模块职责清晰：状态归 sidebar.ts 管理，行为委托给子模块
- 避免引入 EventBus 或 DI 等额外抽象

### 3. 私有函数保持在同一模块内

**决策**：`showExternalConflictDialog`、`showExternalDeletionDialog`、`restoreDeletedActiveDocument`、`saveActiveDocumentAsNewFile`、`getConflictSavePath` 等私有函数随其调用者移动到对应模块，不对外导出。

**理由**：
- 这些函数仅供模块内部使用，不应暴露到公共 API
- 与重构前相同（重构前它们也不导出）

### 4. 模块间函数归属

| 函数 | 归属模块 | 理由 |
|------|---------|------|
| `initSidebar` | sidebar.ts | UI 挂载和事件绑定 |
| `switchSidebarTab` | sidebar.ts | Tab 切换是 UI 操作 |
| `getActiveFilePath` | sidebar.ts | 核心状态管理 |
| `setActiveFilePath` | sidebar.ts | 核心状态管理 |
| `rewriteActiveDocumentPath` | sidebar.ts | 路径重写是状态管理的一部分 |
| `clearActiveDocumentIfMatches` | sidebar.ts | 状态清理 |
| `clearActiveDocument` | sidebar.ts | 状态清理 |
| `confirmDocumentTransition` | sidebar.ts | 模态框 UI 逻辑，与 initSidebar 的按钮绑定配对 |
| `saveActiveDocument` | sidebar.fileops.ts | 文件保存操作 |
| `reloadActiveDocumentFromDisk` | sidebar.fileops.ts | 文件重载操作 |
| `openFileInEditor` | sidebar.fileops.ts | 打开文件操作 |
| `handleExternalDeletion` | sidebar.conflict.ts | 外部删除处理 |
| `handleActiveDocumentExternalModification` | sidebar.conflict.ts | 外部修改处理 |
| `showExternalConflictDialog` | sidebar.conflict.ts | 冲突对话框（私有） |
| `showExternalDeletionDialog` | sidebar.conflict.ts | 删除对话框（私有） |
| `restoreDeletedActiveDocument` | sidebar.conflict.ts | 恢复删除文件（私有） |
| `saveActiveDocumentAsNewFile` | sidebar.fileops.ts | 另存为操作（私有） |
| `getConflictSavePath` | sidebar.fileops.ts | 路径工具函数（私有） |
| `updateActiveTreeSelection` | sidebar.ts | UI 辅助函数（私有） |

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 循环导入导致运行时错误 | 实际不构成循环：sidebar.ts 只导入子模块的导出函数，子模块只导入 sidebar.ts 的状态函数，方向是单向的 |
| 重构后某个模块的内部函数被其他文件意外使用 | 拆分后所有私有函数仍保持 `function` 声明而非 `export`，TypeScript 编译不会暴露它们 |
| 测试文件直接 import 了私有函数 | 本次重构不改变导出列表 — 私有函数原本就不导出，不受影响 |

## Migration Plan

1. 创建 `src/components/sidebar.fileops.ts` — 提取文件操作相关代码
2. 创建 `src/components/sidebar.conflict.ts` — 提取冲突处理相关代码
3. 精简 `src/components/sidebar.ts` — 删除已移出的代码，保留 UI 和状态管理代码
4. 更新各模块的 import 语句
5. 运行 `npm test` 验证所有测试通过
6. 手动测试关键路径：保存文件、外部修改弹出、外部删除检测、文件切换
