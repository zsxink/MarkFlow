## Why

提交 2260bdd 为工具栏按钮添加了 `role="group"` ARIA 容器包装，但未添加对应的 CSS 布局规则，导致按钮在 span 的默认行内排版中发生换行/溢出，工具栏布局错乱。同时新增的 `#btn-theme` 与状态栏已有 `#sb-theme` 重复，需统一保留状态栏入口。

## What Changes

1. 为 `[role="group"]` 按钮组容器增加 flex 布局 CSS，确保分组后的按钮保持单行工具栏布局
2. 移除工具栏中的 `#btn-theme` 主题切换按钮及其事件绑定，仅保留状态栏的 `#sb-theme`
3. 增加工具栏布局回归测试，覆盖动态分组后的 DOM/CSS 结构

## Capabilities

### New Capabilities
- `toolbar-layout`: 工具栏按钮组容器的布局规范，定义 flex 布局及对齐方式

### Modified Capabilities
- `ui-aria-attributes`: 新增工具栏布局约束要求，确保 ARIA 分组不破坏原有视觉布局

## Impact

- `src/components/toolbar.ts`：移除 `#btn-theme` 相关 DOM 创建和事件绑定
- `src/styles/toolbar.css`：新增 `[role="group"]` 的 flex 布局规则
- `src/components/statusbar.ts`：无需改动，保留现状
- 测试：新增 E2E 回归测试覆盖工具栏布局
