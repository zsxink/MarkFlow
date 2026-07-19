## 1. 文件树无障碍属性与键盘导航

- [x] 1.1 文件树容器添加 `role="tree"` 和 `aria-label="文件树"`（fileTree.core.ts）
- [x] 1.2 目录节点添加 `role="treeitem"` 和 `aria-expanded="true/false"`（fileTree.core.ts renderNode）
- [x] 1.3 文件节点添加 `role="treeitem"`（fileTree.core.ts renderNode）
- [x] 1.4 选中节点添加 `aria-selected="true"`（fileTree.core.ts 选中逻辑）
- [x] 1.5 实现键盘导航：上下箭头移动焦点、左右箭头展开/折叠、Enter 打开文件（fileTree.core.ts）
- [x] 1.6 验证：运行 `npm test -- src/components/fileTree.core.test.ts` 确认无回归

## 2. 右键菜单无障碍属性与焦点管理

- [x] 2.1 菜单容器添加 `role="menu"`（contextMenu.ts showContextMenuStatic）
- [x] 2.2 每个菜单项添加 `role="menuitem"`（contextMenu.ts 菜单项创建）
- [x] 2.3 禁用菜单项添加 `aria-disabled="true"`（contextMenu.ts）
- [x] 2.4 菜单显示时焦点移到第一个菜单项（contextMenu.ts）
- [x] 2.5 ESC 关闭菜单并恢复焦点到触发元素（contextMenu.ts）
- [x] 2.6 验证：运行 `npm test -- src/components/contextMenu.test.ts` 确认无回归

## 3. 工具栏无障碍属性

- [x] 3.1 工具栏容器添加 `role="toolbar"` 和 `aria-label="工具栏"`（toolbar.ts）
- [x] 3.2 按钮组添加 `role="group"` 和 `aria-label`（toolbar.ts）
- [x] 3.3 开关按钮添加 `aria-pressed="true/false"`（toolbar.ts）
- [x] 3.4 验证：运行 `npm test` 确认无回归

## 4. 状态栏无障碍属性

- [x] 4.1 状态栏容器添加 `role="status"` 和 `aria-live="polite"`（statusbar.ts）
- [x] 4.2 验证：运行 `npm test -- src/components/statusbar.test.ts` 确认无回归

## 5. Toast 无障碍属性

- [x] 5.1 Toast 容器添加 `role="alert"` 和 `aria-live="assertive"`（toast.ts）
- [x] 5.2 验证：运行 `npm test` 确认无回归

## 6. 提交与 PR

- [ ] 6.1 提交所有变更，commit message 格式 `feat: 核心 UI 组件无障碍支持 (#134)`
- [ ] 6.2 推送分支到远程
- [ ] 6.3 创建 PR，标题 `feat: 核心 UI 组件无障碍支持 (#134)`
