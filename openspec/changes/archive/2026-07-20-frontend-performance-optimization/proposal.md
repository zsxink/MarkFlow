## Why

文件树在大目录场景下每次 `refreshFileTree()` 全量重建 DOM（`container.innerHTML = ''`），导致展开大文件夹时明显卡顿。此外，多个组件的事件监听器未在销毁时清理，存在内存泄漏风险。需要审查并优化前端性能热点。

## What Changes

- 文件树增量更新：在 `fileTree.core.ts` 中为 `applyFileTreeEvents` 添加 `requestAnimationFrame` 批量提交机制，用 `pendingMutations` 队列积累 16ms 内的 DOM 变更后一次性 apply；保留 `refreshFileTree` 作为 fallback（首次加载、workspace 切换）
- 内存泄漏修复：检查并修复 `fileTree.core.ts`、`toolbar.ts`、`settings.ts`、`editor.ts` 中未清理的事件监听器，添加 `cleanup`/`destroy` 函数
- Bundle 分析报告：运行 `npm run analyze` 输出当前 bundle 构成，确认 mermaid 已正确 lazy load、无意外大依赖打入主 chunk

## Capabilities

### New Capabilities

- `file-tree-incremental-update`: 文件树 DOM 增量更新机制 — 使用 rAF 批量提交变更，避免全量重建

### Modified Capabilities

- `file-tree-architecture`: 增加增量更新相关的不变量和验证要求
- `expensive-task-scheduling`: 确认文件树更新遵循任务调度规范（去抖、取消）
- `bundle-budget`: 更新 bundle 分析基线数据

## Impact

- **源码文件**：`src/components/fileTree.core.ts`（主要修改）、`src/components/toolbar.ts`、`src/components/settings.ts`、`src/lib/editor.ts`
- **测试**：`src/components/fileTree.core.test.ts`、`src/components/fileTree.lazy.test.ts`
- **构建**：`npm run analyze` 需确认 bundle 体积无回涨
- **依赖**：无新增依赖
