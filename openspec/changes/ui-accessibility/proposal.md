## Why

MarkFlow 的核心 UI 组件（文件树、右键菜单、工具栏、状态栏、Toast）完全缺失无障碍支持。整个前端仅 5 处 ARIA 属性（dialog.ts 和 degradationBar.ts），屏幕阅读器用户无法有效使用文件导航、菜单操作、工具栏切换等核心功能。添加 WAI-ARIA 无障碍支持可提升产品的可访问性和合规性。

## What Changes

- 文件树容器添加 `role="tree"`，目录/文件节点添加 `role="treeitem"`，支持 `aria-expanded`、`aria-selected`，并实现键盘导航（上下/左右箭头、Enter）
- 右键菜单容器添加 `role="menu"`，菜单项添加 `role="menuitem"`，禁用项添加 `aria-disabled`，支持 ESC 关闭和焦点恢复
- 工具栏容器添加 `role="toolbar"`，按钮组添加 `role="group"`，开关按钮添加 `aria-pressed`
- 状态栏容器添加 `role="status"` + `aria-live="polite"`，字数变化时屏幕阅读器可感知
- Toast 容器添加 `role="alert"` + `aria-live="assertive"`

## Capabilities

### New Capabilities
- `ui-aria-attributes`: 为核心 UI 组件添加 WAI-ARIA 属性支持（文件树、右键菜单、工具栏、状态栏、Toast）

### Modified Capabilities
- `file-tree-architecture`: 添加 aria-expanded/aria-selected 属性和键盘导航支持
- `context-menu`: 添加 role menu/menuitem 属性、焦点管理和 ESC 关闭
- `statusbar`: 添加 role status 和 aria-live 属性

## Impact

- 文件：`src/components/fileTree.core.ts`、`src/components/ui/contextMenu.ts`、`src/components/toolbar.ts`、`src/components/statusbar.ts`、`src/components/toast.ts`
- 无 API 变更，无依赖变更
- 纯前端 DOM 属性和事件处理改动，不影响 Rust 层
