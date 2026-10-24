# file-tree-incremental-update Specification

## Purpose
定义文件树 DOM 增量更新机制，使用 rAF 批量提交变更，避免每次文件系统事件触发全量重建。

## Agent Context
- **源码入口：** `src/ui/file-tree/core.ts`、`src/ui/file-tree/index.ts`。
- **关联规范：** `file-tree-architecture`、`expensive-task-scheduling`。
- **不变量：** 增量更新 SHALL 使用 rAF 批量提交，pendingMutations 队列积累 16ms 内变更；首次加载或 workspace 切换时仍使用全量重建。
- **验证：** `npm test -- src/ui/file-tree/__tests__/core.test.ts`；`npm run benchmark:file-tree`。

## Requirements

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
- **THEN** `pendingMutations` 队列中的所有变更 SHALL 被一次性 apply 到 DOM，队列清空

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

### Requirement: 增量插入排序一致性

文件树 DOM 增量插入（watcher 事件、新建、重命名重排、分页追加、拖拽落树）SHALL 保持与全量刷新一致的排序：文件夹整体位于文件之上，同类内按名称 `localeCompare` 升序。插入位置 SHALL 由统一的排序插入 helper 决定，不得在找不到更大名称的同类节点时把文件夹落到文件之后或分页按钮之后。

#### Scenario: 新文件夹名排在所有已有文件夹之后

- **WHEN** 工作区已渲染 `archive/`、`notes/` 文件夹与若干文件节点，外部新增（或内部新建）名称排序在其后的文件夹（如「测试」）
- **THEN** 该文件夹节点 SHALL 插入到文件夹区末尾（最后一个文件夹之后、第一个文件节点之前），不落到任何文件之下

#### Scenario: 新文件名排在所有已有文件之后

- **WHEN** 增量插入一个名称排在所有已有文件之后的文件节点
- **THEN** 该文件节点 SHALL 落到文件区末尾；若容器存在 `.tree-load-more` 分页按钮，SHALL 插到按钮之前

#### Scenario: 重命名到排序末位的名称

- **WHEN** inline 重命名文件或跨目录重命名后，节点新名称在同类中排最后
- **THEN** 重排后节点位置 SHALL 与全量刷新后的位置一致，文件夹仍整体在文件之上

#### Scenario: 增量插入顺序与全量刷新一致

- **WHEN** 任一增量插入路径（watcher create、右键复制副本、新建对话框、拖拽移动、分页追加）执行后立即触发 `refreshFileTree()` 全量刷新
- **THEN** 刷新前后同级节点的顺序 SHALL 相同
