# statusbar Specification

## Purpose

定义底部状态栏的统计、自动保存警告与快捷操作行为。

## Agent Context
- **源码入口：** `src/components/statusbar.ts`、`src/lib/store.ts` 与 `src/lib/editor.source.ts`。
- **关联规范：** `autosave-reliability`、`codemirror-source-editor`、`document-size-tier`。
- **不变量：** 统计必须跟随当前编辑模式；连续自动保存失败才显示持续警告；快捷操作不得改变未保存文档内容。
- **验证：** `npm test -- src/components/statusbar.test.ts`；`npx openspec validate statusbar --strict`。

## Requirements

### Requirement: 状态栏统计与快捷操作

系统 MUST 通过 `src/components/statusbar.ts` 初始化状态栏。状态栏 MUST 订阅 `editor:update` 事件，并显示当前编辑模式下的字数、行数和光标位置；设置、专注模式和主题操作 MUST 保持可用。

#### Scenario: 编辑后更新统计
- **WHEN** 编辑器发出 `editor:update` 事件
- **THEN** 状态栏更新字数、行数和光标位置

#### Scenario: 所见即所得模式按块级节点统计行数
- **WHEN** 所见即所得模式的内容包含多个块级节点
- **THEN** 状态栏行数使用块级节点数量，而不是将 `textContent` 按换行符分割的结果

#### Scenario: 源码模式显示 CM6 统计
- **WHEN** 源码模式激活并更新内容或光标位置
- **THEN** 状态栏显示 CodeMirror 文档的字数、行数和光标位置

#### Scenario: 状态栏快捷操作
- **WHEN** 用户点击设置、专注模式或主题操作
- **THEN** 系统分别打开设置、切换专注模式或循环主题

### Requirement: 自动保存失败警告

状态栏 MUST 订阅 `autosave:status` 事件。当连续自动保存失败次数达到 2 次或更多时，状态栏 MUST 显示内容未保存的警告；失败次数低于 2 次时 MUST 隐藏该警告。

#### Scenario: 连续自动保存失败显示警告
- **WHEN** `autosave:status` 事件的 `errorCount` 达到 2
- **THEN** 状态栏显示连续失败次数及“内容未保存”警告

#### Scenario: 自动保存恢复后清除警告
- **WHEN** `autosave:status` 事件的 `errorCount` 低于 2
- **THEN** 状态栏隐藏自动保存失败警告

### Requirement: 状态栏无障碍属性

状态栏容器 SHALL 设置 `role="status"` 和 `aria-live="polite"`，确保字数、行数等统计信息变化时屏幕阅读器能感知。

#### Scenario: 状态栏容器具有正确 ARIA 属性
- **WHEN** 状态栏完成初始化渲染
- **THEN** 容器元素 SHALL 具有 `role="status"` 和 `aria-live="polite"`

#### Scenario: 统计变化时屏幕阅读器感知
- **WHEN** 编辑器更新导致字数或行数变化
- **THEN** 状态栏的 `aria-live="polite"` 区域 SHALL 允许屏幕阅读器在空闲时播报更新内容
