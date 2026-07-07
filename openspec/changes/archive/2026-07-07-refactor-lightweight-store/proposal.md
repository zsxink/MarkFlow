## Why

当前模块级 mutable 变量（`editor`, `mode`, `documentState`, `workspacePath` 等）散布在各文件中，组件间通信依赖 `new Event('editor-update')` 等裸 DOM 自定义事件，payload 为 `any`，类型不安全且难以追踪数据流。引入轻量级 Store 统一状态管理与事件分发，提升类型安全性和可维护性。

## What Changes

1. 创建 `src/lib/store.ts` — 轻量级发布订阅 Store，不引入外部框架
2. 定义 `StoreEvent` 联合类型，覆盖所有组件间通信场景
3. 将 `editor.state.ts` 中的模块级变量迁移到 Store 的 `getState()` / `setState()`
4. 将 `editor.ts`、`settings.ts`、`sidebar.ts`、`fileTree.core.ts` 等文件中 `document.dispatchEvent(new Event(...))` 替换为 `store.emit(...)`
5. 将 `statusbar.ts`、`outline.ts`、`editor.ts` 等文件中的 `document.addEventListener(...)` 替换为 `store.on(...)`
6. 清理不再需要的模块级变量和 setter 函数
7. 删除 `editor.state.ts` 中的事件定时器变量（移入 Store 或局部化）

## Capabilities

### New Capabilities
- `state-management`: 轻量级发布订阅 Store，提供类型化事件（`StoreEvent`）和集中式状态管理

### Modified Capabilities
<!-- 本次为内部重构，不涉及外部行为变更，无需修改 spec -->

## Impact

- **新增**: `src/lib/store.ts`
- **修改**:
  - `src/lib/editor.state.ts` — 变量迁移为 Store 状态
  - `src/lib/editor.ts` — DOM 事件替换为 Store 事件
  - `src/components/statusbar.ts` — 事件订阅迁移
  - `src/components/outline.ts` — 事件订阅迁移
  - `src/components/settings.ts` — 事件派发迁移
  - `src/components/sidebar.ts` — 事件订阅迁移
  - `src/components/fileTree.core.ts` — `workspacePath` 迁移
  - `src/main.ts` — 事件订阅迁移
- **无外部依赖变更**，纯 TypeScript 实现
