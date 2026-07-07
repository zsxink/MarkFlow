## 1. Store 核心实现

- [x] 1.1 创建 `src/lib/store.ts`：实现 `Store<T>` 类，包含 `on(type, cb)`, `off(type, cb)`, `emit(event)`, `getState()`, `setState(partial)`
- [x] 1.2 定义 `StoreEvent` 联合类型 + `StoreState` 接口，导出 Store 单例

## 2. Store 事件替换 editor.ts 中的 DOM 事件

- [x] 2.1 editor.ts: 将所有 `document.dispatchEvent(new Event('editor-update'))` 替换为 `store.emit({ type: 'editor:update' })`
- [x] 2.2 editor.ts: 将 `document.addEventListener('editor-update', ...)` 替换为 `store.on('editor:update', ...)`
- [x] 2.3 editor.ts: 将 `document.addEventListener('settings-changed', ...)` 替换为 `store.on('settings:changed', ...)`，适配 `StoreEvent` 类型

## 3. Store 事件替换 settings.ts

- [x] 3.1 settings.ts: 将 `document.dispatchEvent(new CustomEvent('settings-changed', ...))` 替换为 `store.emit({ type: 'settings:changed', settings })`

## 4. Store 事件替换 statusbar.ts

- [x] 4.1 statusbar.ts: 将 `document.addEventListener('editor-update', ...)` 替换为 `store.on('editor:update', ...)`

## 5. Store 事件替换 outline.ts

- [x] 5.1 outline.ts: 将 `document.addEventListener('editor-update', ...)` 替换为 `store.on('editor:update', ...)`

## 6. Store 事件替换 main.ts

- [x] 6.1 main.ts: 将 `document.addEventListener('settings-changed', ...)` 替换为 `store.on('settings:changed', ...)`

## 7. Store 状态迁移 — editor.state.ts

- [x] 7.1 将 `mode` 变量迁移到 Store 状态，`setMode()` 改为调用 `store.setState({ mode })`
- [x] 7.2 将 `editor` 引用保留为模块局部变量（编辑器实例仅 editor.ts 使用，不必进全局 Store）
- [x] 7.3 将 `activeDocPathOverride` 迁移到 Store 的 `activeFilePath` 状态
- [x] 7.4 将 `documentState.dirty` 迁移到 Store，`store.setState({ dirty })` 自动派发 `editor:dirty` 事件
- [x] 7.5 将 `cachedSourceGutterStyles` 迁移到 Store 状态
- [x] 7.6 将 `assetToOriginalMap` 保留为模块局部变量（仅在 editor 子模块使用）
- [x] 7.7 清理 `editor.state.ts` 中不再需要的导出变量和 setter

## 8. Store 状态迁移 — sidebar.ts

- [x] 8.1 将 `activeFilePath` 局部变量迁移到 Store 状态
- [x] 8.2 修改 `setActiveFilePath()` / `getActiveFilePath()` 读写 Store

## 9. Store 状态迁移 — fileTree.core.ts

- [x] 9.1 将 `workspacePath` 变量迁移到 Store 状态
- [x] 9.2 修改 `setWorkspacePath()` / `getWorkspacePath()` 读写 Store，set 时 `emit({ type: 'workspace:set', path })`
- [x] 9.3 将 `expandedPaths` 迁移到 Store 状态

## 10. 验证

- [x] 10.1 `npm test` 全部通过（31/31）
- [x] 10.2 `npm run build` 编译无错误
- [x] 10.3 手动验证：状态栏统计、大纲刷新、文件切换、设置变更、自动保存功能正常
