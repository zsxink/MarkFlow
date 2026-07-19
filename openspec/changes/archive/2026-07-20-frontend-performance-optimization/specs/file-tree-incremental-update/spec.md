## ADDED Requirements

### Requirement: 文件树 DOM 增量更新

文件树模块 SHALL 使用 `requestAnimationFrame` 批量提交 DOM 变更，避免全量重建。

#### Scenario: 单个文件创建事件触发增量更新

- **WHEN** 文件系统发出单个文件创建事件
- **THEN** DOM 变更 SHALL 在下一个 rAF 回调中提交，而非立即重建整个文件树

#### Scenario: 多个快速连续事件合并为单次 DOM 操作

- **WHEN** 16ms 内收到多个文件变更事件（如批量保存）
- **THEN** 所有变更 SHALL 合并为一次 DOM 操作，不触发多次重绘

#### Scenario: 首次加载使用全量重建

- **WHEN** 文件树首次渲染或 workspace 切换
- **THEN** SHALL 使用 `refreshFileTree()` 全量重建 DOM，不使用增量更新

### Requirement: pendingMutations 队列

文件树模块 SHALL 维护一个 `pendingMutations` 队列，积累变更后一次性 apply。

#### Scenario: 队列积累变更

- **WHEN** 多个变更事件在 16ms 窗口内到达
- **THEN** 变更 SHALL 被添加到 `pendingMutations` 队列，不立即执行

#### Scenario: 队列在 rAF 回调中清空

- **WHEN** 浏览器触发下一帧渲染（rAF 回调）
- **THEN** `pending队列中的所有变更 SHALL 被一次性 apply 到 DOM，队列清空

#### Scenario: 队列为空时跳过 rAF

- **WHEN** `pendingMutations` 队列为空
- **THEN** SHALL 不注册 rAF 回调，避免不必要的调度

### Requirement: cleanup 函数

文件树模块 SHALL 导出 `cleanup()` 函数，用于在组件销毁时清理事件监听器和 rAF 调度。

#### Scenario: cleanup 移除所有事件监听器

- **WHEN** 调用 `cleanup()` 函数
- **THEN** 所有通过 `applyFileTreeEvents` 注册的事件监听器 SHALL 被移除

#### Scenario: cleanup 取消待执行的 rAF

- **WHEN** 调用 `cleanup()` 函数且有 pending 的 rAF 回调
- **THEN** SHALL 调用 `cancelAnimationFrame` 取消待执行的回调
