## Context

`src/components/fileTree.ts` 当前 805 行，负责文件树的渲染、拖拽、内联编辑、排序和 DOM 操作。所有功能混合在单文件中，导致：

- 模块边界模糊，新增功能需要理解全部 805 行
- 测试困难，无法独立测试拖拽或内联编辑逻辑
- 合并冲突频率上升，多人修改同一文件

## Goals / Non-Goals

**Goals:**
- 将 `fileTree.ts` 拆分为 3 个职责独立的子模块：core、dragdrop、inline
- `fileTree.ts` 保留为公共 API 入口，所有导出符号通过 re-export 透传
- 零行为变更：所有外部调用方无需修改 import 路径或 API 名
- 每个子模块 ≤300 行，职责边界清晰

**Non-Goals:**
- 不改功能行为（不修 bug、不加功能）
- 不改函数签名或对外 API
- 不引入新依赖或重构 storage/sidebar/toast 模块
- 不添加测试（但后续可独立测试各模块）

## Decisions

### 决策 1：拆分方案 — core + dragdrop + inline

**方案**：按功能领域拆分，而非按渲染/逻辑分离

| 模块 | 职责 | 预计行数 | 核心内容 |
|------|------|---------|---------|
| `fileTree.core.ts` | 状态管理 + 工具函数 + 树渲染 + 展开/折叠 + DOM 操作 + 排序 | ~320 | `workspacePath`, `expandedPaths`, `suppressPaths` 状态；`createTreeNode` 渲染；`insertEntryIntoTree`/`removeEntryFromTree`/`renameEntryInTree` 等 DOM 操作；`insertSorted` 排序 |
| `fileTree.dragdrop.ts` | 鼠标拖拽所有逻辑 | ~140 | `dragSrcPath`/`dragSrcEl`/`isDragging` 状态；`initMouseDrag`（mousemove + mouseup 全局监听器） |
| `fileTree.inline.ts` | 内联重命名 + 内联新建 | ~190 | `startInlineRename`；`startInlineCreate`；`createInlineInput`/`setupInlineInput` 输入框辅助 |
| `fileTree.ts` | 公共 API re-export 入口 | ~5 | `export * from './fileTree.xxx'`（3 行） |

**理由**：按功能领域拆分，语义清晰，各模块间依赖单向（core ← dragdrop, core ← inline），core 仅需从 dragdrop 导入 `initMouseDrag` 用于 `initFileTree`。

**替代方案考虑**：按渲染/逻辑水平拆分（如 `fileTree.render.ts` + `fileTree.logic.ts`）。拒绝理由：渲染和逻辑在现有代码中高度耦合（事件监听器在 createTreeNode 内部绑定），水平拆分会导致跨文件交叉引用过多。

### 决策 2：core 模块导入 dragdrop 的 initMouseDrag

`initFileTree()` 函数内部调用 `initMouseDrag()`，因此 core 需要从 dragdrop 导入该函数。这是 core 唯一直接引用拖拽模块的地方。

**理由**：相比在 `fileTree.ts`（re-export 入口）中手动调用 `initMouseDrag`，让 core 直接导入更内聚——调用者只需 `import { initFileTree }` 即可完成所有初始化，无需分别调用两个初始化函数。

### 决策 3：helper 函数的归属

- `insertSorted` → core（被 `insertEntryIntoTree` 和 `startInlineCreate` 共用；后者在内联模块，故 inline 需从 core 导入）
- `escapePathSelector` / `escapeHtml` → core（通用工具函数，dragdrop 和 inline 均需使用）
- `createInlineInput` / `setupInlineInput` → inline（仅内联创建和重命名使用）

## Risks / Trade-offs

- [Module interaction] `startInlineCreate` 需调用 core 的 `createTreeNode` 和 `insertSorted`，以及 storage 的 `createFile`/`readSingleDir` 。依赖路径清晰：inline → core, inline → storage/sidebar/toast。没有循环依赖风险。
- [Drag integration] `refreshFileTree`（在 drop 成功后被调用）属于 core，dragdrop 通过 import 调用 → dragdrop → core 单向依赖，无隐患。
- [Regression] 拆分后所有公共 API 通过 re-export 透传，外部调用方不受影响。验证方式：`npm test` 通过 + 手动测试展开/折叠/拖拽/重命名/新建。
