# State Management — 轻量级状态管理

> 版本：1.0.0 ｜ 状态：草案 ｜ 更新日期：2026-07-07

---

## ADDED Requirements

### Requirement: Store 实例

系统 SHALL 提供一个全局单例 Store 实例，通过 `src/lib/store.ts` 导出。

#### Scenario: 单例导出

- **WHEN** 模块导入 `src/lib/store.ts`
- **THEN** 获取到的是唯一的 Store 实例

### Requirement: 事件订阅 (`store.on`)

Store SHALL 提供 `on(type, cb)` 方法用于订阅特定类型的事件。

#### Scenario: 订阅事件

- **WHEN** 调用 `store.on('editor:update', cb)`
- **THEN** 当 `editor:update` 事件被 `emit` 时，`cb` 被调用

#### Scenario: 多次订阅

- **WHEN** 同一事件类型被多次 `on`
- **THEN** 所有回调按注册顺序依次执行

### Requirement: 取消订阅 (`store.off`)

Store SHALL 提供 `off(type, cb)` 方法用于取消订阅。

#### Scenario: 取消订阅

- **WHEN** 调用 `store.off('editor:update', cb)`
- **THEN** 该 `cb` 不再接收 `editor:update` 事件

#### Scenario: 取消未注册的回调

- **WHEN** 调用 `store.off` 传入未注册的回调
- **THEN** 不抛出错误，无副作用

### Requirement: 事件派发 (`store.emit`)

Store SHALL 提供 `emit(event)` 方法用于派发类型化事件。

#### Scenario: 派发事件

- **WHEN** 调用 `store.emit({ type: 'editor:update' })`
- **THEN** 所有订阅 `editor:update` 的回调被调用

#### Scenario: 类型安全

- **WHEN** 调用 `store.emit({ type: 'editor:dirty', dirty: true })`
- **THEN** payload `dirty` 被正确类型检查，非 `boolean` 类型在编译时报错

### Requirement: 状态读取 (`store.getState`)

Store SHALL 提供 `getState()` 方法返回当前状态快照。

#### Scenario: 读取初始状态

- **WHEN** 调用 `store.getState()`
- **THEN** 返回包含所有状态字段的默认值对象

#### Scenario: 状态更新后读取

- **WHEN** 调用 `store.setState(...)` 后调用 `store.getState()`
- **THEN** 返回包含更新值的状态对象

### Requirement: 状态更新 (`store.setState`)

Store SHALL 提供 `setState(partial)` 方法用于更新状态，并在状态变化时自动派发对应事件。

#### Scenario: 更新编辑器模式

- **WHEN** 调用 `store.setState({ mode: 'source' })`
- **THEN** Store 内 `mode` 更新为 `'source'`，且 `editor:mode` 事件被派发

#### Scenario: 更新活跃文件

- **WHEN** 调用 `store.setState({ activeFilePath: '/doc.md' })`
- **THEN** Store 内 `activeFilePath` 更新，且 `file:active` 事件被派发

#### Scenario: 空更新

- **WHEN** 调用 `store.setState({})`
- **THEN** 无状态变更，无事件派发

### Requirement: StoreEvent 联合类型

系统 SHALL 定义 `StoreEvent` 联合类型，覆盖所有组件间通信场景。

#### Scenario: 事件类型覆盖

- **WHEN** 组件间需要通信
- **THEN** 使用以下类型之一：`editor:update`、`editor:dirty`、`editor:mode`、`file:active`、`settings:changed`、`workspace:set`

### Requirement: StoreState 类型

系统 SHALL 定义 `StoreState` 类型，包含所有集中管理的状态字段。

#### Scenario: 状态字段覆盖

- **WHEN** 调用 `store.getState()`
- **THEN** 返回对象包含 `mode`、`activeFilePath`、`workspacePath`、`expandedPaths` 等字段
