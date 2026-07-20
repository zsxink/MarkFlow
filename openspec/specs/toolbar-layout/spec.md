# toolbar-layout Specification

## Purpose

定义工具栏按钮组容器和整体布局规范，确保 ARIA 分组不破坏视觉布局。

## Agent Context
- **源码入口：** `src/styles/toolbar.css`、`src/components/toolbar.ts`
- **关联规范：** `ui-aria-attributes`、`statusbar`。
- **不变量：** 待实现。
- **验证：** 待实现。

## Requirements

### Requirement: 工具栏按钮组容器布局

工具栏中所有 `[role="group"]` 容器 SHALL 使用 flex 布局，确保按钮在分组后仍保持单行水平排列。

#### Scenario: 按钮组容器具有正确的 flex 布局
- **WHEN** 工具栏完成初始化渲染（`initToolbar()` 执行后）
- **THEN** 每个 `[role="group"]` 容器 SHALL 具有 `display: inline-flex`
- **THEN** 每个 `[role="group"]` 容器 SHALL 具有 `align-items: center`
- **THEN** 每个 `[role="group"]` 容器 SHALL 具有 `flex-wrap: nowrap`
- **THEN** 每个 `[role="group"]` 内的按钮 SHALL 按水平单行排列，不换行、不溢出

### Requirement: 主题切换按钮唯一入口

系统 SHALL 只有一个主题切换入口，位于状态栏（`#sb-theme`），工具栏中 SHALL NOT 存在 `#btn-theme` 按钮。

#### Scenario: 工具栏中不存在重复的主题按钮
- **WHEN** 页面 DOM 完全加载后
- **THEN** DOM 中 SHALL NOT 存在 `id="btn-theme"` 的元素
- **THEN** 状态栏中 SHALL 存在 `id="sb-theme"` 的元素
- **THEN** 点击 `#sb-theme` SHALL 触发主题切换

### Requirement: 工具栏布局整体稳定

工具栏容器内的所有直接子元素（包括按钮、分隔符、group 容器）SHALL 在水平单行内完整排列，不发生垂直错位或换行。

#### Scenario: 工具栏布局不因 ARIA 分组改变
- **WHEN** 工具栏渲染完成
- **THEN** 工具栏容器 `.toolbar` 的高度 SHALL 等于预期工具栏高度（34px + padding）
- **THEN** 工具栏内所有按钮和分隔符的 `offsetTop` SHALL 相同（即在同一水平行上）
