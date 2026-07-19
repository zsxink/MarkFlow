## MODIFIED Requirements

### Requirement: 去抖昂贵的任务

昂贵的操作 SHALL 进行去抖以避免每次击键执行。

#### 去抖时间

- Markdown serialization: 400ms debounce
- Word count: 200ms debounce
- Outline refresh: 300ms debounce
- Line number recalculation: 150ms debounce
- **新增**：文件树增量更新: 16ms debounce（rAF 窗口）

#### Scenario: 文件树变更事件去抖

- **WHEN** 16ms 内收到多个文件变更事件
- **THEN** SHALL 合并为一次 DOM 操作，不触发多次重绘

### Requirement: 新请求使过期任务结果失效

新请求 MUST 使过期任务结果失效。

#### Scenario: 文件树增量更新取消旧请求

- **WHEN** 新的文件变更事件到达且有 pending 的 rAF 回调
- **THEN** SHALL 取消旧的 rAF 回调，使用新的变更队列
