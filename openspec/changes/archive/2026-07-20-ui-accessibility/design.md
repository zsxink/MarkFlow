## Context

MarkFlow 前端使用 ProseMirror (WYSIWYG) + CodeMirror (源码模式) 编辑器引擎，核心 UI 组件包括文件树、右键菜单、工具栏、状态栏和 Toast。当前整个前端仅 5 处 ARIA 属性（dialog.ts 和 degradationBar.ts），文件树、右键菜单、工具栏、状态栏和 Toast 完全缺失无障碍支持。

## Goals / Non-Goals

**Goals:**
- 为 5 个核心 UI 组件添加 WAI-ARIA 属性支持
- 文件树实现完整的键盘导航（方向键、Enter）
- 右键菜单支持焦点管理和 ESC 关闭
- 所有改动遵循 WAI-ARIA 1.2 规范

**Non-Goals:**
- 不引入屏幕阅读器测试框架（如 axe-core）
- 不修改 ProseMirror/CodeMirror 内部的无障碍行为
- 不改变现有视觉样式或布局
- 不添加 skip-to-content 等全局导航功能

## Decisions

### Decision 1: 文件树键盘导航使用原生 keydown 事件

**选择**：在 `fileTree.core.ts` 容器上绑定 `keydown` 事件监听器，通过 `event.key` 判断方向键和 Enter。

**替代方案**：使用 `roving tabindex` 模式（每个可聚焦元素独立 tabindex）。

**理由**：文件树节点数量动态变化（懒加载），roving tabindex 需要在每次 DOM 变更时更新 tabindex，增加复杂度。原生 keydown 监听器更简单，且 WAI-ARIA Treeview 模式允许容器级键盘处理。

### Decision 2: 右键菜单焦点管理

**选择**：菜单显示时将焦点移到第一个菜单项，ESC 关闭时恢复焦点到触发元素。

**理由**：符合 WAI-ARIA Menu 模式的标准交互。触发元素引用存储在闭包中，菜单关闭时恢复。

### Decision 3: ARIA 属性通过 DOM API 直接设置

**选择**：在组件初始化和状态变更时通过 `element.setAttribute()` 直接设置 ARIA 属性。

**替代方案**：使用 `aria-*` HTML 属性或框架绑定。

**理由**：MarkFlow 使用原生 DOM 操作（无框架），`setAttribute` 是最直接的方式，与现有代码风格一致。

## Risks / Trade-offs

- **[键盘导航与拖拽冲突]** → 文件树的左右箭头展开/折叠可能与拖拽操作冲突。缓解：键盘导航仅响应 `keydown` 事件，不干扰鼠标拖拽。
- **[动态 DOM 更新]** → 文件树懒加载和增量更新时需同步更新 ARIA 属性。缓解：在现有的 `renderNode` 函数中统一设置 ARIA 属性。
- **[测试覆盖]** → 无障碍属性的测试需要模拟键盘事件。缓解：使用 `npm test` 中已有的 DOM 测试模式。
