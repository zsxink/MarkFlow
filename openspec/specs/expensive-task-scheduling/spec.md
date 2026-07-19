# expensive-task-scheduling Specification

## Purpose
定义高开销任务的防抖、取消、复杂度上限和增量计算要求，保障编辑器响应性。

## Agent Context
- **源码入口：** `src/lib/taskScheduler.ts`、`src/lib/editor.ts` 与 `src/components/statusbar.ts`。
- **关联规范：** `document-size-tier`、`codemirror-source-editor`、`regression-coverage`。
- **不变量：** 新请求必须使过期任务结果失效；各任务队列独立去抖；取消后不得发布部分结果。
- **验证：** `npm test -- src/lib/taskScheduler.test.ts`；`npx openspec validate expensive-task-scheduling --strict`。

## Requirements

### Requirement: 去抖昂贵的任务
昂贵的操作 MUST 进行去抖以避免每次击键执行。

- Markdown serialization: 400ms debounce
- Word count: 200ms debounce
- Outline refresh: 300ms debounce
- Line number recalculation: 150ms debounce
- 文件树增量更新: 16ms debounce（rAF 窗口）

#### Scenario: Debounce防止冗余执行
- **WHEN** 用户在编辑器中快速输入
- **THEN** 最后一次按键后400ms才执行序列化任务
- **THEN** 最后一次按键后200ms才执行字数统计任务
- **THEN** 每个任务队列独立运行

#### Scenario: 去抖定时器在新触发时重置
- **WHEN** 去抖任务有一个待处理的计时器并且新的触发器到达
- **THEN** 之前的计时器取消，新的计时器开始

#### Scenario: 文件树变更事件去抖
- **WHEN** 16ms 内收到多个文件变更事件
- **THEN** SHALL 合并为一次 DOM 操作，不触发多次重绘

### Requirement: 任务取消
当新的触发器到达时，系统 MUST 支持取消正在进行的昂贵任务。

#### Scenario: 取消可防止结果过时
- **WHEN** 新的序列化请求到达，而前一个序列化请求正在等待处理
- **THEN** 先前待处理的请求被取消（通过AbortController）
- **THEN** 仅执行最新的请求

#### Scenario: 部分计算取消后仍有效
- **WHEN** 任务执行中被取消
- **THEN** 任何部分结果将被丢弃
- **THEN** 没有对文档应用部分状态

### Requirement: 新请求使过期任务结果失效
新请求 MUST 使过期任务结果失效。

#### Scenario: 文件树增量更新取消旧请求
- **WHEN** 新的文件变更事件到达且有 pending 的 rAF 回调
- **THEN** SHALL 取消旧的 rAF 回调，使用新的变更队列

### Requirement: 渲染复杂度限制
系统 MUST 对渲染子系统实施复杂性限制，以防止主线程阻塞。

#### Scenario: 带行数限制的语法高亮
- **WHEN** 某个代码块超出了语法高亮配置的最大行数
- **THEN** 该块的语法高亮已禁用
- **THEN** 该区块被渲染为纯文本
- **THEN** 悬停时会显示一条注释，解释为什么突出显示被禁用

#### Scenario: 美人鱼渲染超时
- **WHEN** 美人鱼图渲染时间超过5秒
- **THEN** 渲染中止
- **THEN** 后备显示显示带有 "Render failed" 消息的源代码
- **THEN** 有重试按钮

#### Scenario: 每个文档的图像解析限制
- **WHEN** 文档包含超过50张图片参考
- **THEN** 超过50张的图片无法解析/加载
- **THEN** 显示占位符元素，并显示未解析图像的数量

### Requirement: 增量计算
在可行的情况下，昂贵的计算 MUST 使用增量更新而不是完全重新计算。

#### Scenario: 字数增量重新计算
- **WHEN** 用户编辑大文档的一小部分
- **THEN** 字数统计是通过计算增量而不是重新计算整个文档来更新的
- **THEN** 结果与全面重新计票一致

#### Scenario: 大纲更新仅更改标题
- **WHEN** 用户修改文档中的单个标题
- **THEN** 大纲中仅更新更改的标题条目
- **THEN** 未改变的标题顺序被保留
