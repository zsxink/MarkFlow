## Context

当前 MarkFlow 前端在 `src/lib/editor.state.ts` 中维护了约 10 个模块级 mutable 变量（`editor`, `mode`, `documentState`, `dirtyCheckTimer`, `updateEventTimer`, `activeDocPathOverride`, `cachedSourceGutterStyles`, `assetToOriginalMap`），同时在 `src/components/fileTree.core.ts` 中有 `workspacePath` 和 `expandedPaths` 变量。组件间通过 `document.dispatchEvent(new Event('editor-update'))` 和 `CustomEvent('settings-changed')` 通信，payload 为 `any`，无类型检查。

## Goals / Non-Goals

**Goals:**
- 创建 `src/lib/store.ts` — 轻量级发布订阅 Store，纯 TypeScript，无外部依赖
- 定义 `StoreEvent` 联合类型，覆盖所有组件间通信场景
- 将模块级 mutable 变量迁入 Store 集中管理
- 用 `store.emit()` / `store.on()` 替换所有 `dispatchEvent` / `addEventListener` 的自定义事件通信
- 保持所有现有功能不变（重构不改变行为）

**Non-Goals:**
- 不引入 Redux、Zustand 等外部状态管理库
- 不改变 UI 布局或交互行为
- 不修改 Rust 后端
- 不处理 DOM 原生事件（click、keydown、mousedown 等），仅替换业务自定义事件
- 不做性能优化或架构重设计

## Decisions

### 1. Store API 设计：发布订阅 + 状态快照

选择极简的发布订阅模式，类似 Node.js EventEmitter：

- `store.on(type, cb)` — 订阅事件
- `store.off(type, cb)` — 取消订阅
- `store.emit(event)` — 派发事件（参数为 `StoreEvent` 联合类型）
- `store.getState()` — 获取当前状态快照
- `store.setState(partial)` — 更新状态并自动派发对应事件

**为什么不选 Redux 模式？** 项目规模小，Redux 的 action/reducer 样板代码过重。发布订阅模式直接匹配当前 DOM 事件模式的替换需求。

**为什么不选 Zustand？** 零外部依赖策略，避免 npm 依赖膨胀。不到 50 行的 Store 实现即可满足需求。

### 2. `StoreEvent` 联合类型（详见 spec）

用 TypeScript  discriminated union 确保 `emit` 时 type-check：

```typescript
type StoreEvent =
  | { type: 'editor:update' }
  | { type: 'editor:dirty'; dirty: boolean }
  | { type: 'editor:mode'; mode: 'wysiwyg' | 'source' }
  | { type: 'file:active'; path: string | null }
  | { type: 'settings:changed'; settings: Record<string, unknown> }
  | { type: 'workspace:set'; path: string | null };
```

### 3. 状态与事件分离

`getState()` 返回的状态对象是当前快照，而 `emit()` 的 `StoreEvent` 是事件通知。两者互补：

- **状态读取**：组件初始化时调用 `getState()` 获取当前值
- **事件订阅**：状态变化时通过 `emit` 通知订阅者

### 4. 迁移策略：逐步替换，不中断

迁移分两阶段：
1. 先创建 Store，在 `editor.state.ts` 中同时维护旧变量和 Store 引用，逐一替换消费方
2. 所有消费方迁移完成后，删除旧变量和 setter

## Risks / Trade-offs

- **[兼容风险]** 若某处代码在 Store 发布前直接读取 DOM（如 `document.querySelector('.tree-file.active')`），迁移后需改为 Store 状态 → **确保所有状态写入都经过 Store**
- **[遗漏风险]** 自定义 DOM 事件可能有隐式依赖（如多个监听器执行顺序） → **现有 `addEventListener` 调用逐一审计**
- **[定时器变量]** `dirtyCheckTimer` / `updateEventTimer` 是局部实现细节，不应放入全局 Store → **保留为模块局部变量或移入对应模块**
